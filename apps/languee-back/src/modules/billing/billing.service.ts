import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { UserNotFoundError } from './billing.errors';
import { PAYMENT_PROVIDER } from './billing.tokens';
import type { IPaymentProvider } from './interfaces/payment-provider.interface';
import type { BillingEventParsed } from './interfaces/payment-provider.interface';
import {
  mapStripeSubscriptionStatus,
  PLAN_DEFINITIONS,
} from './billing.constants';
import type {
  CheckoutSessionResult,
  PlansResult,
  SubscriptionSummary,
  WebhookResult,
} from './billing.types';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: IPaymentProvider,
  ) {}

  get isConfigured(): boolean {
    return this.paymentProvider.providerName !== 'null';
  }

  getPlans(): PlansResult {
    return { plans: PLAN_DEFINITIONS, billingConfigured: this.isConfigured };
  }

  async createCheckoutSession(
    userId: string,
    tier: 'plus' | 'pro',
  ): Promise<CheckoutSessionResult> {
    const user = await this.usersService.findById(userId);
    if (user === null) throw new UserNotFoundError();

    await this.prisma.subscription.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    const successUrl = this.config.get<string>('billing.successUrl') ?? '';
    const cancelUrl = this.config.get<string>('billing.cancelUrl') ?? '';

    const session = await this.paymentProvider.createCheckoutSession({
      userId,
      userEmail: user.email,
      tier,
      successUrl,
      cancelUrl,
    });

    this.logger.log({
      message: 'checkout session created',
      event: 'billing.checkout_session_created',
      method: this.createCheckoutSession.name,
      data: { userId, tier },
    });

    return session;
  }

  async getSubscription(userId: string): Promise<SubscriptionSummary> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    return {
      tier: subscription?.tier ?? 'free',
      status: subscription?.status ?? 'active',
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      billingConfigured: this.isConfigured,
    };
  }

  async handleWebhookEvent(
    rawBody: Buffer,
    signatureHeader: string,
  ): Promise<WebhookResult> {
    const parsed = this.paymentProvider.verifyAndParseWebhook(
      rawBody,
      signatureHeader,
    );

    const existing = await this.prisma.billingEvent.findUnique({
      where: { stripeEventId: parsed.eventId },
    });
    if (existing !== null) {
      this.logger.log({
        message: 'duplicate billing event ignored',
        event: 'billing.duplicate_event',
        method: this.handleWebhookEvent.name,
        data: { type: parsed.type },
      });
      return { received: true, duplicate: true };
    }

    await this.processEvent(parsed);

    this.logger.log({
      message: 'billing event processed',
      event: 'billing.event_processed',
      method: this.handleWebhookEvent.name,
      data: { type: parsed.type },
    });

    return { received: true };
  }

  private async processEvent(parsed: BillingEventParsed): Promise<void> {
    switch (parsed.type) {
      case 'checkout.session.completed':
        await this.processCheckoutCompleted(parsed);
        return;
      case 'customer.subscription.updated':
        await this.processSubscriptionUpdated(parsed);
        return;
      case 'customer.subscription.deleted':
        await this.processSubscriptionDeleted(parsed);
        return;
      default:
        await this.recordEventOnly(parsed);
    }
  }

  private async recordEventOnly(parsed: BillingEventParsed): Promise<void> {
    await this.prisma.billingEvent.create({
      data: {
        stripeEventId: parsed.eventId,
        type: parsed.type,
        payload: parsed.data as Prisma.InputJsonValue,
      },
    });
  }

  private async processCheckoutCompleted(
    parsed: BillingEventParsed,
  ): Promise<void> {
    const data = parsed.data;
    const metadata =
      (data['metadata'] as Record<string, unknown> | undefined) ?? {};
    const userId =
      (data['client_reference_id'] as string | null | undefined) ??
      (metadata['userId'] as string | undefined);
    const tier = metadata['tier'] as 'plus' | 'pro' | undefined;

    if (userId === undefined || userId === null || tier === undefined) {
      this.logger.warn({
        message:
          'checkout.session.completed event is missing userId or tier metadata',
        event: 'billing.checkout_completed_missing_metadata',
        method: this.processCheckoutCompleted.name,
      });
      await this.recordEventOnly(parsed);
      return;
    }

    const stripeCustomerId = (data['customer'] as string | null) ?? null;
    const stripeSubscriptionId =
      (data['subscription'] as string | null) ?? null;

    await this.prisma.$transaction([
      this.prisma.subscription.upsert({
        where: { userId },
        update: {
          tier,
          status: 'active',
          stripeCustomerId,
          stripeSubscriptionId,
        },
        create: {
          userId,
          tier,
          status: 'active',
          stripeCustomerId,
          stripeSubscriptionId,
        },
      }),
      this.prisma.billingEvent.create({
        data: {
          stripeEventId: parsed.eventId,
          type: parsed.type,
          payload: data as Prisma.InputJsonValue,
        },
      }),
    ]);
  }

  private async processSubscriptionUpdated(
    parsed: BillingEventParsed,
  ): Promise<void> {
    const data = parsed.data;
    const stripeSubscriptionId = data['id'] as string;
    const status = mapStripeSubscriptionStatus(data['status'] as string);
    const currentPeriodEndEpoch = data['current_period_end'] as
      | number
      | undefined;
    const currentPeriodEnd =
      currentPeriodEndEpoch !== undefined
        ? new Date(currentPeriodEndEpoch * 1000)
        : null;

    const subscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });
    if (subscription === null) {
      this.logger.warn({
        message:
          'customer.subscription.updated references an unknown stripeSubscriptionId',
        event: 'billing.subscription_updated_unknown',
        method: this.processSubscriptionUpdated.name,
      });
      await this.recordEventOnly(parsed);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { stripeSubscriptionId },
        data: { status, currentPeriodEnd },
      }),
      this.prisma.billingEvent.create({
        data: {
          stripeEventId: parsed.eventId,
          type: parsed.type,
          payload: data as Prisma.InputJsonValue,
        },
      }),
    ]);
  }

  private async processSubscriptionDeleted(
    parsed: BillingEventParsed,
  ): Promise<void> {
    const data = parsed.data;
    const stripeSubscriptionId = data['id'] as string;

    const subscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });
    if (subscription === null) {
      this.logger.warn({
        message:
          'customer.subscription.deleted references an unknown stripeSubscriptionId',
        event: 'billing.subscription_deleted_unknown',
        method: this.processSubscriptionDeleted.name,
      });
      await this.recordEventOnly(parsed);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { stripeSubscriptionId },
        data: { status: 'canceled', tier: 'free' },
      }),
      this.prisma.billingEvent.create({
        data: {
          stripeEventId: parsed.eventId,
          type: parsed.type,
          payload: data as Prisma.InputJsonValue,
        },
      }),
    ]);
  }
}
