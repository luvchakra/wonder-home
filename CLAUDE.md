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
   of the phone tab bar: Home, Calendar, HomeTalk, Family, More (the Today tab
   became Calendar on 2026-10-18, D1 of `design/FAMILY-CALENDAR-PHASE0.md`;
   Today's plan is one tap from the Calendar's day view). Domains live in the
   desktop sidebar and behind More.
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
16. **A swipe moves between the five primary areas.** Home, Calendar, AI,
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
    - **The one exception, the owner's call (2026-10-18):** Kids & School's
      three Overview counts sit three across as `ExpandableMetricRow` —
      stacked tiles whose labels wrap, never cut, with the open tile's
      entries in a full-width panel below. It is not precedent for any
      other grid.
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
23. **Every setting has one editor.** Settings & Profile (`/settings`) is
    where a person controls how WonderHome works for them. It holds the
    profile, and one chevron row per setting that opens that setting's own
    page:
    - Language & Region, Notifications, Voice and Voice assistants;
    - AI Assistant (`/settings/ai`) and Privacy;
    - WhatsApp and Connected accounts;
    - Your plan (`/settings/plan`).

    Any other screen may show a setting's value and link to its page, but
    never keeps a second form, a second write path or a competing default.
    Onboarding collects values through the same repositories Settings uses.
    A person's own profile is edited only in Settings; an Admin managing
    someone else does that in Family. A row appears only when this person
    can use what it opens, and nothing unbuilt is listed.

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
  happened. Every utterance is first cleaned into one canonical sentence
  (`conversation/normalise.ts`: spoken lead-ins, wrappers, repeats, "I am
  planning X" as "plan X"); the rules, retrieval and the model read that, and
  the person's own words are what is recorded. A clear request is its own
  consent (HomeBrain 4.0 §3.9, `conversation/consent.ts`): an adult's
  everyday, undoable change — the list, a reminder, a plan, a meal, being
  away, what is at home — is done at once and the reply says "Say undo to
  take it back" (`undoExecuted`, the same service a correction uses). A
  change that touches someone else (guests, another person's duty or day, a
  name resolved at medium confidence) is asked once in the conversation, and
  paying and ordering always wait for a tap on screen. A child's or helper's
  request, and anything an agent does on its own, still follows autonomy. An
  Admin's "Ask before acting on what I say" (`policies`, `ai_autonomy`,
  `conversation/consent-repository.ts`) makes every act a question first.
  A reminder is a real notification to the speaker alone, held
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
  understanding changes. A person who uses another language (story
  22-005) is read into the same language-neutral intent (`languageLine` in
  `systemFor`). Their reply is composed and validated in English and put
  into their language only through `conversation/reply-language.ts`:
  - names, items, dates, times, amounts, numbers and links are tokens the
    translator never sees;
  - a translation that drops, repeats or invents one is refused;
  - a reply carrying a content class the household has not agreed may
    reach its provider (`REPLY_CLASSES`, the answer's facts) stays in
    English, with a line saying why.

  The English is always the record. A new action gets a `REPLY_CLASSES`
  entry.
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
  Since HomeBrain 3.0 phase A (spec `design/HOMEBRAIN-3.0-HOUSEHOLD-CONTEXT.md`,
  story 14-020) the household's context is kept whole in one server-only
  row (`household_context`, deny-all RLS, `homebrain/context-store.ts`):
  every record, no horizon and no per-list cap, event guests, every memory,
  food preferences and places. A domain write sets `stale_since` and rebuilds
  it after the response; a turn reads the row plus the viewer's own live
  reads and holds it to the same domain gates and `filterForViewer`. Never
  read the row from a session, and never let a turn answer from a row older
  than the last write. Without the table, reads fall back to the live path.
  Since HomeBrain 4.0 (spec `design/HOMEBRAIN-4.0-DEEP-HOUSEHOLD-INTELLIGENCE.md`):
  - **Look deeper.** Before "not on record", a turn reads the question's
    domains again, live, through the viewer's own session
    (`homebrain/deep-read.ts`, at most 3 domains and 1.5 s). A find marks the
    store stale; each look leaves one content-free `homebrain_misses` row. A
    database trigger marks the store stale for any write that went round a
    service, and the delivery clock keeps stores warm (`keepStoresWarm`).
  - **Follow links.** `homebrain/graph.ts` links the viewer's own items
    (person, same day, a meal's needs, a duty's owners, a HomeSend source);
    retrieval follows them at a score below what a rules answer uses.
  - **Inferences are rules.** `homebrain/insights.ts` draws each one from
    records, sent with its evidence. A model's own "because" is refused
    (`unsupported_inference`) unless it cites one. A new rule is a function
    with a golden test.
  - **The goal shapes the answer** (`homebrain/goal.ts`): what decides comes
    first for "should we…?", the fact first for "when is…?".
  Since HomeBrain Sleep (5.0, story 14-032, `packages/core/src/homebrain/sleep/`)
  HomeBrain tidies what it remembers each night, as a brain does in sleep:
  - **The night.** Between 2 and 5 am on each household's clock, once per local
    day (`homebrain_runs`), on the delivery tick after its response
    (`sleepDueHouseholds`). `planSleep` (pure) lets go of empty notes, tags
    salience, expires what is past, reads notes into person–stance–thing,
    merges the same thing, splits a sentence about several people, files a note
    under its person, and rests what has gone 90 days unused. A rested note
    wakes when it is used again. Salience 3 (health, allergy, safety) never
    rests or expires on its own.
  - **Only contradictions reach a person.** The same thing liked and disliked
    goes to Needs review. Everything else applies automatically and is listed
    under Learned → While you slept, with Undo (`undo.ts`, from the `detail`
    each `homebrain_consolidations` row keeps). Never hard-delete a memory: a
    merge or split supersedes it.
  - **A model judges; rules decide.** Merging by meaning happens by rule only
    when two notes are near-identical (0.985). Anything close goes to the model
    (`sleep-model.ts`), which also reads sentences the rules cannot and
    proposes links. A reading is kept only when it names a person it was shown
    and uses the sentence's own words. A link is kept only when it joins two
    records the model was shown.
  - **Meaning.** `homebrain_embeddings` uses pgvector, 768 dimensions, compared
    exactly per household (`match_homebrain_embeddings`, service role). Each
    record is embedded with the household's Google or OpenAI key, else its
    Gemini key, else the platform key. Only classes the data-use policy
    allows are embedded, and every family name becomes "someone" before
    anything is sent. On a turn, meaning starts alongside the read and gets
    900 ms (`recall.ts`), then the turn answers by words.
  - **Links and profiles.** Links (`homebrain_links`) ride on the store's items
    as `attributes.associations`. The graph follows one only when both ends
    are in the viewer's list. A person at a glance (`profiles.ts`) is built on
    the turn from the viewer's own items, never health or money, and leads
    "What do you know about X?". The memories an answer used are counted after
    the response (`homebrain_recalled`), apart from `memories`, so a turn never
    marks the store stale.
  - **Household understanding** counts the household's own records per
    category (`withRecords`), not only what HomeTalk was told.
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
  guess; a school notice naming a child not on record is never assumed to
  be the household's only child, and an Admin can add them right in the
  review, story 08-009), and every candidate is reconciled against what is already on
  record (`homesend/reconcile.ts`): a duplicate is shown, a moved date or a
  cancellation is offered as an update to the existing record, never a
  second copy. Since Deep Document Understanding 2.0 (spec
  `design/HOMESEND-DEEP-DOCUMENT-UNDERSTANDING-2.0.md`) the whole document
  is read into every record it proposes (`homesend/document.ts`: each
  event, each date of a series, each fee, each thing to buy, with page and
  quote as evidence, and the pages actually read), and `homesend/plan.ts`
  reconciles each record on its own into one outcome — create, field-level
  update, cancel, no change, conflict (a record changed after the document
  was written stands) or one question — never a guess and never a second
  copy. A new rule for a document is a plan rule with a golden test in
  `plan.test.ts`, not a special case in a screen. A document with two or
  more records is reviewed as that plan (`_components/home-send-plan.tsx`)
  and never applies on its own. The browser sends only choices (include,
  edit, who it is for); `applyDocumentPlanAction` rebuilds the plan on the
  server and writes each record through its domain service, via the
  server-only `home-send-writes.ts`. Each change is recorded with its plan
  key, field-level before/after and evidence, and the exact plan and
  receipt are kept on the item (`homesend/apply.ts`: created, updated,
  cancelled, unchanged, skipped, needs clarification, failed). A partial
  result is never reported as done, and "Undo all" reverses a whole
  document. HomeTalk's paperclip is the same sheet and pipeline. Once a
  plan is applied there, HomeTalk posts what it did from the stored receipt
  (`homesend/talk.ts`). "What did the school notice change?" is answered by
  rules from the receipt and the change rows, never from what a model read,
  and an undone change is said to be undone. How an item is confirmed is `homesend/confirmation.ts`
  (§12): a clear, new grocery or school item a member sent may apply on its
  own only where the household set that outcome's autonomy to "execute";
  bills, health documents and receipts always wait for a person, whatever
  the confidence. A paid receipt is its own kind, never a bill: each line
  a person keeps becomes a `consumable_purchases` row (`commerce/receipts.ts`
  matches a line to a tracked item only when plain, never guesses) and
  undoes on its own. What each review decided is kept in closed words on the item
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
  nothing about the UI or the backend behind it does. WhatsApp is also
  an intake (stories 14-015/14-016, `packages/core/src/whatsapp/`; see
  the WhatsApp section under External providers). The classifier can
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

- **HomePlaces** (`packages/core/src/homeplaces/`, intent `find_places`)
  answers location questions: "somewhere for dinner tonight", "where can
  we hang out near Anya's school after school?". It is a read, never a
  write:
  - **Rules read the request.** `request.ts` reads the request (eat or go
    out, near home or a child's school, now, a meal time or after school).
    A model only ever says that a sentence is a place question.
  - **Where comes from the record.** `service.ts` takes the anchor from
    the saved home address or the child's picked school, never a guess.
    Two children at two schools and no name gets one question.
  - **Places are checked and ranked.** Google's text search
    (`places/google.ts`'s `findNearby`, behind the same
    `GOOGLE_MAPS_API_KEY`) supplies the places. Each one is checked
    against its weekly hours for the whole window (`isOpenFor`), then
    ranked by rating, distance and the family's own place book.
  - **When comes from the record too.** "After school" starts when that
    child's school day ends (`school_enrolments.ends_at`), "after work" when
    the speaker's office hours end (`household_members.work_ends_at`); both
    are read through `household/day-hours.ts`.
  - **Assumptions are said back.** With no hours on record, school is taken
    to end at 3:30 pm and work at 6 pm, and the reply says so and where to
    set them.
  - **The place book has a screen.** `/places` (under More) lists saved and
    turned-down places; an adult keeps a note, removes one, or lets a
    turned-down place be suggested again (`app/places/actions.ts`).
  - **The reply is deterministic** (`answer.ts`). The places travel as
    cards (`apps/web/app/ai/place-cards.tsx`, kept in the message's
    metadata).
  - **The family is the only teacher.** Save and "not for us" go to
    `household_places` through `apps/web/app/ai/place-actions.ts`. That
    action re-reads the place from the stored reply, never from the
    browser. Every member reads the book; adults and Admins write it.
    Saved places rank first, and turned-down places never return.
  - **Searches are budgeted.** `places.find` limits each household to 30
    searches an hour. Alexa leaves place questions to the app; Gemini Live
    inside the app answers them where location may reach Google
    (`channelAllowsAction`, `inApp` limits).
  - **Getaways.** "A two-day vacation plan" is a getaway (`purpose:
    "getaway"`): tourist attractions within a few hours' drive of home,
    kept to that area rather than only biased to it, day-trip distances left
    out, no opening hours checked.

  A model's reading names people by placeholder ("Child A"), and the letters
  move when a member is added, so `restoreParameterNames` puts real names back
  into every string before anything is kept. Never store a placeholder.
  "Who is in the family" is answered from the whole member list by rules
  (`conversation/roster.ts`), never from what a model was shown.

  Spoken replies go through `conversation/speech.ts`'s `speakable`. It
  drops arrows, links, list markers and symbols for words a person would
  say. Every voice path speaks through it, never the raw reply.

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
`ALEXA_*`; Gemini Live runs only on a Google key and only where the household's
data-use agreement allows it, re-checked on every tool call. That key is the
household's own Gemini voice key (`household_gemini_voice_credentials`,
voice, and HomeBrain's embeddings when the assistant key cannot make them) if one is set, otherwise the assistant's key when that is
Google's, so an assistant on Anthropic can still talk through Gemini. No key
table ever lets a session read `api_key` back. Each one grants SELECT on
every column except the key, so key writes are an insert, then an update by
household (`ai/key-row.ts`), never an upsert. Gemini Voice runs only inside HomeTalk's own screen, so a capability may
be `in_app` for it: the same as typing it there (plans, what is at home, who
does what), while Alexa keeps `app_only`. Paying and ordering are never by
voice. What each
channel may do is `voicelink/capabilities.ts` — every HomeTalk action is
placed in it exactly once and its tests hold each cell to the real gates, so
a new action forces a decision about voice. A conversation belongs to its
surface (`conversation_sessions.surface`): what the app is waiting on is
never answered by Alexa. Every turn leaves one content-free row in
`hometalk_channel_events`, and `npm run eval`'s blocking `voice` gate checks
that every Gemini tool sentence is read by the rules as the action it
promised — extend `voicelink/readiness.ts` when a tool changes.

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
- **Plan policies.** A burst limit and a fair-use level are plan data on
  `plan_features` (story 20-007), read only by `billing/repository.ts`'s
  `consume`. A burst refuses for its fixed window, and the refusal says so.
  Past a fair-use level nothing is refused: the household is served more
  simply, and HomeTalk answers from the rules with a disclosure. Staff
  change them through `PATCH /platform-admin/plans/{planKey}/policies`, and
  every change is kept in `plan_policy_events`. A domain module never
  hard-codes a number of its own.
- **Entitlement experiments.** An experiment changes one plan feature for
  a stable, hashed share of the households on the plans it names (story
  20-008, `billing/experiments.ts`). It is applied inside `loadSubscription`,
  so `may`, `consume` and every screen give the same answer, and a direct
  API call gets the same answer too. Its terms are frozen once it is
  running, and the database enforces that. Settings tells a household when
  a feature is part of a trial. Never gate a feature on anything but the
  entitlement service.
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
- Every Admin is equal: any Admin can make another adult an Admin or step one back. The owner always stays an Admin, and only adults can be Admins.
- Children have age-appropriate access and privacy.
- Manage Household defines responsibilities, playbook, routines, policies and AI autonomy.
- Certification exposes what WonderHome believes and lets authorized users correct it.
- AI agents use governed APIs/tools and never directly mutate Supabase.
- Server-side authorization is authoritative.
- Sensitive actions require appropriate approval/step-up authentication.

## External providers
Never invent credentials or claim a live integration. Build provider-neutral interfaces and deterministic mocks/fixtures first. A real provider is considered live only after credentials, authentication, contract behavior and integration tests are configured.

Weather (story 17-007) is the first provider that needs no household
credential: Open-Meteo sits behind the 13-005 `WeatherProvider` port
(`home/open-meteo.ts`), and `home/weather-service.ts`'s `householdWeather`
is the one way in. It checks, in order, that the deployment has a
provider, that an Admin chose an area and that the plan includes
`home.weather`. The area is stored only as coordinates rounded to about a
kilometre (`weather_locations`). The forecast is fetched at most hourly and
kept on that row by the server. An outage is recorded on the integration
row and never on household state. Weather is off unless the deployment
sets `WONDERHOME_WEATHER_PROVIDER=open-meteo`. `OPEN_METEO_API_KEY` moves
requests to Open-Meteo's commercial endpoint, and whether production needs
that key is a person's call. Weather speaks only when it changes a
decision, such as washing that won't dry. It never gives a forecast readout.

Billing (story 20-006) goes through the `BillingProvider` port
(`billing/provider.ts`). Only the pure `applyBillingEvent` moves a
subscription in response to a payment. It ignores an event older than the
last one applied, or one about another subscription. A failed payment keeps
the plan as past-due, and a cancellation falls back to free. Neither ever
touches a household's records.

Payments (story 20-009) take two providers behind that one port: Razorpay
(`billing/razorpay.ts`) for India and Stripe (`billing/stripe.ts`) for
everywhere else. The provider is never the source of truth:
- **Prices are ours.** `plan_prices` holds what a plan costs per interval
  and currency, in major units. `payment_provider_plans` maps each price to
  the provider's plan or price id. It is service-role only, so the browser
  never names or sees a provider id. Both start empty. Pricing is a
  person's decision, never invent one.
- **The router chooses.** `billing/router.ts`'s `selectPaymentProvider`
  sends INR or a household in India to the India provider (default
  razorpay) and anything else to the international one (default stripe).
  A preference is honoured only where that provider is eligible. A provider
  is live only when it is listed in `WONDERHOME_BILLING_PROVIDERS` (the
  older `WONDERHOME_BILLING_PROVIDER` is still read) and fully configured.
  Razorpay needs `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
  `RAZORPAY_WEBHOOK_SECRET`. Stripe needs `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET`; `STRIPE_PRICE_<PLAN>` is only the legacy
  fallback. `WONDERHOME_BILLING_INDIA_PROVIDER` and
  `WONDERHOME_BILLING_INTERNATIONAL_PROVIDER` change the defaults.
- **Money converts at the adapter.** Minor units exist only inside an
  adapter (`billing/money.ts`, by the currency's own exponent).
- **Webhooks are verified and applied once.** Each provider has its own
  endpoint, `/api/v1/billing/webhook/{provider}` (the bare path stays
  Stripe's). A delivery is believed only after HMAC verification of the raw
  body, and each provider event is applied once (`billing_events`). The
  intent id is the idempotency key (`billing_intents` holds one open intent
  per household and plan), so a retry is never a second transaction.
- **The ledger is what providers reported.** `payments` only ever move
  forward (`billing/states.ts`). A refund in `payment_refunds` is pending
  until the provider confirms it, and its household comes from our own
  ledger, never the payload. `billing_invoices` and `payment_customers`
  complete it. Admins read the ledger, only the server writes it, and it
  holds no card number, no secret and no provider prose.
- **Nothing is taken away early.** A cancellation or downgrade waits for the
  end of the paid period (`cancel_at_period_end`, `scheduled_plan_key`).
- **Operations** (story 20-011). A payment's outcome reaches one Admin as a
  notification sourced from its ledger row (`billing/notices.ts`). Staff see
  payments and start refunds through `platform/payments.ts` (a reason code,
  pending until the provider confirms). Reconciliation (`billing/reconcile.ts`)
  records differences in closed words and never corrects the ledger itself.
- **The prices, and early access.** The catalogue holds the decided prices:
  Pro ₹299 and Max ₹599 a month, or a year at 20% off (₹2,870 and ₹5,750).
  No plan is marked `requires_payment` yet, so switching stays free and every
  screen says "Free during early access". Marking the plans paid is the step
  taken once a provider is live; until then no checkout is offered.
- **The screens** (story 20-010) are `/settings/plan` (terms, Monthly/Yearly,
  the plans), `/settings/plan/checkout` (our summary before the provider's
  page), `/settings/plan/confirmed` (waits for the webhook, never assumes),
  `/settings/plan/billing` and its invoices. `billing/account.ts` holds their
  reads and arithmetic. Cancelling at period end asks the provider first
  (`POST /households/{id}/plan/cancel`).

A plan marked `plans.requires_payment` can never be written onto a
subscription from a household session: RLS and `changePlan` both refuse
it. Every plan is unmarked today, and marking plans paid is a person's
pricing decision. Never let a household change its own plan to a paid one
without a verified payment.

WhatsApp (story 17-006) is a delivery channel behind the 06-008 adapter
shape (`notifications/whatsapp.ts`). A new notification that is due now
goes out on the member's live channels (`notifications/deliver.ts`, called
from `createNotification`), and each attempt leaves a `sent` or
`delivery_failed` event in closed words. A reply to an open thread never
pings again.

The webhook (`/api/v1/whatsapp/webhook`) does four things:
- answers Meta's handshake;
- believes a POST only after `X-Hub-Signature-256` verifies, then records
  delivered, seen or failed by provider message id;
- honours STOP on the spot;
- takes in what a linked adult sends (below).

WhatsApp is also a HomeSend intake (stories 14-015/14-016,
`packages/core/src/whatsapp/`). It is an input channel, never an
authorization channel:
- **Linking.** A number becomes one adult member's only through a
  single-use code. The member asks for it signed in, and it is stored
  only as a hash, valid for fifteen minutes (`whatsapp_link_requests`).
  WhatsApp then delivers "CONNECT <code>" from that number, and
  `public.complete_whatsapp_link` completes the link atomically on the
  server. A number that merely matches something typed somewhere links
  nothing. One number is linked to one member at a time, anywhere
  (`whatsapp_identities`). Disconnecting (`public.disconnect_whatsapp`,
  the member or an admin) keeps the row and everything made from it.
- **Inbound.** The household and member always come from the verified
  link, never from the message. A linked number's message is recorded
  once by WhatsApp's message id (`whatsapp_messages`) and queued as a
  `whatsapp.process` job. After the response it becomes a HomeSend item
  (`whatsapp` / `whatsapp_media`), through `ingestWhatsAppText` /
  `ingestWhatsAppMedia` — the same pipeline, gates and confirmation as any
  item. A number with no link is told how to connect, and nothing it sent
  is kept.
- **Replies.** The acknowledgement (`acknowledgementFor`) is short, sent
  once, inside the 24-hour window the person opened, and never echoes an
  amount, a health detail or a number.
- **What it never does.** WhatsApp is not a second brain: it never answers
  questions, decides, or touches a domain record.
- **Telemetry.** `whatsapp_events` holds closed words and counts only.
- **Screens.** `/settings/whatsapp` is the one place a number is
  connected or disconnected. "I've sent the message" only looks again,
  and the confirmation is shown from the server's own link, never from
  the browser. Other members only ever see "WhatsApp connected" beside a
  name, never the number. HomeSend lists WhatsApp as a channel, filters
  its inbox by channel (`homesend/channels.ts`), and says who sent each
  WhatsApp item.

It all stays inert until a deployment sets `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`,
`WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`. The app offers
connecting only once `WHATSAPP_BUSINESS_NUMBER` is set too. Scheduled notifications go out at their time through the delivery clock
(see Push under Smart notifications).

Partner keys (story 18-008, `packages/core/src/developer/`) let an app a
household trusts use a narrow API (`/api/v1/partner/*`). An Admin creates a
key under Integrations and sees it once; only its hash is kept. Scopes only
narrow, a sandbox key (`whk_test_`) reads fixtures and writes nothing, and
writes go through the same domain service a screen uses. A partner has no
session, so every partner query names the key's own household explicitly. It
is all off unless a deployment sets `WONDERHOME_DEVELOPER_API=on`. A new
partner capability is a new scope plus its endpoint, never a wider key.

Smart notifications (module 23, `packages/core/src/notifications/`) are
reminders about real records, never lines of text fired and forgotten.
- **Sources.** `sources.ts` derives each reminder from a record a domain
  already keeps: an unpaid bill, pending school work, a planned meal, the
  grocery list, pet care, a family plan.
- **Reconcile.** `reconcile.ts` brings the notifications table in line
  with those records (create, update, resolve, expire; idempotent). It runs
  after any signed-in page (throttled), before `/notifications` reads, and
  from the daily cron.
- **Timing.** `policies.ts` defines when each kind lands, as per-category
  presets a person picks from (`reminder_preferences`). Every time is on
  the household's clock (`timing.ts`); never read `getUTCHours()` for a
  person's day.
- **Recipient.** One person (`plan.ts`): the record's owner, then the
  responsibility's owner, a child's guardian, the backup, then the Admin.
- **What a person may change.** A recipient changes a reminder's state
  (seen, done, dismissed, snoozed forward up to 31 days), never its
  content; a trigger enforces this, and every transition is recorded.
- **Actions.** Acting on the thing itself goes through the domain's own
  service. The reminder resolves because its source changed, not because a
  notification wrote to a domain table.
- **Push** (story 23-015, `notifications/web-push.ts`, `push-gate.ts`). A
  member turns push on per device in Settings → Notifications
  (`push_subscriptions`, their own rows only; `public/sw.js` shows it). A
  push goes to the one recipient's devices only when it earns the buzz
  (`pushWorthSending`): critical always, high and timed reminders within a
  daily ceiling, low never; quiet hours hold except for critical. Every five
  minutes pg_cron calls `/api/v1/notifications/dispatch`
  (`deliverDueNotifications`), so a reminder lands at its time. It is inert
  until a deployment sets `WONDERHOME_VAPID_PUBLIC_KEY` and
  `WONDERHOME_VAPID_PRIVATE_KEY` (optionally `WONDERHOME_VAPID_SUBJECT`) and
  the database holds the cron secret in Vault as `cron_secret`. A device the
  push service calls gone is forgotten. Never push from anywhere but
  `deliverNotification`.
- **Email** (story 27-001, `notifications/email.ts`). The same `deliverNotification`
  sends it, through the platform mailer (`email/mailer.ts`, GoDaddy SMTP) where the
  deployment has one, to the confirmed email of the recipient's own account, never one
  an Admin typed. It earns an inbox by `emailWorthSending` (critical always, high up to
  12 a day, a reminder timed for the person up to 6, low never) and holds for quiet
  hours except critical. Each attempt is a closed-word `notification_events` row. Never
  mail a notification from anywhere but `deliverNotification`.
- **What goes where** (story 27-002, `notifications/routing.ts`). A person keeps one
  kind of reminder off one channel (`notification_channel_mutes`, their own rows only);
  no row means allowed. `deliverNotification` is given the reminder's `category` and
  skips a muted channel, except for a critical alert, and the in-app list cannot be
  muted. Only channels that are on and reach someone here are offered, in Settings →
  Notifications → "What goes where". The backlog for the
  channels and the events still to come is `backlogs/27-Notification-Channels.md`.
- **Fewer interruptions.** A child's school things due the same day are one
  reminder (`school_day`, `batchSchoolDays`), as urgent as the most urgent
  item in it. A policy that escalates tells the responsibility's backup
  once, only after the last reminder has gone unanswered for the policy's
  wait (`isUnanswered`, `planEscalation`). Nothing repeats beyond
  `maxRemindersFor`.
- **Smart, but never in charge.** The day's summary on `/notifications` is
  built from the same rows. Learned timing (`learning.ts`) is off unless a
  person turns it on. It learns only from them acting on a reminder, needs
  five consistent times, never overrides a timing they chose, and is claimed
  on a row only when it actually moved it.
- **In each person's language** (story 22-006). A reminder's words are a
  `reminder.*` catalog key plus typed values (`notifications/message.ts`),
  kept in `notifications.message`. `title`/`body` are the English record,
  rendered from that same message. `/notifications` and delivery beyond the
  app render it in the recipient's language and formats. A name or item is
  never translated, and an unreadable message shows the stored English.
- **New kinds.** A new kind of reminder is a new source plus a policy
  entry, with its wording as `reminder.*` keys in every catalog, never a
  new writer of `notifications`.

## Non-functional gates
Use the targets in `TECH-STACK-AND-NFR.md`. P0 security and authorization tests are release blockers. Core API targets are p95 <=500ms reads and <=800ms ordinary writes excluding external provider latency.

## Verifying UI changes in a browser
For any UI change, actually drive it in a browser at 360px and desktop before calling the story done — typecheck/lint/unit tests verify correctness, not that the feature works. To sign in as a test household without touching the public sign-up form (which rejects sandboxed test-email domains like `.test`/`example.com` with a generic "could not create that account" error that looks like an app bug but is Supabase Auth's own validation, not this app's): `node scripts/qa-test-user.mjs create "Name"` creates an already-confirmed account directly via the service-role key already in `apps/web/.env.local`, then sign in with the printed credentials. Always `node scripts/qa-test-user.mjs delete <user-id>` when done — it only ever touches whatever Supabase project `.env.local` points at.

## Applying a migration to the live project
Writing a migration file is not shipping it. This repo's live Supabase project only has what actually reached it through the Supabase MCP `apply_migration` tool (`mcp__Supabase__list_projects` finds the project id, `list_migrations` shows what has landed) — a file committed to `supabase/migrations/` with nobody having run that tool is invisible to production no matter what the story tracker says. This bit a real story: three migrations in a row got written, tested locally, committed and marked `Done` without ever being applied, and the gap surfaced only when a fourth story tried to read the column one of them added. Apply every migration to the live project as part of finishing the story that introduces it, in the same session, and run `npm run verify:live` afterward to confirm it landed — never treat a green `test:db` run (a from-scratch local database) as proof that the live project has it too.

## Row-level security checks membership as a set
A policy never calls `wh.is_member(x)`, `wh.is_household_admin(x)` or
`col = wh.member_id(x)`. Each is a security-definer function that runs its
own lookup for every row a query touches; counting 32 rows took 17 ms that
way (performance pass, 2026-10-19). Write the set forms instead, which run
once per statement:
- `x in (select wh.member_households())`;
- `x in (select wh.admin_households())`;
- `(x, col) in (select household_id, member_id from wh.my_memberships())`;
- `(select auth.uid())`, never a bare `auth.uid()`.

`scripts/test-setup-counts-rls.mjs` fails if a policy still uses a per-row
helper.

## Performance: what every change keeps
The performance pass (2026-10-19, `docs/progress/2026-10-19-performance-pass.md`)
halved most page times. Production runs beside the database (Vercel `bom1`,
Supabase ap-south-1), so a page is as slow as its longest chain of awaits plus
its slowest query. New code keeps both short:
- **One wave, not a chain.** A page or action starts every independent read
  in one `Promise.all`. It never awaits one read before starting another that
  does not need its result. A plan check starts alongside the read it gates,
  and the read's result is dropped if the check refuses (`_lib/agenda.ts`).
- **Read a thing once per request.** A domain's agenda returns the rows it
  assessed, and its page reuses them instead of reading the table again.
  Anything several components need in one render goes through React `cache()`.
- **One call for many counts.** Several counts or small reads that always go
  together become one security-invoker RPC, like
  `public.household_setup_counts`, never N requests.
- **Every list has a bound.** A read of a table that grows (messages,
  actions, events, notifications, history) has a `.limit()` or a date range.
  Pages ask only for the columns they show.
- **Index what a query filters or joins on.** Every new foreign key and every
  column a policy or a hot query filters by gets an index in the same
  migration. RLS policies use the set forms above.
- **Platform data is cached per server.** Data that is the same for every
  household (holiday regions, catalog metadata) is kept in a process-level
  cache with a TTL, as `calendar/repository.ts`'s `holidayRegions` does. It is
  never read on every request. Household data is never cached across requests.
- **Work that can wait runs after the response.** Rebuilds, reconciles and
  throttled writes go through `after()` or the delivery clock, never on the
  request path.
- **Nothing server-only reaches the browser.** Catalogs, help words and large
  constants stay on the server, and a client component gets its labels as
  props. `npm run check:bundle` guards this.
- **Measure before and after.** For a change on a hot path, read
  `pg_stat_statements` or the performance advisor first. `EXPLAIN ANALYZE` the
  query as `authenticated` with a real member's claims, and compare warm
  timings on the production build. Never time a dev server. Put the numbers in
  the progress note.

## Database query permissions
All SQL against the Supabase project — `mcp__Supabase__execute_sql`, `apply_migration`, and every other Supabase MCP tool — is pre-authorized. Run what the work needs (including destructive statements: dropping a constraint, deleting QA/test rows, correcting bad data) without pausing to ask first. This still means investigate before deleting real household data and keep QA cleanup scoped to what a session's own test account created, per the rest of this file — it removes the confirmation step, not the judgment.

## Opening and merging pull requests
Merging is automatic, and standing permission covers it: never ask before opening or merging.
- **Every change reaches `main` through a pull request,** never a direct push, so every build and deployment has CI behind it.
- **Open a PR for finished work** pushed to a story or feature branch. Never leave pushed commits on a branch with no PR against them.
- **Turn on auto-merge as soon as the PR is open.** Use squash, per the build-slot budget below, so GitHub merges it once every required check passes.
- **Where auto-merge can't be enabled, merge it yourself.** That covers a repo setting that rejects it and a PR with no required checks. Merge as soon as CI is green on the current head and there is no merge conflict.
- **Every PR against this repo is merged this way,** whether this session opened it or found it already open.
- **Only four things hold a merge back:**
  - an open review thread that hasn't been addressed;
  - a PR explicitly marked draft or WIP;
  - red CI, which is work to fix, never a reason to wait;
  - a red nightly E2E run on `main` (`e2e-nightly.yml`). It is fixed before other work merges, and its fix is the one PR that may merge meanwhile. Find the root cause; "flaky" is not one.

## Where tests run
[`docs/CI.md`](docs/CI.md) is the full account.
- **Pull requests** run fast checks only: typecheck, ESLint on the changed files, the unit tests related to what changed, the security and evaluation gates, DB tests when migrations change, and a build.
- **Pushes to `main`** run every unit test and the whole lint.
- **The full Playwright suite** runs nightly at 03:00 IST (`e2e-nightly.yml`, cron `30 21 * * *` UTC) against a fresh build, never on a pull request.
- **Before merging something risky,** run the affected specs locally with `npm run test:e2e -- <spec files>`. Risky means sign-in, permissions, a migration, payments, or a new cross-feature flow. That command pins the app to a placeholder Supabase project, so it never reaches production data.
- **Never skip, disable or delete a test** to make CI green.
- **Pre-launch testing is pre-authorized.** WonderHome has no real households yet, and the owner allows the following without asking:
  - running every test, including the full E2E suite and the signed-in specs;
  - creating QA and E2E test users and households on the live project. For E2E, set `E2E_ALLOW_LIVE_PROJECT=1` with the `E2E_SUPABASE_*` variables.

  Clean up afterwards as *Cleaning up test data after the merge* requires. This permission ends the day WonderHome launches. From then on, E2E needs its own test project, and the live project is refused again.

## Help content changes with the feature
The user guide is for signed-in members only.
- **Where it lives:**
  - the route gate is `security/route-policy.ts`;
  - the words are `packages/core/src/i18n/messages/areas/help/`, read through `help/words.ts` and never through the general catalogs;
  - its shape is `help/guide.ts`.
- **What a feature change carries.** A pull request that adds, removes or renames a user-facing feature updates the help content in the same pull request:
  - the section's words, in all eight languages;
  - the FAQ if one covers it;
  - the section's `updated` date.
- **How to write it.** Describe what the code does, in the UI's own labels. Say when something is AI-generated or done on the person's behalf, and what they stay in control of. Never describe a planned feature as available.
- **The checks.** `npm run lint:help-links` fails on a link to a route or section that is gone. `npm run check:bundle` fails if the guide's words reach client JavaScript.
- **Release notes** (`help/release-notes.ts`, `/help#release-notes`) are written only when the owner confirms a version is live:
  - add one entry at the top of `RELEASE_NOTES`: that day's date, `fromPr` one after the previous entry's `throughPr`, and `throughPr` the last PR merged into what is live;
  - cover every user-facing feature merged in that range, at a high level, one item per feature in the UI's own labels; leave out fixes, CI and docs;
  - its words are `help.release.<id>.title` and `.item.N`, in all eight languages;
  - never write an entry for work the owner has not confirmed live, and never edit an older entry except to correct it.

## Where it is hosted
Since October 2026 WonderHome lives in the Vercel account **Kunal** (team `kunals-projects-9f64757f`, `team_nGnxn1FrUI78kVpMm12R7FIF`, Hobby plan) — the account the Vercel connector is signed in to. The earlier teams (`wonder-team4`, `luvchakras-projects`) are history; older progress notes that name them are superseded.

| Vercel project | Id | Serves |
|---|---|---|
| `wonderhome` | `prj_wmkKrjqrezwGc8av9LEdjbcU46cO` | `home.wonderapps.biz` (this app, production from `main`) |
| `wonder-apps` | `prj_eAN93HE8LG4URCWU0JlhBQtokWuM` | `wonderapps.biz`, `www.wonderapps.biz` |

New deployment URLs end in `-kunals-projects-9f64757f.vercel.app`. Deployments made before the move still end in `-wonder-team4.vercel.app`; that is the old team's URL slug, not a second team. Call the Vercel connector **without** a `teamId`/`slug` — it then works against this team, the account's default; naming the team explicitly is refused with 403 until the connector is re-authorized for that scope. The live database is Supabase project `wonderhome` (`kqxndableyysxqhxiorz`, ap-south-1).

## Build-slot budget (Vercel's daily deployment cap)
The Vercel project is on a plan that allows 100 deployments a day. Every deployment Vercel *creates* counts, including one the ignore step (`scripts/vercel-should-build.sh`) then cancels. When the cap is reached, Vercel refuses new deployments, production included, and refused ones are not queued (this happened on PR #191). Treat deployments as a scarce budget, with production first:

1. **Create no deployment you don't need.**
   - `vercel.json`'s `git.deploymentEnabled` turns automatic deployments off for `claude/**` and `feature/**` branches. Keep it that way; the ignore script is not a substitute, because a cancelled build still uses a slot.
   - Previews stay off unless someone will actually open one. Verify UI locally (see *Verifying UI changes in a browser*), not on a preview.
   - Only one Vercel project may be linked to this repository.
2. **One merge to `main` is one production deployment, so merge in bigger pieces.**
   - Squash-merge.
   - Docs, changelog, trackers (`npm run tracker`), progress notes and test updates go in the same PR as the code they describe.
   - Never open a docs-only PR while a code PR is open or about to open.
3. **Tests run on GitHub Actions or locally, never on Vercel.**
   - E2E runs on the CI runner nightly (`e2e-nightly.yml`). Don't add a check that deploys to run tests.
   - Never re-run a failed run hoping it passes; find the cause first.
   - A scheduled suite, if one is ever added, runs rarely, uses few shards, and skips when `main` hasn't changed since the last green run.
4. **Verify before pushing, so there are no fix-up pushes.** Run typecheck, lint, the touched unit tests and a local production build (`npm run build -w apps/web`) when the change can affect the build. Push a branch once, when it's ready.
5. **Watch the budget.**
   - Before deployment-heavy work, count the last 24 hours. Vercel's API may refuse this session; `gh api "repos/luvchakra/wonder-home/deployments?per_page=100"` lists what Vercel reported, with `created_at`.
   - Above about 70 of 100, stop docs-only merges and anything else that deploys. Keep the rest for production and hotfixes.
6. **When the cap is hit:**
   - Stop pushing to branches that deploy.
   - Wait until the oldest counted deployment is 24 hours old.
   - Redeploy only the latest `main`, once.
   - A Vercel "rate limited" / `api-deployments-free-per-day` status is infrastructure, not a failing check on the PR. It is not a reason to push again.

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

**HomePlaces, HomeFood and HomeEvents keep their own backlogs, kept current
by every PR that touches them.** HomePlaces is `backlogs/24-HomePlaces.md`
(place questions, the place book, school and work hours, `/places`).
HomeFood is `backlogs/25-HomeFood.md`, the owner's name for all grocery and
pantry work — what is at home, what to buy, receipts into stock, Send to
Cook (formerly 09-010 to 09-013). HomeEvents is `backlogs/26-HomeEvents.md`,
the owner's name for the calendar — the Calendar tab, event visibility,
occasions and holidays, and every later calendar phase (formerly 12-009 to
12-014). Any work on any of them, a fix included, updates that file in the
same pull request:
- the story's status and its notes, with the PR number;
- a new story for each follow-up the work leaves open, and the removal of
  one the work closed;
- then `tracking/PROGRESS.md` and `npm run tracker`.

**"Work on the next high-priority story" means `tracking/PRIORITY-ITEMS-REPORT.md`.**
It is the owner's ordered queue for the four priority modules (HomePlaces,
HomeFood, HomeTalk, HomeEvents) and their direct asks. Take its first
**Next** or **Not Started** row that waits on nobody, and update the file in
the same PR that moves it.

**Regenerate `docs/PROGRESS.md` after every story status change.** Run
`npm run tracker`. It projects all twenty-two backlogs into one page — where
the whole application stands, what is left, and every story with its status —
so nobody has to read twenty-two files to answer "what is done". The backlogs
stay the source of truth: edit the story's row there, then regenerate. Never
edit `docs/PROGRESS.md` by hand; CI runs `npm run tracker -- --check` and
fails when it is out of date.

**Write a progress note in `docs/progress/` after every major activity.** A major activity is anything a reader would want to find later without reading git history: a story or module completed, an infrastructure change (a database or hosting move, a new provider, a region change), a design-system or performance pass, a security fix, or a decision that shapes later work. Name the file `YYYY-MM-DD-short-slug.md` and write it before moving on to the next activity, not at the end of the session. Each note says what was done, why, what was verified (which gates ran and their results), what is still open or needs a person, and where the code lives. `docs/progress/README.md` is the index: add every new note to it. The trackers say *that* something is done; these notes say *what it was and how to pick it up*.
