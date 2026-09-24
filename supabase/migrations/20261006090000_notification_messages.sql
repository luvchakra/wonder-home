-- Story 22-006: a reminder is an event and its parameters.
--
-- `title`/`body` stay the English record. `message` carries the same words as
-- a catalog key and typed values ({ v, title, body }), so each recipient
-- reads the reminder in their own language and formats. Written only by the
-- server, like every other content column, and a recipient can no more
-- rewrite it than the title.

alter table public.notifications
  add column if not exists message jsonb
    check (message is null or (jsonb_typeof(message) = 'object' and message ? 'v' and message ? 'title' and message ? 'body'));

comment on column public.notifications.message is
  'The reminder as a catalog key plus typed parameters (story 22-006); title/body are its English rendering.';

-- A recipient changes state, never content — the message included.
create or replace function wh.guard_notification_recipient_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.household_id is distinct from old.household_id
    or new.recipient_member_id is distinct from old.recipient_member_id
    or new.type is distinct from old.type
    or new.priority is distinct from old.priority
    or new.thread_key is distinct from old.thread_key
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.message is distinct from old.message
    or new.action is distinct from old.action
    or new.outcome_id is distinct from old.outcome_id
    or new.decision_factors is distinct from old.decision_factors
    or new.category is distinct from old.category
    or new.source_type is distinct from old.source_type
    or new.source_id is distinct from old.source_id
    or new.earliest_at is distinct from old.earliest_at
    or new.latest_at is distinct from old.latest_at
    or new.expires_at is distinct from old.expires_at
    or new.reminder_policy is distinct from old.reminder_policy
    or new.reminder_seq is distinct from old.reminder_seq
    or new.created_at is distinct from old.created_at
    or new.delivered_at is distinct from old.delivered_at
  then
    raise exception 'A reminder''s content belongs to WonderHome; you can act on it, dismiss it or snooze it.'
      using errcode = 'insufficient_privilege';
  end if;

  -- A snooze: back to waiting, later than now, no further than a month out,
  -- counted once.
  if new.scheduled_for is distinct from old.scheduled_for or new.snooze_count is distinct from old.snooze_count then
    if new.status <> 'generated'
      or new.scheduled_for <= now()
      or new.scheduled_for > now() + interval '31 days'
      or new.snooze_count <> old.snooze_count + 1
      or old.status not in ('generated', 'delivered', 'seen')
    then
      raise exception 'A reminder can only be snoozed forward, up to a month.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status and new.status not in ('seen', 'acted', 'resolved', 'dismissed') then
    raise exception 'That is not a change a person makes to a reminder.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
