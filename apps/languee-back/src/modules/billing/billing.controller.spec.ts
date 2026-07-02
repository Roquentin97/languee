import 'reflect-metadata';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  BillingNotConfiguredError,
  WebhookSignatureError,
} from './billing.errors';
import type { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import type { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';

const mockUser: CurrentUserPayload = {
  userId: 'user-1',
  sessionId: 'session-1',
};

const mockBillingService = {
  getPlans: jest.fn(),
  createCheckoutSession: jest.fn(),
  getSubscription: jest.fn(),
  handleWebhookEvent: jest.fn(),
};

function fakeRequest(rawBody: Buffer | undefined): RawBodyRequest<Request> {
  return { rawBody } as RawBodyRequest<Request>;
}

describe('BillingController', () => {
  let controller: BillingController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [{ provide: BillingService, useValue: mockBillingService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BillingController>(BillingController);
  });

  function guardsForRoute(
    route: 'getPlans' | 'createCheckoutSession' | 'getSubscription' | 'webhook',
  ): unknown[] | undefined {
    const handler = BillingController.prototype[route];
    return Reflect.getMetadata(GUARDS_METADATA, handler) as
      | unknown[]
      | undefined;
  }

  describe('guard wiring', () => {
    it('applies JwtAuthGuard to plans, checkout-session, and subscription', () => {
      const routes = [
        'getPlans',
        'createCheckoutSession',
        'getSubscription',
      ] as const;
      for (const route of routes) {
        expect(guardsForRoute(route)).toContain(JwtAuthGuard);
      }
    });

    it('does not apply any guard to the webhook route', () => {
      expect(guardsForRoute('webhook')).toBeUndefined();
    });
  });

  describe('getPlans', () => {
    it('returns the service result serialized', () => {
      mockBillingService.getPlans.mockReturnValue({
        plans: [
          { tier: 'free', name: 'Free', priceMonthlyUsd: 0, features: [] },
        ],
        billingConfigured: false,
      });

      const result = controller.getPlans();

      expect(result.billingConfigured).toBe(false);
      expect(result.plans).toHaveLength(1);
    });
  });

  describe('createCheckoutSession', () => {
    it('returns 201-shaped body on success', async () => {
      mockBillingService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/c/pay/cs_test_1',
        sessionId: 'cs_test_1',
      });

      const result = await controller.createCheckoutSession(
        { tier: 'plus' },
        mockUser,
      );

      expect(result).toEqual({
        url: 'https://checkout.stripe.com/c/pay/cs_test_1',
        sessionId: 'cs_test_1',
      });
    });

    it('maps BillingNotConfiguredError to ServiceUnavailableException', async () => {
      mockBillingService.createCheckoutSession.mockRejectedValue(
        new BillingNotConfiguredError(),
      );

      await expect(
        controller.createCheckoutSession({ tier: 'plus' }, mockUser),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('getSubscription', () => {
    it('returns the serialized subscription', async () => {
      mockBillingService.getSubscription.mockResolvedValue({
        tier: 'free',
        status: 'active',
        currentPeriodEnd: null,
        billingConfigured: false,
      });

      const result = await controller.getSubscription(mockUser);

      expect(result).toEqual({
        tier: 'free',
        status: 'active',
        currentPeriodEnd: null,
        billingConfigured: false,
      });
    });
  });

  describe('webhook', () => {
    it('returns 200 body on success', async () => {
      mockBillingService.handleWebhookEvent.mockResolvedValue({
        received: true,
      });

      const result = await controller.webhook(
        fakeRequest(Buffer.from('{}')),
        't=1,v1=abc',
      );

      expect(result).toEqual({ received: true });
    });

    it('maps WebhookSignatureError to 400 INVALID_SIGNATURE', async () => {
      mockBillingService.handleWebhookEvent.mockRejectedValue(
        new WebhookSignatureError('bad signature'),
      );

      await expect(
        controller.webhook(fakeRequest(Buffer.from('{}')), 't=1,v1=abc'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('maps BillingNotConfiguredError to 503', async () => {
      mockBillingService.handleWebhookEvent.mockRejectedValue(
        new BillingNotConfiguredError(),
      );

      await expect(
        controller.webhook(fakeRequest(Buffer.from('{}')), 't=1,v1=abc'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('returns 400 when the raw body was not captured', async () => {
      await expect(
        controller.webhook(fakeRequest(undefined), 't=1,v1=abc'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockBillingService.handleWebhookEvent).not.toHaveBeenCalled();
    });
  });
});
