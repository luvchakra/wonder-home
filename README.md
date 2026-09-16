# WonderHome

Next.js (App Router) application backed by a single, pinned Supabase project.

## The one-database rule

WonderHome connects to **exactly one** Supabase project:

| | |
|---|---|
| Project ref | `stehegovxlssxdepiruk` |
| API URL | `https://stehegovxlssxdepiruk.supabase.co` |
| Postgres host | `db.stehegovxlssxdepiruk.supabase.co` |

No other database may be connected. This is not just a convention — it is
enforced in three places, so a misconfiguration fails loudly instead of
silently reading or writing the wrong data:

1. **`src/lib/supabase/project.ts`** is the single source of truth. Every
   Supabase client resolves its URL and keys through it, and it throws a
   `WrongSupabaseProjectError` if either points at a different project.
   Legacy JWT-style keys carry their project ref in the payload, so a key
   pasted in from another project is rejected too.
2. **`scripts/check-supabase-env.mjs`** runs before `npm run dev` and
   `npm run build`. It validates the API URL, the keys, every common Postgres
   connection-string variable (`DATABASE_URL`, `POSTGRES_URL`, …, including
   the pooler's `postgres.<ref>` username form), and sweeps the rest of the
   environment for any variable mentioning a different Supabase project. A
   foreign database fails the build with a non-zero exit code.
3. **`supabase/config.toml`** pins `project_id`, so the Supabase CLI links and
   pushes migrations to this project only.

If you ever need to run a task that touches no database at all (a lint-only CI
job, say), set `SKIP_ENV_VALIDATION=1`.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev
```

`.env.local` is gitignored. Keys come from the Supabase dashboard under
**Project Settings → API Keys**.

| Variable | Exposed to browser | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | all clients |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | browser + server clients |
| `SUPABASE_SECRET_KEY` | **no** | `src/lib/supabase/admin.ts` |
| `SUPABASE_DB_URL` | **no** | migration tooling only |

## Choosing a client

| Module | Key | Row Level Security | Use in |
|---|---|---|---|
| `src/lib/supabase/client.ts` | publishable | enforced | Client Components |
| `src/lib/supabase/server.ts` | publishable | enforced | Server Components, Route Handlers, Server Actions |
| `src/lib/supabase/admin.ts` | secret | **bypassed** | trusted server-side work only |

`server.ts` and `admin.ts` import `server-only`, so importing either from a
Client Component is a build error rather than a leaked secret.

`src/proxy.ts` refreshes the auth session on every request (Next.js 16 renamed
the `middleware` convention to `proxy`). Server Components cannot write
cookies, so removing it would log users out at random.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Preflight the environment, then start the dev server |
| `npm run build` | Preflight the environment, then build |
| `npm run check:env` | Preflight only — verifies the one-database rule |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests for the project guard |
| `npm run db:link` | Link the Supabase CLI to the pinned project |
| `npm run db:new <name>` | Create a migration in `supabase/migrations/` |
| `npm run db:push` | Apply pending migrations to the project |
| `npm run db:types` | Regenerate `src/lib/supabase/types.ts` from the schema |

Run `npm run db:types` after every migration — `types.ts` currently holds an
empty-schema placeholder, because no tables have been defined yet.

## Supabase MCP server

`.mcp.json` configures a project-scoped, **read-only** Supabase MCP server
pinned to the same project ref as the app. It is checked in, so the token is
not: `${SUPABASE_ACCESS_TOKEN}` is expanded from the environment your editor
was launched in.

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...   # from Supabase -> Account -> Access Tokens
```

Put that in your shell profile. It is deliberately *not* read from
`.env.local` — that file is loaded by Next.js at runtime, whereas `.mcp.json`
is expanded by the editor before the app ever starts.

Two things worth knowing about the token:

- It is **account-scoped, not project-scoped**. `--project-ref` constrains what
  the MCP server will do, not what the token can do. Never commit a literal one.
- Restart your editor after changing `.mcp.json`; a project-scoped server is
  read at startup and needs an explicit approval before it will run.

## Health check

`GET /api/health/supabase` performs a real round trip to the project's Auth
health endpoint and returns 200 when reachable, 503 otherwise. The home page
renders the same check. Neither ever echoes a key.

## Database schema

No migrations exist yet. `supabase/migrations/` is set up and wired to the
pinned project, ready for the first one.

When you add tables, enable Row Level Security on every one of them. Both the
browser and server clients use the publishable key, so RLS policies are what
actually separate one user's data from another's.
