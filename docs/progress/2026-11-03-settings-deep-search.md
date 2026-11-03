# Settings search goes deep (2026-11-03)

Owner request: typing any word for any individual setting, however deep, finds it and lands on it. Builds on #467 (cards only).

## What was done
- **One typed registry** — `packages/core/src/settings-search/registry.ts`: id, parent (breadcrumb), label key (the screen's own key, so already in 8 languages), optional description key, `href` with `#anchor`, audience. About 90 entries covering Manage Household (address, members, responsibilities, playbook, policies, AI autonomy, Teach, notifications, activity), AI (confirm, auto-add bar, direct-add money/health, provider, key, voice key, data use), Voice (every field), Connections (WhatsApp, voice assistants, school, shopping, calendar, email, weather, smart home, payments, developer access, connectors), Plan, Profile, Language & region (language, region, currency, date/time, units, member languages), Notifications (centre, quiet hours, digest, routing, push, channels, delivery), Privacy (retention, export, deletion), Location.
- **Matcher** — `settings-search/match.ts`: case/accent-insensitive (Latin accents only), word-start and prefix, one typo for words of 4+ letters, synonyms, English fallback in any language; rank label > label prefix > keyword > description > typo. `highlight()` marks the typed text.
- **Index** — `GET /settings/search-index` (`private, no-store`) returns the viewer's compact index (labels, breadcrumbs, synonyms; no household data), filtered server-side by role: Admin, `integrations.manage`, developer access (needs the deployment flag), adults, non-children. Fetched on first focus of the box, so no page's JS carries it.
- **UI** — results show a breadcrumb (`Assistant & voice › AI Assistant › …`), highlighted matches, and an "Ask HomeTalk" link (`/ai?q=`) when nothing matches (rule 13).
- **Landing** — `OpenOnHash` now also centres the target, focuses its control and flashes it (`[data-hash-flash]` in `ui-theme.css`), and is on every settings page. New anchors added to the sections and fields that lacked one.
- **Words** — `i18n/messages/areas/settings-search/*.ts`: synonyms for every entry in all eight languages (keywords are language-specific; English is always searched as well).

## Verified
- `npx tsc -p apps/web`, `npm run lint -w apps/web` (0 errors), `lint:boundaries`.
- Unit tests: matcher (prefix, typo, synonym, ranking, locale), registry completeness (every anchor exists in a screen; every settings page and fold anchor is registered), role filtering, every language has labels and synonyms, and real-index lookups: speed → Voice speed, rupee → Currency, mute → Quiet hours, invite → Members & roles, delete account → Privacy deletion, api key → API key.
- `cache-headers.test.ts`, `client-writes.test.ts` still pass with the new route.

## Not done / open
- This container has no Supabase env, so I could not sign in and drive the 360 px browser check; the owner's phone check is the first real one.
- Not in the product, so not indexed: a webhooks setting, a routines screen, an invitation form under Settings (invitations live at `/family`; indexed as "Members & roles"), and an email-pause switch.
- Voice fields appear only when the Google speech service is picked; if one is hidden the link still opens the page and flashes nothing.
- Profile edit-sheet fields (name, birthday, phone…) are one entry ("You"): the sheet is closed on load.
- Several fields still share ids across forms (e.g. `name` on /settings); they are not used as anchors.

## Where
`packages/core/src/settings-search/`, `apps/web/app/settings/search-index/route.ts`, `apps/web/app/settings/_components/settings-search.tsx`, `apps/web/app/settings/_lib/settings-registry.test.ts`.
New setting? Add one `e(...)` line to the registry, a `settingsSearch.kw.<id>` line in each language, and an `id` on the control.
