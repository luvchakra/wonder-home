-- HomeSend 2.0 (story 14-011, Wave 3 §10, §11): a routed item can now do
-- more than create a row.
--
-- §10 — reconciliation: "Science Exhibition moved to 29 September" updates
-- the Science Exhibition already on record, and "Sports Day is cancelled"
-- cancels it, instead of creating a second one. Undo has to put the record
-- back exactly as it was, so the change keeps what it replaced.
--
-- §11 — multi-domain impact: one school notice can ask for a white T-shirt
-- AND sports shoes. Each is its own grocery row, separately confirmed and
-- separately undoable, so "one change per domain per intake" becomes "one
-- change per record per intake".

alter table public.homesend_changes
  add column change_type text not null default 'created'
    check (change_type in ('created', 'updated', 'cancelled')),
  add column previous jsonb;

comment on column public.homesend_changes.change_type is
  'What routing did to the domain record: created it, updated an existing one, or cancelled an existing one. Undo reverses exactly that, through the same domain service.';
comment on column public.homesend_changes.previous is
  'For an update or a cancellation, the fields as they were before — what undo restores. Never set for a created row.';

alter table public.homesend_changes add constraint homesend_changes_previous_matches_type
  check ((change_type = 'created') = (previous is null));

alter table public.homesend_changes drop constraint homesend_changes_one_per_intake_domain;
alter table public.homesend_changes add constraint homesend_changes_one_per_intake_record
  unique (intake_id, domain, entity_id);

comment on constraint homesend_changes_one_per_intake_record on public.homesend_changes is
  'One change per record per intake -- a school notice can add two different grocery needs, never the same record twice.';

notify pgrst, 'reload schema';
