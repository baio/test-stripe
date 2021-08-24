import { Test } from '@nestjs/testing';
import { StripeService } from '../stripe.service';
import { createStripeConfig } from './utils';

const TEST_EMAIL = 'max.putilov@gmail.com';

xdescribe('StripeCustomer', () => {
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

  describe('Stripe customer', () => {
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
