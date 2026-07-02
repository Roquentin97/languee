import type {
  CheckoutSessionResult,
  PlansResult,
  SubscriptionSummary,
} from '../billing.types';
import { CheckoutSessionResponseDto } from '../dto/checkout-session-response.dto';
import { PlansResponseDto } from '../dto/plans-response.dto';
import { SubscriptionResponseDto } from '../dto/subscription-response.dto';

export function serializePlans(result: PlansResult): PlansResponseDto {
  return {
    plans: result.plans.map((plan) => ({
      tier: plan.tier,
      name: plan.name,
      priceMonthlyUsd: plan.priceMonthlyUsd,
      features: plan.features,
    })),
    billingConfigured: result.billingConfigured,
  };
}

export function serializeCheckoutSession(
  result: CheckoutSessionResult,
): CheckoutSessionResponseDto {
  return { url: result.url, sessionId: result.sessionId };
}

export function serializeSubscription(
  result: SubscriptionSummary,
): SubscriptionResponseDto {
  return {
    tier: result.tier,
    status: result.status,
    currentPeriodEnd:
      result.currentPeriodEnd !== null
        ? result.currentPeriodEnd.toISOString()
        : null,
    billingConfigured: result.billingConfigured,
  };
}
