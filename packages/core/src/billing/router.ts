import type { BillingProvider, PaymentProviderName } from "./provider";
import { razorpayFromEnv } from "./razorpay";
import { stripeFromEnv } from "./stripe";

/**
 * Which payment providers this deployment has, and which one takes a given
 * payment (story 20-009).
 *
 * No module names Razorpay or Stripe to decide anything. Enabling one is
 * configuration, and choosing between them is `selectPaymentProvider`: pure,
 * over which providers are live and which have a price mapped for what is
 * being bought, with defaults a deployment can change:
 *
 *   - INR, or a household in India → `WONDERHOME_BILLING_INDIA_PROVIDER` (razorpay)
 *   - anything else                → `WONDERHOME_BILLING_INTERNATIONAL_PROVIDER` (stripe)
 *   - a preference the person made is honoured only where it is eligible
 *   - nothing eligible → no provider, and the reason, never a quiet switch
 *
 * A payment that has started is never moved to another provider: the choice
 * is made once, when the checkout is opened.
 */

export const PAYMENT_PROVIDERS: readonly PaymentProviderName[] = ["razorpay", "stripe"];

type Env = Record<string, string | undefined>;

/** The providers this deployment turned on (`WONDERHOME_BILLING_PROVIDERS=razorpay,stripe`), live or not. */
export function enabledProviderNames(env: Env = process.env): PaymentProviderName[] {
  const listed = (env.WONDERHOME_BILLING_PROVIDERS ?? env.WONDERHOME_BILLING_PROVIDER ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return PAYMENT_PROVIDERS.filter((name) => listed.includes(name));
}

/** Every live provider this deployment has, each fully configured or absent. */
export function billingProvidersFromEnv(env: Env = process.env): BillingProvider[] {
  const providers: BillingProvider[] = [];
  for (const name of enabledProviderNames(env)) {
    const provider = name === "razorpay" ? razorpayFromEnv(env) : stripeFromEnv(env);
    if (provider?.live) providers.push(provider);
  }
  return providers;
}

export function billingProviderNamed(name: string, env: Env = process.env): BillingProvider | null {
  return billingProvidersFromEnv(env).find((provider) => provider.name === name) ?? null;
}

export type RoutingConfig = { indiaProvider: PaymentProviderName; internationalProvider: PaymentProviderName };

export function routingConfigFromEnv(env: Env = process.env): RoutingConfig {
  const pick = (value: string | undefined, fallback: PaymentProviderName) => {
    const name = value?.trim().toLowerCase();
    return (PAYMENT_PROVIDERS as readonly string[]).includes(name ?? "") ? (name as PaymentProviderName) : fallback;
  };
  return {
    indiaProvider: pick(env.WONDERHOME_BILLING_INDIA_PROVIDER, "razorpay"),
    internationalProvider: pick(env.WONDERHOME_BILLING_INTERNATIONAL_PROVIDER, "stripe"),
  };
}

export type ProviderChoice =
  | { provider: PaymentProviderName; reason: "preferred" | "india_default" | "international_default" | "only_eligible" }
  | { provider: null; reason: "none_eligible" };

/**
 * Picks the provider for one payment.
 *
 * `eligible` is every provider that is live and has a price mapped for this
 * plan, interval and currency — the caller works that out from the catalogue,
 * so this function never has to trust anything a browser said.
 */
export function selectPaymentProvider(input: {
  currency: string;
  country: string | null;
  preferred?: string | null;
  eligible: readonly PaymentProviderName[];
  config: RoutingConfig;
}): ProviderChoice {
  const eligible = input.eligible;
  if (eligible.length === 0) return { provider: null, reason: "none_eligible" };

  const preferred = input.preferred?.toLowerCase();
  if (preferred && (eligible as readonly string[]).includes(preferred)) return { provider: preferred as PaymentProviderName, reason: "preferred" };

  const india = input.currency.toUpperCase() === "INR" || input.country?.toUpperCase() === "IN";
  const target = india ? input.config.indiaProvider : input.config.internationalProvider;
  if (eligible.includes(target)) return { provider: target, reason: india ? "india_default" : "international_default" };

  return { provider: eligible[0]!, reason: "only_eligible" };
}
