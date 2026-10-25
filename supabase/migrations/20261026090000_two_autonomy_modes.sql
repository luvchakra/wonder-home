-- Two autonomy modes (the owner, 2026-10-26).
--
-- Of the four modes, "approve" and "prepare" were enforced identically (the
-- change is made ready and waits for a person's yes), and "observe" differed
-- only in refusing to prepare anything at all. The owner chose two:
--
--   prepare  WonderHome prepares the change and waits for your OK.
--   execute  WonderHome does it, and tells you afterwards.
--
-- "observe" and "approve" become "prepare": nothing that waited for a person
-- before acts without one now. "prepare" is also the new default and the
-- fallback for an outcome nobody configured, so an unconfigured outcome is
-- still never acted on automatically. Paying, permission changes and deletes
-- still always need a person, whatever the mode (household/autonomy.ts).

update public.responsibilities
set ai_mode = 'prepare'
where ai_mode in ('observe', 'approve');

alter table public.responsibilities
  alter column ai_mode set default 'prepare';

alter table public.responsibilities
  drop constraint responsibilities_ai_mode_check;

alter table public.responsibilities
  add constraint responsibilities_ai_mode_check check (ai_mode in ('prepare', 'execute'));

create or replace function wh.autonomy_for(p_household_id uuid, p_outcome_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.ai_mode from public.responsibilities r
     where r.household_id = p_household_id and r.outcome_key = p_outcome_key),
    'prepare'
  );
$$;

comment on function wh.autonomy_for(uuid, text) is
  'The configured autonomy for an outcome, defaulting to prepare. An unconfigured outcome is never acted on automatically: prepare waits for a person.';

comment on function public.autonomy_for(uuid, text) is
  'Server-only wrapper for wh.autonomy_for (the configured autonomy for an outcome, defaulting to prepare). Callable by service_role only.';
