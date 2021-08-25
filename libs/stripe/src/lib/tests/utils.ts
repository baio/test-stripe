import { StripeConfig, SubscriptionConfig } from '../stripe.service';

export const createStripeConfig = (
  subscriptionConfig: SubscriptionConfig = {
    trialPeriodInSeconds: 0,
    gracePeriodInSeconds: 0,
  }
): StripeConfig => ({
  apiKey: 'sk_test_gERO5pQnIDoRzbaDZR6YmjUf',
  apiVersion: '2020-08-27',
  products: {
    mainProduct: {
      id: 'prod_K6ApfX0ddUPZHq',
      prices: {
        yearlyPriceId: 'price_0JRyThdOpWxwtH1jzozBfQjz',
        monthlyPriceId: 'price_0JRyThdOpWxwtH1jfrJ6IinA',
      },
    },
    locationProduct: {
      id: 'prod_K5nPBdjSrT8arx',
      prices: {
        yearlyPriceId: 'price_0JRbp5dOpWxwtH1jCTnadg9w',
        monthlyPriceId: 'price_0JRbp5dOpWxwtH1jNWeUdONO',
      },
    },
  },
  subscription: subscriptionConfig,
});

export const addDays = (date: Date, days: number) => {
  date.setDate(date.getDate() + days);
  return date;
}

export const getDateTimestamp = (date: Date) =>
  Math.floor(date.getTime() / 1000);
