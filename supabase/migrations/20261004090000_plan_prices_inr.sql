-- What Pro and Max cost (story 20-010), as decided by the product owner on
-- 2026-09-24: Pro ₹299 a month, Max ₹599 a month, and a year at 20% off
-- twelve months — rounded down to whole rupees, so ₹2,870 and ₹5,750.
--
-- Prices only. No plan is marked `requires_payment` here: until a payment
-- provider is live, switching to Pro or Max stays free and the screens say
-- "free during early access". Marking the plans paid is a separate, later
-- step taken once Razorpay or Stripe is configured, and no provider plan is
-- mapped here either (`payment_provider_plans` needs the provider's own ids).

insert into public.plan_prices (plan_key, billing_interval, currency, amount)
select plan_key, billing_interval, 'INR', amount
from (values
  ('pro', 'month', 299.00),
  ('pro', 'year', 2870.00),
  ('max', 'month', 599.00),
  ('max', 'year', 5750.00)
) as seed(plan_key, billing_interval, amount)
where exists (select 1 from public.plans where key = seed.plan_key)
  and not exists (
    select 1 from public.plan_prices existing
    where existing.plan_key = seed.plan_key
      and existing.billing_interval = seed.billing_interval
      and existing.currency = 'INR'
      and existing.active
  );
