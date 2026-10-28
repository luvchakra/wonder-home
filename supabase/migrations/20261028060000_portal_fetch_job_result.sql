-- Story 08-033 — observability for a fetch that signs in but files nothing.
--
-- A job completes `done` when the sign-in worked, regardless of how the page
-- reads went. When "Fetch done" shows but nothing reaches HomeSend, we need to
-- know what the worker actually read without the Fly logs and without touching
-- the parent's sign-in. `result` holds per-page metadata only — the final URL,
-- how many characters of text were read, how many items were extracted and newly
-- filed, and any error — never the page content itself.
alter table public.portal_fetch_jobs
  add column if not exists result jsonb;

comment on column public.portal_fetch_jobs.result is
  'Per-run outcome metadata for diagnostics: {filed, pages:[{url, finalUrl, chars, items, fresh, error}]}. Never portal content.';
