# Agent platform: HomeTalk, HomeBrain, HomeSend

Reference detail moved verbatim from CLAUDE.md (2026-10-24, token-economy pass); the summary rules followed on 2026-10-25 and are the next section. `CLAUDE.md` keeps only the invariants. Read this file before you change conversation, HomeBrain, HomeSend, HomePlaces, voice or evaluation code.

## Summary rules (from CLAUDE.md)

Detail: `docs/agent-platform.md`. Read it before changing conversation, HomeBrain, HomeSend, HomePlaces, voice or evaluation code. One pipeline, three real surfaces, each wired end to end.

- **HomeTalk** (`/ai`, `packages/core/src/components/ui/talk-composer.tsx`) is the one door (rule 13). Spoken and typed turns both run through `conversation/engine.ts`.
  - Every action is grounded before a proposal exists (`conversation/grounding.ts`): names via the Wave 1 resolver, dates via `conversation/temporal.ts` (code decides the day, in household time), references via `conversation/references.ts`. Still uncertain → one focused question, never a guess.
  - A correction replaces a pending proposal or undoes an executed write through its domain service, both kept on the record (`conversation/corrections.ts`).
  - Multi-request sentences are split (`conversation/decompose.ts`); a dependent part runs only if its earlier part happened.
  - Consent (`conversation/consent.ts`): an adult's everyday, undoable change is done at once ("Say undo to take it back"). Changes touching someone else are asked once. Paying and ordering always wait for a tap on screen. Child, helper and agent actions follow autonomy. An Admin's "Ask before acting" makes every act a question.
  - A reminder is a notification to the speaker alone, held until `scheduled_for`. An add that changed nothing says "Nothing to change", never "Done".
  - Models see facts only. `withoutServerOnly` strips anything the server decides (ids, grounded dates, undo records). Replies are composed in English, the record; other languages go through `conversation/reply-language.ts`. A new action needs a `REPLY_CLASSES` entry.
  - Extend `conversation/evaluation.test.ts` when an understanding changes; never loosen it.
- **HomeBrain** (`conversation/brain.ts`, `ai/model-client.ts`) gives the reasoning behind a reply. It is a real model call behind the same consent, minimisation and entitlement gates, and never decides: every downstream gate runs on its output.
  - No model answer reaches a person unvalidated: `homebrain/validate.ts` refuses invented names, dates, amounts, events, health or integration claims and "I've done it" claims. Extend it when a new kind of invention appears; never route around it.
  - "Why?" is answered from evidence in `homebrain/why.ts`, never by a model.
  - The household context is one server-only row (`household_context`, `homebrain/context-store.ts`). Never read it from a session, and never answer from a row older than the last write.
- **HomeSend** (`packages/core/src/homesend/`, `ai/classify-intake.ts`, `/home-send`) is the intake. Every input enters through `homesend/ingest.ts` and ends in `IntakeUnderstanding`. A new input type is a new `ingest*` entry point, never a second pipeline.
  - Nothing reaches a domain table until a person confirms. Bills, health documents and receipts always wait for a person.
  - Nothing is added on its own unless HomeSend is more sure than the household's bar: more than 95% (every detail found in the text sent, `homesend/verify.ts`) unless an Admin picks another on Settings → AI Assistant (`homesend/auto-add.ts`, 60–99%). Photos and files always wait, whatever the bar. Every entry shows its score as "N% sure". The `understanding` eval gate keeps HomeSend above 95% in category and end to end.
  - Told in HomeTalk about a new dated thing (`file_with_homesend`), the sentence goes through `ingestText` like a paste, never straight to a table.
  - A class outside school is its own kind, never school work (`activity_item`, 08-027): filed under the child's class of that name in Kids & School, the class added in the same step when missing. An event or invitation (`event`) goes on the calendar through `addFamilyEvent`.
  - All content is untrusted: `injection.ts` fences it and ignores instructions aimed at WonderHome. Links are fetched only through `link-fetch.ts` (public addresses, DNS pinned, every redirect checked).
  - Duplicates are shown and moved dates are offered as updates, never a second copy (`reconcile.ts`). Document plans (`homesend/plan.ts`) apply only through `applyDocumentPlanAction`, and never on their own when there are two or more records.
  - Failed items are kept under "Failed safely", never dropped. Every routed item can be undone through `homesend/changes.ts`, never a raw delete.
- **HomePlaces** (`packages/core/src/homeplaces/`, intent `find_places`) is a read, never a write. Where and when come from the record; assumptions are said back. Never store a placeholder name.
- **Voice channels are doors into HomeTalk, never second brains.** Every channel asks through `hometalk/gateway.ts`; `completed` is only the executor's own record. What each channel may do is `voicelink/capabilities.ts`. A new voice capability is an allowlisted tool mapped to a HomeTalk utterance, never a tool that reaches a table. Paying and ordering are never by voice. Spoken replies pass through `conversation/speech.ts` `speakable`.
- **Agents** run a governed pipeline: `ai/gather-assessments.ts` → `ai/specialists.ts` `coordinate()` → `ai/orchestrator.ts` → `ai/tools.ts` `authorizeToolCall()` (scope → entitlement → permission → autonomy) → `ai/executors.ts`. Autonomy has two modes, prepare (wait for a person) and execute, and reads "prepare" on any error. AI agents use governed tools and never mutate Supabase directly.
- **One evaluation** (`npm run eval`, `packages/core/src/evaluation/`) runs golden cases A–E, all synthetic. Release gates block CI; Unsafe Action Rate must stay zero. When a case catches a defect, fix the product, never the expectation. An `includes` entry may list one fact's wordings, never a different fact. Add a case whenever an understanding, reconciliation or answer rule changes. Corrections are evidence (`evaluation/evidence.ts` → `ai_corrections`). Approvals bind to the exact proposal (`conversation/approval.ts`); a stale or changed approval is refused.
- **Production hardening**
  - Rate limits go through `security/rate-limit.ts` `hitRateLimit`. They fail open and say the pause is temporary.
  - Plan burst and fair-use numbers are plan data read only by `billing/repository.ts` `consume`. A domain module never hard-codes a number.
  - Gate a feature only on the entitlement service. Experiments apply inside `loadSubscription`.
  - Model clients come only from `ai/provider-clients.ts` (timeout, one retry). Never construct an SDK client elsewhere.
  - A cron route exports `GET` as well as `POST` (Vercel Cron sends GET).
  - An idempotency key is reserved while in flight, so a double tap is refused. A household runs one agent pass at a time.
  - Failed classifications are retried through `jobs` (`homesend/retry-queue.ts`), dead after five tries.


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
  The household record index (spec `design/HOUSEHOLD-RECORD-INDEX.md`, story
  14-036) makes every saved record knowledge by default:
  - **One registry.** `knowledge/registry.ts` names every table with a
    `household_id` once. It is `builder` (a hand-written builder reads it,
    naming its `ContextRecords` list), `registry` (the generic describer in
    `knowledge/describe.ts` reads it and says every field) or `excluded` (with
    the reason). A new table goes in the same pull request that creates it.
  - **CI enforces it.** `npm run lint:knowledge` fails on an unnamed table, a
    stale entry, or a table read as knowledge without the
    `wh.mark_context_stale` trigger.
  - **It tests itself.** Each `registry` entry's `example` row is run through
    the describer by `knowledge/registry.test.ts`, with no case to write.
  HomeBrain reads everything the Calendar shows (26-020):
  - **One map.** `CALENDAR_SOURCE_RECORDS` (`context/builders.ts`) names the
    HomeBrain records behind every calendar source. A new source does not
    compile until it is mapped and read.
  - **Every table it reads marks it stale.** A table HomeBrain reads gets the
    `wh.mark_context_stale` trigger in the same migration that adds the read.
  - **A day or a week comes from the Calendar.** "What's on tomorrow?" is
    answered by rules from `calendarRange`, as the screen reads it
    (`scheduleReply`).
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
  Nothing is added on its own (a household's "execute" setting; never a
  bill, health document or receipt) unless HomeSend is more sure than the household's bar
  (`homesend/verify.ts`, the owner 2026-10-25; the bar is 95% unless an
  Admin picks another, `homesend/auto-add.ts`, the owner 2026-10-26). A model's own "high" counts
  as 0.9. A reading earns 0.97 only when its kind has what that kind needs
  and its name, amount, date, payee and shop are all found in the text that
  was sent; the review says which detail it could not check. A photo or a
  file has no text to check against, so it always waits for a person, and a
  voice note is never surer than its transcript.
  Being *told* in HomeTalk about a new dated thing ("Asmi's karate grading
  is on Sunday 1 November at 9.30 am") is the `file_with_homesend` action
  (the owner, 2026-10-25: a model had read it as a move). The executor hands
  the person's own words to `ingestText`, the same entry point the paperclip
  uses, so it is read, checked and reviewed exactly like anything sent, and
  nothing reaches a domain table from HomeTalk. It needs no target and no
  grounding of its own: HomeSend resolves the names and decides the day.
  A file's type is decided from its bytes (`normalize.ts`), a link is only
  ever fetched through `link-fetch.ts` (public addresses only, DNS checked
  and pinned, every redirect re-checked), an uncertain voice transcript is
  shown and confirmed, never acted on (`audio.ts`; with no Cloud Speech key,
  a voice note is written down by the household's Gemini key where its
  data-use agreement allows Google), and all of it is
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
  the confidence. A class outside school is its own kind, never school work
  (`activity_item`, story 08-027): a karate exam or a dance show is filed under
  the child's class of that name in Kids & School (the class is added in the
  same step when the child has none, and undone with it), and an event or
  invitation (`event`) goes on the family calendar through `addFamilyEvent`.
  A paid receipt is its own kind, never a bill: each line
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
  deployment sets `WONDERHOME_MALWARE_SCAN_ENDPOINT`, or
  `WONDERHOME_MALWARE_SCAN_PROVIDER=cloudmersive` (the owner's pick,
  2026-10-21) together with `WONDERHOME_MALWARE_SCAN_KEY` — same discipline
  as every other integration point here. The classifier's structured output
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
Alexa, WhatsApp — asks through one gateway (`hometalk/gateway.ts`, the canonical
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
The `understanding` gate blocks a release unless HomeSend gets more than
95% of its cases right end to end and more than 95% in the right category
(the owner, 2026-10-25); only a provider run measures the model's own reading.
`--provider configured` runs the same cases through the configured model,
and `--write` records the release artifact in `docs/ai-releases/`. When the
golden set catches a defect, fix the product. Never loosen an expectation
to pass. A case checks what an answer says, not its wording (the owner,
2026-10-21): an `includes` entry may list one fact's wordings ("2026-11-28"
or "28 Nov 2026"), never a different fact. Add a case whenever an understanding, a reconciliation or an
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
server-only `public.autonomy_for` wrapper, and "prepare" (wait for a person) on any error,
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
