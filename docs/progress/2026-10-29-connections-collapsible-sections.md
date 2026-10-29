# Connections page: each section is its own collapsible card

**What** — On Settings → Connections (`apps/web/app/settings/connections/`),
every major section is now a collapsible card with a chevron, the same fold the
playbook area cards and the "What comes to you" notifications card use (the
owner, 2026-10-29). The page had grown into a long stack — a connections list,
"What a voice assistant can do", and tall per-assistant cards (Gemini Voice,
Alexa) with long CAN DO lists — that scrolled a lot. Now it opens as a short,
scannable index of headers; each opens on demand.

**Why this shape** — Reuses the existing native `<details>`/`<summary>` fold
(no new mechanism, no client component, no JS accordion), extracted into one
shared presentational component so every section folds identically:

- `packages/core/src/components/ui/collapsible-section.tsx` — a card whose
  `<summary>` is the header (tinted `IconTile` + title + one intro line) with a
  `ChevronDown` that rotates `group-open:rotate-180`. `<summary>` is a real
  button with an implicit `aria-expanded`, keyboard-operable, a 48px target
  (≥44px). The title wraps, never truncates (principle 11); `min-w-0`/`flex-1`
  and `shrink-0` on the chevron keep it from overflowing at 360px.

Applied to the sections (all collapsed by default, to keep the page short —
principle 17, group by what the reader is deciding):

- `whatsapp-section.tsx`, `voice-section.tsx`, `school-section.tsx`,
  `accounts-section.tsx`, and the Shopping block in `page.tsx`.
- Inside Voice, each per-assistant card (Gemini Voice, Alexa) is itself a fold,
  so the long CAN DO lists open one at a time rather than as two walls.
- The admin Integrations block (`integrations-section.tsx`): its sub-sections
  (needs-attention, providers, devices, weather, developer) are now collapsible
  cards too; "needs attention" opens by default. The closing footer note and
  the page's `QuoteCard` stay as plain closing content.
- WhatsApp opens by default only on the `?connected=1` connect callback, so the
  success notice is in view.

**Unchanged** — No content, wording, capability lists, behaviour, or anchors
(`#whatsapp`, `#voice`, `#school`, `#accounts`, `#providers`, …) changed; each
`id` moved onto its `<details>` so in-page links still scroll to it. No i18n
strings added or changed: the visible title is the disclosure's accessible
name, so no chevron `aria-label` was needed.

**Verified**
- `npm run typecheck -w apps/web` and `-w packages/core`: clean.
- ESLint on the changed web files: clean (the core component is outside the web
  ESLint base path, as other `@wonderhome/core` UI components are).
- `npm run build -w apps/web`: succeeds.
- Signed-in E2E against the live project (pre-launch, `E2E_ALLOW_LIVE_PROJECT`):
  a throwaway spec provisioned a household like `e2e/screens.spec.ts`, signed
  in, opened `/settings/connections`, and asserted the Voice section is
  collapsed by default, expands on click, and a per-assistant card then expands
  its CAN DO list. Screenshots at 360px (collapsed + expanded) and desktop
  confirmed no horizontal overflow and the nested per-assistant folds. The spec
  and its QA household/user were deleted afterwards; `e2e-cleanup` confirmed no
  stray accounts remain.

**Where the code lives** — the shared component is
`packages/core/src/components/ui/collapsible-section.tsx`; the page and its
sections are under `apps/web/app/settings/connections/`.

**Open** — none. If a future section needs to stay open by default (e.g. a
primary action a household uses often), pass `defaultOpen` to its
`CollapsibleSection`.
