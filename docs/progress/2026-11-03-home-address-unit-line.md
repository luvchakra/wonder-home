# Home address: flat / house / wing line

Owner request: an optional line before the Maps-picked home address (flat, house no., wing), shown with it as one address.

**Done.** New nullable `household_addresses.unit_line` (≤120 chars; migration `20261103120000_household_address_unit_line.sql`). `formatted_address`, place id and coordinates are untouched, so "Open in Google Maps" and the map stay exact. `packages/core/src/household/address.ts` holds `cleanUnitLine`, `combineAddress`/`fullAddress` (`<unit>, <maps address>`; empty unit → maps address only; whitespace and stray commas trimmed). Readers that print the address use `fullAddress`: Settings card map alt text, Manage Household meta, HomePlaces "Our places" home, HomeTalk/AMAF memory, context builder. Editing shows both fields; the unit line alone can change without re-reading the place; Remove address deletes the row, so both go. Words in all eight languages (`address.unit`, `address.unitHint`).

**Safe in either order.** Load and save fall back to the old columns on `42703`/`PGRST204`, so the code works before the migration lands.

**Privacy.** Same table, RLS unchanged: adults read, Admins write, helpers and children read nothing.

**Verified.** `address.test.ts` (combine, round trip, line-only change, pre-migration fallback), related core tests, `tsc` for `apps/web` and `packages/core`. Not run here: `ui-check` at 360 px and `verify:live` (no `.env.local` in this container).

**Open.** Apply the migration live after the deploy is READY. Register the field in the Settings deep-search registry once that PR merges (not on `main` yet). Help guide needed no change: it only says where the address is edited.
