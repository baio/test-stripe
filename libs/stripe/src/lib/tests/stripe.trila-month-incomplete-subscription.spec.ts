import { Test } from '@nestjs/testing';
import { StripeService, SubscriptionPeriod } from '../stripe.service';
import { createStripeConfig } from './utils';

const TEST_EMAIL = 'trial_month_subscription_incomplete@gmail.com';
const TEST_PAYMENT_METHOD_ID = 'pm_card_us';
const TEST_TRIAL_PERIOD = 30 * 24 * 60 * 60;

describe('StripeTrialMonthInCompleteSubscription', () => {
  let service: StripeService;

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      providers: [
        {
          provide: StripeService,
          useFactory: () =>
            new StripeService(
              createStripeConfig({
                gracePeriodInSeconds: 0,
                trialPeriodInSeconds: TEST_TRIAL_PERIOD,
              })
            ),
        },
      ],
    }).compile();

    service = app.get<StripeService>(StripeService);
  });

  let customerId: string;
  let subscriptionId: string;
  it('create customer', async () => {
    const res = await service.createCustomer(TEST_EMAIL);
    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
    expect(res.email).toEqual(TEST_EMAIL);
    customerId = res.id;
  });

  it('set customer payment method', async () => {
    const res = await service.setCustomerPaymentMethod(
      customerId,
      TEST_PAYMENT_METHOD_ID
    );
    expect(res).toBeDefined();
    console.log('222', res);
  });

  it('add main monthly subscription', async () => {
    const res = await service.createMainSubscription(
      customerId,
      SubscriptionPeriod.Month
    );
    console.log('333', res);
    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
    subscriptionId = res.id;
  });

  it('get logs', async () => {
    // No payments !!!
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const res = await service.getLatestEvents(12);
    console.log('444', res);
    expect(res).toBeDefined();
    expect(res.data).toHaveLength(12);
  });

  xit('remove customer', async () => {
    const res = await service.removeCustomer(customerId);
    expect(res).toBeDefined();
  });
});
