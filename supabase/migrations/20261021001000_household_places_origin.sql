-- Places a person added themselves and places saved from a HomeTalk
-- suggestion are kept apart, and an added place ranks first (the owner,
-- 2026-10-21: "added place and saved place should be in separate section,
-- added place should get priority").
--
-- `origin` says how a place came into the book: 'added' from the place book's
-- own search, 'suggestion' saved from a HomePlaces answer. A place added by
-- hand always stayed `kind` null (the search keeps no type) while a saved
-- suggestion carries the provider's type, so existing rows are told apart by
-- that. Saving an added place again from a suggestion keeps it 'added'.
--
-- Rollback: alter table public.household_places drop column origin;

alter table public.household_places
  add column if not exists origin text not null default 'suggestion' check (origin in ('added', 'suggestion'));

update public.household_places set origin = 'added' where kind is null and status = 'saved' and origin = 'suggestion';

comment on column public.household_places.origin is
  'How the place came into the place book: added by a person (ranks first) or saved from a HomePlaces suggestion.';

notify pgrst, 'reload schema';
