-- HomeSend Phase 3 (intelligence pipeline, scoped slice): one intake can now
-- name a second, different-domain need alongside its primary classification
-- -- the PRD's own headline example ("Sports day Friday. Bring white
-- T-shirt.") is a school notice AND a grocery need, not one or the other.
-- The classifier (`ai/classify-intake.ts`) already proposes this as
-- `extracted.secondary`, a household still confirms it explicitly (a second
-- checkbox on the same confirm form, never auto-applied) before anything is
-- written, and routing it calls the exact same governed `createConsumable`
-- every other grocery item goes through.
--
-- The one thing that blocked this at the database level: `homesend_changes`
-- allowed exactly one row per intake, because v1 routing only ever wrote one
-- domain row. Two different domains from one intake need two rows -- but
-- never two of the *same* domain (an intake never plausibly produces two
-- bills), so the constraint narrows to per-domain rather than disappearing.
alter table public.homesend_changes drop constraint homesend_changes_one_per_intake;
alter table public.homesend_changes add constraint homesend_changes_one_per_intake_domain
  unique (intake_id, domain);

comment on constraint homesend_changes_one_per_intake_domain on public.homesend_changes is
  'One write per domain per intake -- a school notice can produce a school_item row and a grocery_item row, never two of the same domain.';

notify pgrst, 'reload schema';
