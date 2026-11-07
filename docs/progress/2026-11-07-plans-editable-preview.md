# Platform admin: plans shown as members see them, editable by the owner (2026-11-07)

Owner request: "give option to edit this as it will look like to end user."

## What was done
- `/platform-admin/plans` now draws each plan with `app/_components/plan-card.tsx`, the same card `PlanForm` uses on Settings → Your plan. Members' plan list now also lists what each plan includes (member labels from `FEATURES`, never raw keys).
- **Badge fix.** The Pro card said "Free" because `plans.requires_payment` is false (early access). `planBadge` (`billing/plan-shared.ts`) is Free only when no price is above zero; a priced plan is "Paid" once payments are required, else "Priced · free during early access" (the member card already said "Free during early access").
- **Edit in place** (platform owner only; `plans.edit` capability, owner role): name, description, monthly and yearly price (decimal text, ≤ 2 decimals, INR, yearly saving in words), each feature on/off and its monthly limit or Unlimited. "Preview as member" toggles the inputs off. "Review changes" asks the server (`PATCH /api/v1/platform-admin/plans/{planKey}`, `confirm: false`) for the truthful sentences; "Save changes" repeats it with `confirm: true`.
- Saving (`billing/plan-edit.ts` `savePlan`): checks owner again, retires the active price and inserts a new one (so provider mappings and past terms stay true), updates `plans` and `plan_features`, calls `forgetPlatformData("plan_catalog")`, and writes one `platform.plan_updated` audit row with who and each field's old → new.

## Decisions to know
- There was no existing editor for plan name, price, enabled or limit; `setFeaturePolicy` only edits burst and fair-use, which keep their own route. So this is the only path for these fields, not a second one.
- A new price has no `payment_provider_plans` mapping, so it cannot be bought until mapped at the provider. The confirm panel says so; nothing here changes a provider. No household moves to a paid plan; `requires_payment` is not editable here.
- Staff-only admin pages are English throughout `/platform-admin`; the new admin text follows that. The words shared with members (`settingsPage.plan.*`) come from the existing catalogs.
- Help guide / release note not touched (release notes wait for the owner to confirm a version is live).

## Verified
- `npm run typecheck`, `npm run build -w apps/web`, eslint on touched web files, vitest for billing, platform, security, api (506+ tests incl. 11 new: badge, decimal validation, owner-only, dry run writes nothing, save writes + cache clear + audit, every seeded feature key has a label).
- Live check with a QA owner against the live project, at 360 px (no horizontal overflow) and 1280 px: badges, labels, edit inputs, Review changes (dry run only; no live plan was changed). QA account, profile and platform_admins row deleted; `.env.local` removed.

## Open
- Nothing was saved to live plans. After deploy, the owner can edit Pro and check Settings → Your plan within a minute.
