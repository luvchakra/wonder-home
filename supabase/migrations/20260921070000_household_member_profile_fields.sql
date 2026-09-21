-- Extended person details for a household member.
--
-- What a household actually knows about each other beyond a name and a
-- birthday: what they go by day to day, how they are related, what they do,
-- where they spend their day, and a date worth remembering besides a
-- birthday. Every column is optional — a household fills in what it knows,
-- never a placeholder for what it does not (design principle 9).
--
-- `relationship` is deliberately free text, not an enum: "stepfather",
-- "grandmother", "cousin" and a dozen others are all real answers, and a
-- fixed list would refuse the true one. Older/younger sibling order is
-- deliberately NOT a column here — it is arithmetic over `date_of_birth`,
-- computed in application code (`siblingOrder` in identity/households.ts),
-- so it can never drift out of step with the birthdate a household already
-- keeps.
--
-- Write access follows the same rule every other field on this table
-- already does (`household_members_update_admin`): an Admin edits it. No RLS
-- change is needed — these are new columns on an existing row, not a new
-- write path.

alter table public.household_members
  add column nickname text check (nickname is null or length(trim(nickname)) between 1 and 60),
  add column relationship text check (relationship is null or length(trim(relationship)) between 1 and 60),
  add column occupation text check (occupation is null or length(trim(occupation)) between 1 and 100),
  add column school_or_work_location text check (school_or_work_location is null or length(trim(school_or_work_location)) between 1 and 120),
  add column special_occasion_label text check (special_occasion_label is null or length(trim(special_occasion_label)) between 1 and 80),
  add column special_occasion_date date;

comment on column public.household_members.nickname is
  'What the household actually calls this person, when it differs from their display name.';
comment on column public.household_members.relationship is
  'Free text: "Father", "Mother", "Daughter", "Grandmother" — whatever the household would actually say. Not an enum: the real answers do not fit a fixed list.';
comment on column public.household_members.occupation is
  'What this person does for work or study, in their own words.';
comment on column public.household_members.school_or_work_location is
  'Where they spend the day: a school name, an employer, a campus.';
comment on column public.household_members.special_occasion_label is
  'A date worth remembering besides a birthday — an anniversary, a graduation — paired with special_occasion_date.';
comment on column public.household_members.special_occasion_date is
  'The date special_occasion_label refers to. Null unless the label is set.';

notify pgrst, 'reload schema';
