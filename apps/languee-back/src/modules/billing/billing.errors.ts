export class BillingNotConfiguredError extends Error {
  constructor() {
    super('Billing is not configured');
    this.name = 'BillingNotConfiguredError';
  }
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super('User not found');
    this.name = 'UserNotFoundError';
  }
}
