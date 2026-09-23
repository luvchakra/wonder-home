-- HomeSend 2.0 (story 14-011, Wave 3 §12, §19): what a person decided when
-- they reviewed an item, kept on the item itself.
--
-- §19 asks HomeSend to optimize for correct household outcomes, not parse
-- counts — which needs to know, per item, what was decided (added, updated,
-- cancelled, kept the existing one, dismissed, or applied on its own under
-- the household's own autonomy setting, §12), whether the person had to
-- correct what was read, what reconciliation offered, and whether "who is
-- this for" had to be asked. Every one of these is a closed word or a
-- boolean: nothing here repeats what the household sent, so the metrics
-- read from them can be counted platform-wide without reading content.

alter table public.home_send_items
  add column review_decision text
    check (review_decision in ('added', 'updated', 'cancelled', 'kept_existing', 'dismissed', 'auto_added')),
  add column review_proposal text
    check (review_proposal in ('duplicate', 'update', 'cancellation', 'conflict')),
  add column review_subject text
    check (review_subject in ('resolved', 'asked', 'not_needed')),
  add column review_corrected boolean,
  add column reviewed_at timestamptz;

alter table public.home_send_items add constraint home_send_items_review_complete
  check ((review_decision is null) = (reviewed_at is null));

comment on column public.home_send_items.review_decision is
  'What the person decided at review (Wave 3 §13), or auto_added when the household''s own autonomy setting let it apply without asking (§12).';
comment on column public.home_send_items.review_proposal is
  'What reconciliation offered at review (§10): a duplicate, an update, a cancellation or a conflict with a record on file; null when it was new.';
comment on column public.home_send_items.review_subject is
  'Whether who it was for was resolved from the content, had to be asked, or did not apply (§9).';
comment on column public.home_send_items.review_corrected is
  'Whether the person changed anything WonderHome read before confirming it.';

create index home_send_items_reviewed_at on public.home_send_items (reviewed_at) where reviewed_at is not null;

notify pgrst, 'reload schema';
