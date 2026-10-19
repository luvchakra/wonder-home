-- What HomeBrain registers is confirmed by default (the owner, 2026-10-19).
--
-- Until now, everything a member told HomeTalk was kept as "learned" and sat
-- under HomeBrain Review's "Needs review" until someone confirmed it. The
-- owner's decision: whatever HomeBrain registers is confirmed from the start,
-- and an Admin removes or corrects it in Review later. New writes are
-- confirmed by the app (conversation/memory.ts, welcome.ts); the column
-- defaults follow, so a writer that leaves the status out agrees with it; and
-- what is already on record is brought in line.
--
-- Only "learned" moves. "needs_review" — a statement that contradicts
-- something already confirmed — still waits for a person, and nothing removed,
-- corrected, rejected or superseded comes back.

alter table public.memories alter column status set default 'confirmed';
alter table public.certification_items alter column status set default 'confirmed';

update public.memories set status = 'confirmed' where status = 'learned';
update public.certification_items set status = 'confirmed' where status = 'learned';
