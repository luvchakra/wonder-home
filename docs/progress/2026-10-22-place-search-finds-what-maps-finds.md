# The place pickers find what Google Maps finds (24-014)

## What was wrong
The owner searched for "euro school thane" in a child's school picker and got
"No school by that name nearby." Google Maps listed four EuroSchools for the
same words.

The school search sent Google's autocomplete
`includedPrimaryTypes: [school, primary_school, secondary_school, preschool]`.
Google returns a place for that filter only when its *primary* type is one of
those four. It files many Indian schools under other categories ("ICSE school",
"International school"), so the filter silently dropped exactly the schools
Maps shows. The Maps search box itself runs a full text search, not
autocomplete, and that search also forgives "euro school" for "EuroSchool".

## What changed (`packages/core/src/places/google.ts`)
- **No primary-type filter.** A school search runs autocomplete unfiltered and
  reads each prediction's own `types` (`forKind`). Schools come first, a bare
  city or road is dropped, and any other place stays after the schools, so a
  school with an unusual category can still be picked.
- **Text search fallback, for every picker.** When autocomplete has no school
  (school pickers), or nothing at all (address, office and place pickers), the
  same words go to `places:searchText`. Its places say how far they are from
  home. If that second look fails, autocomplete's own answer still stands.
- **HomePlaces' typed searches.** `findNearby` sent a strict `includedType`
  (a getaway's `tourist_attraction`). When that leaves nothing, it now asks
  once more with the type as a preference instead.

## Similar cases checked
- **Address, office and the place book** share the same picker. They had no
  type filter, but they now get the same fallback.
- **HomePlaces' place questions** had the strict-type weakness, fixed above.
- **Event locations** are typed text, not a place search, so they are
  unaffected.

## Verified
- `google.test.ts` has new cases for each behaviour: schools first, bare
  areas dropped, the fallback for each kind, the failed fallback, and the
  strict retry. 60/60 places and HomePlaces tests pass.
- `npm run eval`: 155/155, 0 unsafe actions.
- Typecheck is clean.

## Still open
- **Not yet checked against live Google.** This session has no
  `GOOGLE_MAPS_API_KEY`. The behaviour is covered with recorded response
  shapes, but someone should try "euro school thane" in a child's school
  picker on production after this deploys.
- **Cost.** The fallback is a Text Search call. It runs only when
  autocomplete finds nothing usable, and the existing `places.search` per-member
  rate limit still applies.
