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

  async setCustomerPaymentMethod(customerId: string, paymentMethodId: string) {
    const res = await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    console.log('333', res);

    return await this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: res.id,
      },
    });
  }

  createMainSubscription(customerId: string, period: SubscriptionPeriod) {
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
          quantity: 1,
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
    });
  }

  getSubscription(subscriptionId: string) {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  getLatestEvents(limit: number) {
    return this.stripe.events.list({ limit });
  }

  subscriptionTrialEndNow(subscriptionId: string) {
    return this.stripe.subscriptions.update(subscriptionId, {
      trial_end: 'now',
    });
  }
}
