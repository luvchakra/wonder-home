-- HomeSend v1 — a real inbound intake channel (Phase C of the HomeTalk/
-- HomeBrain/HomeSend architecture; product-direction v4 names it as one of
-- the three primary surfaces alongside HomeTalk and HomeBrain).
--
-- v1 is honestly scoped: no WhatsApp or email webhook exists yet (no
-- provider credentials, per CLAUDE.md's external-providers rule), so
-- `source` only names the two channels that are actually real today — a
-- photo/file upload and pasted text, both from inside the app. Nothing
-- about `status`/`classified_kind`/`routed_*` assumes how the item arrived,
-- so a real webhook can insert into this same table later by widening the
-- `source` check, not by a redesign.
--
-- The pipeline this table drives: received -> classified (an AI read of the
-- photo/text) -> routed (a person confirmed it and it was written into the
-- real domain table) or dismissed (not something to act on). `extracted`
-- holds whatever the classifier read, exactly as read — the confirm screen
-- shows it for the household to correct before anything is written, the
-- same never-write-without-review contract `extractSchoolItemFromImage`
-- already keeps for the homework screenshot flow. This table is never a
-- document library: file_path/raw_text exist only to get an item to
-- classified/routed, not as a standing record of what was sent.

create table public.home_send_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by_member_id uuid not null references public.household_members(id) on delete cascade,
  source text not null check (source in ('manual_upload', 'pasted_text')),
  file_path text check (length(trim(file_path)) between 1 and 400),
  raw_text text check (length(trim(raw_text)) between 1 and 4000),
  status text not null default 'received'
    check (status in ('received', 'classified', 'routed', 'dismissed')),
  classified_kind text check (classified_kind in ('bill', 'school_item', 'grocery_item', 'unknown')),
  extracted jsonb,
  -- Set together, once a person confirms where this went.
  routed_table text check (length(trim(routed_table)) <= 60),
  routed_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_send_items_has_content check (
    (source = 'manual_upload' and file_path is not null)
    or (source = 'pasted_text' and raw_text is not null)
  ),
  constraint home_send_items_routed_together check ((routed_table is null) = (routed_id is null)),
  constraint home_send_items_routed_implies_status check (routed_table is null or status = 'routed')
);

comment on table public.home_send_items is
  'HomeSend intake: a photo, file or pasted forward on its way into a real domain table, or dismissed. Never a document library.';

alter table public.home_send_items enable row level security;

create index home_send_items_household_idx on public.home_send_items (household_id, created_at desc);
create index home_send_items_pending_idx on public.home_send_items (household_id, status)
  where status in ('received', 'classified');

create trigger home_send_items_set_updated_at
  before update on public.home_send_items
  for each row execute function wh.set_updated_at();

-- Any household member can see and act on an intake item — a shared inbox,
-- not a personal one, the same visibility obligations/consumables already
-- have. Classifying and routing/dismissing are status changes any member
-- may make on a shared item; the confirm step itself is the safeguard —
-- nothing here writes a domain row, that happens only through each domain's
-- own governed create function, called after a person reviews the
-- extraction.
create policy home_send_items_select_member on public.home_send_items for select
  to authenticated using (wh.is_member(household_id));

create policy home_send_items_insert_member on public.home_send_items for insert
  to authenticated with check (
    wh.is_member(household_id) and created_by_member_id = wh.member_id(household_id)
  );

create policy home_send_items_update_member on public.home_send_items for update
  to authenticated using (wh.is_member(household_id)) with check (wh.is_member(household_id));

-- ---------------------------------------------------------------------------
-- Storage — private bucket, path-as-authorization-boundary, same shape as the
-- `avatars` bucket (20260921090000_household_member_avatar.sql).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('home-send', 'home-send', false)
on conflict (id) do nothing;

create policy "home_send_select_household_member"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'home-send'
    and wh.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "home_send_insert_member"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'home-send'
    and wh.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "home_send_delete_member"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'home-send'
    and wh.is_member(((storage.foldername(name))[1])::uuid)
  );

notify pgrst, 'reload schema';
