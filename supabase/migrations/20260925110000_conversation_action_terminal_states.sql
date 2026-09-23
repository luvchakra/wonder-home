-- A rejected action never executes (test spec AG-005).
--
-- Every path in the application already moves a HomeTalk proposal out of
-- 'proposed' only once, with a conditional update, and carries out only
-- what it just approved. This makes the same rule the database's own:
-- a proposal a person turned down ('rejected'), or one that timed out or
-- changed before it was approved ('expired'), is finished. No later write —
-- a retried request, a stale approval, a bug, a service-role script — can
-- turn it into 'approved', 'executed' or anything else. The record of the
-- decision stays exactly as it was made.

create or replace function wh.keep_closed_conversation_action_closed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.approval_status in ('rejected', 'expired') and new.approval_status is distinct from old.approval_status then
    raise exception 'conversation action % is % and cannot become %', old.id, old.approval_status, new.approval_status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger conversation_actions_closed_stay_closed
  before update of approval_status on public.conversation_actions
  for each row execute function wh.keep_closed_conversation_action_closed();
