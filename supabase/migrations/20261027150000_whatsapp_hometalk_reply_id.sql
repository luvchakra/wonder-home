-- HomeTalk's own WhatsApp reply to a message (WhatsApp's id for it). A
-- swipe-reply quoting it is an answer to HomeTalk's open question, never a
-- new HomeSend item: "skip", swiped onto "How much maps link should I add?",
-- failed safely (the owner, 2026-10-27). Additive: older code never reads it.

alter table public.whatsapp_messages add column if not exists hometalk_reply_id text
  check (hometalk_reply_id is null or char_length(hometalk_reply_id) <= 200);

-- The quoted message is looked up by household, member and that id.
create index if not exists whatsapp_messages_household_member_hometalk_reply
  on public.whatsapp_messages (household_id, member_id, hometalk_reply_id)
  where hometalk_reply_id is not null;
