-- Chat notifications (the owner, 2026-10-21: "notification should be
-- triggered for chat feature").
--
-- A chat with something new to read is a notice like any other (27-004
-- pattern, notifications/notices.ts `chatNotices`): one per person per chat,
-- derived from chat_messages and the reader's own last read, resolved once
-- they read it. The notifications table names every source a notification may
-- come from, so 'chat_thread' joins that list. The delivery clock finds
-- households with new messages by household and time, so that read gets its
-- own index.
--
-- Rollback: re-create notifications_source_type_check from
-- 20261020230000_goal_checkin_verification.sql (after resolving any open
-- 'chat_thread' notifications) and drop index
-- public.chat_messages_household_created_idx.

alter table public.notifications drop constraint notifications_source_type_check;
alter table public.notifications add constraint notifications_source_type_check
  check (source_type in ('obligation', 'school_item', 'school_day', 'meal', 'grocery_list', 'pet_care_need', 'family_event',
                         'health_appointment', 'health_routine', 'health_checkup', 'approval', 'reminder',
                         'payment', 'payment_refund',
                         'homesend_item', 'event_replies', 'helper_absence', 'grocery_order', 'event_change', 'weather_plan',
                         'goal_checkin', 'chat_thread',
                         'digest'));

create index if not exists chat_messages_household_created_idx on public.chat_messages (household_id, created_at desc);
