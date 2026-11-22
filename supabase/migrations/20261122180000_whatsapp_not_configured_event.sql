-- The WhatsApp webhook refused every message for a day (2026-11-21/22) because
-- its app secret was missing after a redeploy, and nothing said so. It now
-- records a `not_configured` event (at most one a minute per server) when it
-- refuses for a missing setting. Safe in either order: until this check
-- allows the kind, `whatsapp/events.ts` drops it and keeps the rest.

alter table public.whatsapp_events drop constraint if exists whatsapp_events_kind_check;
alter table public.whatsapp_events add constraint whatsapp_events_kind_check check (kind in (
  'connection_started', 'connection_completed', 'connection_failed', 'disconnected',
  'message_received', 'media_received', 'message_processed', 'message_failed',
  'homesend_created', 'clarification_requested', 'ack_sent', 'ack_failed',
  'duplicate', 'unknown_sender', 'unsupported_type', 'signature_failed', 'rate_limited', 'retry_queued',
  'question_redirected', 'question_answered', 'clarification_answered',
  'typing_shown', 'typing_failed', 'not_configured'
));
