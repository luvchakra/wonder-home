-- Voice integration phase 6: what happened to every HomeTalk turn, per
-- channel — the observability the spec asks for
-- (design/voice-integration/06-voice-integration-evaluation-and-hardening.md,
-- "Observability"), counted by provider: web, mobile, Gemini Voice, Alexa.
--
-- One row per turn, or per channel event that is not a turn (a Gemini Live
-- session opened, a token the provider would not issue, an Alexa request
-- from an unlinked speaker, a rate limit). Each row is closed words and
-- numbers only: the channel, the outcome, the latency, and whether it was a
-- redelivery answered from its first response. Never an utterance, a
-- transcript, audio, or anything a household said — "avoid collecting
-- unnecessary voice/audio content".
--
-- Operational telemetry, like homesend_email_events: members cannot read
-- or write it; the service role writes it and the platform-admin voice
-- metrics read it. Rows older than 90 days are removed by
-- /platform/retention.
create table public.hometalk_channel_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  channel text not null check (channel in ('web', 'mobile', 'gemini_voice', 'alexa')),
  outcome text not null check (outcome in (
    'answered',
    'clarification_required',
    'approval_required',
    'completed',
    'failed',
    'not_authorized',
    'session_opened',
    'provider_error',
    'unlinked',
    'rate_limited'
  )),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  replayed boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.hometalk_channel_events is
  'Voice phase 6: one closed-word row per HomeTalk turn or channel event, by channel. Never any content. Service-role only.';

alter table public.hometalk_channel_events enable row level security;

create policy hometalk_channel_events_no_client_access
  on public.hometalk_channel_events for all
  to anon, authenticated
  using (false)
  with check (false);

create index hometalk_channel_events_created on public.hometalk_channel_events (created_at);
create index hometalk_channel_events_channel_created on public.hometalk_channel_events (channel, created_at);
