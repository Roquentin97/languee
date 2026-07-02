export interface PlanDefinition {
  tier: 'free' | 'plus' | 'pro';
  name: string;
  priceMonthlyUsd: number;
  features: string[];
}

export const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    tier: 'free',
    name: 'Free',
    priceMonthlyUsd: 0,
    features: ['Word capture', 'Basic spaced-repetition review'],
  },
  {
    tier: 'plus',
    name: 'Plus',
    priceMonthlyUsd: 9,
    features: [
      'Everything in Free',
      'Chat practice with a better model',
      'Deeper writing analysis',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    priceMonthlyUsd: 19,
    features: [
      'Everything in Plus',
      'Largest available models',
      'Streaming chat responses',
    ],
  },
];

export const STRIPE_PROVIDER_NAME = 'stripe';
export const STRIPE_API_BASE_URL = 'https://api.stripe.com/v1';
export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

const KNOWN_STRIPE_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'incomplete',
]);

/**
 * Maps a Stripe subscription status string to our SubscriptionStatus enum.
 * Stripe also emits "incomplete_expired", "unpaid", and "paused", which have
 * no direct equivalent in our enum; those fall back to "incomplete" since
 * they all represent a subscription that is not currently entitled.
 */
export function mapStripeSubscriptionStatus(
  status: string,
): 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' {
  if (KNOWN_STRIPE_SUBSCRIPTION_STATUSES.has(status)) {
    return status as
      | 'active'
      | 'trialing'
      | 'past_due'
      | 'canceled'
      | 'incomplete';
  }
  return 'incomplete';
}
