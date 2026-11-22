-- HomeSend's learned rules (story 14-084; the owner 2026-11-22: "new kind,
-- unseen incoming messages should be analysed by ai and learnt over time to
-- take the right decision in automated way").
--
-- `homesend_learned_defaults` gains one rule kind and one source:
--   decision_pattern  `pattern:sender:<address>` or `pattern:newkind:<words>`
--                     → how such an item is handled, as the capabilities it
--                     becomes ("note.create event.create"). Promoted when
--                     the same household confirmed the same handling three
--                     times with no correction or Undo in between
--                     (`homesend/decision-rules.ts`); one correction or Undo
--                     demotes it (`mixed`, so it settles nothing).
--   source 'confirmations'  promoted from confirmations, not from one answer.
-- The value is a capability list only: never money, health, approval or a
-- person (the app refuses any other capability; the value_text checks of
-- 20261114231537 still refuse currency).
--
-- Safe in either order: old code reads rows with its own column list and
-- drops kinds it doesn't know (`rules-repository.ts` `toRule`) and reads an
-- unknown source as 'answer'; new code before this migration fails the
-- check on write, which it ignores (a rule is a convenience).
-- Rollback: delete from public.homesend_learned_defaults where kind =
-- 'decision_pattern' or source = 'confirmations'; then restore both checks
-- from 20261114231537.

alter table public.homesend_learned_defaults drop constraint if exists homesend_learned_defaults_kind_check;
alter table public.homesend_learned_defaults add constraint homesend_learned_defaults_kind_check
  check (kind in ('sender_child', 'sender_person', 'sender_area', 'vendor_category', 'phrase_item', 'place_alias', 'decision_pattern'));

alter table public.homesend_learned_defaults drop constraint if exists homesend_learned_defaults_source_check;
alter table public.homesend_learned_defaults add constraint homesend_learned_defaults_source_check
  check (source in ('answer', 'pick', 'correction', 'confirmations'));

-- Promotion reads the household's recent memories through
-- homesend_decision_memories_recent_idx; no new index is needed.

notify pgrst, 'reload schema';
