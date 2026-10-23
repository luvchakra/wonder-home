-- A WhatsApp reply quotes the message it answers (`context.id`). Kept so a
-- reply naming someone answers that item's "who is this for?" rather than
-- arriving as a new item of its own (the owner's "asmi", 2026-10-24).

alter table public.whatsapp_messages add column if not exists reply_to_provider_message_id text
  check (reply_to_provider_message_id is null or char_length(reply_to_provider_message_id) <= 200);

-- The quoted message is looked up by household, member and WhatsApp's id.
create index if not exists whatsapp_messages_household_member_provider
  on public.whatsapp_messages (household_id, member_id, provider_message_id);

alter table public.whatsapp_events drop constraint if exists whatsapp_events_kind_check;
alter table public.whatsapp_events add constraint whatsapp_events_kind_check check (kind in (
  'connection_started', 'connection_completed', 'connection_failed', 'disconnected',
  'message_received', 'media_received', 'message_processed', 'message_failed',
  'homesend_created', 'clarification_requested', 'ack_sent', 'ack_failed',
  'duplicate', 'unknown_sender', 'unsupported_type', 'signature_failed', 'rate_limited', 'retry_queued',
  'question_redirected', 'question_answered', 'clarification_answered'
));
