# A UX clarity pass across every screen — what was real, and what wasn't

**Date:** 2026-09-20
**Scope:** 28 screens audited; fixes in `household/page.tsx`, `household/integrations/page.tsx`,
`reset-password/page.tsx`, `today/page.tsx`, `certification/page.tsx` (+ new
`_components/certification-controls.tsx`), `_components/config-forms.tsx`,
`packages/core/src/identity/schemas.ts`
**Status:** Done for the confirmed real gaps; two findings deliberately left alone (below)

## What this is

Direct request: "make all the screens logical and intuitive for the user to
understand and input any required information. go through all the screens
one by one and verify." Three background agents each audited a slice of the
app's 28 routes for label clarity, input ambiguity, error/pending feedback,
and dead ends — not for "is this pretty" but for "could a real person get
stuck, confused, or misled here."

## What almost went wrong

The first pass (a separate audit earlier in the session, covering Groceries,
Bills, Home & upkeep, School, Meals, Househelper, Family, Activity,
Notifications, Members) flagged non-clickable rows and missing manual "add"
forms as gaps on several domain screens. Both readings turned out to be
wrong once checked against the code's own stated intent:

- `ActionRow` (the shared row those screens are built from) carries an
  explicit design comment: "the action sits on the row rather than behind a
  tap-through... a row with nothing to do about it simply has no action, and
  that is a meaningful state rather than a missing button." Retrofitting
  click-to-expand there would have fought a documented rule, not fixed one.
- Home & upkeep and School already have `createAsset`/`createServiceRequest`/
  `createSchoolItem` built — but wired only to REST API routes meant for the
  AI assistant to call. Building parallel manual forms would have duplicated
  the intended "Talk to WonderHome" creation path, not filled a gap.

Both are noted here so the next session doesn't rediscover the same dead
end. Responsibilities (fixed in the previous activity this session) really
was a gap — its rows were static with no documented reason, and its own
add/edit form existed already, just never wired to the page.

## What was fixed

- **`household/page.tsx`** — the playbook and policy empty states described
  what belongs there but gave no way to add one; added `PillLink`s to the
  matching setup-wizard step.
- **`household/integrations/page.tsx`** — a "Reconnect" `Badge` implied an
  action that doesn't exist (it's a non-interactive span, and no connect
  flow is live yet). Relabeled to "Needs reconnecting" — a status word, not
  a promise.
- **`reset-password/page.tsx`** — the expired/used-link error told the user
  what happened but gave no way to act on it. Added the same `footer` link
  pattern `forgot-password` already uses, pointing back to it.
- **`welcome/page.tsx`** (via `identity/schemas.ts`) — `householdName` and
  `displayName` shared one `trimmedName` schema whose message was a bare "is
  required" — on a two-name-field form with one top-of-form error, a user
  leaving either blank had no way to tell which. Split into two schemas with
  field-naming messages, matching how sign-up's messages already work.
- **`today/page.tsx`** — every fetch was `.catch(() => [])`, so a genuine
  backend failure rendered identically to "your day is clear." Added a
  `settle`/`ok` pair that tracks a `failed` flag per source; when anything
  failed, a banner and a different empty-state title say so instead of
  claiming a clear day WonderHome couldn't actually confirm.
- **`certification/page.tsx`** — `reviewCertificationAction` returned `void`
  and silently no-op'd on any failure (bad payload, a child reviewing, a
  missing item, a DB error) with only a server log; the buttons were plain
  `<form action={...}>` with no pending state, so a click gave no feedback
  beyond the item eventually vanishing from the tab. Converted the action to
  the app's standard `ActionState` shape and built `CertificationControls`
  (a small client component, `useActionState` + `useFormStatus` per button)
  so a failed review now says why, and a pending one visibly shows it.
- **`_components/config-forms.tsx`** — `ResponsibilityForm`'s Priority field
  was a bare 1–5 `Select` with no indication which end matters more, and
  nothing elsewhere in the domain code documents it either. Labelled the
  ends ("1 — Most important" / "5 — Least important") and added a hint,
  consistent with the ascending `order("priority")` already used everywhere
  it's read.

## What was found and deliberately left alone

**`invite/[token]/page.tsx`** never shows which household or who invited the
user before "Accept invitation." The audit read this as a real gap — and as
a one-line UX fix it would be, except the page carries its own comment:
"the page never says whether the token is valid... so simply loading a link
cannot be used to test whether an invitation exists." Showing the household
name pre-accept would mean looking the invitation up before submission,
which is exactly what that comment says is deliberately avoided. Reversing
a stated anti-enumeration decision to fix a UX nit is a security-posture
call, not a copy fix, so it wasn't made unilaterally. Flagged for a person to
decide: is the enumeration risk here (a long random token, not a guessable
email) worth the blind-accept UX cost it buys?

## What was verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`,
  `npm run lint:secrets` — clean
- `npm run build` — succeeds
- `npm run verify` (typecheck, lint×4, tracker/brand checks, P0 security
  suite, unit tests, `test:db`, build, E2E desktop+mobile) — 252/252 E2E,
  passes end to end
- Not verified in a live browser — same constraint as every other UI change
  this session (`2026-09-20-nav-drawer.md`): no seed script for a test
  household, dev points at a rate-limited live Supabase project.

## Where

`apps/web/app/household/page.tsx`, `household/integrations/page.tsx`,
`reset-password/page.tsx`, `today/page.tsx`, `certification/page.tsx`,
`_components/certification-controls.tsx` (new), `_components/config-forms.tsx`,
`(auth)/certification-actions.ts`, `packages/core/src/identity/schemas.ts`.
