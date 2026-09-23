-- HomeSend 2.0 (story 14-011, Wave 3 §3, §8, §14, §15): one intake table for
-- every kind of input, one canonical understanding, and an inbox that says
-- what failed safely instead of leaving it looking like it is waiting.
--
-- New sources:
--   audio_note        a voice note; the recording is the file, its transcript
--                     is raw_text once heard
--   link              a web address someone shared; source_url is the address,
--                     raw_text what could be read from it
--   email_attachment  a file that came with a forwarded email; always has a
--                     parent email item and, like email, no acting member
-- A PDF, text or CSV upload is still `manual_upload`; `content_type` says
-- which kind of file it is.

alter table public.home_send_items drop constraint home_send_items_source_check;
alter table public.home_send_items add constraint home_send_items_source_check
  check (source in ('manual_upload', 'pasted_text', 'email', 'audio_note', 'link', 'email_attachment'));

alter table public.home_send_items
  add column content_type text check (length(trim(content_type)) between 1 and 100),
  add column content_hash text check (content_hash ~ '^[0-9a-f]{64}$'),
  add column source_url text check (length(trim(source_url)) between 1 and 2048),
  add column subject text check (length(trim(subject)) between 1 and 300),
  add column parent_item_id uuid references public.home_send_items(id) on delete cascade,
  add column understanding jsonb,
  add column transcript_confidence numeric(4, 3) check (transcript_confidence between 0 and 1),
  add column failure_reason text check (failure_reason in (
    'security_rejected', 'unsupported_type', 'unreadable', 'too_large',
    'link_blocked', 'link_unreachable', 'transcription_unavailable', 'transcription_failed'
  )),
  add column routed_at timestamptz;

comment on column public.home_send_items.understanding is
  'The canonical IntakeUnderstanding (homesend/understanding.ts): summary, entities, facts, candidate actions, references, change signal, safety and provenance. Built deterministically from the classifier''s reading; never holds a database id the model produced.';
comment on column public.home_send_items.content_hash is
  'sha256 of the content, so sending the same thing twice finds the item already waiting instead of creating a second one (Wave 3 §15).';
comment on column public.home_send_items.failure_reason is
  'Why an item failed safely: kept, never classified, and shown in the inbox''s "Failed safely" list with this reason in words.';

-- A fetched page, a PDF's text or an email body is longer than a pasted
-- message; the understanding step reads at most 12,000 characters.
alter table public.home_send_items drop constraint home_send_items_raw_text_check;
alter table public.home_send_items add constraint home_send_items_raw_text_check
  check (length(trim(raw_text)) between 1 and 12000);

alter table public.home_send_items drop constraint home_send_items_status_check;
alter table public.home_send_items add constraint home_send_items_status_check
  check (status in ('received', 'classified', 'routed', 'dismissed', 'undone', 'failed'));

alter table public.home_send_items drop constraint home_send_items_has_content;
alter table public.home_send_items add constraint home_send_items_has_content check (
  (source in ('manual_upload', 'audio_note', 'email_attachment') and file_path is not null)
  or (source in ('pasted_text', 'email') and raw_text is not null)
  or (source = 'link' and source_url is not null)
);

alter table public.home_send_items drop constraint home_send_items_actor_matches_source;
alter table public.home_send_items add constraint home_send_items_actor_matches_source check (
  (source in ('email', 'email_attachment') and created_by_member_id is null)
  or (source not in ('email', 'email_attachment') and created_by_member_id is not null)
);

alter table public.home_send_items add constraint home_send_items_attachment_has_parent
  check ((source = 'email_attachment') = (parent_item_id is not null));

alter table public.home_send_items add constraint home_send_items_failed_has_reason
  check (status <> 'failed' or failure_reason is not null);

create index home_send_items_content_hash_idx
  on public.home_send_items (household_id, content_hash)
  where content_hash is not null;

create index home_send_items_parent_idx
  on public.home_send_items (parent_item_id)
  where parent_item_id is not null;

-- Uploads that were refused before this migration were left looking like
-- they were waiting on a review nobody could give. They failed safely; say so.
update public.home_send_items
  set status = 'failed', failure_reason = 'security_rejected'
  where security_status = 'rejected' and status in ('received', 'classified');

-- A share sheet can hand WonderHome a PDF, a text file or a voice note now,
-- not only a photo. What it really is is decided from the bytes once the
-- share is resumed; the staged row only keeps the type the OS claimed.
alter table public.homesend_share_handoffs drop constraint homesend_share_handoffs_file_content_type_check;
alter table public.homesend_share_handoffs add constraint homesend_share_handoffs_file_content_type_check
  check (length(trim(file_content_type)) between 1 and 100);

notify pgrst, 'reload schema';
