import { createHmac } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

interface LoginApiResponse {
  accessToken: string;
}

interface RegisterApiResponse {
  id: string;
}

interface PlansApiResponse {
  plans: Array<{ tier: string; name: string; priceMonthlyUsd: number }>;
  billingConfigured: boolean;
}

interface SubscriptionApiResponse {
  tier: 'free' | 'plus' | 'pro';
  status: string;
  currentPeriodEnd: string | null;
  billingConfigured: boolean;
}

async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>({
    rawBody: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  return app;
}

async function registerAndLogin(
  app: INestApplication<App>,
  email: string,
  password: string,
): Promise<{ userId: string; accessToken: string }> {
  const registerRes = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password });
  const userId = (registerRes.body as RegisterApiResponse).id;

  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password });
  const accessToken = (loginRes.body as LoginApiResponse).accessToken;

  return { userId, accessToken };
}

function signStripePayload(
  secret: string,
  timestampSeconds: number,
  rawBody: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest('hex');
}

describe('BillingController (e2e) — unconfigured (no Stripe env vars)', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  const testEmail = `billing-e2e-unconfigured-${Date.now()}@example.com`;
  const testPassword = 'Test1234!';

  beforeAll(async () => {
    delete process.env['STRIPE_SECRET_KEY'];
    delete process.env['STRIPE_WEBHOOK_SECRET'];
    delete process.env['STRIPE_PRICE_PLUS'];
    delete process.env['STRIPE_PRICE_PRO'];

    app = await createApp();
    ({ accessToken } = await registerAndLogin(app, testEmail, testPassword));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/billing/plans', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/billing/plans')
        .expect(401);
    });

    it('returns the plan table with billingConfigured=false', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/billing/plans')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as PlansApiResponse;
      expect(body.billingConfigured).toBe(false);
      expect(body.plans.map((p) => p.tier)).toEqual(['free', 'plus', 'pro']);
    });
  });

  describe('GET /api/v1/billing/subscription', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/billing/subscription')
        .expect(401);
    });

    it('defaults to free/active with billingConfigured=false', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/billing/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as SubscriptionApiResponse;
      expect(body.tier).toBe('free');
      expect(body.status).toBe('active');
      expect(body.currentPeriodEnd).toBeNull();
      expect(body.billingConfigured).toBe(false);
    });
  });

  describe('POST /api/v1/billing/checkout-session', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/billing/checkout-session')
        .send({ tier: 'plus' })
        .expect(401);
    });

    it('returns 503 BILLING_NOT_CONFIGURED when Stripe is not configured', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/billing/checkout-session')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tier: 'plus' })
        .expect(503);

      expect((res.body as { error: string }).error).toBe(
        'BILLING_NOT_CONFIGURED',
      );
    });

    it('returns 400 for an invalid tier', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/billing/checkout-session')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tier: 'ultimate' })
        .expect(400);
    });
  });
});

describe('BillingController (e2e) — configured (webhook signature verification)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let userId: string;

  const testEmail = `billing-e2e-configured-${Date.now()}@example.com`;
  const testPassword = 'Test1234!';
  const WEBHOOK_SECRET = 'whsec_e2e_test_secret';

  beforeAll(async () => {
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_e2e_dummy';
    process.env['STRIPE_WEBHOOK_SECRET'] = WEBHOOK_SECRET;
    process.env['STRIPE_PRICE_PLUS'] = 'price_plus_e2e';
    process.env['STRIPE_PRICE_PRO'] = 'price_pro_e2e';

    app = await createApp();
    ({ userId, accessToken } = await registerAndLogin(
      app,
      testEmail,
      testPassword,
    ));
  });

  afterAll(async () => {
    await app.close();
    delete process.env['STRIPE_SECRET_KEY'];
    delete process.env['STRIPE_WEBHOOK_SECRET'];
    delete process.env['STRIPE_PRICE_PLUS'];
    delete process.env['STRIPE_PRICE_PRO'];
  });

  it('plans report billingConfigured=true', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/billing/plans')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect((res.body as PlansApiResponse).billingConfigured).toBe(true);
  });

  describe('POST /api/v1/billing/webhook', () => {
    it('rejects a request with a bad signature', async () => {
      const rawBody = JSON.stringify({
        id: 'evt_bad_sig',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_1' } },
      });
      const timestamp = Math.floor(Date.now() / 1000);

      const res = await request(app.getHttpServer())
        .post('/api/v1/billing/webhook')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', `t=${timestamp},v1=${'0'.repeat(64)}`)
        .send(rawBody)
        .expect(400);

      expect((res.body as { error: string }).error).toBe('INVALID_SIGNATURE');
    });

    it('flips the subscription tier to "plus" after a valid checkout.session.completed event', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const rawBody = JSON.stringify({
        id: `evt_checkout_${userId}`,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_e2e_1',
            customer: 'cus_e2e_1',
            subscription: 'sub_e2e_1',
            client_reference_id: userId,
            metadata: { userId, tier: 'plus' },
          },
        },
      });
      const signature = signStripePayload(WEBHOOK_SECRET, timestamp, rawBody);

      const webhookRes = await request(app.getHttpServer())
        .post('/api/v1/billing/webhook')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', `t=${timestamp},v1=${signature}`)
        .send(rawBody)
        .expect(200);

      expect(webhookRes.body).toEqual({ received: true });

      const subscriptionRes = await request(app.getHttpServer())
        .get('/api/v1/billing/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = subscriptionRes.body as SubscriptionApiResponse;
      expect(body.tier).toBe('plus');
      expect(body.status).toBe('active');
    });

    it('replaying the same event id is idempotent (duplicate:true, no re-processing)', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const rawBody = JSON.stringify({
        id: `evt_checkout_${userId}`,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_e2e_1',
            customer: 'cus_e2e_1',
            subscription: 'sub_e2e_1',
            client_reference_id: userId,
            metadata: { userId, tier: 'pro' },
          },
        },
      });
      const signature = signStripePayload(WEBHOOK_SECRET, timestamp, rawBody);

      const webhookRes = await request(app.getHttpServer())
        .post('/api/v1/billing/webhook')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', `t=${timestamp},v1=${signature}`)
        .send(rawBody)
        .expect(200);

      expect(webhookRes.body).toEqual({ received: true, duplicate: true });

      const subscriptionRes = await request(app.getHttpServer())
        .get('/api/v1/billing/subscription')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Tier is still "plus" from the first event — the duplicate ("pro") was not applied.
      expect((subscriptionRes.body as SubscriptionApiResponse).tier).toBe(
        'plus',
      );
    });
  });
});
