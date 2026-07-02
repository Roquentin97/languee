export interface CheckoutSessionInput {
  userId: string;
  userEmail: string;
  tier: 'plus' | 'pro';
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export interface BillingEventParsed {
  eventId: string;
  type: string;
  data: Record<string, unknown>;
}

/**
 * Pluggable adapter for any external payment provider.
 * Implementations must throw PaymentProviderError on non-2xx responses and
 * WebhookSignatureError when webhook signature verification fails.
 */
export interface IPaymentProvider {
  readonly providerName: string;
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession>;
  verifyAndParseWebhook(
    rawBody: Buffer,
    signatureHeader: string,
  ): BillingEventParsed;
}
