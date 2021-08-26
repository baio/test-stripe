import { Test } from '@nestjs/testing';
import { StripeService, SubscriptionPeriod } from '../stripe.service';
import { createStripeConfig } from './utils';

const TEST_EMAIL = 'flow_secondary_increase@gmail.com';
const TEST_PAYMENT_METHOD_ID = 'pm_card_us';
const TEST_GRACE_PERIOD = 3 * 24 * 60 * 60;

describe('StripeFlowSecondaryIncreaseSubscription', () => {
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
                trialPeriodInSeconds: 0,
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

  it('increase number of subscriptions to 3', async () => {
    const res = await service.updateSubscriptionSecondaryQuantity(
      subscriptionId,
      3
    );
    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
  });

  it('increase number of subscriptions to 4', async () => {
    const res = await service.updateSubscriptionSecondaryQuantity(
      subscriptionId,
      4
    );
    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
  });

  it('increase number of subscriptions to 5', async () => {
    const res = await service.updateSubscriptionSecondaryQuantity(
      subscriptionId,
      5
    );
    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
  });

  xit('remove customer', async () => {
    const res = await service.removeCustomer(customerId);
    expect(res).toBeDefined();
  });
});
