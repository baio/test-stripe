import { Test } from '@nestjs/testing';
import { StripeService } from './stripe.service';

const TEST_EMAIL = 'max.putilov@gmail.com';

describe('StripeService', () => {
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
            }),
        },
      ],
    }).compile();

    service = app.get<StripeService>(StripeService);
  });

  describe('Stripe subscription', () => {
    let customerId: string;
    it('create customer', async () => {
      const res = await service.createCustomer(TEST_EMAIL);
      console.log('111', res);
      expect(res).toBeDefined();
      expect(res.id).toBeDefined();
      expect(res.email).toEqual(TEST_EMAIL);
      customerId = res.id;
    });

    it('remove customer', async () => {
      const res = await service.removeCustomer(customerId);
      expect(res).toBeDefined();
    });
  });
});
