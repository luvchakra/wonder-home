-- "typing…" on WhatsApp (Meta's typing indicator) while WonderHome works on a
-- message: whether WhatsApp showed it, in closed words only. Safe in either
-- order: the code writes these kinds only alongside a fallback that drops
-- them when this check still refuses them (`whatsapp/events.ts`).

alter table public.whatsapp_events drop constraint if exists whatsapp_events_kind_check;
alter table public.whatsapp_events add constraint whatsapp_events_kind_check check (kind in (
  'connection_started', 'connection_completed', 'connection_failed', 'disconnected',
  'message_received', 'media_received', 'message_processed', 'message_failed',
  'homesend_created', 'clarification_requested', 'ack_sent', 'ack_failed',
  'duplicate', 'unknown_sender', 'unsupported_type', 'signature_failed', 'rate_limited', 'retry_queued',
  'question_redirected', 'question_answered', 'clarification_answered',
  'typing_shown', 'typing_failed'
));
