-- Story 14-014: a school item keeps the time a notice gave, not only its day.
--
-- `due_at` has always been an instant, but nothing said whether its time of
-- day was ever told to WonderHome: an all-day item ("due Friday") was stored
-- at midnight UTC and then shown with a time nobody said ("5:30 am" in
-- India). `due_time_known` says so, and an event or exam that runs for a
-- while ("9–11am") keeps its end in `ends_at`.

alter table public.school_items
  add column due_time_known boolean not null default false,
  add column ends_at timestamptz;

alter table public.school_items
  add constraint school_items_time_needs_due check (not due_time_known or due_at is not null),
  -- An end only means something after a start whose time is known.
  add constraint school_items_end_after_start check (
    ends_at is null or (due_time_known and ends_at > due_at)
  );

comment on column public.school_items.due_time_known is
  'True only when a person or source actually gave a time of day; otherwise due_at names a day and no time is shown.';
comment on column public.school_items.ends_at is
  'When a timed event or exam ends ("9–11am"); null when no end was given.';

-- Rows written before this change: an all-day item was always stored at
-- midnight UTC, so any other instant was a time somebody (or a portal) gave,
-- and it was already being shown. Keep showing it.
update public.school_items
   set due_time_known = true
 where due_at is not null
   and (extract(hour from due_at at time zone 'UTC') <> 0 or extract(minute from due_at at time zone 'UTC') <> 0);
