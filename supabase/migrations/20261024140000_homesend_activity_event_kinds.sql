-- HomeSend reads two more kinds of thing (the owner, 2026-10-24: a karate
-- exam is a class outside school, not school work): something a class
-- outside school has on a day, and a family event or invitation. Each is
-- written through its own domain's service, and each change can be undone.
alter table public.home_send_items drop constraint if exists home_send_items_classified_kind_check;
alter table public.home_send_items
  add constraint home_send_items_classified_kind_check
  check (classified_kind in ('bill', 'school_item', 'activity_item', 'event', 'grocery_item', 'health_document', 'receipt', 'unknown'));

-- activity_item: the class's exam, competition or event (child_activity_notes);
-- activity: a class added in the same step because the child had none by that
-- name (child_activities); event: a family event (family_events).
alter table public.homesend_changes drop constraint if exists homesend_changes_domain_check;
alter table public.homesend_changes
  add constraint homesend_changes_domain_check
  check (domain in ('bill', 'school_item', 'activity_item', 'activity', 'event', 'grocery_item', 'health_document', 'purchase'));
