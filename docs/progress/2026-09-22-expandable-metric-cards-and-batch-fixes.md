# Chevron-expandable stat cards, Bills paid-on, Househelper multi-add

## What

A batch of UI/UX polish requests, each driven by a phone screenshot of the
live app:

- New shared component `ExpandableMetricGrid` (`packages/core/src/components/ui/expandable-metric-card.tsx`):
  a stat card with a down chevron that opens in place onto the real entries
  behind its count (design principle 21), instead of only linking away.
  Reuses `AgendaExpandableRow` and each screen's own existing item rows for
  the panel content — never a second, thinner list invented for it.
- Applied to four screens' stat-card grids, all previously plain
  (non-expandable) `MetricGrid`:
  - Home (`apps/web/app/_screens/home-dashboard.tsx`) — the four counts
    (Need you / Handled / Upcoming / Checked), plus its "Today's focus"
    section's calendar-event rows also gained a chevron with full detail
    (date/time range, protected-time flag, kind, expected action).
  - Kids & School Overview (`apps/web/app/school/page.tsx`) — Need you /
    Live work / Checked.
  - Bills & Finance Overview (`apps/web/app/bills/page.tsx`) — Need you /
    Upcoming / Settled.
  - Home & Upkeep (`apps/web/app/household/home/page.tsx`) — Need you /
    Handled / Laundry / Pets.
- Bills: a bill's actual payment date (`obligation_history.paid_on`, a
  column that existed but was application-dead) is now recorded on the
  "Add transaction" form and shown as a "Paid on" fact on each transaction
  row — separate from the period it covers.
- Groceries: the duplicate-name conflict error (`packages/core/src/commerce/repository.ts`)
  now names the existing entry and says what to do about it, instead of a
  generic "already tracking something with that name" message. The
  underlying uniqueness constraint itself was already correct — verified via
  a live SQL query that the household's rejected "Bread" really was a
  duplicate of a genuine active entry, not a bug.
- Househelper: a header "Add helper" pill is now always visible (permission
  gated), so a household with one existing helper can still add a second,
  different one. The empty-state's own "add" action was removed as
  redundant now the header covers it always, per the no-duplicate-button
  rule.

## A merge conflict found mid-session

Partway through this batch, pushing turned up that the remote branch
`claude/supabase-user-lookup-x9day2` already had a newer, unmerged commit
(`61373eb`, from an earlier pass of this same session) implementing
overlapping work: Bills Transactions-tab chevron detail with a real
`TransactionRow`/`RemoveTransactionControl`, multi-engagement Househelper
support, and a full Family "Key Member" removal. A stale branch reset
earlier in the session had discarded local awareness of it. Resolved with
`git merge` — four files had real conflicts (`finance-actions.ts`,
`bills/page.tsx`, `school/page.tsx`, `commerce/repository.ts`), all
additive on both sides; kept both sets of changes rather than picking one
over the other.

## A real bug the merge exposed

Live-browser QA (not just typecheck/lint) caught a genuine runtime crash on
every screen using the new `ExpandableMetricGrid`: `icon: ComponentType`
was being passed as a raw prop from a Server Component into
`ExpandableMetricCard`/`MetricDetailRow`, both of which are Client
Components (`"use client"`, for their open/close state). React can't
serialize a bare function reference across that boundary — "Functions
cannot be passed directly to Client Components" — so every affected page
rendered its `app/error.tsx` fallback instead of the cards.

Fixed by changing `ExpandableMetric.icon` and `MetricDetailRow.icon` from
`ComponentType<...>` + a separate `tone` prop to a single `icon: ReactNode`
— the caller (always a Server Component) now constructs the
`<IconTile icon={X} tone={Y} size="sm" />` element itself and passes the
already-rendered tile across the boundary, which is fine (a rendered React
element serializes; a raw function does not). All four call sites were
updated to match. `IconTile` itself has no `"use client"` directive, so
this composition is free.

## Verified

- `npm run verify` — full gate, green (typecheck, lint, migrations, embeds,
  boundaries, secrets, tracker, brand, security, unit tests, `test:db`,
  build, e2e).
- `npm run verify:live` — 111/111 checks against the live Supabase project
  (`kqxndableyysxqhxiorz`); `helper_profiles_multiple_engagements`
  (20260922152219) was already applied live from the earlier session pass,
  confirmed present.
- Live browser QA at 360px against a real QA household (created via
  `scripts/qa-test-user.mjs`, upgraded to the `max` plan to unlock every
  domain, deleted afterward): confirmed the client-boundary crash on Home,
  Home & Upkeep, Kids & School and Bills Overview, fixed it, then confirmed
  all four screens' chevron cards open correctly with real content. Added a
  real bill and a real transaction with a `paidOn` date through the actual
  UI and confirmed "Paid on" renders correctly (`Sun 20 Sept`) on the
  transaction's expanded detail. Confirmed Househelper's header "Add
  helper" pill is present with the empty state, no duplicate action.

## What's still open

- Groceries duplicate-message fix was verified via the earlier live-SQL
  investigation and by reading the code; the add-form's own selector
  changed since (a dropdown per rule 20) and a follow-up live-UI
  round-trip of the duplicate flow itself wasn't completed in this batch —
  low risk, since it's a string-only change to an already-correct
  constraint path.

## Where the code lives

- `packages/core/src/components/ui/expandable-metric-card.tsx` (new)
- `apps/web/app/_screens/home-dashboard.tsx`,
  `apps/web/app/school/page.tsx`, `apps/web/app/bills/page.tsx`,
  `apps/web/app/household/home/page.tsx`
- `apps/web/app/(auth)/finance-actions.ts`,
  `apps/web/app/_components/finance-forms.tsx`,
  `packages/core/src/finance/repository.ts` (paid-on)
- `packages/core/src/commerce/repository.ts` (Groceries error message)
- `apps/web/app/househelper/page.tsx` (Add helper pill)
- `design/DESIGN-NOTES.md` (new kit entry for `ExpandableMetricGrid`)
