import type { PlanDefinition } from './billing.constants';

export type SubscriptionTierValue = 'free' | 'plus' | 'pro';
export type SubscriptionStatusValue =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete';

export interface PlansResult {
  plans: PlanDefinition[];
  billingConfigured: boolean;
}

export interface CheckoutSessionResult {
  url: string;
  sessionId: string;
}

export interface SubscriptionSummary {
  tier: SubscriptionTierValue;
  status: SubscriptionStatusValue;
  currentPeriodEnd: Date | null;
  billingConfigured: boolean;
}

export interface WebhookResult {
  received: true;
  duplicate?: true;
}
