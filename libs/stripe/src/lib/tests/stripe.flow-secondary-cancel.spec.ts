import { Test } from '@nestjs/testing';
import { StripeService, SubscriptionPeriod } from '../stripe.service';
import { createStripeConfig } from './utils';

const TEST_EMAIL = 'flow_secondary_cancel@gmail.com';
const TEST_PAYMENT_METHOD_ID = 'pm_card_us';

describe('StripeFlowSecondaryCancelSubscription', () => {
  let service: StripeService;

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      providers: [
        {
          provide: StripeService,
          useFactory: () => new StripeService(createStripeConfig()),
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
      SubscriptionPeriod.Month,
      4
    );
    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
    subscriptionId = res.id;
  });

  it('decrease number of subscriptions', async () => {
    const res = await service.updateSubscriptionSecondaryQuantity(
      subscriptionId,
      3
    );
    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
  });

  it('decrease number of subscriptions once again', async () => {
    const res = await service.updateSubscriptionSecondaryQuantity(
      subscriptionId,
      2
    );
    expect(res).toBeDefined();
    expect(res.id).toBeDefined();
  });


  xit('get subscription', async () => {
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
