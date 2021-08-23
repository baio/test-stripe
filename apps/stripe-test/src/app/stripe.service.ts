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

export interface StripeConfig {
  apiKey: string;
  apiVersion: string;
  products: ProductsConfig;
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

  createMainSubscription(customerId: string, period: SubscriptionPeriod) {
    const data: Stripe.SubscriptionCreateParams = {
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
}
