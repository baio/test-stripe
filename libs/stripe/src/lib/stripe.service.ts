import { Injectable } from '@nestjs/common';
import { Stripe } from 'stripe';

export interface PricesConfig {
  monthlyPriceId: string;
  yearlyPriceId: string;
}

export interface ProductConfig {
  id: string;
  prices: PricesConfig;
}

export interface ProductsConfig {
  mainProduct: ProductConfig;
  locationProduct: ProductConfig;
}

export interface SubscriptionConfig {
  trialPeriodInSeconds: number;
  gracePeriodInSeconds: number;
}

export interface StripeConfig {
  apiKey: string;
  apiVersion: string;
  products: ProductsConfig;
  subscription: SubscriptionConfig;
}

export enum SubscriptionPeriod {
  Month,
  Year,
}

const getNowTimestamp = () => Math.floor(new Date().getTime() / 1000);

const METADATA_TEST_TIMESTAMP_FIELD = 'testTimestamp';
const METADATA_TEST_TIMESTAMP_WARNING_FIELD = 'testTimestampWarning';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private currentTestTimeStamp?: number;
  constructor(private readonly config: StripeConfig) {
    this.stripe = new Stripe(config.apiKey, { apiVersion: '2020-08-27' });
  }

  private getMainProductPrice(period: SubscriptionPeriod) {
    return period === SubscriptionPeriod.Month
      ? this.config.products.mainProduct.prices.monthlyPriceId
      : this.config.products.mainProduct.prices.yearlyPriceId;
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
    const data: Stripe.SubscriptionCreateParams = {
      trial_end: trialEnd,
      customer: customerId,
      items: [
        {
          price: this.getMainProductPrice(period),
          quantity: 1 + secondaryQuantity,
        },
      ],
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
    const metadata = this.getTestTimestampMetadata();
    if (metadata) {
      const latestInvoiceId = updatedSubscription.latest_invoice as string;
      this.stripe.invoices.update(latestInvoiceId, { metadata });
    }

    return updatedSubscription;
  }

  private async updateTrialSubscriptionSecondaryQuantity(
    subscription: Stripe.Subscription,
    newQuantity: number
  ) {
    const itemId = subscription.items.data[0].id;
    const priceId = subscription.items.data[0].price.id;
    return this.stripe.subscriptions.update(subscription.id, {
      items: [
        {
          id: itemId,
          price: priceId,
          quantity: newQuantity + 1,
        },
      ],
      proration_behavior: 'none',
    });
  }

  private getTestTimestampMetadata() {
    return this.currentTestTimeStamp
      ? {
          [METADATA_TEST_TIMESTAMP_FIELD]: this.currentTestTimeStamp,
          [METADATA_TEST_TIMESTAMP_WARNING_FIELD]:
            'There is test current time stamp set for subscription, prorarta will be calculated incorrectly !',
        }
      : undefined;
  }

  private async increaseSubscriptionSecondaryQuantity(
    subscription: Stripe.Subscription,
    newQuantity: number
  ) {
    const itemId = subscription.items.data[0].id;
    const priceId = subscription.items.data[0].price.id;
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
        proration_behavior: 'always_invoice',
      }
    );

    // update invoice metadata for test purposes
    const metadata = this.getTestTimestampMetadata();
    if (metadata) {
      const latestInvoiceId = updatedSubscription.latest_invoice as string;
      this.stripe.invoices.update(latestInvoiceId, { metadata });
    }

    return updatedSubscription;
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
    await this.stripe.subscriptions.update(subscription.id, {
      items: [
        {
          id: itemId,
          price: priceId,
          quantity: newQuantity + 1,
        },
      ],
      proration_behavior: 'none',
    });
    const refundAmount = quantityDiff * (10 * 100);
    const refunds = this.getInvoicesRefunds(refundableInvoices, refundAmount);

    console.log(
      `Trying refund. Amount to refund ${refundAmount}. Refund amount available ${
        refundAmount - refunds.refundLeftover
      }.`
    );

    console.log('Refunds', refunds);

    for (const charge of refunds.charges) {
      await this.refundInvoice(charge.paymentIntentId, charge.amountToRefund);
    }

    return { id: '1' };
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

  private getSubscriptionLatestInvoice(subscription: Stripe.Subscription) {
    return subscription.latest_invoice as Stripe.Invoice;
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
      console.log('???', JSON.stringify(items, null, 2));
      const itemsInTestTimestampPeriod = items.filter(
        (invoice) =>
          !invoice.metadata[METADATA_TEST_TIMESTAMP_FIELD] ||
          +invoice.metadata[METADATA_TEST_TIMESTAMP_FIELD] >=
            graceTestPeriodOffset
      );
      return itemsInTestTimestampPeriod;
    } else {
      return items;
    }
  }

  /**
   * Invoice should have secondary price amount !!!
   * @param invoice
   * @returns
   */
  private getInvoiceSecondaryPriceAmount(invoice: Stripe.Invoice) {
    const secondaryPriceLine = invoice.lines.data[1];
    return secondaryPriceLine.amount / secondaryPriceLine.quantity;
  }

  private getInvoicesRefunds(
    refundableInvoices: Stripe.Invoice[],
    refundAmount: number
  ) {
    const charges = refundableInvoices.reduce(
      (acc, v) =>
        // payment intent could be null for trial period invoice
        v.payment_intent
          ? [...(v.payment_intent as Stripe.PaymentIntent).charges.data, ...acc]
          : acc,
      [] as Stripe.Charge[]
    );
    const chargeAmounts = charges.map((charge) => ({
      paymentIntentId: charge.payment_intent as string,
      amount: charge.amount,
      amountRefunded: charge.amount_refunded,
      amountLeft: charge.amount - charge.amount_refunded,
    }));
    // create refunds left based on refundable invoices chares
    // if chare is not refunded or partially refunded - refund it with calculated amount
    // and then use next invoice for additional refunds if necessary
    const refunds = chargeAmounts.reduceRight(
      (acc, v) => {
        if (acc.refundLeftover <= 0) {
          // everything already covered by previous charges
          return acc;
        } else if (v.amountLeft >= acc.refundLeftover) {
          // charge has enough amount to cover refund
          return {
            charges: [
              ...acc.charges,
              {
                paymentIntentId: v.paymentIntentId,
                amountToRefund: acc.refundLeftover,
              },
            ],
            refundLeftover: 0,
          };
        } else {
          if (v.amountLeft > 0) {
            // charge has partial amount to cover refund
            return {
              charges: [
                ...acc.charges,
                {
                  paymentIntentId: v.paymentIntentId,
                  amountToRefund: v.amountLeft,
                },
              ],
              refundLeftover: acc.refundLeftover - v.amountLeft,
            };
          } else {
            // charge already refunded
            return acc;
          }
        }
      },
      {
        charges: [] as { paymentIntentId: string; amountToRefund: number }[],
        refundLeftover: refundAmount,
      }
    );
    return refunds;
  }
}
