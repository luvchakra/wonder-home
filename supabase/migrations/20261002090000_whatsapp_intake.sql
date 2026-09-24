-- WhatsApp as a HomeSend intake channel (WhatsApp HomeSend spec, stories
-- 14-015 and 14-016).
--
-- WhatsApp stops being only a way reminders go out. A household adult links
-- their own WhatsApp number to their own membership, and anything they then
-- send or forward to WonderHome's official business number becomes a
-- HomeSend item in their household, understood and waiting for a person to
-- confirm, exactly like an upload or a forwarded email.
--
-- It is an input channel, never an authorization channel:
--   * A number becomes a member's only when that member, signed in, asked
--     for a single-use code and then sent it from that number. A number
--     that merely matches something typed somewhere links nothing.
--   * The member and the household always come from the verified link,
--     never from anything in a message.
--   * One number is linked to at most one member at a time, anywhere.
--   * What arrives is untrusted content. It becomes a HomeSend item and
--     nothing else; every gate after that is the one every item goes
--     through.
--
-- whatsapp_identities: the verified link. The member and the household's
-- admins can see it (the number is theirs to see); every other member only
-- learns whether someone is connected, through
-- public.household_whatsapp_members. No session writes it; the server
-- completes a link through public.complete_whatsapp_link and a person ends
-- one through public.disconnect_whatsapp. Disconnecting keeps the row, so
-- what was linked when is not lost, and deletes nothing created from it.
--
-- whatsapp_link_requests: the single-use CONNECT codes, stored only as a
-- SHA-256 hash, valid for fifteen minutes. No session can read them.
--
-- whatsapp_messages: one row per inbound message from a linked number, keyed
-- by WhatsApp's own message id, so a retried delivery is recorded once and
-- processed once. What happened to it is kept in closed words.
--
-- whatsapp_events: what each delivery did, in closed words and counts only —
-- never a number, a name or a word of what was sent. Service role only.

-- ---------------------------------------------------------------------------
-- The verified link
-- ---------------------------------------------------------------------------

create table public.whatsapp_identities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.household_members (id) on delete cascade,
  -- WhatsApp's own id for the sender (the number, in digits, as WhatsApp reports it).
  wa_user_id text not null check (wa_user_id ~ '^[1-9][0-9]{7,14}$'),
  phone_number text not null check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  -- The WhatsApp profile name at the time of linking, if WhatsApp sent one.
  display_name text check (display_name is null or length(trim(display_name)) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'disconnected')),
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'disconnected') = (disconnected_at is not null))
);

comment on table public.whatsapp_identities is
  'A WhatsApp number verified as one adult member''s, by a single-use code sent from it. The only thing inbound WhatsApp is routed by.';

create index whatsapp_identities_household on public.whatsapp_identities (household_id, member_id);
-- One number, one member, anywhere — at a time.
create unique index whatsapp_identities_active_number on public.whatsapp_identities (wa_user_id) where status = 'active';
-- One live number per member; linking a new one ends the old link.
create unique index whatsapp_identities_active_member on public.whatsapp_identities (member_id) where status = 'active';

alter table public.whatsapp_identities enable row level security;

create policy whatsapp_identities_select_own_or_admin
  on public.whatsapp_identities for select
  to authenticated
  using (member_id = wh.member_id(household_id) or wh.is_household_admin(household_id));

-- Only an adult of the household may hold a link: a child or a helper does
-- not forward things into the household's HomeSend.
create or replace function wh.assert_whatsapp_member_is_adult()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.household_members m
    where m.id = new.member_id and m.household_id = new.household_id and m.member_type = 'adult'
  ) then
    raise exception '%: member % is not an adult of household %', tg_table_name, new.member_id, new.household_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger whatsapp_identities_member_is_adult
  before insert or update of household_id, member_id on public.whatsapp_identities
  for each row execute function wh.assert_whatsapp_member_is_adult();

create or replace function wh.touch_whatsapp_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger whatsapp_identities_touch
  before update on public.whatsapp_identities
  for each row execute function wh.touch_whatsapp_identity();

-- ---------------------------------------------------------------------------
-- Single-use CONNECT codes
-- ---------------------------------------------------------------------------

create table public.whatsapp_link_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.household_members (id) on delete cascade,
  -- SHA-256 of the code, hex. The code itself is shown once, to the member.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  identity_id uuid references public.whatsapp_identities (id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '1 hour')
);

comment on table public.whatsapp_link_requests is
  'Single-use CONNECT codes for linking a WhatsApp number, stored only as SHA-256 hashes. Service role only.';

create index whatsapp_link_requests_member on public.whatsapp_link_requests (member_id, created_at desc);
create index whatsapp_link_requests_expiry on public.whatsapp_link_requests (expires_at);

alter table public.whatsapp_link_requests enable row level security;

create policy whatsapp_link_requests_no_client_access
  on public.whatsapp_link_requests for all
  to anon, authenticated
  using (false)
  with check (false);

create trigger whatsapp_link_requests_member_is_adult
  before insert on public.whatsapp_link_requests
  for each row execute function wh.assert_whatsapp_member_is_adult();

-- ---------------------------------------------------------------------------
-- Inbound messages from linked numbers
-- ---------------------------------------------------------------------------

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  -- WhatsApp's message id ("wamid.…"): the idempotency key for every retry.
  provider_message_id text not null unique check (length(provider_message_id) between 1 and 200),
  identity_id uuid not null references public.whatsapp_identities (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.household_members (id) on delete cascade,
  message_type text not null check (message_type in ('text', 'image', 'document', 'audio', 'video', 'unsupported')),
  text_content text check (text_content is null or length(text_content) between 1 and 4096),
  media_id text check (media_id is null or length(media_id) between 1 and 200),
  media_mime_type text check (media_mime_type is null or length(media_mime_type) between 1 and 120),
  media_filename text check (media_filename is null or length(media_filename) between 1 and 240),
  received_at timestamptz not null,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  failure_reason text check (failure_reason is null or failure_reason ~ '^[a-z_]{1,60}$'),
  attempts smallint not null default 0 check (attempts between 0 and 20),
  homesend_item_id uuid references public.home_send_items (id) on delete set null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (processing_status <> 'failed' or failure_reason is not null),
  check (message_type <> 'text' or (text_content is not null and media_id is null)),
  check (message_type not in ('image', 'document', 'audio', 'video') or media_id is not null)
);

comment on table public.whatsapp_messages is
  'One row per message a linked adult sent to WonderHome''s WhatsApp number, keyed by WhatsApp''s message id so a retried delivery is kept and processed once.';

create index whatsapp_messages_household on public.whatsapp_messages (household_id, received_at desc);
create index whatsapp_messages_pending on public.whatsapp_messages (processing_status, received_at) where processing_status in ('received', 'processing');
create index whatsapp_messages_item on public.whatsapp_messages (homesend_item_id) where homesend_item_id is not null;

alter table public.whatsapp_messages enable row level security;

-- The sender and the household's admins can see a message's record; what it
-- became is the HomeSend item, which the whole household sees.
create policy whatsapp_messages_select_own_or_admin
  on public.whatsapp_messages for select
  to authenticated
  using (member_id = wh.member_id(household_id) or wh.is_household_admin(household_id));

create or replace function wh.assert_whatsapp_message_matches_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.whatsapp_identities i
    where i.id = new.identity_id and i.household_id = new.household_id and i.member_id = new.member_id
  ) then
    raise exception 'whatsapp_messages: household and member must be the linked identity''s' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger whatsapp_messages_matches_identity
  before insert or update on public.whatsapp_messages
  for each row execute function wh.assert_whatsapp_message_matches_identity();

-- ---------------------------------------------------------------------------
-- Telemetry: closed words and counts only
-- ---------------------------------------------------------------------------

create table public.whatsapp_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete cascade,
  kind text not null check (kind in (
    'connection_started', 'connection_completed', 'connection_failed', 'disconnected',
    'message_received', 'media_received', 'message_processed', 'message_failed',
    'homesend_created', 'clarification_requested', 'ack_sent', 'ack_failed',
    'duplicate', 'unknown_sender', 'unsupported_type', 'signature_failed', 'rate_limited', 'retry_queued'
  )),
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 3600000),
  count integer not null default 1 check (count between 1 and 1000),
  created_at timestamptz not null default now()
);

comment on table public.whatsapp_events is
  'What each WhatsApp delivery did, in closed words and counts. Never a number, a name or message content. Service role only.';

create index whatsapp_events_recent on public.whatsapp_events (created_at desc, kind);

alter table public.whatsapp_events enable row level security;

create policy whatsapp_events_no_client_access
  on public.whatsapp_events for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- HomeSend: two new sources
-- ---------------------------------------------------------------------------

alter table public.home_send_items drop constraint home_send_items_source_check;
alter table public.home_send_items add constraint home_send_items_source_check
  check (source in ('manual_upload', 'pasted_text', 'email', 'audio_note', 'link', 'email_attachment', 'whatsapp', 'whatsapp_media'));

alter table public.home_send_items drop constraint home_send_items_has_content;
alter table public.home_send_items add constraint home_send_items_has_content check (
  (source in ('manual_upload', 'audio_note', 'email_attachment', 'whatsapp_media') and file_path is not null)
  or (source in ('pasted_text', 'email', 'whatsapp') and raw_text is not null)
  or (source = 'link' and source_url is not null)
);

-- A WhatsApp item always has its sender: the linked member it came from.
-- (The existing constraint already requires a member for every source other
-- than email; it is restated so the two new sources are named.)
alter table public.home_send_items drop constraint home_send_items_actor_matches_source;
alter table public.home_send_items add constraint home_send_items_actor_matches_source check (
  (source in ('email', 'email_attachment') and created_by_member_id is null)
  or (source not in ('email', 'email_attachment') and created_by_member_id is not null)
);

-- ---------------------------------------------------------------------------
-- Linking, disconnecting, and who is connected
-- ---------------------------------------------------------------------------

-- Completes a link from a verified inbound CONNECT message. Server only: the
-- webhook calls it after the delivery's signature verified. Atomic, so two
-- deliveries of the same code cannot both succeed.
--   linked         the number is now this member's
--   already_linked this number was already this member's
--   invalid        no such code
--   expired        the code is older than its window, or already used
--   in_use         the number is linked to someone else
create or replace function wh.complete_whatsapp_link(
  p_token_hash text,
  p_wa_user_id text,
  p_phone_number text,
  p_display_name text
)
returns table (outcome text, household_id uuid, member_id uuid, identity_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_request public.whatsapp_link_requests%rowtype;
  v_existing public.whatsapp_identities%rowtype;
  v_identity_id uuid;
begin
  select * into v_request from public.whatsapp_link_requests r
    where r.token_hash = p_token_hash
    for update;
  if not found then
    return query select 'invalid'::text, null::uuid, null::uuid, null::uuid;
    return;
  end if;
  if v_request.used_at is not null or v_request.expires_at <= now() then
    return query select 'expired'::text, v_request.household_id, v_request.member_id, null::uuid;
    return;
  end if;

  select * into v_existing from public.whatsapp_identities i
    where i.wa_user_id = p_wa_user_id and i.status = 'active'
    for update;
  if found then
    if v_existing.member_id = v_request.member_id then
      update public.whatsapp_link_requests set used_at = now(), identity_id = v_existing.id where id = v_request.id;
      return query select 'already_linked'::text, v_existing.household_id, v_existing.member_id, v_existing.id;
      return;
    end if;
    return query select 'in_use'::text, v_request.household_id, v_request.member_id, null::uuid;
    return;
  end if;

  -- A member linking a new number ends their old link first.
  update public.whatsapp_identities
    set status = 'disconnected', disconnected_at = now()
    where whatsapp_identities.member_id = v_request.member_id and status = 'active';

  insert into public.whatsapp_identities (household_id, member_id, wa_user_id, phone_number, display_name)
    values (v_request.household_id, v_request.member_id, p_wa_user_id, p_phone_number, nullif(trim(p_display_name), ''))
    returning id into v_identity_id;

  update public.whatsapp_link_requests set used_at = now(), identity_id = v_identity_id where id = v_request.id;
  return query select 'linked'::text, v_request.household_id, v_request.member_id, v_identity_id;
end;
$$;

create or replace function public.complete_whatsapp_link(
  p_token_hash text,
  p_wa_user_id text,
  p_phone_number text,
  p_display_name text
)
returns table (outcome text, household_id uuid, member_id uuid, identity_id uuid)
language sql
security definer
set search_path = ''
as $$
  select * from wh.complete_whatsapp_link(p_token_hash, p_wa_user_id, p_phone_number, p_display_name);
$$;

revoke all on function wh.complete_whatsapp_link(text, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_whatsapp_link(text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_whatsapp_link(text, text, text, text) to service_role;

-- Ending a link: the member whose number it is, or a household admin. It
-- stops new messages being associated and keeps everything already created.
create or replace function wh.disconnect_whatsapp(p_identity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identity public.whatsapp_identities%rowtype;
begin
  select * into v_identity from public.whatsapp_identities where id = p_identity_id;
  if not found then
    return false;
  end if;
  -- coalesce: for a caller outside the household wh.member_id is null, and
  -- `not (null or false)` is null, which an IF treats as "allowed".
  if not coalesce(v_identity.member_id = wh.member_id(v_identity.household_id) or wh.is_household_admin(v_identity.household_id), false) then
    raise exception 'not allowed to disconnect this WhatsApp number' using errcode = '42501';
  end if;
  if v_identity.status = 'disconnected' then
    return true;
  end if;
  update public.whatsapp_identities
    set status = 'disconnected', disconnected_at = now()
    where id = p_identity_id;
  return true;
end;
$$;

create or replace function public.disconnect_whatsapp(p_identity_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select wh.disconnect_whatsapp(p_identity_id);
$$;

revoke all on function wh.disconnect_whatsapp(uuid) from public, anon;
revoke all on function public.disconnect_whatsapp(uuid) from public, anon;
grant execute on function wh.disconnect_whatsapp(uuid) to authenticated;
grant execute on function public.disconnect_whatsapp(uuid) to authenticated, service_role;

-- Who in the household has WhatsApp connected — member ids only, never a
-- number — for any member of that household.
create or replace function wh.household_whatsapp_members(p_household_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.member_id from public.whatsapp_identities i
  where i.household_id = p_household_id and i.status = 'active' and wh.is_member(p_household_id);
$$;

create or replace function public.household_whatsapp_members(p_household_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select wh.household_whatsapp_members(p_household_id);
$$;

revoke all on function wh.household_whatsapp_members(uuid) from public, anon;
revoke all on function public.household_whatsapp_members(uuid) from public, anon;
grant execute on function wh.household_whatsapp_members(uuid) to authenticated;
grant execute on function public.household_whatsapp_members(uuid) to authenticated, service_role;
