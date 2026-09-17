-- Conversation, actions and household memory (stories 04-001 through 04-008).
--
-- Applied to the wonder-home Supabase project as version 20260917021114.
--
-- One engine serves text and voice, so there is one set of tables and the
-- channel is a column rather than a second schema.
--
-- The privacy property here is the important one: a conversation is private by
-- default. A member talking to WonderHome is not addressing the household, and
-- the policies below never let one person's session appear in another's context
-- unless it was explicitly shared.

create table public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  channel text not null check (channel in ('text', 'voice')),
  status text not null default 'open' check (status in ('open', 'closed')),
  visibility text not null default 'private' check (visibility in ('private', 'household')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.conversation_sessions is
  'One conversation. Private by default: a member talking to WonderHome is not addressing the household.';

alter table public.conversation_sessions enable row level security;

create index conversation_sessions_member_idx on public.conversation_sessions (member_id, created_at desc);

create trigger conversation_sessions_set_updated_at
  before update on public.conversation_sessions
  for each row execute function wh.set_updated_at();

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  session_id uuid not null references public.conversation_sessions(id) on delete cascade,
  role text not null check (role in ('member', 'assistant', 'system')),
  content text not null,
  -- Speech is a guess about what was said; keeping the confidence lets a low
  -- one be confirmed rather than acted on.
  transcript_confidence numeric(3, 2) check (transcript_confidence between 0 and 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.conversation_messages is
  'What was said. Reaches only the session it belongs to; a private conversation never joins shared household context.';

alter table public.conversation_messages enable row level security;

create index conversation_messages_session_idx on public.conversation_messages (session_id, created_at);

create table public.conversation_actions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  session_id uuid not null references public.conversation_sessions(id) on delete cascade,
  message_id uuid references public.conversation_messages(id) on delete set null,
  action_type text not null check (action_type ~ '^[a-z][a-z0-9_.]{1,60}$'),
  outcome_key text,
  payload jsonb not null default '{}'::jsonb,
  approval_status text not null default 'proposed'
    check (approval_status in ('proposed', 'approved', 'rejected', 'executed', 'failed', 'expired')),
  decided_by_member_id uuid references public.household_members(id) on delete set null,
  decided_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.conversation_actions is
  'A proposed change, its approval state and its result. Every mutation an agent makes is traceable to one of these.';

alter table public.conversation_actions enable row level security;

create index conversation_actions_session_idx on public.conversation_actions (session_id, created_at desc);
create index conversation_actions_pending_idx on public.conversation_actions (household_id)
  where approval_status = 'proposed';

create trigger conversation_actions_set_updated_at
  before update on public.conversation_actions
  for each row execute function wh.set_updated_at();

-- ---------------------------------------------------------------------------
-- Memory
-- ---------------------------------------------------------------------------

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  scope text not null check (scope in ('household', 'member')),
  member_id uuid references public.household_members(id) on delete cascade,
  category text not null check (category in
    ('preference', 'routine', 'constraint', 'fact', 'relationship')),
  key text not null check (key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  value jsonb not null,
  -- Where the belief came from and how sure we are. Module 05 turns this into
  -- what the family sees when it asks what WonderHome thinks it knows.
  source_type text not null check (source_type in ('setup', 'conversation', 'integration', 'observed')),
  source_id uuid,
  confidence numeric(3, 2) not null default 0.5 check (confidence between 0 and 1),
  status text not null default 'learned' check (status in ('learned', 'confirmed', 'rejected', 'superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memories_member_scope check ((scope = 'member') = (member_id is not null))
);

comment on table public.memories is
  'What WonderHome believes about the household, with where it came from and how sure it is. Confirmed facts are canonical and are never silently replaced by inference.';

alter table public.memories enable row level security;

create index memories_lookup_idx on public.memories (household_id, category, key);

-- One live belief per key. Superseded and rejected versions stay for history.
create unique index memories_one_active_per_key
  on public.memories (household_id, coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid), category, key)
  where status in ('learned', 'confirmed');

create trigger memories_set_updated_at
  before update on public.memories
  for each row execute function wh.set_updated_at();

create or replace function wh.assert_session_member_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select household_id into v_household from public.household_members where id = new.member_id;
  if v_household is distinct from new.household_id then
    raise exception 'Member % is not part of household %', new.member_id, new.household_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger conversation_sessions_member_valid
  before insert or update on public.conversation_sessions
  for each row execute function wh.assert_session_member_in_household();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Read-only from the client throughout. Sessions, messages and actions are
-- written server-side through governed tools, so nothing a browser sends can
-- fabricate a conversation, approve its own proposal, or plant a memory.
-- ---------------------------------------------------------------------------

create policy conversation_sessions_select_own
  on public.conversation_sessions for select
  to authenticated
  using (
    member_id = wh.member_id(household_id)
    or (visibility = 'household' and wh.is_member(household_id))
  );

create policy conversation_messages_select_own
  on public.conversation_messages for select
  to authenticated
  using (exists (
    select 1 from public.conversation_sessions s
    where s.id = session_id
      and (s.member_id = wh.member_id(s.household_id)
           or (s.visibility = 'household' and wh.is_member(s.household_id)))
  ));

create policy conversation_actions_select_own
  on public.conversation_actions for select
  to authenticated
  using (exists (
    select 1 from public.conversation_sessions s
    where s.id = session_id
      and (s.member_id = wh.member_id(s.household_id)
           or (s.visibility = 'household' and wh.is_member(s.household_id)))
  ));

-- A member sees household memory and their own; an administrator sees both, so
-- the household's understanding can actually be reviewed and corrected.
create policy memories_select_scoped
  on public.memories for select
  to authenticated
  using (
    wh.is_member(household_id)
    and (scope = 'household' or member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
  );

notify pgrst, 'reload schema';
