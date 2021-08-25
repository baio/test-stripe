import { Test } from '@nestjs/testing';
import { StripeService, SubscriptionPeriod } from '../stripe.service';
import { createStripeConfig } from './utils';

const TEST_EMAIL = 'trial_flow_complete_subscription@gmail.com';
const TEST_PAYMENT_METHOD_ID = 'pm_card_us';
const TEST_TRIAL_PERIOD = 30 * 24 * 60 * 60;

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

  it('set 4 secondary locations', async () => {
    const res = await service.updateSubscriptionSecondaryQuantity(
      subscriptionId,
      4
    );
    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
  });

  it('end trial now', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    service.subscriptionTrialEndNow(subscriptionId);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  it('get subscription', async () => {
    const res = await service.getSubscription(subscriptionId);
    expect(res).toBeDefined();
    expect(res.id).toBeDefined();

    console.log('555', res.items.data[0]);
  });

  xit('remove customer', async () => {
    const res = await service.removeCustomer(customerId);
    expect(res).toBeDefined();
  });
});
