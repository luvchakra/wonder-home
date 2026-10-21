# Home's date card: the day's weather and something to watch; Kids & School actions under the child picker

2026-10-21 · stories 17-009 and 08-025

## What was done

**Home's date card (17-009).** The owner asked for the date pill at the top of Home to be "longer", with "more weather info", "any new movies released, any good family stuff to watch on ott", aligned nicely and "something new on every load".

- `apps/web/app/_components/today-card.tsx` replaces the pill. It streams behind the greeting through `<Suspense>`; the fallback is the old day-and-household line, so Home never waits on a provider.
- Weather, where it is on (`householdWeather`), comes from `home/today-weather.ts`'s `todayWeather` (pure, tested). It shows the current temperature, the day's high and low on the household's clock, and the first hour still ahead today with a 40% or higher chance of rain, else that the day looks dry. Imperial households see °F. Neither the weather service nor its gates changed. CLAUDE.md's weather paragraph now names this one readout.
- Films come from `home/screen-picks.ts`, a provider-neutral port with one adapter, TMDB:
  - now playing in the household's region;
  - family-genre films and shows on subscription streaming there;
  - adult titles dropped;
  - lists kept per server for six hours (platform data, never household data), and the last good lists kept when the provider fails;
  - `pickFew` takes a different pair each load.

  Each pick opens its TMDB page, where where-to-watch is listed, and TMDB's attribution line is shown beside the picks.
- Without `TMDB_API_KEY` nothing about films is shown, never a placeholder. CSP `img-src` allows `https://image.tmdb.org`.
- Words: the `today.*` area in all eight languages. Help: Today and Home ¶7 in all eight.

**Kids & School row (08-025).** The owner asked: "bring this row in between these lines, these should specific to each child". Add homework and Connect school left the page header for a row between the child picker and the tabs. Add homework opens with the picked child already chosen (`defaultChildId`). Connect school still goes to Integrations, because a school portal is connected for the household, not per child. Help (Kids & School ¶1) is updated in all eight languages.

## Verified

- Unit tests: `today-weather.test.ts` (2) and `screen-picks.test.ts` (4) pass.
- Typecheck, lint on the changed files and the production build are clean.
- Browser, production build, QA household with Weather on (Mumbai):
  - Home at 360px and 1280px shows 32°, high 36°, low 30° and "dry".
  - The date stays on one line, and the script accent no longer overlaps the card on desktop.
  - No horizontal scroll.
- Kids & School at 360px and 1280px:
  - The row sits between the pills and the tabs.
  - Picking the second child, then Add homework, shows that child in For.
  - No horizontal scroll.

## Open / needs a person

- Create a TMDB account and set `TMDB_API_KEY` (a v4 read token or a v3 key) in Vercel. Until then the card shows weather only.

## Where

`apps/web/app/_components/today-card.tsx`, `apps/web/app/_screens/home-dashboard.tsx`, `packages/core/src/home/{today-weather,screen-picks}.ts`, `apps/web/app/school/page.tsx`, `apps/web/app/_components/school-forms.tsx`.
