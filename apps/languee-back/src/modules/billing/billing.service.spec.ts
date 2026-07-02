import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../core/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { BillingService } from './billing.service';
import { PAYMENT_PROVIDER } from './billing.tokens';
import { BillingNotConfiguredError, UserNotFoundError } from './billing.errors';
import type { IPaymentProvider } from './interfaces/payment-provider.interface';

const NOW = new Date('2026-07-02T12:00:00.000Z');

const mockUser = {
  id: 'user-1',
  email: 'user@example.com',
  passwordHash: 'hash',
  createdAt: NOW,
  updatedAt: NOW,
};

const mockPrismaService = {
  subscription: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  billingEvent: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(
    async (ops: unknown[]): Promise<unknown[]> => Promise.all(ops),
  ),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'billing.successUrl') return 'https://app.example.com/success';
    if (key === 'billing.cancelUrl') return 'https://app.example.com/cancel';
    return undefined;
  }),
};

const mockUsersService = {
  findById: jest.fn(),
};

function buildProviderMock(
  providerName: string,
): jest.Mocked<IPaymentProvider> {
  return {
    providerName,
    createCheckoutSession: jest.fn(),
    verifyAndParseWebhook: jest.fn(),
  };
}

async function buildService(
  provider: jest.Mocked<IPaymentProvider>,
): Promise<BillingService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      BillingService,
      { provide: PrismaService, useValue: mockPrismaService },
      { provide: ConfigService, useValue: mockConfigService },
      { provide: UsersService, useValue: mockUsersService },
      { provide: PAYMENT_PROVIDER, useValue: provider },
    ],
  }).compile();
  return module.get<BillingService>(BillingService);
}

describe('BillingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsersService.findById.mockResolvedValue(mockUser);
    mockPrismaService.billingEvent.findUnique.mockResolvedValue(null);
  });

  describe('isConfigured / getPlans', () => {
    it('billingConfigured is true when a non-null provider is wired', async () => {
      const service = await buildService(buildProviderMock('stripe'));
      expect(service.isConfigured).toBe(true);
      expect(service.getPlans().billingConfigured).toBe(true);
      expect(service.getPlans().plans.length).toBeGreaterThan(0);
    });

    it('billingConfigured is false when the null provider is wired', async () => {
      const service = await buildService(buildProviderMock('null'));
      expect(service.isConfigured).toBe(false);
      expect(service.getPlans().billingConfigured).toBe(false);
    });
  });

  describe('createCheckoutSession', () => {
    it('upserts a default free subscription row before calling the provider', async () => {
      const provider = buildProviderMock('stripe');
      provider.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/c/pay/cs_test_1',
        sessionId: 'cs_test_1',
      });
      const service = await buildService(provider);

      const result = await service.createCheckoutSession('user-1', 'plus');

      expect(mockPrismaService.subscription.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: {},
        create: { userId: 'user-1' },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(provider.createCheckoutSession).toHaveBeenCalledWith({
        userId: 'user-1',
        userEmail: 'user@example.com',
        tier: 'plus',
        successUrl: 'https://app.example.com/success',
        cancelUrl: 'https://app.example.com/cancel',
      });
      expect(result).toEqual({
        url: 'https://checkout.stripe.com/c/pay/cs_test_1',
        sessionId: 'cs_test_1',
      });
    });

    it('throws UserNotFoundError when the user does not exist', async () => {
      mockUsersService.findById.mockResolvedValue(null);
      const service = await buildService(buildProviderMock('stripe'));

      await expect(
        service.createCheckoutSession('missing-user', 'plus'),
      ).rejects.toBeInstanceOf(UserNotFoundError);
      expect(mockPrismaService.subscription.upsert).not.toHaveBeenCalled();
    });

    it('propagates BillingNotConfiguredError from the null provider', async () => {
      const provider = buildProviderMock('null');
      provider.createCheckoutSession.mockRejectedValue(
        new BillingNotConfiguredError(),
      );
      const service = await buildService(provider);

      await expect(
        service.createCheckoutSession('user-1', 'plus'),
      ).rejects.toBeInstanceOf(BillingNotConfiguredError);
    });
  });

  describe('getSubscription', () => {
    it('returns free/active defaults when no row exists', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue(null);
      const service = await buildService(buildProviderMock('stripe'));

      const result = await service.getSubscription('user-1');

      expect(result).toEqual({
        tier: 'free',
        status: 'active',
        currentPeriodEnd: null,
        billingConfigured: true,
      });
    });

    it('returns the persisted row when one exists', async () => {
      const periodEnd = new Date('2026-08-01T00:00:00.000Z');
      mockPrismaService.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-1',
        tier: 'pro',
        status: 'active',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_stripe_1',
        currentPeriodEnd: periodEnd,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const service = await buildService(buildProviderMock('stripe'));

      const result = await service.getSubscription('user-1');

      expect(result).toEqual({
        tier: 'pro',
        status: 'active',
        currentPeriodEnd: periodEnd,
        billingConfigured: true,
      });
    });
  });

  describe('handleWebhookEvent', () => {
    it('short-circuits duplicate events without touching the subscription', async () => {
      mockPrismaService.billingEvent.findUnique.mockResolvedValue({
        id: 'be-1',
        stripeEventId: 'evt_1',
        type: 'checkout.session.completed',
        payload: {},
        processedAt: NOW,
      });
      const provider = buildProviderMock('stripe');
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'evt_1',
        type: 'checkout.session.completed',
        data: {},
      });
      const service = await buildService(provider);

      const result = await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(result).toEqual({ received: true, duplicate: true });
      expect(mockPrismaService.subscription.upsert).not.toHaveBeenCalled();
      expect(mockPrismaService.billingEvent.create).not.toHaveBeenCalled();
    });

    it('checkout.session.completed upserts the subscription with tier/status/customer/subscription ids', async () => {
      const provider = buildProviderMock('stripe');
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'evt_2',
        type: 'checkout.session.completed',
        data: {
          client_reference_id: 'user-1',
          customer: 'cus_1',
          subscription: 'sub_stripe_1',
          metadata: { userId: 'user-1', tier: 'plus' },
        },
      });
      const service = await buildService(provider);

      const result = await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrismaService.subscription.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: {
          tier: 'plus',
          status: 'active',
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_stripe_1',
        },
        create: {
          userId: 'user-1',
          tier: 'plus',
          status: 'active',
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_stripe_1',
        },
      });
      expect(mockPrismaService.billingEvent.create).toHaveBeenCalled();
      expect(result).toEqual({ received: true });
    });

    it('checkout.session.completed with missing userId/tier metadata only records the event', async () => {
      const provider = buildProviderMock('stripe');
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'evt_3',
        type: 'checkout.session.completed',
        data: { customer: 'cus_1' },
      });
      const service = await buildService(provider);

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrismaService.subscription.upsert).not.toHaveBeenCalled();
      expect(mockPrismaService.billingEvent.create).toHaveBeenCalledWith({
        data: {
          stripeEventId: 'evt_3',
          type: 'checkout.session.completed',
          payload: { customer: 'cus_1' },
        },
      });
    });

    it('customer.subscription.updated maps status and current_period_end when the subscription is known', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-1',
        tier: 'plus',
        status: 'active',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_stripe_1',
        currentPeriodEnd: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const provider = buildProviderMock('stripe');
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'evt_4',
        type: 'customer.subscription.updated',
        data: {
          id: 'sub_stripe_1',
          status: 'past_due',
          current_period_end: 1_800_000_000,
        },
      });
      const service = await buildService(provider);

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_stripe_1' },
        data: {
          status: 'past_due',
          currentPeriodEnd: new Date(1_800_000_000 * 1000),
        },
      });
    });

    it('customer.subscription.updated for an unknown stripeSubscriptionId only records the event', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue(null);
      const provider = buildProviderMock('stripe');
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'evt_5',
        type: 'customer.subscription.updated',
        data: { id: 'sub_unknown', status: 'active' },
      });
      const service = await buildService(provider);

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrismaService.subscription.update).not.toHaveBeenCalled();
      expect(mockPrismaService.billingEvent.create).toHaveBeenCalled();
    });

    it('customer.subscription.deleted sets status canceled and tier free', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-1',
        tier: 'pro',
        status: 'active',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_stripe_1',
        currentPeriodEnd: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const provider = buildProviderMock('stripe');
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'evt_6',
        type: 'customer.subscription.deleted',
        data: { id: 'sub_stripe_1' },
      });
      const service = await buildService(provider);

      await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrismaService.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_stripe_1' },
        data: { status: 'canceled', tier: 'free' },
      });
    });

    it('unknown event types are recorded but do not touch the subscription', async () => {
      const provider = buildProviderMock('stripe');
      provider.verifyAndParseWebhook.mockReturnValue({
        eventId: 'evt_7',
        type: 'invoice.paid',
        data: { id: 'in_1' },
      });
      const service = await buildService(provider);

      const result = await service.handleWebhookEvent(Buffer.from('{}'), 'sig');

      expect(mockPrismaService.subscription.upsert).not.toHaveBeenCalled();
      expect(mockPrismaService.subscription.update).not.toHaveBeenCalled();
      expect(mockPrismaService.billingEvent.create).toHaveBeenCalledWith({
        data: {
          stripeEventId: 'evt_7',
          type: 'invoice.paid',
          payload: { id: 'in_1' },
        },
      });
      expect(result).toEqual({ received: true });
    });

    it('propagates BillingNotConfiguredError when the null provider is used', async () => {
      const provider = buildProviderMock('null');
      provider.verifyAndParseWebhook.mockImplementation(() => {
        throw new BillingNotConfiguredError();
      });
      const service = await buildService(provider);

      await expect(
        service.handleWebhookEvent(Buffer.from('{}'), 'sig'),
      ).rejects.toBeInstanceOf(BillingNotConfiguredError);
    });
  });
});
