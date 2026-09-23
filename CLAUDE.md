# WonderHome — Claude Code Autonomous Build Contract

## Mission
Build **WonderHome** from this package as an AI-driven Household Operating System. It is a greenfield project and must use the WonderArk/founder-collab-aligned technical stack documented in `TECH-STACK-AND-NFR.md`.

## Mandatory startup
0. **Fetch the latest `main` first, before any other activity.** Run `git fetch origin main` and bring the working branch up to date with it (`git merge origin/main`, or start the branch from `origin/main` if it has no unmerged work). Never begin reading, planning or editing against a stale checkout: another session may have pushed since this one started, and work built on an old base is work that conflicts. Do this again whenever the session is resumed after a pause or a context reset.
1. Inspect the repository. If it is empty, start with `backlogs/00-Project-Bootstrap-and-Architecture.md`.
2. Read `TECH-STACK-AND-NFR.md`.
3. Read `tracking/PROGRESS.md` and `tracking/IMPLEMENTATION-ORDER.md`.
4. Read `architecture/API-ARCHITECTURE.md`, `architecture/SECURITY-BASELINE.md` and `database/SUPABASE-DATABASE.md`.
5. For any UI work, read `design/UI-UX-REQUIREMENTS-v3.md` (the UI/UX contract) and `design/DESIGN-NOTES.md` (the rules the components encode).
6. Read `design/PRODUCT-DIRECTION-v4-talk-to-wonderhome.md`. It is an authoritative product-direction update: real LLM reasoning behind the conversation engine and "Talk to WonderHome" as a P0 primary control surface take priority over chasing full backlog-story coverage. It does not replace the backlogs below — it reprioritizes work within them.
7. Pick the first dependency-ready incomplete story, weighted by that reprioritization.

## Autonomous execution
For each story: mark In Progress → inspect existing code → implement → test → typecheck/lint/build → fix → update docs/migrations/contracts → mark Done → update overall/module trackers → continue automatically.

Do not ask “what next?”. Ask only for genuinely blocking product, security/privacy, destructive migration, production credential or irreversible architecture decisions.

## Stack is fixed unless explicitly changed
- Next.js 16 App Router
- React 19
- TypeScript 5.9.x
- Tailwind CSS 4
- Radix UI + Lucide React
- Supabase PostgreSQL + `@supabase/ssr` / `@supabase/supabase-js`
- Vercel AI SDK
- **Anthropic Claude primary AI provider; Google Gemini and OpenAI configurable alternatives**
- Zod + React Hook Form
- Vitest + Playwright
- npm workspaces with `apps/web` and `packages/*`

Do not switch to React Native, a different backend framework, Clerk, Prisma or another ORM without an explicit architecture decision. The mobile-first requirement means responsive Next.js/PWA-capable web UI, not React Native.

## Design principles — keep every screen close to the mockups
The approved sheets in `design/` (splash and onboarding, the app screens, the
device sheet, the landing page) are the look, not a suggestion. Read
`design/UI-UX-REQUIREMENTS-v3.md` and `design/DESIGN-NOTES.md` before any UI
work, and hold new work against these:

1. **Warm, never clinical.** Cream page, white cards, soft shadows, generous
   rounding and generous whitespace. Never grey, never pure white for the page,
   never a dense dashboard. If a screen could belong to an analytics product,
   it is wrong.
2. **One handwritten line per screen.** Every sheet closes with script —
   "Less mental load. More family time.", "Home runs smoother. Together." Use
   `ScriptAccent` or `QuoteCard`, once per screen, always decoration and never
   a control. Nothing a household must read is said only in the script face.
3. **Blue commits, domains colour, state speaks in words.** The brand's
   Primary Blue is for every committing action and the active nav state. Each household domain
   keeps its own colour, used on the icon tile and never on text. Amber is
   attention, red is only for the genuinely critical, green is handled. Colour
   alone never carries a meaning — the wording and the offered action do.
4. **Every row begins with a tinted icon tile** (`IconTile`), then the name,
   then one line of reason, then the single thing to do. A row with nothing to
   do carries no action, which is itself the message.
5. **Botanical framing on warm surfaces.** `LeafDecor` in the corners of the
   signed-out frame, the landing hero and the closing section — faint, behind
   the content, never over anything readable.
6. **Five primary areas at every size, with the assistant raised in the middle**
   of the phone tab bar. Domains live in the desktop sidebar and behind More.
7. **A human sentence opens every screen and a warm one closes it.** A greeting
   with the person's name, a plain-language lede, and no bare table dropped on
   the page.
8. **Imagery is warm family life** — illustrated, in the household's own tones.
   Never stock-office photography, never a stretched screenshot: product
   visuals are the real components in device frames.
9. **Numbers are arithmetic somebody can explain.** A ring, a metric or a
   percentage is a count of things the system evaluated. Never invent one, and
   never show a figure with no source.
10. **Mobile-first and real.** Every screen works at 360px with no horizontal
    scroll, honours `prefers-reduced-motion`, keeps the three states
    (empty, error, loading), and never offers a button that does nothing
    because the provider behind it is not live.
11. **A name is never truncated.** A person's, a household's, a grocery
    item's, an outcome's — never `truncate`/ellipsis a name to make a row
    fit. Give it the room instead: a row's actions are icons with an
    accessible label (`aria-label`, not just a tooltip), not full-width text
    buttons, and the space that frees belongs to the name and the one line
    of reason beside it, not to more chrome. Wrap to a second line before
    you ever cut a name short.
12. **Every entity can be added, updated and removed.** If a household can
    create something — a member, a helper, a grocery item, a
    responsibility, a bill, a meal — it can also change what it said and
    undo having added it. What "removed" means is whatever fits that
    entity (retire, deactivate, stand down, cancel) and is never a hard
    delete that orphans something else's history, but the option itself is
    never missing. A create-only screen is a half-built feature, not a
    smaller one. Adding is also never capped at one: a household with an
    existing helper, pet, bill or member can still add another, different
    one — the "add" action stays reachable once a first instance exists,
    not only from the now-gone empty state (this bit Househelper, whose
    only add path was the empty state's own action, invisible again the
    moment a first helper was added).
13. **One door to the assistant, not one per screen.** The assistant is
    already a primary tab, raised in the middle of the phone bar (rule 6)
    and reachable everywhere the mic icon is. A screen never adds its own
    "Ask AI" / "HomeTalk" / "Assign with AI" shortcut next to an
    entity — that duplicates the one door with a second, inconsistent one.
    Manual add/update/remove (rule 12) is a screen's own job; talking to
    WonderHome about the same thing happens through the assistant tab, not
    a pill bolted onto a row or a header. HomeSend's paperclip beside the
    mic is not an exception to this — it is a second input *modality* of
    the same one door (a photo or a paste is content, not a question), not
    a second door. HomeSend's own screen (`/home-send`, secondary nav) is
    the one deliberate exception to "not a second door": it is a second
    *surface* for that same one pipeline — a drop zone and an inbox for
    what is waiting on a confirm — not a competing "Ask AI" shortcut on an
    unrelated screen, and the paperclip stays exactly as it was. A future
    screen does not get to cite this as precedent for its own shortcut;
    this exists because the product direction explicitly asked for a
    HomeSend menu, not because the rule got easier to route around.
14. **No two buttons for the same job.** Before a header or an empty state
    ships with more than one action, ask what each one actually does. Two
    pills that both amount to "add this" — one manual, one routed through
    `/ai` — are a duplicate, not a choice, and the AI-routed one is the one
    that goes (rule 13 already says a screen doesn't get its own "Ask AI"
    button). A screen keeps one path per job; a second control only earns
    its place when it truly does something different a reader would ask
    for by name.
15. **Show the whole thing, don't clip it.** A name, an amount, a date, a
    status word — the layout bends around the content, the content never
    gets cut to fit a layout that was sized for something shorter (rule 11
    already says this for names specifically; it holds for every value a
    row shows). This includes vertical space: fixed chrome — the tab bar,
    its raised assistant button, a sticky header — reserves real clearance
    for what sits below or above it, so scrolled-to-the-end content (the
    closing `QuoteCard`, a last list row) never sits half behind it. When
    you add or resize any fixed element, re-check what the page's own
    padding assumes about its size.
16. **A swipe moves between the five primary areas.** Home, Today, AI,
    Family, More (`PRIMARY_NAVIGATION`, rule 6's order) are a sequence, not
    just five taps — a full-width horizontal swipe on a primary screen
    moves to the next or previous one in that order, the same motion a
    phone user already reaches for. It's additive to the tab bar and the
    sidebar, never a replacement: every area stays directly tappable, the
    gesture is ignored the moment a horizontal scroller, carousel or
    swipeable row underneath it wants the gesture instead, and it never
    fires from inside a sheet, dialog or form. Respects
    `prefers-reduced-motion` for the transition itself.
17. **Group by what the reader is deciding, not by when it was built.**
    A screen's actions and sections read top to bottom in the order a
    person actually thinks: the one thing most likely to need them first,
    the thing they'd do next, the record of what already happened last.
    Don't bolt a new control onto the end of a header or the top of a list
    because that's where there was room — place it where it belongs next
    to the thing it acts on, even if that means moving what's already
    there.
18. **A stat tile takes the width its label needs.** `MetricGrid`/`StatChips`
    never force three or four tiles into one cramped row on a phone just
    because that is the desktop layout — that is what truncated "Need you"
    into "Nee…" (rule 15 already forbids the clipping; this is the layout
    decision that was causing it). On a narrow screen a tile is a
    full-width row, or at most one of two (rule 19), and it widens further
    only once there is real room for every label at `sm` and up. The same
    test applies to any new row of small cards: if fitting them side by
    side on a phone means cutting a label, they are not side by side on a
    phone.
19. **Two cards to a row on a phone, never three.** This is a hard
    constraint, not a preference, and it applies to every grid of cards on
    every screen:
    - **Maximum two cards per row** on a phone. Three or more is never
      correct, whatever the desktop layout does and however short the
      labels look in a mockup.
    - **Roughly 48% width each**, with one consistent gap between them, so
      a two-up row reads as a pair rather than as two things that happen
      to be adjacent.
    - **Stack vertically the moment the content needs more width.** A card
      whose label, number or name would be cut at half width is a
      full-width card instead — rule 15 decides, and it always wins.
    - **Primary information is a full-width card.** The thing a person
      came to the screen for is never one of a pair.
    - **Secondary shortcuts use the two-column grid.** Domain tiles, quick
      links and at-a-glance counts are what the pair layout is for.
    - **Touch targets stay comfortable and text stays readable** at that
      width: nothing shrinks its type or its tap area to make a row fit.
      If it would have to, it was not a two-up row.
20. **A choice is picked, not typed.** Wherever a field's answer is one of a
    known set — a category, a relationship, a unit, a status, a frequency —
    it is a dropdown/select, a tag picker, a radio group or a checkbox list,
    never a free-text box a person has to remember the right spelling for.
    Free text stays for what it's actually for: a name, a note, an amount.
    Whatever the picker, it always carries its own way to add a value that
    isn't listed yet, inline, so a household is never stuck picking the
    closest existing option because the real one doesn't exist — a form
    that only offers what was seeded at launch is a half-built picker, not
    a finished one.
21. **A card opens to its full detail.** A summary card — one row's worth of
    name, tile and headline number — carries a down chevron that expands it
    in place to the full actionable detail behind it: every field, every
    action, not just the one the card already shows. The chevron is the
    single, consistent way in; it never coexists with a second, differently
    styled "view more" link doing the same job (rule 14). Built as
    `ExpandableRow` for a single list row and `AgendaExpandableRow` for any
    domain's `HomeAssessment` row, and as `ExpandableMetricGrid` (with
    `MetricDetailList`/`MetricDetailRow`/`MetricDetailEmpty` for its own
    panel rows) for a stat-card grid — a card opening onto the real entries
    behind its count rather than only linking away. A screen never
    hand-rolls this open/close behaviour; it reuses one of these three.
22. **Money is decimal, always.** A household types and reads amounts in
    the currency's own major unit — 42.50, never 4250 — everywhere an
    amount is entered or shown: a bill, a budget, a price, a spending
    limit. Nothing in this product's own UI or domain logic expects or
    displays paise/cents as a bare integer. Convert to a minor unit only
    at a boundary that genuinely requires it — a payment provider's own
    API — and convert back before showing anything to a person.

**The brand is the sheet at `design/WonderHome-brand-guidelines.png`.** The
name is WonderHome, one word, its wordmark set once in the brand's ink —
solid, not per-letter colour — (`WORDMARK_LETTERS` in
`packages/core/src/brand/mark.ts` is the one source for this, read by both
the live wordmark and the generated share card). The mark beside it is a
rounded-square tile carrying the brand's Primary-to-Secondary gradient
(indigo into emerald), a white house silhouette, and a heart cut from the
house's centre so the gradient shows through — its geometry lives in the
same module (the header renders it, `npm run brand` writes the icons from
it, CI checks they match). The tagline is "Less mental load. More family
time!" The palette is Primary `#6366F1` (indigo — every committing action
and the active nav state), Secondary `#10B981` (emerald — handled/success),
Accent `#F59E0B` (amber — attention), Warm `#F472B6` (pink, decorative/
available for a future domain accent), and Neutral `#1F2937` (body text),
expressed as the tokens in `packages/core/src/ui-theme.css` (the interactive
tokens use slightly deepened steps of Primary/Accent/Secondary for
guaranteed contrast against the cream page — the exact sheet hexes are
reserved for the mark's own gradient); the typeface is Sora. Never hand-draw
a second logo, paste a raster of it, or reach for a hex the tokens don't
carry.

Use the shared kit in `@wonderhome/core/ui/*` — no screen invents its own card,
row, pill or tile. A new pattern belongs in the kit, with a note in
`design/DESIGN-NOTES.md` saying which rule it encodes.

## The agent platform: HomeTalk, HomeBrain, HomeSend
WonderHome's AI layer is one pipeline with three named, real surfaces —
"real" meaning each one is wired end to end, not illustrative:

- **HomeTalk** (`/ai`, `packages/core/src/components/ui/talk-composer.tsx`)
  is where a household talks or types to WonderHome — the one door (rule
  13). Every turn goes through the same conversation engine
  (`conversation/engine.ts`) whether spoken or typed. Since HomeTalk 2.0
  (spec `design/HOMETALK-2.0-WAVE-4.md`) every action intent is grounded
  before a proposal exists (`conversation/grounding.ts`): a person
  mention becomes a member id through the Wave 1 resolver, a date phrase
  becomes a local day through `conversation/temporal.ts` (the model names
  the phrase, deterministic code decides the day, in the household's
  timezone), and "that/it/them/the other one" resolves through
  `conversation/references.ts` in the spec's order — pending question,
  pending proposal, recent conversation and recent HomeSend by recency.
  Anything still uncertain becomes one focused question, never a guess;
  each turn persists what it was about (its focus) for the next turn's
  "that". A correction ("not milk, almond milk", "no, I meant Manan",
  "actually, make that Friday" — `conversation/corrections.ts`) replaces a
  proposal still waiting for a yes, or undoes an executed write through
  its own domain service before making the corrected one — both kept on
  the record, never a silent overwrite. A sentence with several requests
  is split (`conversation/decompose.ts`) and each part runs through the
  same engine on its own; a part that leans on an earlier one ("remind me
  to buy *them*") only goes ahead when that earlier part actually
  happened. A reminder is a real notification to the speaker alone, held
  until its `scheduled_for`; the inbox and badge only ever show what is
  due. An add where nothing was new shows "Nothing to change", never
  "Done". The understanding model is given the moment as facts — role,
  local date and time, what is waiting, what the conversation is about,
  all minimised like the utterance (`ai/model-client.ts`'s `systemFor`) —
  and returns named, nullable parameters with no id field of any kind;
  `withoutServerOnly` strips anything that is the server's to decide (ids,
  grounded dates, a correction's undo record) from whatever a model
  sends. A person resolved at medium confidence is named back ("I think
  you mean Manan…"); two equally likely ones are one question. Every
  §21 example and the §22 matrix are covered deterministically in
  `conversation/evaluation.test.ts` — extend it, never loosen it, when an
  understanding changes.
- **HomeBrain** (`conversation/brain.ts`, `ai/model-client.ts`'s
  `understand`/answer-composition seam) is the reasoning behind a reply: a
  real model call, gated by the same consent/minimisation/entitlement
  checks a fixture-resolved intent already passed through, never trusted
  with a decision — every downstream authorization gate runs on its output
  exactly as it runs on a deterministic one. Since HomeBrain 2.0
  (`packages/core/src/homebrain/`, spec `design/HOMEBRAIN-2.0-WAVE-2.md`)
  a model only ever sees `GroundedFact`s (opaque `F`-ids, cited back in
  `usedFacts`), and no model answer reaches a person unvalidated:
  `homebrain/validate.ts` refuses unsupported names, dates, amounts,
  events, health claims, integration claims and "I've done it" claims,
  then `homebrain/answer.ts` regenerates once with tighter context, then
  answers deterministically from the same facts, then says honestly that
  nothing is on record. "Why?" questions are answered from recorded
  evidence in `homebrain/why.ts`, never by a model. Add to the validator
  when a new kind of invention shows up; never route an answer around it.
- **HomeSend** (`packages/core/src/homesend/`, `ai/classify-intake.ts`,
  the composer's paperclip button, and its own screen at `/home-send` —
  a drop zone plus an inbox of what is waiting on a confirm) is the
  inbound intake channel: a photo, a PDF, a text file, a voice note, a
  shared link, a pasted forward or a forwarded email, classified and
  routed into a real domain table only once a person confirms it. Since
  HomeSend 2.0 (spec `design/HOMESEND-2.0-WAVE-3.md`) every one of those
  goes through one pipeline, `homesend/ingest.ts` (secure intake →
  normalize → understand), and ends in the same canonical
  `IntakeUnderstanding` (`homesend/understanding.ts`) — a new input type
  is a new `ingest*` entry point into that pipeline, never a second one.
  A file's type is decided from its bytes (`normalize.ts`), a link is only
  ever fetched through `link-fetch.ts` (public addresses only, DNS checked
  and pinned, every redirect re-checked), an uncertain voice transcript is
  shown and confirmed, never acted on (`audio.ts`), and all of it is
  untrusted content: `injection.ts` fences it for the model and flags
  instructions aimed at WonderHome, which are ignored and said so.
  Whatever cannot go on is kept and shown under "Failed safely", never
  dropped. Names are resolved through the same Wave 1 resolver HomeBrain
  uses (`homesend/resolve.ts` — one question when two people fit, never a
  guess), and every candidate is reconciled against what is already on
  record (`homesend/reconcile.ts`): a duplicate is shown, a moved date or a
  cancellation is offered as an update to the existing record, never a
  second copy. How an item is confirmed is `homesend/confirmation.ts`
  (§12): a clear, new grocery or school item a member sent may apply on its
  own only where the household set that outcome's autonomy to "execute";
  bills and health documents always wait for a person, whatever the
  confidence. What each review decided is kept in closed words on the item
  and counted by `homesend/metrics.ts` (§19) — outcomes, not parse counts. Every routed item can be undone
  (`homesend/changes.ts`), the same domain service a manual remove would
  use, never a raw delete. A real Resend inbound-email webhook
  (`POST /api/v1/homesend/email/webhook`, `homesend/email-gateway.ts`)
  exists behind the same provider-neutral gate the AI/voice keys use —
  code-complete, Svix-signature-verified, unit- and DB-tested — but
  genuinely inert until a deployment sets `RESEND_API_KEY` and
  `RESEND_WEBHOOK_SECRET` for a real account with a verified receiving
  domain, which no session has configured (a human's DNS/domain errand,
  not a credential to invent). Its address-management screen
  (`home-send-channels.tsx`) is real: every member can read and copy the
  household's address, only an admin can set it up, rotate or turn it
  off — real forwarding still waits on that same human errand, but
  nothing about the UI or the backend behind it does. WhatsApp still has
  no webhook at all. The classifier can
  also propose one secondary, different-domain write alongside an
  intake's primary one (a bill or school notice that also implies a
  grocery need) — always a grocery suggestion, never written until the
  household confirms it separately, tracked as its own
  `homesend_changes` row so it can be undone independently of the
  primary. Installed as a PWA, WonderHome is a real Web Share Target
  (`manifest.webmanifest`'s `share_target`, `POST /api/v1/intake/share`):
  the OS share sheet lands there whether or not the person has signed in
  on that device yet — signed in, the content is classified and saved
  immediately; signed out, it is staged (`homesend_share_handoffs`,
  RLS-unreachable from any session, an unguessable single-use token is
  its only credential) and resumed the moment sign-in resolves a
  household. That signed-out branch is rate-limited by IP hash
  (`homesend/rate-limit.ts`'s `mayCreateShareHandoff`/`hashClientIp` —
  never the raw address, only its sha256, counted via
  `homesend_share_handoffs.ip_hash`); an unidentifiable caller is let
  through rather than blocked, since this is a throttle against abuse, not
  an authorization gate. Every upload path also runs a malware-scanning
  seam (`homesend/malware-scan.ts`'s `scanForMalware`, wired in through
  `security.ts`'s `assessUploadSecurity`) alongside the existing
  magic-byte check — provider-neutral and genuinely inert until a
  deployment sets `WONDERHOME_MALWARE_SCAN_ENDPOINT`, same discipline as
  every other integration point here. The classifier's structured output
  runs through a deterministic backstop (`classify-intake.ts`'s
  `sanitizeIntakeExtraction`) that nulls out any field a hallucinating
  model set outside its own claimed kind — never trusted to classify,
  only to enforce the invariants the system prompt only asks for —
  covered by golden scenarios in `classify-intake-evaluations.ts`, the
  same "policy decides, the model only proposes" pattern `evaluations.ts`
  already documents. `homesend_share_handoffs` past its 30-minute window
  is swept both opportunistically on every share request and for real by
  `/platform/retention`.

**Voice channels are doors into HomeTalk, never second brains**
(`design/voice-integration/`). Every channel — the app, Gemini Voice,
Alexa — asks through one gateway (`hometalk/gateway.ts`, the canonical
`hometalk/contract.ts`): an adapter proves who is speaking and renders the
answer, and `completed` is only ever the executor's own record. An external
assistant is linked to one member (`voicelink/`: OAuth with S256 PKCE,
hashed tokens, scopes that only narrow, payments and orders never by
voice) and its turns run under that member's own RLS session. Gemini Voice
(`voicelink/gemini-live.ts`) holds only a single-use Live token locked to
WonderHome's instructions and a fixed allowlist of tools; each tool call is
turned into words a member could have said and answered by the gateway on
channel `gemini_voice`, narrowed to the content classes the household lets
reach a model provider (Gemini hears every answer). A new voice capability
is a new allowlisted tool that maps to a HomeTalk utterance — never a tool
that reaches a table. Alexa (`/api/v1/voice/alexa`) is verified as Amazon
documents and stays inert until a person creates the skill and sets
`ALEXA_*`; Gemini Live runs only where the household's key is Google's and
its data-use agreement allows it, re-checked on every tool call.

**One evaluation across all three** (Wave 5, spec
`design/AI-EVALUATION-WAVE-5.md`, `packages/core/src/evaluation/`):
`npm run eval` runs the golden cases through the real HomeTalk, HomeSend
and HomeBrain pipelines against synthetic golden households A–E, never
production data. Every stage a case states is compared, and each mismatch
gets a §10 error type. Metrics are counts out of counts, and every run
records its prompt, context and dataset versions. The blocking release
gates fail CI, and an Unsafe Action Rate above zero is one of them.
`--provider configured` runs the same cases through the configured model,
and `--write` records the release artifact in `docs/ai-releases/`. When the
golden set catches a defect, fix the product. Never loosen an expectation
to pass. Add a case whenever an understanding, a reconciliation or an
answer rule changes.
A person's correction is evidence, not just a fix:
`evaluation/evidence.ts` writes one row per corrected field into the
append-only `ai_corrections` (HomeTalk "no, I meant…", HomeSend review
edits, HomeBrain Review corrections). A HomeTalk approval binds to the
exact proposal through `conversation/approval.ts`: a fingerprint of the
action, its target and every parameter. A stale, changed or timed-out
approval is refused and closed, never carried out. Production quality
(§23) is counted from closed words only, in `evaluation/production.ts`.
Production hardening (Wave 5 §14–§17):
- **Rate limits.** Every rate limit goes through `security/rate-limit.ts`'s
  `hitRateLimit`, which reaches the service-role-only
  `public.rate_limit_hit`. It fails open, because it throttles abuse and is
  not an authorization gate. Its refusal says the pause is temporary and
  that nothing was lost.
- **Timeouts.** Every model client comes from `ai/provider-clients.ts`, with
  a timeout and a single retry. Never construct an SDK client elsewhere.
- **Forwarded email.** Each delivery leaves closed-word events in
  `homesend_email_events` (`homesend/email-monitoring.ts`), and the §14
  alert thresholds are evaluated over the last hour.
- **Failed classifications.** A failed classification is kept and retried
  through `jobs` (`homesend/retry-queue.ts`, one waiting job per item,
  dead after five tries).
- **Cron.** A cron route exports `GET` as well as `POST`, because Vercel
  Cron sends GET.
- **Duplicate requests.** An idempotency key is reserved while its request
  is in flight, so a double tap is refused rather than run twice. A
  household runs one agent pass at a time.

Underneath HomeTalk and HomeBrain, a real governed multi-agent pipeline
runs the household's actual domains: `ai/gather-assessments.ts` merges
every domain's `*Agenda()` read into one `HomeAssessment[]`,
`ai/specialists.ts`'s `coordinate()` turns that into `PlannedStep`s,
`ai/orchestrator.ts`'s `executeStep()`/`advance()` run each step through
`ai/tools.ts`'s `authorizeToolCall()` (scope → entitlement → permission →
autonomy, in that order) and `household/autonomy.ts`'s per-outcome
autonomy setting — read by `household/autonomy-lookup.ts` through the
server-only `public.autonomy_for` wrapper, and "observe" on any error,
timeout or unknown value, never a default of "execute" (PostgREST only
resolves RPCs in `public`, so a `wh.*` function the app calls by RPC
needs a narrow, explicitly granted wrapper, never an exposed `wh`) —
`ai/executors.ts` performs the write for a step that is
actually authorized to execute, and `ai/run.ts`'s `runHouseholdAgents()`
ties a run together — triggered today from HomeTalk (a "check on things"
utterance) or `POST /households/{householdId}/agents/run`, with automatic/
scheduled runs deliberately not wired up yet (`proactive_agents`, still
`false`, is the gate for that). This is the same pipeline the diagram
"Inputs → Intake → Understand → Decide & Plan → Take Action → Outcome"
describes — HomeSend and manual entry are Inputs, HomeBrain is Understand,
`coordinate()` is Decide & Plan, the executors are Take Action.

## Product rules
- Manage outcomes, not micro-task checklists.
- Normal household routines are silent.
- Househelpers do not need to update every chore.
- Notifications are precise, timely, recipient-specific, actionable, grouped, threaded and automatically resolved.
- Talk and text share one conversation engine — HomeTalk, backed by HomeBrain.
- One household has multiple identities and personalized views.
- Head of Family can designate Household Administrators.
- Children have age-appropriate access and privacy.
- Manage Household defines responsibilities, playbook, routines, policies and AI autonomy.
- Certification exposes what WonderHome believes and lets authorized users correct it.
- AI agents use governed APIs/tools and never directly mutate Supabase.
- Server-side authorization is authoritative.
- Sensitive actions require appropriate approval/step-up authentication.

## External providers
Never invent credentials or claim a live integration. Build provider-neutral interfaces and deterministic mocks/fixtures first. A real provider is considered live only after credentials, authentication, contract behavior and integration tests are configured.

## Non-functional gates
Use the targets in `TECH-STACK-AND-NFR.md`. P0 security and authorization tests are release blockers. Core API targets are p95 <=500ms reads and <=800ms ordinary writes excluding external provider latency.

## Verifying UI changes in a browser
For any UI change, actually drive it in a browser at 360px and desktop before calling the story done — typecheck/lint/unit tests verify correctness, not that the feature works. To sign in as a test household without touching the public sign-up form (which rejects sandboxed test-email domains like `.test`/`example.com` with a generic "could not create that account" error that looks like an app bug but is Supabase Auth's own validation, not this app's): `node scripts/qa-test-user.mjs create "Name"` creates an already-confirmed account directly via the service-role key already in `apps/web/.env.local`, then sign in with the printed credentials. Always `node scripts/qa-test-user.mjs delete <user-id>` when done — it only ever touches whatever Supabase project `.env.local` points at.

## Applying a migration to the live project
Writing a migration file is not shipping it. This repo's live Supabase project only has what actually reached it through the Supabase MCP `apply_migration` tool (`mcp__Supabase__list_projects` finds the project id, `list_migrations` shows what has landed) — a file committed to `supabase/migrations/` with nobody having run that tool is invisible to production no matter what the story tracker says. This bit a real story: three migrations in a row got written, tested locally, committed and marked `Done` without ever being applied, and the gap surfaced only when a fourth story tried to read the column one of them added. Apply every migration to the live project as part of finishing the story that introduces it, in the same session, and run `npm run verify:live` afterward to confirm it landed — never treat a green `test:db` run (a from-scratch local database) as proof that the live project has it too.

## Database query permissions
All SQL against the Supabase project — `mcp__Supabase__execute_sql`, `apply_migration`, and every other Supabase MCP tool — is pre-authorized. Run what the work needs (including destructive statements: dropping a constraint, deleting QA/test rows, correcting bad data) without pausing to ask first. This still means investigate before deleting real household data and keep QA cleanup scoped to what a session's own test account created, per the rest of this file — it removes the confirmation step, not the judgment.

## Opening and merging pull requests
Always open a PR for finished work pushed to a story/feature branch — never ask first, and never leave pushed commits sitting on a branch with no PR against them. Once that PR (or any PR against this repo, whether opened this session or found already open) has CI green on its current head — every required check passing, no merge conflict — merge it, again without asking. Still hold off merging when there's an open review thread that hasn't been addressed, or when the PR is explicitly marked draft/WIP.

## Cleaning up test data after the merge
The work isn't finished until its test data is gone. Once the PR has merged into `main`, remove everything the session created to test it, in that same session and before reporting the work done:

- **QA accounts.** Delete every account made with `node scripts/qa-test-user.mjs create`, using `node scripts/qa-test-user.mjs delete <user-id>`.
- **QA households.** Delete each QA household and every row created in it, on the live project and on any preview branch.
- **Seeded or hand-inserted rows.** Remove any rows added directly with `execute_sql` to set up a scenario.
- **Stored files.** Remove files uploaded to Storage buckets during testing, such as HomeSend and avatar uploads.
- **Local debris.** Delete scratch files, screenshots and QA helper scripts left in the working tree, and stop any dev server the session started.

Then confirm it is gone: a SQL count, or a `qa-test-user.mjs` lookup, should find nothing left. Only delete what this session created itself, tracked by the user ids and household ids it printed along the way. When you can't prove a leftover test account or row belongs to this session, leave it in place and name it in your report, with the id and the command that would remove it. Never delete it on a guess. The progress note for the work says the cleanup ran, or lists what was left behind and why.

## Progress
`tracking/PROGRESS.md` is the overall source of truth. Every story status change must be reflected there and in the module file. Never fabricate completion.

**Regenerate `docs/PROGRESS.md` after every story status change.** Run
`npm run tracker`. It projects all twenty-two backlogs into one page — where
the whole application stands, what is left, and every story with its status —
so nobody has to read twenty-two files to answer "what is done". The backlogs
stay the source of truth: edit the story's row there, then regenerate. Never
edit `docs/PROGRESS.md` by hand; CI runs `npm run tracker -- --check` and
fails when it is out of date.

**Write a progress note in `docs/progress/` after every major activity.** A major activity is anything a reader would want to find later without reading git history: a story or module completed, an infrastructure change (a database or hosting move, a new provider, a region change), a design-system or performance pass, a security fix, or a decision that shapes later work. Name the file `YYYY-MM-DD-short-slug.md` and write it before moving on to the next activity, not at the end of the session. Each note says what was done, why, what was verified (which gates ran and their results), what is still open or needs a person, and where the code lives. `docs/progress/README.md` is the index: add every new note to it. The trackers say *that* something is done; these notes say *what it was and how to pick it up*.
