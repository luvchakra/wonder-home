-- An alert on WonderHome's own AI key (WONDERHOME_AI_KEY) reaches the
-- platform admins (story 14-048, design §13.1). Matched to no household, it
-- was recorded and told to no one. The delivery clock emails the platform's
-- owners and operators once per alert and stamps it here; a new alert (after
-- the key works again) is a new row, so it is told again.
--
-- Rollback: alter table public.ai_key_alerts drop column platform_notified_at;

alter table public.ai_key_alerts add column platform_notified_at timestamptz;

comment on column public.ai_key_alerts.platform_notified_at is
  'When the platform admins were emailed about this alert on the platform''s own key; null for a household key or not yet told.';
