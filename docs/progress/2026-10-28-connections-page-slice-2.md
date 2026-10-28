# 2026-10-28 — Connections framework: the Connections page (slice 2)

Builds the user-facing Connections page on the foundation from slice 1. A
household creates named connections by picking a connector type and filling in
its parameters; a created connection is listed, editable and removable.

Owner decisions (2026-10-28): **any adult** (not only admins) creates/edits a
connection — every member still sees and picks them; the page lives under
**Manage → Connections** (`/household/connections`).

## What was built

- **Adult write** — migration `20261028130000_connections_adult_write`: a
  `wh.adult_households()` set-form helper, and the `connections` /
  `connection_secrets` write policies swapped from admin to adult. Children are
  excluded; every member still reads connections.
- **Server actions** — `apps/web/app/(auth)/connection-actions.ts`:
  create/update/delete. The form carries the chosen type's declared parameters
  (`param.<key>`); the action collects them by the registry's schema and the
  repository splits secret from non-secret. A blank secret on edit keeps the
  stored one.
- **Page + manager** — `apps/web/app/household/connections/page.tsx` and
  `_components/connections-manager.tsx`: "New connection" → pick a connector type
  → its params form (or, for a `link`-flow type like WhatsApp, a note + a link to
  its own page); the list shows each connection's name, type, status and
  url, with inline edit and remove. "New connection" shows only to adults.
- **Nav** — a Connections card in Manage → Records, with a live count.
- **i18n** — `manage.connections.*` + `manage.section.connections*` in all eight
  languages (parity test green). Connector-type and parameter labels come from
  the registry (English) for now.

## Verified
- core + web typecheck; i18n parity 7/7; ESLint on changed web files; registry
  unit test 4/4; web build green.
- `test-connections-rls.mjs` updated for adult-write (adult writes, child can't,
  members incl. child read, outsider nothing, secret unreadable / service-role
  reads, delete cascades).

## Open
- Migration `20261028130000` is **not yet applied live** — the Supabase approval
  prompt timed out while the owner was away. Apply it (and `20261028120000` from
  slice 1 is already live) before relying on adult-write in production. CI's
  `test:db` validates it against a fresh database.
- Connector-type / parameter labels are English (from the registry); i18n for
  those is a possible follow-up.

## Next slices
3. Connection picker + School refactor (repoint the portal engine from
   `integration_id` → `connection_id`; School selects a `portal-fetch` connection).
4. WhatsApp wired in as a connector (its link flow from the page).

## Where the code lives
`supabase/migrations/20261028130000_connections_adult_write.sql`,
`apps/web/app/(auth)/connection-actions.ts`,
`apps/web/app/household/connections/page.tsx`,
`apps/web/app/_components/connections-manager.tsx`,
`apps/web/app/_lib/connections-labels.ts`,
`apps/web/app/household/page.tsx`,
`packages/core/src/i18n/messages/areas/household/*.ts`.
