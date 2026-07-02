import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  STRIPE_API_BASE_URL,
  STRIPE_PROVIDER_NAME,
  STRIPE_WEBHOOK_TOLERANCE_SECONDS,
} from '../billing.constants';
import { PaymentProviderError, WebhookSignatureError } from '../billing.errors';
import {
  BillingEventParsed,
  CheckoutSession,
  CheckoutSessionInput,
  IPaymentProvider,
} from '../interfaces/payment-provider.interface';

interface StripeErrorResponse {
  error?: { type?: string; message?: string };
}

interface StripeCheckoutSessionResponse {
  id: string;
  url: string;
}

interface ParsedSignatureHeader {
  timestamp: number;
  signatures: string[];
}

@Injectable()
export class StripePaymentAdapter implements IPaymentProvider {
  readonly providerName = STRIPE_PROVIDER_NAME;
  private readonly logger = new Logger(StripePaymentAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSession> {
    const priceId =
      input.tier === 'plus'
        ? this.config.get<string>('billing.stripePricePlus')
        : this.config.get<string>('billing.stripePricePro');

    const body = new URLSearchParams();
    body.set('mode', 'subscription');
    body.set('line_items[0][price]', priceId ?? '');
    body.set('line_items[0][quantity]', '1');
    body.set('success_url', input.successUrl);
    body.set('cancel_url', input.cancelUrl);
    body.set('customer_email', input.userEmail);
    body.set('client_reference_id', input.userId);
    body.set('metadata[userId]', input.userId);
    body.set('metadata[tier]', input.tier);

    let response: Response;
    try {
      response = await fetch(`${STRIPE_API_BASE_URL}/checkout/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.get<string>('billing.stripeSecretKey')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    } catch (err: unknown) {
      throw new PaymentProviderError(
        'Stripe checkout session request failed',
        err,
      );
    }

    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({}))) as StripeErrorResponse;
      this.logger.error({
        message: 'stripe checkout session creation failed',
        event: 'billing.stripe_checkout_failed',
        method: this.createCheckoutSession.name,
        data: {
          status: response.status,
          errorType: errorBody.error?.type ?? 'unknown',
        },
      });
      throw new PaymentProviderError(
        `Stripe checkout session creation failed with status ${response.status}`,
      );
    }

    const session = (await response.json()) as StripeCheckoutSessionResponse;
    return { url: session.url, sessionId: session.id };
  }

  verifyAndParseWebhook(
    rawBody: Buffer,
    signatureHeader: string,
  ): BillingEventParsed {
    const webhookSecret = this.config.get<string>(
      'billing.stripeWebhookSecret',
    );
    const { timestamp, signatures } =
      this.parseSignatureHeader(signatureHeader);

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestamp) > STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
      throw new WebhookSignatureError('Webhook timestamp is outside tolerance');
    }

    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expectedSignature = createHmac('sha256', webhookSecret ?? '')
      .update(signedPayload)
      .digest('hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    const matches = signatures.some((candidate) => {
      const candidateBuffer = Buffer.from(candidate, 'utf8');
      if (candidateBuffer.length !== expectedBuffer.length) return false;
      return timingSafeEqual(candidateBuffer, expectedBuffer);
    });

    if (!matches) {
      throw new WebhookSignatureError('Webhook signature does not match');
    }

    const parsedBody = JSON.parse(rawBody.toString('utf8')) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };

    return {
      eventId: parsedBody.id,
      type: parsedBody.type,
      data: parsedBody.data.object,
    };
  }

  private parseSignatureHeader(header: string): ParsedSignatureHeader {
    if (header.length === 0) {
      throw new WebhookSignatureError('Missing Stripe-Signature header');
    }

    let timestamp: number | undefined;
    const signatures: string[] = [];

    for (const part of header.split(',')) {
      const [key, value] = part.split('=', 2);
      if (key === undefined || value === undefined) continue;
      if (key === 't') timestamp = Number.parseInt(value, 10);
      if (key === 'v1') signatures.push(value);
    }

    if (timestamp === undefined || Number.isNaN(timestamp)) {
      throw new WebhookSignatureError(
        'Malformed Stripe-Signature header: missing timestamp',
      );
    }
    if (signatures.length === 0) {
      throw new WebhookSignatureError(
        'Malformed Stripe-Signature header: missing v1 signature',
      );
    }

    return { timestamp, signatures };
  }
}
