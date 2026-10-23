-- A WhatsApp text that asks WonderHome a question is answered with where to
-- ask it and is never kept as a HomeSend item: one more closed word for the
-- telemetry it leaves (packages/core/src/whatsapp/intake.ts).

alter table public.whatsapp_events drop constraint if exists whatsapp_events_kind_check;
alter table public.whatsapp_events add constraint whatsapp_events_kind_check check (kind in (
  'connection_started', 'connection_completed', 'connection_failed', 'disconnected',
  'message_received', 'media_received', 'message_processed', 'message_failed',
  'homesend_created', 'clarification_requested', 'ack_sent', 'ack_failed',
  'duplicate', 'unknown_sender', 'unsupported_type', 'signature_failed', 'rate_limited', 'retry_queued',
  'question_redirected'
));
