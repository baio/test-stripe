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

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly productsConfig: ProductsConfig;
  private currentTimeStamp?: number;

  constructor(private readonly config: StripeConfig) {
    this.stripe = new Stripe(config.apiKey, { apiVersion: '2020-08-27' });
    this.productsConfig = config.products;
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
    this.currentTimeStamp = timestamp;
  }

  getCurrentTimeStamp() {
    return this.currentTimeStamp || new Date().getTime() / 1000;
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
        ? Math.trunc(
            new Date().getTime() / 1000 +
              this.config.subscription.trialPeriodInSeconds
          )
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
    const subscription = await this.getSubscription(subscriptionId);

    // TODO !!!
    const subscriptionSecondaryQuantity =
      this.getSubscriptionSecondaryQuantity(subscription);

    if (subscriptionSecondaryQuantity > count) {
      return this.decreaseSubscriptionSecondaryQuantity(subscription, count);
    } else {
      const itemId = subscription.items.data[0].id;
      const priceId = subscription.items.data[0].price.id;
      return this.stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: itemId,
            price: priceId,
            quantity: count + 1,
          },
        ],
        proration_behavior: 'none',
      });
    }
  }

  getSubscription(subscriptionId: string) {
    return this.stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice.payment_intent'],
    });
  }

  getLatestEvents(limit: number) {
    return this.stripe.events.list({ limit });
  }

  subscriptionTrialEndNow(subscriptionId: string) {
    return this.stripe.subscriptions.update(subscriptionId, {
      trial_end: 'now',
    });
  }

  private async decreaseSubscriptionSecondaryQuantity(
    subscription: Stripe.Subscription,
    newQuantity: number
  ) {
    const timestamp = this.getCurrentTimeStamp();
    const subscriptionSecondaryQuantity =
      this.getSubscriptionSecondaryQuantity(subscription);
    const quantityDiff = subscriptionSecondaryQuantity - newQuantity;
    const itemId = subscription.items.data[0].id;
    const priceId = subscription.items.data[0].price.id;
    const latestInvoice = this.getSubscriptionLatestInvoice(subscription);
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
    const refundableAmount = this.getInvoiceRefundableAmount(
      latestInvoice,
      timestamp,
      this.config.subscription.gracePeriodInSeconds,
      quantityDiff
    );
    if (refundableAmount > 0) {
      await this.refundInvoice(latestInvoice, refundableAmount);
    }
    return { id: '1' };
  }

  private refundInvoice(invoice: Stripe.Invoice, refundAmount: number) {
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;
    return this.stripe.refunds.create({
      payment_intent: paymentIntent.id,
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

  /**
   * Invoice should have secondary price amount !!!
   * @param invoice
   * @returns
   */
  private getInvoiceSecondaryPriceAmount(invoice: Stripe.Invoice) {
    const secondaryPriceLine = invoice.lines.data[1];
    return secondaryPriceLine.amount / secondaryPriceLine.quantity;
  }

  private getInvoiceRefundableAmount(
    invoice: Stripe.Invoice,
    timestamp: number,
    gracePeriod: number,
    maxRefundQuantity: number
  ) {
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;
    const charges = paymentIntent.charges.data;
    const previousRefunds = charges.reduce(
      (acc, v) => [...v.refunds.data, ...acc],
      [] as Stripe.Refund[]
    );
    const previousRefundsAmount = previousRefunds.reduce(
      (acc, v) => acc + v.amount,
      0
    );
    const potentiallyRefundableLines = invoice.lines.data.slice(1);
    const refundableItems = potentiallyRefundableLines.filter(
      (f) => timestamp - f.period.start <= gracePeriod
    );

    const refundableResult = refundableItems.reduce(
      (acc, val) => {
        const previousRefundsAmountLeftover =
          acc.previousRefundsAmountLeftover - val.amount;
        if (previousRefundsAmountLeftover >= 0) {
          // line amount was consumed by previous refunds
          console.warn(
            'Line amount was consumed by previous refunds! This is unexpected case for current flows!'
          );
          return {
            previousRefundsAmountLeftover,
            refundsAmount: acc.refundsAmount,
            refundsQuantityLeftover: acc.refundsQuantityLeftover,
          };
        } else {
          // ex: 4
          const availableQuantity = val.quantity;
          // ex: 4000 / 4 = 1000
          const lineUnitPrice = val.amount / availableQuantity;
          // ex: 4 >= 1 ? 1 : 4 ~> 1
          const quantityToRefund =
            availableQuantity >= acc.refundsQuantityLeftover
              ? acc.refundsQuantityLeftover
              : availableQuantity;
          // 1000 * 1
          const amount = lineUnitPrice * quantityToRefund;
          return {
            previousRefundsAmountLeftover: 0,
            refundsAmount: acc.refundsAmount + amount,
            refundsQuantityLeftover:
              acc.refundsQuantityLeftover - quantityToRefund,
          };
        }
      },
      {
        previousRefundsAmountLeftover: previousRefundsAmount,
        refundsAmount: 0,
        refundsQuantityLeftover: maxRefundQuantity,
      }
    );
    return refundableResult.refundsAmount;
  }
}
