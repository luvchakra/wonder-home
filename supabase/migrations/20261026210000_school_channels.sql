-- School message channels (story 08-031).
--
-- A connected school lets a household track a message channel inside the portal
-- — a class group, a notice board — reached at a stable URL, for example
-- https://www.looplearning.com/channel/2044541. This stores the channels a
-- household registers, and adds the HomeSend source a channel message is filed
-- under.
--
-- What it keeps, from CLAUDE.md's agent platform:
--   * A channel is read-only and never an authorization channel. Every message
--     it yields is untrusted content: it becomes a HomeSend item and nothing
--     else, waiting for a person to confirm.
--   * No portal is live. A channel can be stored before any adapter exists; it
--     is polled only once its provider is live, and storing one grants nothing.
--
-- Channels are part of a school connection, which is an administrator's to set
-- up, so an Admin manages them; every member of the household may see which
-- channels are tracked. A channel may name the child it is about, kept on the
-- row so its visibility needs no join.

create table public.school_channels (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  integration_id uuid not null references public.integrations (id) on delete cascade,
  provider text not null check (length(trim(provider)) between 1 and 64),
  channel_id text not null check (length(trim(channel_id)) between 1 and 200),
  url text not null check (length(url) between 1 and 2048),
  -- The child this channel is about, when it is one child's. Null for a class
  -- channel not tied to a single child.
  child_member_id uuid references public.household_members (id) on delete set null,
  active boolean not null default true,
  -- The administrator who added it; the member its messages are filed under.
  created_by uuid references public.household_members (id) on delete set null,
  -- Where the last poll stopped, so a continuous feed resumes and never re-files.
  last_message_external_id text,
  last_polled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.school_channels is
  'A message channel inside a connected school portal that a household tracks. Read-only; its messages become HomeSend items awaiting confirmation. Never an authorization channel.';

-- One channel per connection; re-adding the same link reactivates its row.
create unique index school_channels_integration_channel on public.school_channels (integration_id, channel_id);
create index school_channels_household on public.school_channels (household_id, integration_id);
create index school_channels_child on public.school_channels (child_member_id) where child_member_id is not null;
create index school_channels_created_by on public.school_channels (created_by);

create trigger school_channels_set_updated_at
  before update on public.school_channels
  for each row execute function wh.set_updated_at();

alter table public.school_channels enable row level security;

-- Every member of the household may see which channels are tracked; when a
-- channel names a child, only those who may see that child do.
create policy school_channels_select on public.school_channels for select
  to authenticated
  using (
    household_id in (select wh.member_households())
    and (child_member_id is null or wh.may_see_child(household_id, child_member_id))
  );

-- An Admin sets up a connection and its channels.
create policy school_channels_insert on public.school_channels for insert
  to authenticated
  with check (household_id in (select wh.admin_households()));

create policy school_channels_update on public.school_channels for update
  to authenticated
  using (household_id in (select wh.admin_households()))
  with check (household_id in (select wh.admin_households()));

create policy school_channels_delete on public.school_channels for delete
  to authenticated
  using (household_id in (select wh.admin_households()));

grant select, insert, update, delete on public.school_channels to authenticated;

-- ---------------------------------------------------------------------------
-- HomeSend: the school-channel source
-- ---------------------------------------------------------------------------
-- A channel message is text, filed under its own source so the inbox and the
-- metrics tell it apart. Its actor is the Admin who added the channel, as every
-- non-email source carries the member who brought it in; the message did not
-- come from that member, and nothing in it decides who it belongs to.

alter table public.home_send_items drop constraint home_send_items_source_check;
alter table public.home_send_items add constraint home_send_items_source_check
  check (source in ('manual_upload', 'pasted_text', 'email', 'audio_note', 'link', 'email_attachment', 'whatsapp', 'whatsapp_media', 'school_channel'));

alter table public.home_send_items drop constraint home_send_items_has_content;
alter table public.home_send_items add constraint home_send_items_has_content check (
  (source in ('manual_upload', 'audio_note', 'email_attachment', 'whatsapp_media') and file_path is not null)
  or (source in ('pasted_text', 'email', 'whatsapp', 'school_channel') and raw_text is not null)
  or (source = 'link' and source_url is not null)
);
