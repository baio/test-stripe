import { Test } from '@nestjs/testing';
import { StripeService, SubscriptionPeriod } from '../stripe.service';
import { createStripeConfig } from './utils';

const TEST_EMAIL = 'simple_subscription@gmail.com';
const TEST_PAYMENT_METHOD_ID = 'pm_card_us';

xdescribe('StripeSimpleSubscription', () => {
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
  });

  it('read customer events', async () => {
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

