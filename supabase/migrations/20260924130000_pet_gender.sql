-- A pet can have a gender, the same way a household member can
-- (20260923100000 added `household_members.gender`).
--
-- Asked for by name: "both for humans and animals, add a field gender in
-- their profiles". Open text for the same reason the member column is: the
-- form offers a short list (including spayed/neutered, which a vet or a
-- sitter asks about) and "add another" (CLAUDE.md rule 20), so a fixed check
-- here would refuse a true answer. Optional, and readable and writable
-- exactly as every other column on `pets` already is — `pets` RLS covers the
-- whole row, so no policy changes.

alter table public.pets
  add column if not exists gender text
    check (gender is null or length(trim(gender)) between 1 and 40);

comment on column public.pets.gender is
  'How the household describes this pet''s gender, in its own words (for example "Female (spayed)"). Null when not recorded.';
