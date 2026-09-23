-- HomeBrain 2.0 (story 14-010, Wave 2 §8, §9): what HomeTalk learned is
-- visible, and correctable, in HomeBrain Review.
--
-- Until now a preference someone stated in HomeTalk was written to
-- `memories` (which HomeBrain reads) and never to `certification_items`
-- (which HomeBrain Review shows), so the household could not see, confirm,
-- correct or remove it — `certification_items.memory_id` existed for exactly
-- this link and nothing ever set it. From this story on `remember()` writes
-- the linked item as it learns; this backfills every current belief learned
-- before that, once. Data only: no schema, no policy change.
--
-- The category, risk and claim wording mirror `conversation/memory.ts`'s
-- `reviewPlacementFor` and `claimFor`, so a backfilled item reads exactly
-- like one written today.

with learned as (
  select
    m.id,
    m.household_id,
    m.scope,
    m.member_id,
    m.key,
    m.value,
    m.source_type,
    m.status,
    coalesce(nullif(btrim(m.value ->> 'statement'), ''), regexp_replace(m.key, '[._]+', ' ', 'g')) as said
  from public.memories m
  where m.status in ('learned', 'confirmed')
    -- A memory with nothing in it is not a belief anyone can check.
    and m.value is not null and m.value <> '{}'::jsonb
    and not exists (select 1 from public.certification_items c where c.memory_id = m.id)
)
insert into public.certification_items (household_id, memory_id, category, claim, scope, member_id, source_type, source_detail, status, risk_level)
select
  l.household_id,
  l.id,
  case
    when l.value ->> 'stance' = 'allergic' then 'safety'
    when l.key ~ '^(meals|kids|household\.(bedtime|routine|schedule))' then 'home_routines'
    when l.key ~ '^(school|homework)' then 'education'
    when l.key ~ '^(bills|money|finance|budget)' then 'finance'
    else 'lifestyle'
  end,
  left(upper(left(l.said, 1)) || substr(l.said, 2) || case when l.said ~ '[.!?]$' then '' else '.' end, 300),
  l.scope,
  l.member_id,
  l.source_type,
  null,
  case when l.status = 'confirmed' then 'confirmed' else 'learned' end,
  case
    when l.value ->> 'stance' = 'allergic' then 'high'
    when l.key ~ '^(bills|money|finance|budget)' then 'medium'
    else 'low'
  end
from learned l;
