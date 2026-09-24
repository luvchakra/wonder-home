-- Deep Document Understanding 2.0 (story 14-018, spec §22–27, §44): the
-- exact plan a person applied, the exact receipt it left, and a field-level
-- history on every change a document made.
--
-- `home_send_items.plan` is the change plan as it was applied — rebuilt on
-- the server from the stored reading, never taken from the browser — and
-- `receipt` is what actually happened to each of its records: created,
-- updated, cancelled, unchanged, skipped, needs clarification or failed.
-- Together they let HomeSend and HomeTalk say exactly what a document
-- changed from what was done, never from what the model read.
--
-- `homesend_changes` keeps one row per write as before (undo reverses it
-- through the domain's own service); each row now also says which record of
-- the document it was (`plan_key`), which fields it changed from what to
-- what (`fields`), and where in the document that came from (`evidence`).
-- Both tables keep their existing household-scoped RLS: nothing here is
-- readable outside the household it belongs to.

alter table public.home_send_items
  add column plan jsonb,
  add column receipt jsonb;

comment on column public.home_send_items.plan is
  'The document change plan as it was applied (DDU 2.0 §22): every record with its outcome, fields and source evidence.';
comment on column public.home_send_items.receipt is
  'What applying the plan actually did, record by record (DDU 2.0 §24, §44): created, updated, cancelled, unchanged, skipped, needs_clarification or failed.';

alter table public.homesend_changes
  add column plan_key text check (plan_key ~ '^r[0-9]{1,3}$'),
  add column fields jsonb,
  add column evidence jsonb;

comment on column public.homesend_changes.plan_key is
  'Which record of the document this change was ("r1"…), when it came from a document plan.';
comment on column public.homesend_changes.fields is
  'Field-level change history (DDU 2.0 §25): [{field, label, before, after}] as the household was shown it.';
comment on column public.homesend_changes.evidence is
  'Where in the document the change came from (DDU 2.0 §11): {page, section, quote}.';

notify pgrst, 'reload schema';
