-- Home address: one optional line before the picked address (flat, house no.,
-- wing). Its own nullable column so the Maps-picked address, place id and
-- coordinates stay exact. Same table, same RLS (adults read, Admins write; a
-- helper or a child reads nothing). Readers accept the column missing.
alter table public.household_addresses
  add column if not exists unit_line text check (unit_line is null or length(trim(unit_line)) between 1 and 120);

comment on column public.household_addresses.unit_line is
  'Optional flat / house number / wing, shown before formatted_address as one combined address.';
