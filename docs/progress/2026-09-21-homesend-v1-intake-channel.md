# HomeSend v1: a real upload/paste intake channel

## What happened

Phase C of the HomeTalk/HomeBrain/HomeSend architecture (product-direction
v4 §5; Phase A renamed Talk→HomeTalk and Household Brain→HomeBrain, Phase B
wired the specialist pipeline into a real, live, governed agent run). This
phase builds the third named surface: a real, honestly-scoped inbound
channel for a photo, a file, or a forwarded message, classified and routed
into a real domain table only once a person confirms it.

No real WhatsApp or email webhook exists — this repo has no credentials for
either, and CLAUDE.md forbids claiming a live third-party integration
without them. HomeSend v1 is real intake *from inside the app*: upload or
paste, shaped so a real webhook can insert into the same table later without
a redesign.

## What shipped

- **`supabase/migrations/20260921180000_home_send_items.sql`** — the
  `home_send_items` table (`source: manual_upload | pasted_text`, `status:
  received → classified → routed | dismissed`, `classified_kind`,
  `extracted` jsonb, `routed_table`/`routed_id` set together once confirmed)
  plus a private `home-send` Storage bucket, RLS shaped exactly like the
  `avatars` bucket (`<household_id>/<item_id>` path as the authorization
  boundary). Any household member may see and act on an item — a shared
  inbox, not a personal one — but only their own `created_by_member_id`.
  Applied live via the Supabase MCP `apply_migration` tool and confirmed
  with `npm run verify:live` (76/76 checks) and a direct
  `information_schema`/`storage.buckets` read, same session.
- **`packages/core/src/ai/classify-intake.ts`** — generalizes
  `vision-extract.ts`'s school-only extraction to `classifyIntake(provider,
  apiKey, {image} | {text})`, returning one of four kinds (`bill |
  school_item | grocery_item | unknown`) plus per-kind fields. Same
  three-provider dispatch (Anthropic/Google/OpenAI), same never-guess
  (a field the source doesn't show comes back `null`) and never-throw
  (every failure resolves to `null`, the confirm form just stays blank)
  contract as the rest of `ai/`.
- **`packages/core/src/homesend/items.ts`, `repository.ts`** — shapes and
  the DB round trip (`createHomeSendItem`, `setHomeSendClassification`,
  `routeHomeSendItem`, `dismissHomeSendItem`). Repository functions are
  verified by typecheck/build per this codebase's existing convention for
  `SupabaseClient`-composing code, not a mocked network boundary.
- **`apps/web/app/(auth)/home-send-actions.ts`** — `uploadHomeSendItemAction`
  and `pasteHomeSendItemAction` (insert the item, then classify it inline),
  `routeHomeSendItemAction` (writes into the real domain table via that
  domain's own already-governed create function — `createObligation`,
  `createSchoolItem`, `createConsumable` — then marks the item routed),
  `dismissHomeSendItemAction` (rule 12's other half: say it wasn't worth
  adding). Nothing before the confirm submit ever writes a domain row.
- **`apps/web/app/_components/home-send-sheet.tsx`** — the confirm UI,
  mirroring `AddHomeworkButton`'s screenshot-import shape (extraction only
  fills a form; the form's own submit is what writes anything), generalized
  to three destinations with kind-specific fields swapped by a single
  lifted `kind` selector.
- **`packages/core/src/components/ui/talk-composer.tsx`** — a new optional
  `onAttach` prop renders a paperclip button beside the mic, composing-state
  only. This is HomeSend's one entry point: a second input *modality* of the
  same door (rule 13), not a second door — the mic turns speech into text
  for review, the paperclip turns a photo or a paste into a confirm form for
  review, and neither writes anything without the household saying so.
- **`apps/web/app/ai/assistant.tsx`, `apps/web/app/ai/page.tsx`** — wires
  the sheet in: `page.tsx` now also fetches the household's children (for
  the school-item confirm step's "who is this for"), `assistant.tsx` owns
  the sheet's open state and passes `onAttach` to the composer.
- **`scripts/test-homesend-rls.mjs`** — 10 new DB/RLS tests: shared-inbox
  visibility, cross-household isolation, `created_by_member_id` cannot be
  forged, the source/content and routed-table/id check constraints, and
  (using `deniedForUpdate`, not `deniedForProfile` — an UPDATE with no
  matching policy silently matches zero rows rather than throwing) that an
  outsider cannot touch another household's item.
- **`design/DESIGN-NOTES.md`** — `TalkComposer`'s entry updated for
  `onAttach`; a new `HomeSendSheet` entry added.

## Verified

- `npm run verify`'s full gate: typecheck, lint, migrations/embeds/
  boundaries/secrets lint, tracker check (21 modules, untouched by this
  phase), brand check, security suite (9/9 areas), 1343 unit tests,
  249 DB/RLS tests (up from 239 — the 10 new HomeSend tests), production
  build, 260 e2e (unchanged surface, all green) — all green.
- Migration applied live (Supabase MCP `apply_migration`), confirmed with
  `npm run verify:live` and a direct read of `information_schema.tables`
  and `storage.buckets` against the live project.
- **Live-browser-verified** at 360px and desktop against a real QA
  household (created via `qa-test-user.mjs`, onboarded through the real
  `/welcome` form): opened the composer's paperclip, pasted a bill-like
  message, reached the confirm screen — correctly showing "No AI provider
  is set up for this household yet" (no platform key configured in this
  environment) with the fallback default kind ("A grocery item") and every
  field still fillable by hand — switched the kind to "A bill", filled the
  amount and currency, and submitted. Confirmed via direct SQL against the
  live project: two real `obligations` rows were created
  (`amount_minor: 145000` — the ₹1450.00 entered, correctly converted to
  minor units), and both `home_send_items` rows moved to
  `status: routed` with `routed_table`/`routed_id` pointing at them. The QA
  household, its members, the two obligations and both intake items were
  deleted afterward (cascade on `households`); the QA auth user was deleted
  via `qa-test-user.mjs delete`.

## What's still open

- **No AI provider is configured in this environment**, so the classify
  step itself (as opposed to the manual-fallback path) was not exercised
  against a live model in this session — the code path is shared with
  `extractSchoolItemFromImage`'s already-proven provider dispatch, but a
  household with a real key configured should try an actual photo upload
  to see the pre-filled path, not just the manual-entry fallback.
  `SendHomeItemState`'s notice text already tells the household when this
  is the case, same as the homework screenshot flow.
- **HomeSend's own tile colour** (amber, per the second brand sheet's "Core
  Experiences" panel — see `2026-09-21-second-brand-sheet-indigo-emerald.md`)
  is still not a dedicated CSS token, since the paperclip button reuses the
  composer's existing outline-button tone rather than introducing a new
  surface. If HomeSend grows a dedicated screen (an inbox of pending
  `received`/`classified` items, say), that is the moment to reach for the
  amber family for its own icon tile.
- **No inbox view of pending items.** An item stuck at `received` (no
  provider) or `classified`-but-not-yet-confirmed only exists inside the
  sheet's own in-memory state right now — closing the sheet before
  confirming leaves the row sitting in the database with no UI surface to
  come back to it from. A future pass could surface these on Home or in the
  sheet's own "choose" step ("2 things waiting for you to confirm").
- **Real WhatsApp/email webhooks** remain explicitly out of scope (no
  credentials) — Phase D (naming HomeTalk/HomeBrain/HomeSend together in
  CLAUDE.md as the standing architecture) is next, once this phase's own
  session confirms everything above stays green.

## Where the code lives

- `supabase/migrations/20260921180000_home_send_items.sql`
- `packages/core/src/ai/classify-intake.ts`
- `packages/core/src/homesend/items.ts`, `repository.ts`
- `apps/web/app/(auth)/home-send-actions.ts`
- `apps/web/app/_components/home-send-sheet.tsx`
- `packages/core/src/components/ui/talk-composer.tsx`
- `apps/web/app/ai/assistant.tsx`, `apps/web/app/ai/page.tsx`
- `scripts/test-homesend-rls.mjs`
- `design/DESIGN-NOTES.md`
