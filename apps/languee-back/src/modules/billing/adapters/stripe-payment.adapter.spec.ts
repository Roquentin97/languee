import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { StripePaymentAdapter } from './stripe-payment.adapter';
import { PaymentProviderError, WebhookSignatureError } from '../billing.errors';

const CONFIG: Record<string, string> = {
  'billing.stripeSecretKey': 'sk_test_abc123',
  'billing.stripeWebhookSecret': 'whsec_test_secret',
  'billing.stripePricePlus': 'price_plus_id',
  'billing.stripePricePro': 'price_pro_id',
};

function buildConfigService(): ConfigService {
  return {
    get: jest.fn((key: string) => CONFIG[key]),
  } as unknown as ConfigService;
}

function mockFetchOk(body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response);
}

function mockFetchStatus(status: number, errorBody: unknown = {}) {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: jest.fn().mockResolvedValue(errorBody),
  } as unknown as Response);
}

function signPayload(
  secret: string,
  timestamp: number,
  payload: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
}

describe('StripePaymentAdapter', () => {
  let adapter: StripePaymentAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new StripePaymentAdapter(buildConfigService());
  });

  it('providerName is "stripe"', () => {
    expect(adapter.providerName).toBe('stripe');
  });

  describe('createCheckoutSession', () => {
    it('POSTs form-encoded params with mode, price, and metadata; returns url/sessionId', async () => {
      const fetchMock = mockFetchOk({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      });
      global.fetch = fetchMock;

      const result = await adapter.createCheckoutSession({
        userId: 'user-1',
        userEmail: 'user@example.com',
        tier: 'plus',
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      });

      expect(result).toEqual({
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
        sessionId: 'cs_test_123',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
      expect(init.method).toBe('POST');

      const body = init.body as URLSearchParams;
      expect(body.get('mode')).toBe('subscription');
      expect(body.get('line_items[0][price]')).toBe('price_plus_id');
      expect(body.get('success_url')).toBe('https://app.example.com/success');
      expect(body.get('cancel_url')).toBe('https://app.example.com/cancel');
      expect(body.get('customer_email')).toBe('user@example.com');
      expect(body.get('client_reference_id')).toBe('user-1');
      expect(body.get('metadata[userId]')).toBe('user-1');
      expect(body.get('metadata[tier]')).toBe('plus');

      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toEqual(expect.any(String));
      expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    });

    it('selects the pro price id for tier "pro"', async () => {
      const fetchMock = mockFetchOk({ id: 'cs_test_456', url: 'https://x' });
      global.fetch = fetchMock;

      await adapter.createCheckoutSession({
        userId: 'user-1',
        userEmail: 'user@example.com',
        tier: 'pro',
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = init.body as URLSearchParams;
      expect(body.get('line_items[0][price]')).toBe('price_pro_id');
    });

    it('non-2xx response throws PaymentProviderError', async () => {
      global.fetch = mockFetchStatus(402, {
        error: { type: 'card_error', message: 'Your card was declined.' },
      });

      await expect(
        adapter.createCheckoutSession({
          userId: 'user-1',
          userEmail: 'user@example.com',
          tier: 'plus',
          successUrl: 'https://app.example.com/success',
          cancelUrl: 'https://app.example.com/cancel',
        }),
      ).rejects.toBeInstanceOf(PaymentProviderError);
    });

    it('network failure throws PaymentProviderError', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

      await expect(
        adapter.createCheckoutSession({
          userId: 'user-1',
          userEmail: 'user@example.com',
          tier: 'plus',
          successUrl: 'https://app.example.com/success',
          cancelUrl: 'https://app.example.com/cancel',
        }),
      ).rejects.toBeInstanceOf(PaymentProviderError);
    });
  });

  describe('verifyAndParseWebhook', () => {
    const SECRET = CONFIG['billing.stripeWebhookSecret'];
    const FIXED_NOW_SECONDS = 1_700_000_000;

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(FIXED_NOW_SECONDS * 1000);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function buildPayload(): { raw: Buffer; body: string } {
      const body = JSON.stringify({
        id: 'evt_test_1',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_1' } },
      });
      return { raw: Buffer.from(body, 'utf8'), body };
    }

    it('accepts a valid signature', () => {
      const { raw, body } = buildPayload();
      const signature = signPayload(SECRET, FIXED_NOW_SECONDS, body);
      const header = `t=${FIXED_NOW_SECONDS},v1=${signature}`;

      const parsed = adapter.verifyAndParseWebhook(raw, header);

      expect(parsed).toEqual({
        eventId: 'evt_test_1',
        type: 'checkout.session.completed',
        data: { id: 'cs_test_1' },
      });
    });

    it('accepts when one of multiple v1 signatures is valid (secret rotation)', () => {
      const { raw, body } = buildPayload();
      const validSignature = signPayload(SECRET, FIXED_NOW_SECONDS, body);
      const header = `t=${FIXED_NOW_SECONDS},v1=deadbeef,v1=${validSignature}`;

      expect(() => adapter.verifyAndParseWebhook(raw, header)).not.toThrow();
    });

    it('rejects a wrong signature', () => {
      const { raw } = buildPayload();
      const header = `t=${FIXED_NOW_SECONDS},v1=${'0'.repeat(64)}`;

      expect(() => adapter.verifyAndParseWebhook(raw, header)).toThrow(
        WebhookSignatureError,
      );
    });

    it('rejects an expired timestamp', () => {
      const { raw, body } = buildPayload();
      const staleTimestamp = FIXED_NOW_SECONDS - 301;
      const signature = signPayload(SECRET, staleTimestamp, body);
      const header = `t=${staleTimestamp},v1=${signature}`;

      expect(() => adapter.verifyAndParseWebhook(raw, header)).toThrow(
        WebhookSignatureError,
      );
    });

    it('accepts a timestamp exactly at the tolerance boundary', () => {
      const { raw, body } = buildPayload();
      const boundaryTimestamp = FIXED_NOW_SECONDS - 300;
      const signature = signPayload(SECRET, boundaryTimestamp, body);
      const header = `t=${boundaryTimestamp},v1=${signature}`;

      expect(() => adapter.verifyAndParseWebhook(raw, header)).not.toThrow();
    });

    it('rejects a malformed header missing the timestamp', () => {
      const { raw } = buildPayload();
      expect(() => adapter.verifyAndParseWebhook(raw, 'v1=abcdef')).toThrow(
        WebhookSignatureError,
      );
    });

    it('rejects a malformed header missing any v1 signature', () => {
      const { raw } = buildPayload();
      expect(() =>
        adapter.verifyAndParseWebhook(raw, `t=${FIXED_NOW_SECONDS}`),
      ).toThrow(WebhookSignatureError);
    });

    it('rejects a completely empty header', () => {
      const { raw } = buildPayload();
      expect(() => adapter.verifyAndParseWebhook(raw, '')).toThrow(
        WebhookSignatureError,
      );
    });
  });
});
