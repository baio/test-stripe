import { Test } from '@nestjs/testing';
import { StripeService, SubscriptionPeriod } from '../stripe.service';
import { createStripeConfig, getDateTimestampFromNow } from './utils';

const TEST_EMAIL = 'complete_flow_1_subscription@gmail.com';
const TEST_PAYMENT_METHOD_ID = 'pm_card_us';
const TEST_TRIAL_PERIOD = 30 * 24 * 60 * 60;
const TEST_GRACE_PERIOD = 3 * 24 * 60 * 60;

describe('StripeTrialFlowCompleteSubscription', () => {
  let service: StripeService;

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      providers: [
        {
          provide: StripeService,
          useFactory: () =>
            new StripeService(
              createStripeConfig({
                gracePeriodInSeconds: TEST_GRACE_PERIOD,
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
  });

  it('add main monthly subscription', async () => {
    const res = await service.createMainSubscription(
      customerId,
      SubscriptionPeriod.Month
    );
    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
    subscriptionId = res.id;
  });

  it('set 5 secondary locations', async () => {
    const res = await service.updateSubscriptionSecondaryQuantity(
      subscriptionId,
      5
    );
    expect(res).toBeDefined();
  });

  it('set 3 secondary locations', async () => {
    const res = await service.updateSubscriptionSecondaryQuantity(
      subscriptionId,
      3
    );
    expect(res).toBeDefined();
  });

  it('set 4 secondary locations', async () => {
    const res = await service.updateSubscriptionSecondaryQuantity(
      subscriptionId,
      4
    );
    expect(res).toBeDefined();
  });

  it('end trial now', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await service.subscriptionTrialEndNow(subscriptionId);
  });

  it('reduce by 1 paid location within grace period A', async () => {
    const res = await service.updateSubscriptionSecondaryQuantity(
      subscriptionId,
      3
    );
    expect(res).toBeDefined();
  });

  it('reduce by 1 paid location within grace period B', async () => {
    service.addCurrentTimeStampDays(1);
    const res = await service.updateSubscriptionSecondaryQuantity(
      subscriptionId,
      2
    );
    expect(res).toBeDefined();
  });

  it('reduce by 1 paid location out of grace period', async () => {
    service.addCurrentTimeStampDays(3);
    const res = await service.updateSubscriptionSecondaryQuantity(
      subscriptionId,
      1
    );
    expect(res).toBeDefined();
  });

  xit('remove customer', async () => {
    const res = await service.removeCustomer(customerId);
    expect(res).toBeDefined();
  });
});
