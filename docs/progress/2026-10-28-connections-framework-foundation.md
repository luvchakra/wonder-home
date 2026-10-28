# 2026-10-28 — Connections framework: foundation (slice 1)

Owner (2026-10-28): generalise the school-specific portal connection into a
reusable **Connections** framework. A household creates named connections on a
dedicated page, each of a **connector type** the product defines; a created
connection is then selectable in feature pages (School, Grocery, …) by
capability, rather than each page creating its own connection.

This note covers **slice 1 — the data model + connector registry + repository**.
The UI (Connections page, connection picker) and the School refactor are later
slices.

## What was built

**Data model** — `supabase/migrations/20261028120000_connections.sql` (applied live):
- `connections` — `{household_id, name, connector_type, status, params, created_by}`.
  Non-secret params (url, username) live here; member-readable, admin-writable
  (the set-form RLS helpers). No one-per-type limit — a household may have many.
- `connection_secrets` — `{connection_id, household_id, secret jsonb}`. The same
  bargain as `school_portal_credentials`: no select grant on `secret`, so nothing
  reachable from a browser can read it; the server reads it with the service role.
  Advisors clean; the deny-all is a revoke + a key-column grant, not `revoke all`.

**Connector registry** — `packages/core/src/connectors/registry.ts`: the product's
catalog. Each `ConnectorType` declares its label, how it's created (`params` form
or a `link` flow like WhatsApp), its parameters (with which are `secret`), and its
**capabilities**. Adding a connector later = one entry here.
- `browser-automation` — params url/username/password(secret), capability `portal-fetch`.
- `whatsapp` — a `link` flow, capability `homesend-intake`.

**Repository** — `packages/core/src/connections/repository.ts`: list/get/create/
update/delete, `setConnectionStatus`, and `readConnectionSecrets` (service-role
only). `createConnection`/`updateConnection` split a supplied params object into
the non-secret row and the secret store by what the connector type marks secret;
a blank secret keeps the stored one.

## Verified
- core typecheck clean; registry unit test 4/4.
- `lint:migrations` (183), `lint:boundaries`, `lint:knowledge` (connections +
  connection_secrets registered as excluded, with reasons), `lint:secrets` — all clean.
- Migration applied live (`kqxndableyysxqhxiorz`); security advisors show no new
  findings for the two tables.
- `scripts/test-connections-rls.mjs` added (admin-writes / non-admin-can't /
  members-see / outsider-sees-nothing / secret-unreadable-but-service-role-reads /
  delete-cascades-secret); runs in CI's `test:db` on migration change.

## Next slices
1. **Connections page** — list, create (pick a connector type → its params form,
   or the link flow), edit, delete; i18n in all 8 languages.
2. **Connection picker** component + **School refactor** — the School page selects
   a `portal-fetch` connection instead of creating its own sign-in; "Pages to read"
   and fetch run against the chosen connection. Repoint the portal engine
   (`portal_scrape_urls`/`portal_sessions`/`portal_fetch_jobs`/credentials) from
   `integration_id` to `connection_id`.
3. **WhatsApp as a connector** in the page (wrap the existing linking flow).

## Where the code lives
`supabase/migrations/20261028120000_connections.sql`,
`packages/core/src/connectors/registry.ts`, `packages/core/src/connections/repository.ts`,
`packages/core/src/knowledge/registry.ts`, `scripts/test-connections-rls.mjs`.
