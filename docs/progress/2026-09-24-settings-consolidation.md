# Settings & Profile consolidation (story 01-009)

**Date:** 2026-09-24 · **Module:** 01 Identity & Family Accounts · **PR:** Settings consolidation

## What was done

The consolidation brief asks for one rule: every setting has exactly one
canonical editor and one source of truth. Settings is where a person
controls how WonderHome works for them. It is not another operational
module.

### The audit, before any change

Every editor of the settings in the brief was traced to the action it calls.

**The only real duplicate.** A signed-in person could edit their own
profile and photo in two places: in Settings, and again in their own card
on Family and Househelper. It was the same action and the same stored
values, but two editors.

**Checked and found to be single editors:**
- **Language & Region.** Language, region, currency, time zone, formats,
  units and member languages are edited only under Settings. Onboarding
  writes through the same repositories, and the time zone is first set
  once when the household is created.
- **Notifications.** Channels, quiet hours, reminder timing, the daily
  digest and learned timing are edited only in `/settings/notifications`.
  `/notifications` only reads them.
- **Voice.** Voice is edited only in `/settings/voice`. HomeTalk's live
  engine picker keeps a per-device choice in the browser. It writes nothing
  to the server and has no provider, voice or language picker of its own.
- **Other settings, each with its own page only:** Voice assistants, the
  household AI key, data use, privacy export and deletion, the plan, the
  WhatsApp intake link, and integrations.

**Two WhatsApp values.** These are different stored values, not
duplicates:
- the number reminders are sent to, set in Notifications;
- the verified WhatsApp link that forwards things into HomeSend, set in
  Settings → WhatsApp.

The reminder number's hint now says so and points to the right place.

### Changes

- **`/settings`** is now the profile card (editable, with the photo)
  followed by grouped rows:
  - **Personal:** Language & Region, Notifications, Voice, Voice assistants;
  - **AI & privacy:** AI Assistant, Privacy & security;
  - **Connected services:**
    - WhatsApp, only once the deployment has a number;
    - Connected accounts, only with `integrations.manage`;
  - **Plan & usage:** Your plan;
  - **Account:** Log out.

  Every row has a chevron that turns for right-to-left layouts.
- **New `/settings/ai`.** The household AI key (status, save, remove) and
  the data-use policy moved here unchanged, with the same actions and the
  same `household.manage` gate. A stored key is never shown.
- **New `/settings/plan`.** Usage this period, trials and policy lines,
  and `PlanForm` moved here unchanged. The payment provider's return URL
  now lands here, so the "your plan changes once the payment is
  confirmed" notice appears where the plan is.
- **Removed from Settings:**
  - the "Two-factor authentication — Soon" row (nothing unbuilt is listed);
  - the separate Export and Delete rows (Privacy covers both);
  - the Role/Time zone/permissions box (the role is on the profile card;
    the time zone is in the Language & Region line and its page);
  - Help (still in the avatar menu and on More).
- **Your own profile elsewhere.** Your own card on Family and Househelper
  now shows the facts and an "Edit your profile in Settings" link instead
  of a second editor. An Admin editing someone else is managing the
  household's people, so that stays there.
- **Privacy.** It still shows the data-use policy, and links to Settings →
  AI Assistant for changing it.
- **Revalidation.** The AI key and data-use actions now also revalidate
  `/settings/ai`.
- **CLAUDE.md.** Rule 23, "Every setting has one editor."
- **e2e.** The signed-out gate test now covers `/settings/ai` and
  `/settings/plan`.

## Verified

- **Typecheck and lint**: clean.
- **Browser QA** at 360px and 1280px, against the live project with a QA
  household, and no horizontal scroll on any page:
  - the grouped Settings page;
  - AI Assistant, Your plan and Privacy;
  - your own Family card, whose link opened `/settings`;
  - after adding a child, the Admin still editing the child's card on
    Family.
- **Full `npm run verify`**: see the PR.

## Still open / needs a person

- **The mockup's extra controls were not added.** Response style, task
  suggestions, auto-create reminders, weekly digest, household name and
  invites inside Settings have nothing behind them, and the brief says not
  to invent them.
- **Right-to-left chevrons.** They use the project's `rtl:rotate-180`
  convention. The full right-to-left pass is story 22-008.
- **Payments.** The Razorpay + Stripe work builds on `/settings/plan`.

## Cleanup

Done after the merge (#168, `680033c`):
- **QA household.** "Mehta QA Home" (`167f83f2-4bba-4b85-a51e-7645ff637aba`)
  was deleted with every row in it, including the child added for the Admin
  check.
- **QA account.** `67b2a3c2-9a87-47b5-a94e-07195c1209bd` was deleted.
- **Local debris.** The scratch scripts and screenshots were removed, and the
  dev server was stopped.

A count over the household's tables, the auth user and Storage found nothing
left.

## Where the code lives

- `apps/web/app/settings/page.tsx`
- `apps/web/app/settings/ai/page.tsx`
- `apps/web/app/settings/plan/page.tsx`
- `apps/web/app/_components/member-detail.tsx`
- `apps/web/app/settings/privacy/page.tsx`
- `apps/web/app/api/v1/households/[householdId]/plan/route.ts`
