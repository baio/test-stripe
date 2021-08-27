import { StripeConfig, SubscriptionConfig } from '../stripe.service';

export const createStripeConfig = (
  subscriptionConfig: SubscriptionConfig = {
    trialPeriodInSeconds: 0,
    gracePeriodInSeconds: 0,
  }
): StripeConfig => ({
  apiKey: 'sk_test_gERO5pQnIDoRzbaDZR6YmjUf',
  products: {
    mainProduct: {
      id: 'prod_K6ApfX0ddUPZHq',
      prices: {
        yearlyPrice: { id: 'price_0JRyThdOpWxwtH1jzozBfQjz', valueInUsd: 100 },
        monthlyPrice: { id: 'price_0JRyThdOpWxwtH1jfrJ6IinA', valueInUsd: 10 },
      },
    },
  },
  subscription: subscriptionConfig,
});

export const addDays = (date: Date, days: number) => {
  date.setDate(date.getDate() + days);
  return date;
};

export const addDaysToNow = (days: number) => addDays(new Date(), days);

export const getDateTimestamp = (date = new Date()) =>
  Math.floor(date.getTime() / 1000);

export const getDateTimestampFromNow = (days: number) =>
  getDateTimestamp(addDaysToNow(days));
