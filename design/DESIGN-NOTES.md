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
| Type | Inter via `next/font` (self-hosted; CSP allows `font-src 'self'` only), deep navy, fluid hero/display/title sizes (`--wh-text-*`) |
| Primary | Teal for every committing action and the active nav state |
| States | Green handled · amber attention · red only for the genuinely critical · blue informational |
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

## The handwritten line, and the greenery

Two things carry the mockups' warmth, and they are easy to lose in a refactor
because neither is information.

- **`ScriptAccent`** is Caveat, self-hosted through `next/font` like Inter so
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

## The shared UI kit

All of it lives in `@wonderhome/core/ui/*` and no screen invents its own:

| Part | What it is |
|---|---|
| `BrandMark`, `Wordmark` | The house-with-a-heart mark, inline SVG |
| `Avatar`, `AvatarGroup` | Initials on a name-stable tint; a role glyph, never colour alone |
| `IconTile` | The tinted glyph square every row begins with; tone by domain |
| `ActionRow` / `NavRow` | Name, one line of reason, one action or a chevron |
| `Pill` / `PillLink` / `Badge` | The small rounded action or state label |
| `MetricCard` / `MetricGrid` / `StatChips` | The counts under a greeting |
| `DomainCard` / `DomainGrid` | A household domain as a tile |
| `SegmentedControl` | Link-based tabs with `aria-current` |
| `Timeline` | The day as a vertical timeline |
| `CalendarItem`, `PersonCard`, `ResponsibilityCard`, `HandledList` | Domain rows |
| `NotificationCard`, `CertificationItem`, `ActionPreview` | Threaded notification, a belief with provenance, an approval card |
| `ProgressRing` | A percentage that is arithmetic, with real text in the middle |
| `SearchBar` | Search that submits to the assistant, because search and ask are the same thing |
| `Sheet`, `ConfirmationSheet`, `ToastProvider` | Radix dialog and toast |
| `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton` | The three states |
| `ScriptAccent`, `LeafDecor` | The handwritten line and the botanical corner |
| `AiOrb`, `ChatMessage`, `SuggestionChips`, `ChatComposer`, `VoiceInputButton`, `Waveform` | The conversation |
| `AppShell`, `MobileHeader`, `PrimaryNav` | The shell |

### Tailwind has to be told about the shared package

Tailwind's automatic source detection never looks inside `node_modules`, and
the workspace links `@wonderhome/core` there. Without the explicit
`@source "../../../packages/core/src"` in `apps/web/app/globals.css`, a class
used **only** by a shared component is never generated.
