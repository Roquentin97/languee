import { NullPaymentProvider } from './null-payment.adapter';
import { BillingNotConfiguredError } from '../billing.errors';

describe('NullPaymentProvider', () => {
  let provider: NullPaymentProvider;

  beforeEach(() => {
    provider = new NullPaymentProvider();
  });

  it('providerName is "null"', () => {
    expect(provider.providerName).toBe('null');
  });

  it('createCheckoutSession rejects with BillingNotConfiguredError', async () => {
    await expect(
      provider.createCheckoutSession({
        userId: 'user-1',
        userEmail: 'user@example.com',
        tier: 'plus',
        successUrl: 'https://x/success',
        cancelUrl: 'https://x/cancel',
      }),
    ).rejects.toBeInstanceOf(BillingNotConfiguredError);
  });

  it('verifyAndParseWebhook throws BillingNotConfiguredError', () => {
    expect(() =>
      provider.verifyAndParseWebhook(Buffer.from('{}'), 'sig'),
    ).toThrow(BillingNotConfiguredError);
  });
});
