# WonderHome — Design notes

Working notes that sit alongside the design contracts. The contracts are:

1. `UI-UX-REQUIREMENTS-v3.md` — the complete UI/UX implementation requirements
   (mobile application + landing page). **This is the primary contract.**
2. `UI-MOCKUP-IMPLEMENTATION-SPEC.md` — the earlier screen spec; still valid
   where v3 does not override it.
3. The mockup sheets (`WonderHome-*.png`) — look and feel, not a feature list.

This file records how we read them and the rules the code encodes.

## The one-line brief

> The family should manage the home. WonderHome should manage the management.

Every screen is judged against that. If a screen asks somebody to update
routine household work, it is wrong. If a screen shows a number nobody can
explain from data, it is wrong. If a screen offers a button that does nothing
because the provider behind it is not live, it is wrong.

## Visual language (v3 §2)

| Token family | Decision |
|---|---|
| Surfaces | Warm cream page (`--wh-background`), white cards, a fixed radial page gradient behind everything |
| Type | Sora via `next/font` (self-hosted; CSP allows `font-src 'self'` only), deep navy, fluid hero/display/title sizes (`--wh-text-*`) — brand guidelines, `design/WonderHome-brand-guidelines.png` |
| Primary | Blue (the brand's Primary Blue) for every committing action and the active nav state |
| States | Green handled · warm yellow attention · red only for the genuinely critical · blue informational |
| Domains | One colour per household domain (`--wh-tone-*`), used for the icon tile, never for text |
| Shape | 1.25rem cards, pill actions, three shadow depths (card / raised / float) |
| Motion | One easing, three durations, transform+opacity only, all removed under `prefers-reduced-motion` |

Tokens are defined once in `packages/core/src/ui-theme.css`, consumed through
Tailwind theme variables, and shared by the product and the landing page. Dark
tokens exist but apply only under an explicit `data-theme="dark"`: there is no
reviewed dark design yet.

## Rules the components encode

1. **Colour follows domain, not urgency.** A bill is money-coloured whether it
   is due tomorrow or paid. Urgency is carried by wording and by which action a
   row offers; colour alone is not a signal every reader receives.
2. **A row separates the name from the reason.** `ActionRow` shows what it is,
   why it is here, and the one thing to do. A row with nothing to do has no
   action, which is a meaningful state.
3. **Every metric is a count of something the system evaluated.** `MetricGrid`
   takes values and never invents one. "Handled quietly" is `checked − needs`.
4. **Tabs are URLs.** `SegmentedControl` renders links with `aria-current`, so
   a tab is deep-linkable, works without script, and survives the back button.
5. **Every data-driven screen has the three states** (v3 §49): `EmptyState`
   says what happens next, `ErrorState` offers a way forward and never shows
   the raw failure, `LoadingState` is a skeleton in the content's shape.
6. **Sheets and dialogs are Radix.** Focus, escape, scroll lock and naming are
   the parts a hand-rolled dialog gets wrong. Every sheet has a real title.
7. **An action preview and an executed action look different** (v3 §48). The
   `ActionPreview` state badge and the presence of Confirm / Change / Cancel
   are the difference; nobody should mistake "will do" for "did".
8. **The domains are never in the phone's tab bar** (v3 §4). Five primary
   areas at every size; domains live in the desktop sidebar and behind More,
   filtered server-side by the member's permissions.
9. **UI visibility is never authorization** (v3 §47). The personal view and the
   secondary navigation are presentation; every page and every API route asks
   the server again, and RLS asks a third time.

### Two voice intentions, two buttons (rule 14, read the other way)

Rule 14 says no two buttons for the same job. `TalkComposer` is the case
that clarifies the opposite: **speaking and conversing are not the same
job**, and for a while they shared one microphone plus a toggle bolted
under the Send button, which is why nobody could tell what a tap would do.

- The **microphone** means "put what I said in the box so I can check it".
  It ends at a transcript the person edits and sends. It never starts a
  conversation.
- The **waveform** means "let's talk". WonderHome answers out loud and
  keeps listening until it is paused or ended.

They are adjacent, the same size, and differently coloured, because they
are siblings rather than a primary and its variant. The state machine is
explicit (`talkComposerState`, and it has its own test) because the
failures here are illegal *combinations* — a Send button appearing while
the microphone is open would commit words somebody is still saying.

The brand mark sits inside this one control, which nothing else in the
product does. The exception is deliberate and narrow: the composer is the
door to WonderHome itself rather than a row about something else, and the
approved sheet draws it that way.

### Two cards to a row, never three (rule 19)

The phone layout has one hard ceiling: **two cards per row, ~48% each,
never three.** `DomainGrid` and `HandledList` are already pairs;
`MetricGrid` stacks full-width by default and takes `pairs` to opt in.

The opt-in is the point. Rule 18 exists because four stat tiles crammed
into one phone row truncated "Need you" into "Nee…", so the default has to
stay full-width — a screen that adds a longer label later must not quietly
re-create that. `pairs` says "I have checked these labels fit at half
width", which on Home means four one-word counts. Where content would be
*cut* at half width it goes full-width instead; wrapping is fine, cutting
is not (rule 15 decides, and it wins).

Primary reading is never half a row. Today's focus and the family moment
stack on a phone and only pair from `sm`; the two-up grid is for
shortcuts and at-a-glance counts.

## The brand mark (rules 1, 3, 5)

The mark is a rounded-square tile carrying the brand's Primary-to-Secondary
gradient (indigo `#6366F1` into emerald `#10B981`, diagonal), a white house
silhouette centred on it, and a heart cut from the house's middle so the
gradient shows through — "the home with heart" the current brand sheet's app
icon reads as.

It is the one place in the product where colour is not doing a job in the
rule-3 sense — the tile's own two-colour gradient is identity, not a signal —
but unlike the earlier rainbow mark it now shares its two colours with the
system: the gradient runs Primary into Secondary, the same pair `--wh-primary`
and `--wh-handled` are built from. It appears as identity — in the header, on
the signed-out frame, on the landing page, as the app icon, and at the left of
`TalkComposer`, the door to the assistant itself — and never inside a row, a
tile or a state.

**One geometry, three consumers.** `packages/core/src/brand/mark.ts` holds
the house path, the heart path and the tile gradient. `components/ui/brand.tsx`
renders the JSX from it and `scripts/build-brand-assets.ts` writes the `.svg`
and `.png` files `apps/web/public` serves. Icons are the assets most likely to
rot — binary, far from the component they should match, and nobody notices a
stale one until it is on somebody's home screen — so `npm run brand -- --check`
runs in CI and fails when what is on disk no longer matches the mark.

**The mark carries its own surface now, and needs nothing from what it sits
on.** The previous mark filled its house body with the surface it was drawn
over, so a card had to redeclare `--wh-brand-surface` for the mark inside it
to look right. The current mark's tile is opaque top to bottom — gradient,
house, heart — so it renders identically wherever it appears; `Card` no
longer redeclares anything for it.

**The wordmark is solid ink now, not a rainbow.** "WonderHome" is set once in
the brand's Neutral ink (`--wh-brand-letter-ink`, light and dark variants),
read from `WORDMARK_LETTERS` exactly as before — every letter is still tagged
with a tone, so the live `Wordmark` component and the share-card generator
needed no structural change, only a palette with one entry instead of four.

**The mark is not a watermark.** A full-colour logo faded to 40% over a
gradient reads as a printing mistake. Where a warm surface wants decoration,
that is `LeafDecor`'s job (rule 5), which is what the landing feature cards
use.

## The brand guidelines refresh

A full brand-guidelines sheet was supplied — logo, app icon, colour palette
(Primary Blue `#0EA5E9`, Accent Green `#22C55E`, Warm Yellow `#FBBF24`, Navy
`#0F172A`, Light Gray `#E5E7EB`), typography (Sora, for every type role) and
mockups — and is kept at `design/WonderHome-brand-guidelines.png` for the same
reason the logo source is: so a value here can be checked against it or
redone. Three deliberate scoping decisions, so the next session does not
re-litigate them:

- **The semantic tokens moved to the new palette, and so did the mark.**
  `--wh-primary` (Primary Blue), `--wh-attention` (Warm Yellow),
  `--wh-handled` (Accent Green) and `--wh-foreground` (Navy) in
  `ui-theme.css` derive from the supplied hues — converted to OKLCH and
  checked for contrast against white/cream rather than lifted as literal
  swatch lightness, which is a marketing lightness, not a button-fill or
  body-text one. The mark (`brand/mark.ts`) was redrawn to the sheet's logo
  when the sheet was confirmed as the direction: the earlier two-stroke
  roof-and-wave mark is gone, replaced by the two-tone house (blue left, warm
  yellow right, a four-pane window, a leaf over the bottom-right corner)
  described at the top of that module. The wordmark lockup follows the sheet
  too — "Wonder" in navy, "Home" in blue, the tagline small, upper-case and
  letter-spaced beneath.
- **The Light Gray swatch was not adopted for surfaces.** Rule 1 is explicit —
  warm cream, never grey — and the sheet's own mockups render on a warm cream
  background too. A brand board's neutral swatch is for print and UI chrome in
  general, not a licence to cool down the one thing this product is
  deliberately warm about.
- **Domain accents (`--wh-tone-*`) are unchanged.** They are WonderHome's own
  internal categorisation, not part of this brand identity, and the sheet
  does not speak to them.

Typography moved from Inter to Sora everywhere `--wh-font-sans` reaches,
wired the same way Inter was (self-hosted via `next/font`, one variable, no
external font request). The tagline changed too — `Happier Homes. Brighter
Tomorrows.` is `Less mental load. More family time.` now, since the sheet shows it
under the lockup and again in the footer mockup: `brand/mark.ts`'s
`TAGLINE`, the manifest, the root layout's description and both places
`UI-UX-REQUIREMENTS-v3.md` names it.

## A second brand sheet, and the palette and mark that came with it

A new brand-guidelines image replaced the one above as the base: Primary
`#6366F1` (indigo), Secondary `#10B981` (emerald), Accent `#F59E0B` (amber),
Warm `#F472B6` (pink), Neutral `#1F2937`, Light `#F8FAFC` — Tailwind's own
indigo/emerald/amber/pink/gray/slate-50 swatches, which is what let the soft
and hover shades below borrow known-contrast steps from those same scales
rather than being eyeballed. `--wh-primary` moved to indigo (base indigo-600
`#4F46E5` for guaranteed 4.5:1 against cream, the sheet's own indigo-500
`#6366F1` reserved for decoration — the mark's gradient and nothing else),
`--wh-attention` to amber-700, `--wh-handled` to emerald-700; `--wh-tone-ai`
(the assistant/HomeTalk violet) was already close to this palette's family
and was left alone. The mark (`brand/mark.ts`) was redrawn to the new app
icon: the house-and-leaf gradient shape is gone, replaced by the rounded
gradient tile, white house and heart-cutout described in "The brand mark"
above, and the wordmark's rainbow letters became one solid ink colour.

Two things this pass deliberately left alone: the tagline's exact wording and
punctuation (`Less mental load. More family time!` — the new sheet's casing
differs only trivially and the string is hand-typed in enough screens and
tests that a punctuation-only sweep was not worth the risk), and the warm
cream page/surface system (rule 1) — the sheet's "Light" swatch is a UI-chrome
reference the same way the first sheet's Light Gray was, not a licence to
cool the page down, and the same reasoning that kept the first sheet's neutral
off `--wh-background` applies here.

## The nav drawer (rules 4, 6, 10)

The phone's bottom bar has always had five destinations, and "More" was
always a real fifth one — a full page listing every household domain, Manage,
Settings, Notifications and Help. That page still exists and is still a real
route, but tapping "More" no longer means leaving the screen you were on to
reach it: it opens the same full menu as a drawer over whatever you were
already looking at, and picking anything in it closes the drawer and takes
you there. A new hamburger trigger at the top left of the mobile header does
the same thing, so a person is never more than one tap from the whole menu
regardless of which primary area they are in.

**Radix owns the drawer**, the same way it owns `Sheet` (rule 6) — `Dialog`
gives it focus trapping, escape, scroll locking and the accessible naming a
hand-rolled panel gets wrong. It differs from `Sheet` only in shape: a sheet
rises from the bottom (or centres on desktop) and always names itself in a
visible title; a drawer is anchored to the left edge, full height, and
carries a `sr-only` title instead, because the brand wordmark at its own top
already identifies it visually. `wh-slide-in-left` is a new keyframe for
exactly this — every other entrance in this kit either rises or fades, and a
left-anchored panel sliding up instead of in reads wrong — defined next to
`wh-rise` in `ui-theme.css` and included in the same `prefers-reduced-motion`
block.

**Collapsed by default, everywhere.** The state a viewer is in before any tap
is always closed — nothing calls `setOpen(true)` on mount. This only changes
the phone experience: the desktop sidebar already shows every primary area
and every domain at once, permanently, so there was never anything on desktop
for a hamburger to collapse, and the trigger is `lg:hidden` for exactly that
reason.

**One nav tree, filtered once.** The drawer's content is not a second copy of
the household's permissions logic — it renders the same `secondary` list
`AppShell` already receives (filtered server-side, per rule 9), grouped the
same way `/more` already groups it: primary areas, then Household, then
Manage. A `NavDrawerProvider` context is what lets the header's trigger and
the tab bar's "More" button open one shared drawer instance without prop-
drilling open state through every intermediate server component in the
shell.

## The handwritten line, and the greenery

Two things carry the mockups' warmth, and they are easy to lose in a refactor
because neither is information.

- **`ScriptAccent`** is Caveat, self-hosted through `next/font` like Sora so
  the CSP's `font-src 'self'` still holds. One line per screen, marked
  decorative, never a control, never the only place something is said. The
  sheets put it on the splash, under the sign up form, beside the landing hero
  and at the foot of most app screens (that last one is `QuoteCard`).
- **`LeafDecor`** is the botanical corner the sheets frame their warm surfaces
  with: one inline SVG, drawn from the household's own leaf tokens rather than
  photographed, faint enough that nothing readable ever competes with it.

Both are decoration in the strict sense — hidden from assistive technology,
and every screen reads correctly with them removed.

## The "talk to" experience

The AI Assistant is the screen the product is judged by, so it has the most
rules:

- **One engine, two channels.** Voice and text hit the same endpoint; the
  channel is metadata. The microphone uses the browser's own Web Speech API
  and, where it is missing or refused, says so instead of pretending to listen.
- **Understand → Decide → Act, in that order and visibly.** A consequential
  request becomes an `ActionPreview`: what I understood, what I plan to do, the
  impact, and Confirm / Change / Cancel. Consent is a request naming the
  action, recorded server-side — never a client-side claim.
- **"Yes" only means yes to the last proposal, and only for ten minutes.** A
  stale yes is answered with a question, not an action.
- **A shaky transcript of something consequential is read back**, never acted on.
- **"Done" is never said unless a governed tool actually did it.** Autonomy may
  allow execution, but with nothing wired to execute, the honest reply is
  "prepared". This is enforced in `converse()` and tested.
- **Understanding is deterministic today.** No language-model provider has
  credentials configured, so intents resolve from the fixture set. The seam is
  `understand`; a live provider slots in there and nothing downstream changes,
  because nothing downstream ever trusted the model with a decision.

## The landing page

Apple-style storytelling in WonderHome's own design (v3 §25–§45). It shares the
product's tokens, mark, buttons, cards and icons, and its product visuals are
the real components in device frames — never screenshots, never stretched.

It closes with a contact section and a real footer — three columns where
every link resolves, because a footer full of dead ends is the fastest way to
teach somebody the product is a mock-up. There is no video call to action:
the approved sheets show "Watch Video", there is no video, and an E2E test
keeps one from appearing.

What it deliberately does **not** do:

- Show prices. None are configured anywhere; the plan cards come from the live
  catalogue and show features, not amounts.
- Quote families. The story cards are labelled *Illustrative* on the card.
- Offer social sign-in it cannot honour. The rule stands — a "Continue with
  Google" button that goes nowhere is worse than none — but it is now
  enforced at runtime: the button renders only where
  `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` is set and Supabase has the provider.
- Claim certifications. The security section states what the code does.

Motion is one small client script (`reveal.tsx`): IntersectionObserver for
scroll reveal, one rAF-throttled listener for parallax, and nothing at all when
`prefers-reduced-motion` is set. No information depends on animation — the
Playwright suite checks that headings are readable before they scroll in.

## Performance rules

"Snappy" is a design property, and these are the rules that keep it:

1. **Compute next to the data.** Supabase is in `ap-south-1` (Mumbai); `vercel.json`
   pins the functions to `bom1`. A page makes tens of queries, and a query
   across the Pacific is 150–200 ms before it does anything.
2. **Verify the session locally.** Tokens are ES256, so `getVerifiedUser()`
   checks the signature against the JWKS (cached process-wide) instead of
   asking the auth server. The middleware, every page and every API route used
   to pay that network round trip — now nothing does. `getUser()` remains only
   as a fallback for a symmetric-key project and for the one screen that needs
   user metadata.
3. **Ask once per request.** `createClient`, `getVerifiedUser`,
   `listMemberships` and `loadSubscription` are wrapped in React's `cache`.
   The shell, the page and each streamed section share the answers; `may()`
   for six domains costs one subscription read, not six.
4. **Navigate, don't reload.** Every link is `next/link`: prefetched in the
   viewport, rendered client-side, with `app/loading.tsx` answering the tap on
   the next frame while the screen streams in.
5. **Shell first, data streams.** A screen renders its header and tabs from the
   session alone, and wraps its data in `<Suspense>` with a skeleton in the
   content's shape. Nothing that needs the database blocks the first paint.
6. **Cache what does not change per visitor.** The landing page's plan
   catalogue comes from `unstable_cache` with an hourly refresh.
7. **Ship only what renders.** `optimizePackageImports` keeps lucide and Radix
   to the handful of icons and primitives each route uses; motion is CSS, and
   the landing's script is one `IntersectionObserver` and one rAF listener.

## The mockup sheets and where they disagree

Six sheets are approved references. They differ in detail (one shows a
"Household" tab on Today, another a "Calendar" tab on Bills) and none is
complete alone. Where a mockup shows a control no story calls for, the story
wins; where a story needs a surface the mockups never drew, it is designed in
the same visual language.

## Spec gaps filled while building

Recorded so they are not mistaken for scope creep:

| Gap | What was built | Where |
|---|---|---|
| No story covers authentication UI | Email sign-up, sign-in, sign-out | `(auth)/actions.ts` |
| Household setup needs location and currency (v3 §8) but the schema has neither | Time zone only, which is the one setting that changes behaviour; the architecture stays locale-neutral | `/welcome` |
| Household setup is "step 2 of 4" in v3 but there is no profile step and inviting is optional | Sign up → household → done, shown as 3 steps | `AuthLayout` |
| Child Goals tab has no backing model | An honest "coming" state rather than a fake streak | `/?tab=goals` |
| MFA, data export and deletion (v3 §23) are not built | Listed as *Soon*, never as a working button | `/settings` |
| No story covers first-week onboarding for the Head of Family or an administrator | A household-setup card, prominent on Home for that person's first week (from their own first sign-in or promotion), one quiet row afterwards, gone at 100%; the full checklist on Manage Household. The percentage is weighted arithmetic over facts that exist, steps that do not apply (no children, no helper) are left out, and 100% is shown as an achievement | `household/setup.ts`, `ui/setup-progress.tsx` |
| No story covered what WonderHome should *sound* like, only that it speaks | A household picks the provider, language, accent, voice family, gender, named voice, rate, pitch, volume and listening device, and separately how it listens: language, languages it may switch to mid-sentence, recognition model, punctuation, profanity masking and expected words. Every one is a control Google actually honours, named in the household's words rather than the API's; the adapter drops what a given voice family rejects rather than sending a request it knows will 400. The household's own member names go as recognition hints with nobody configuring them, which is the single biggest thing that stops an assistant mishearing | `voice/settings.ts`, `voice/google.ts`, `/settings/voice` |
| Product-direction v4 §7 asks for a sustained, hands-free exchange that transcribes as it goes, but names no provider | Browser-native `SpeechRecognition`/`speechSynthesis` only — no credentialed voice vendor is invented. A live turn's speaker is shown as a small caption ("Priya" / "WonderHome") above the existing bubble rather than a separate transcript panel, so the warm chat surface stays the one place a conversation is read, live or not. Ending the session posts a deterministic recap (`summary.ts`) the same way `status.ts` composes an answer: arithmetic over what was recorded, never a second model call | `ui/use-live-voice.tsx`, `conversation/summary.ts`, `ai/assistant.tsx` |

## The shared UI kit

All of it lives in `@wonderhome/core/ui/*` and no screen invents its own:

| Part | What it is |
|---|---|
| `BrandMark`, `Wordmark` | The gradient house-and-heart mark, inline SVG, and the name beside it set once in the brand's ink (`WORDMARK_LETTERS` in `brand/mark.ts`) |
| `Avatar`, `AvatarGroup` | Initials on a name-stable tint; a role glyph, never colour alone. `cardTintFor` gives the same tint as a card background, for a row that wants colour behind the whole thing rather than only the circle |
| `IconTile` | The tinted glyph square every row begins with; tone by domain |
| `ActionRow` / `NavRow` | Name, one line of reason, one action or a chevron |
| `Pill` / `PillLink` / `Badge` | The small rounded action or state label |
| `MetricCard` / `MetricGrid` / `StatChips` | The counts under a greeting |
| `DomainCard` / `DomainGrid` | A household domain as a tile |
| `SegmentedControl` | Link-based tabs with `aria-current` |
| `Timeline` | The day as a vertical timeline |
| `CalendarItem`, `ResponsibilityCard`, `HandledList` | Domain rows |
| `HomeIllustration` | The original warm-house-and-tree illustration (rule 8). Moved here from `apps/web` once the nav drawer needed the same decoration the Home screen and the landing page already used, rather than a second one invented for it |
| `NotificationCard`, `CertificationItem`, `ActionPreview` | Threaded notification, a belief with provenance, an approval card |
| `ProgressRing` | A percentage that is arithmetic, with real text in the middle |
| `SearchBar` | Search that submits to the assistant, because search and ask are the same thing |
| `Sheet`, `ConfirmationSheet`, `ToastProvider` | Radix dialog and toast |
| `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton` | The three states |
| `ScriptAccent`, `LeafDecor` | The handwritten line and the botanical corner |
| `AiOrb`, `ChatMessage`, `SuggestionChips` | The conversation |
| `TalkComposer` | The one way into the assistant, with four states: type, speak-to-text, send, and a live voice conversation. Replaced `ChatComposer` + `VoiceInputButton` + a toggle, which between them could not say which of two voice intentions a tap meant. An optional `onAttach` prop adds a paperclip button beside the mic (Phase C, HomeSend) — a second input *modality* of the same one door, not a second door: rule 13 still says a screen never gets its own "Ask AI" shortcut, but a photo or a pasted forward is not a question, it is content, so it earns a control here rather than being typed out by hand |
| `HomeSendSheet` (`apps/web/app/_components`) | HomeSend v1's own sheet, opened by the composer's paperclip: choose upload-or-paste, review what WonderHome read (or fill it in by hand when no provider is configured), confirm into the real domain table. Mirrors `AddHomeworkButton`'s screenshot-import shape — extraction only ever fills a form, the form's own submit is what writes anything — generalised to three destinations (bill/school item/grocery item) instead of one. The confirm step itself (`HomeSendConfirmStep`/`HomeSendConfirmFields`) moved out to `home-send-intake.tsx` once a second caller needed it |
| `HomeSendInbox` (`apps/web/app/_components`, behind `/home-send`) | The rule-13 exception's own screen: a dashed drop zone (drag a file on desktop, tap "Choose a photo or file" everywhere — drag has no phone equivalent, so the tap path is never secondary), a paste toggle, then the same `HomeSendConfirmStep` the sheet uses. Below it, "Needs your review" (received/classified items not yet confirmed) and "Recently handled" (routed/dismissed) — an inbox the sheet never had room for |
| `Switch` | An on/off setting, not a choice among options (`SegmentedControl` is that) — first used for the live-conversation toggle below the composer's Send button |
| `Select` | A labelled choice among a fixed list. Deliberately the browser's own `select`, because on a phone that opens the OS picker — reachable and thumb-scrollable, which a hand-built dropdown has to re-earn and usually does not at 360px |
| `ComboboxField` | A choice among values a household has already typed — a grocery name, a category, a unit — that must never refuse a genuinely new one. A real `<select>` of the existing values (same OS-picker reasoning as `Select`) ending in "Add new…", which swaps in a plain text field for the value nobody has used yet. Replaces `Field` + `<datalist>` on the Groceries add/edit form (rule 12: a field with real answers offers them, never a fixed list that refuses the true one — and unlike a `<datalist>`, whose suggestion popover is unreliable on mobile Safari, the options are an actual dropdown a phone can open) |
| `Slider` | A value on a scale with the value always visible beside the label, in the unit a household reads ("1.15×", "-2 semitones"), and both ends of the scale named underneath. A bare range input says something changed but never what it changed *to*, which rule 15 does not allow |
| `ExpandableRow` | A row that opens in place instead of leaving the page: a downward chevron that turns to face up, revealing already-rendered content below it. Built to replace Home's family and househelp rows, which linked to `/family?member=…` — a query the Family screen does not read, so the chevron promised navigation it did not deliver (rule 10). First used to show a member's or a helper's own responsibilities inline; now also the Family and Househelper screens' own member rows, full-width and never a half-width card (`PersonCard` retired), showing everything the household knows about that person — name, relationship, nickname, occupation, sibling order — and an edit control for Admins (rule 12); Home & Upkeep's own assessment rows, revealing status, risk and due date rather than squeezing them into the summary line; `CertificationItem`'s beliefs, whose Confirm/Correct/Remove controls (rule 12) and full source/category/risk/last-checked detail now live behind the same chevron instead of always-open under the claim; and Groceries' suggestion rows on both Overview ("Smart insights", via `AgendaExpandableRow`) and List (reason/evidence/needed-by/estimated-cost behind the chevron rather than crammed into one line) |
| `AgendaExpandableRow` (`apps/web/app/_components/agenda-expandable-row.tsx`) | The generic `HomeAssessment`-as-chevron-row `ExpandableRow` wraps — status, risk and due date behind the arrow. Domain-neutral by construction (it only reads the shared assessment shape), so it moved out of a Home-specific filename (was `HomeAgendaRow`) the first time a second domain (Groceries' "Smart insights") needed the identical row rather than inventing its own |
| `AppShell`, `MobileHeader`, `PrimaryNav`, `NavDrawer` | The shell. The phone tab bar's icons are pictorial rather than flat outlines (a two-tone calendar-and-check for Today, two people and a heart for Family), and the active one sits in its own soft pill rather than only changing colour. `NavDrawer`'s domain rows carry the same tinted `IconTile` the desktop sidebar's now do (`SidebarLink`'s new `tone` prop), and it signs out through the shared `identity/session-actions.ts` action — a real form post, not a link, since a link cannot be trusted to only run when a person actually meant it |

### Tailwind has to be told about the shared package

Tailwind's automatic source detection never looks inside `node_modules`, and
the workspace links `@wonderhome/core` there. Without the explicit
`@source "../../../packages/core/src"` in `apps/web/app/globals.css`, a class
used **only** by a shared component is never generated.
