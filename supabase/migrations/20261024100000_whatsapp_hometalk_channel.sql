-- WhatsApp as a door into HomeTalk (the owner, 2026-10-24): a linked
-- adult's question or everyday request is answered through the same gateway
-- as Alexa. Its conversation is its own surface (what WhatsApp is waiting on
-- is answered on WhatsApp), each turn leaves a closed-word channel event, and
-- an answered question leaves a closed-word WhatsApp event.

alter table public.conversation_sessions drop constraint if exists conversation_sessions_surface_check;
alter table public.conversation_sessions add constraint conversation_sessions_surface_check
  check (surface in ('app', 'alexa', 'whatsapp'));

alter table public.hometalk_channel_events drop constraint if exists hometalk_channel_events_channel_check;
alter table public.hometalk_channel_events add constraint hometalk_channel_events_channel_check
  check (channel in ('web', 'mobile', 'gemini_voice', 'alexa', 'whatsapp'));

alter table public.whatsapp_events drop constraint if exists whatsapp_events_kind_check;
alter table public.whatsapp_events add constraint whatsapp_events_kind_check check (kind in (
  'connection_started', 'connection_completed', 'connection_failed', 'disconnected',
  'message_received', 'media_received', 'message_processed', 'message_failed',
  'homesend_created', 'clarification_requested', 'ack_sent', 'ack_failed',
  'duplicate', 'unknown_sender', 'unsupported_type', 'signature_failed', 'rate_limited', 'retry_queued',
  'question_redirected', 'question_answered'
));
