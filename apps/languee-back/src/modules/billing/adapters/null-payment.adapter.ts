import { Injectable } from '@nestjs/common';
import { BillingNotConfiguredError } from '../billing.errors';
import {
  BillingEventParsed,
  CheckoutSession,
  CheckoutSessionInput,
  IPaymentProvider,
} from '../interfaces/payment-provider.interface';

/**
 * Used whenever Stripe credentials are not configured. Any attempt to use
 * payment operations throws BillingNotConfiguredError, which the controller
 * maps to a 503 response.
 */
@Injectable()
export class NullPaymentProvider implements IPaymentProvider {
  readonly providerName = 'null';

  // eslint-disable-next-line @typescript-eslint/require-await
  async createCheckoutSession(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _input: CheckoutSessionInput,
  ): Promise<CheckoutSession> {
    throw new BillingNotConfiguredError();
  }

  verifyAndParseWebhook(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _rawBody: Buffer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _signatureHeader: string,
  ): BillingEventParsed {
    throw new BillingNotConfiguredError();
  }
}
