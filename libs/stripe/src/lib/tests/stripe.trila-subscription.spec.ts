import { Test } from '@nestjs/testing';
import { StripeService, SubscriptionPeriod } from '../stripe.service';

const TEST_EMAIL = 'max.putilov@gmail.com';
const TEST_PAYMENT_METHOD_ID = 'pm_card_us';
const TEST_TRIAL_PERIOD = 1;

/*
When the trial ends, 
a new billing cycle starts for the customer. 
Once the trial period is up, Stripe generates an invoice and sends an 
invoice.created event notification. 
Approximately an hour later, Stripe attempts to charge that invoice.
*/
xdescribe('trial_subscription', () => {
  let service: StripeService;

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      providers: [
        {
          provide: StripeService,
          useFactory: () =>
            new StripeService({
              apiKey: 'sk_test_gERO5pQnIDoRzbaDZR6YmjUf',
              apiVersion: '2020-08-27',
              products: {
                mainProduct: {
                  id: 'prod_K5nP8b9VC7qkVL',
                  prices: {
                    yearlyPriceId: 'price_0JRboQdOpWxwtH1jit8rYhXC',
                    monthlyPriceId: 'price_0JRboQdOpWxwtH1jWYwrsZuB',
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
              subscription: {
                trialPeriodInSeconds: TEST_TRIAL_PERIOD,
                gracePeriodInSeconds: 0,
              },
            }),
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
    // No payments !!!
    await new Promise((resolve) => setTimeout(resolve, 3000));
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
