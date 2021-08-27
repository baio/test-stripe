import { Injectable } from '@nestjs/common';
import { Stripe } from 'stripe';
import {
  createInvoiceMetadata,
  createSubscriptionActiveQuantityMetadata,
  getInvoicesRefunds,
  getInvoiceTestTimestamp,
  getSubscriptionActiveQuantityMetadata,
} from './stripe.utils';

export interface PriceConfig {
  id: string;
  valueInUsd: number;
}

export interface PricesConfig {
  monthlyPrice: PriceConfig;
  yearlyPrice: PriceConfig;
}

export interface ProductConfig {
  id: string;
  prices: PricesConfig;
}

export interface ProductsConfig {
  mainProduct: ProductConfig;
}

export interface SubscriptionConfig {
  trialPeriodInSeconds: number;
  gracePeriodInSeconds: number;
}

export interface StripeConfig {
  apiKey: string;
  products: ProductsConfig;
  subscription: SubscriptionConfig;
}

export enum SubscriptionPeriod {
  Month,
  Year,
}

const getNowTimestamp = () => Math.floor(new Date().getTime() / 1000);

const UNIT_MULTIPLIER = 100;

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private currentTestTimeStamp?: number;
  constructor(private readonly config: StripeConfig) {
    this.stripe = new Stripe(config.apiKey, { apiVersion: '2020-08-27' });
  }

  private getMainProductPrice(period: SubscriptionPeriod) {
    return period === SubscriptionPeriod.Month
      ? this.config.products.mainProduct.prices.monthlyPrice.id
      : this.config.products.mainProduct.prices.yearlyPrice.id;
  }

  createCustomer(email: string) {
    return this.stripe.customers.create({ email });
  }

  removeCustomer(id: string) {
    return this.stripe.customers.del(id);
  }

  setCurrentTimeStamp(timestamp: number) {
    this.currentTestTimeStamp = timestamp;
  }

  addCurrentTimeStampDays(days: number) {
    this.currentTestTimeStamp = this.currentTestTimeStamp + days * 24 * 60 * 60;
  }

  getCurrentTimeStamp() {
    return this.currentTestTimeStamp || getNowTimestamp();
  }

  async setCustomerPaymentMethod(customerId: string, paymentMethodId: string) {
    const res = await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    return await this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: res.id,
      },
    });
  }

  createMainSubscription(
    customerId: string,
    period: SubscriptionPeriod,
    secondaryQuantity = 0
  ) {
    const trialEnd =
      this.config.subscription.trialPeriodInSeconds !== 0
        ? this.getCurrentTimeStamp() +
          this.config.subscription.trialPeriodInSeconds
        : undefined;
    const metadata = createSubscriptionActiveQuantityMetadata(
      secondaryQuantity,
      this.getCurrentTimeStamp()
    );
    const data: Stripe.SubscriptionCreateParams = {
      trial_end: trialEnd,
      customer: customerId,
      items: [
        {
          price: this.getMainProductPrice(period),
          quantity: 1 + secondaryQuantity,
        },
      ],
      metadata,
    };
    return this.stripe.subscriptions.create(data);
  }

  async updateSubscriptionSecondaryQuantity(
    subscriptionId: string,
    count: number
  ) {
    if (count < 0) {
      throw new Error('Bad quantity');
    }
    const subscription = await this.loadSubscription(subscriptionId);

    const subscriptionTrialEnd = subscription.trial_end;

    const isTrial =
      subscriptionTrialEnd && this.getCurrentTimeStamp() < subscriptionTrialEnd;

    if (isTrial) {
      console.log('trial subscription update quantity', subscriptionId, count);
      return this.updateTrialSubscriptionSecondaryQuantity(subscription, count);
    } else {
      const subscriptionSecondaryQuantity =
        this.getSubscriptionSecondaryQuantity(subscription);
      if (subscriptionSecondaryQuantity > count) {
        console.log('subscription decrease quantity', subscriptionId, count);
        return this.decreaseSubscriptionSecondaryQuantity(subscription, count);
      } else if (subscriptionSecondaryQuantity < count) {
        console.log('subscription increase quantity', subscriptionId, count);
        return this.increaseSubscriptionSecondaryQuantity(subscription, count);
      } else {
        console.warn('The same subscriptions count, nothing to change');
      }
    }
  }

  loadSubscription(subscriptionId: string) {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  getSubscriptionInvoices(subscriptionId: string) {
    return this.stripe.invoices.retrieve(subscriptionId, {
      expand: ['latest_invoice.payment_intent'],
    });
  }

  getLatestEvents(limit: number) {
    return this.stripe.events.list({ limit });
  }

  async subscriptionTrialEndNow(subscriptionId: string) {
    const updatedSubscription = await this.stripe.subscriptions.update(
      subscriptionId,
      {
        trial_end: 'now',
      }
    );

    // update invoice metadata for test purposes
    const invoiceMetadata = createInvoiceMetadata(this.currentTestTimeStamp);
    if (invoiceMetadata) {
      const latestInvoiceId = updatedSubscription.latest_invoice as string;
      this.stripe.invoices.update(latestInvoiceId, {
        metadata: invoiceMetadata,
      });
    }

    return updatedSubscription;
  }

  private async updateTrialSubscriptionSecondaryQuantity(
    subscription: Stripe.Subscription,
    newQuantity: number
  ) {
    const oldQuantity = this.getSubscriptionSecondaryQuantity(subscription);
    const itemId = subscription.items.data[0].id;
    const priceId = subscription.items.data[0].price.id;
    // on trial subscription we only increase active quantity
    const activeQuantity =
      newQuantity >= oldQuantity ? newQuantity : oldQuantity;
    const metadata = createSubscriptionActiveQuantityMetadata(
      activeQuantity,
      this.getCurrentTimeStamp()
    );
    return this.stripe.subscriptions.update(subscription.id, {
      items: [
        {
          id: itemId,
          price: priceId,
          quantity: newQuantity + 1,
        },
      ],
      proration_behavior: 'none',
      metadata,
    });
  }

  private async increaseSubscriptionSecondaryQuantity(
    subscription: Stripe.Subscription,
    newQuantity: number
  ) {
    const itemId = subscription.items.data[0].id;
    const priceId = subscription.items.data[0].price.id;
    const subscriptionQuantity =
      this.getSubscriptionSecondaryQuantity(subscription);

    const subscriptionActiveQuantity =
      this.getSubscriptionSecondaryActiveQuantity(subscription);

    const activeSubscriptionsExcess =
      subscriptionActiveQuantity - subscriptionQuantity;

    const subscriptionMetadata = createSubscriptionActiveQuantityMetadata(
      newQuantity,
      this.getCurrentTimeStamp()
    );

    let updatedSubscription: Stripe.Subscription;
    if (activeSubscriptionsExcess > 0) {
      console.log(
        `There is ${activeSubscriptionsExcess} excess of active subscriptions`
      );
      if (newQuantity > activeSubscriptionsExcess) {
        const invoicableQuantity = newQuantity - activeSubscriptionsExcess;
        console.log(
          `New quantity [${newQuantity}] is more than excess quantity [${activeSubscriptionsExcess}], first we will invoice ${invoicableQuantity} and then we will just increase subscription to requested quantity without charges`
        );
        updatedSubscription = await this.stripe.subscriptions.update(
          subscription.id,
          {
            items: [
              {
                id: itemId,
                price: priceId,
                quantity: invoicableQuantity + 1,
              },
            ],
            proration_behavior: 'always_invoice',
          }
        );
      } else {
        console.log(
          `New quantity [${newQuantity}] is less or equal than excess quantity [${activeSubscriptionsExcess}], we will just increase subscription to requested quantity without charges`
        );
      }
      updatedSubscription = await this.stripe.subscriptions.update(
        subscription.id,
        {
          items: [
            {
              id: itemId,
              price: priceId,
              quantity: newQuantity + 1,
            },
          ],
          proration_behavior: 'none',
          metadata: subscriptionMetadata,
        }
      );
    } else {
      updatedSubscription = await this.stripe.subscriptions.update(
        subscription.id,
        {
          items: [
            {
              id: itemId,
              price: priceId,
              quantity: newQuantity + 1,
            },
          ],
          proration_behavior: 'always_invoice',
          metadata: subscriptionMetadata,
        }
      );
    }

    // update invoice metadata for test purposes
    const invoiceMetadata = createInvoiceMetadata(this.currentTestTimeStamp);
    if (invoiceMetadata) {
      const latestInvoiceId = updatedSubscription.latest_invoice as string;
      this.stripe.invoices.update(latestInvoiceId, {
        metadata: invoiceMetadata,
      });
    }

    return updatedSubscription;
  }

  private getSubscriptionSecondaryActiveQuantity(
    subscription: Stripe.Subscription
  ) {
    const subscriptionActiveQuantityMetadata =
      getSubscriptionActiveQuantityMetadata(subscription);
    const subscriptionActiveSecondaryQuantity =
      subscriptionActiveQuantityMetadata.quantity;
    return subscriptionActiveSecondaryQuantity;
  }

  private getPriceValue(priceId: string) {
    return [
      this.config.products.mainProduct.prices.monthlyPrice,
      this.config.products.mainProduct.prices.yearlyPrice,
    ].find((f) => f.id === priceId).valueInUsd;
  }

  private async decreaseSubscriptionSecondaryQuantity(
    subscription: Stripe.Subscription,
    newQuantity: number
  ) {
    const gracePeriod = this.config.subscription.gracePeriodInSeconds;
    const refundableInvoices = await this.loadSubscriptionInvoices(
      subscription.id,
      gracePeriod
    );

    const subscriptionSecondaryQuantity =
      this.getSubscriptionSecondaryQuantity(subscription);
    const quantityDiff = subscriptionSecondaryQuantity - newQuantity;
    const itemId = subscription.items.data[0].id;
    const priceId = subscription.items.data[0].price.id;
    const priceValue = this.getPriceValue(priceId);
    const priceAmount = priceValue * UNIT_MULTIPLIER;
    const refundAmount = quantityDiff * priceAmount;
    const refunds = getInvoicesRefunds(refundableInvoices, refundAmount);

    // decrease active subscription quantity on number of refunds
    // Ex: 2 was refunded and 1 is not, so 1 left uncovered and left in active subscription
    const refundQuantity =
      (refundAmount - refunds.refundLeftover) / priceAmount;
    const subscriptionActiveQuantity =
      this.getSubscriptionSecondaryActiveQuantity(subscription);
    const metadata = createSubscriptionActiveQuantityMetadata(
      subscriptionActiveQuantity - refundQuantity,
      this.getCurrentTimeStamp()
    );
    const updatedSubscription = await this.stripe.subscriptions.update(
      subscription.id,
      {
        items: [
          {
            id: itemId,
            price: priceId,
            quantity: newQuantity + 1,
          },
        ],
        proration_behavior: 'none',
        metadata,
      }
    );

    console.log(
      `Trying refund. Amount to refund ${refundAmount}. Refund amount available ${
        refundAmount - refunds.refundLeftover
      }.`
    );

    console.log('Refunds', refunds);

    for (const charge of refunds.charges) {
      await this.refundInvoice(charge.paymentIntentId, charge.amountToRefund);
    }

    return updatedSubscription;
  }

  private refundInvoice(paymentIntentId: string, refundAmount: number) {
    return this.stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: refundAmount,
    });
  }

  private getSubscriptionItem(subscription: Stripe.Subscription) {
    return subscription.items.data[0];
  }

  private getSubscriptionSecondaryQuantity(subscription: Stripe.Subscription) {
    return this.getSubscriptionItem(subscription).quantity - 1;
  }

  private async loadSubscriptionInvoices(
    subscriptionId: string,
    gracePeriod: number
  ) {
    // stripe doesn't allow to create invoice for particular date
    // all invoices and charges will have real dates independent
    // from current test date timestamp

    // we will select all with real grace period filter and then filter with test date data

    const gracePeriodOffset = getNowTimestamp() - gracePeriod;
    const result = await this.stripe.invoices.list({
      limit: 100,
      subscription: subscriptionId,
      created: { gte: gracePeriodOffset },
      expand: ['data.payment_intent'],
    });

    const items = result.data;

    if (this.currentTestTimeStamp) {
      console.warn('Test timestamp set, filter invoices by test timestamp');
      const graceTestPeriodOffset = this.getCurrentTimeStamp() - gracePeriod;
      const itemsInTestTimestampPeriod = items.filter((invoice) => {
        const invoiceTestTimestamp = getInvoiceTestTimestamp(invoice);
        return (
          !invoiceTestTimestamp || invoiceTestTimestamp >= graceTestPeriodOffset
        );
      });
      return itemsInTestTimestampPeriod;
    } else {
      return items;
    }
  }
}
