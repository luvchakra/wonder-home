# Weather as a planning signal (story 17-007 Done)

**Date:** 2026-09-24 · **Module:** 17 External Integrations · **Story:** 17-007

## What was done

Story 13-005 had built the weather *port* (`home/weather.ts`: `WeatherProvider`,
`dryingConditions`, `planOutdoorWork`, `checkWeatherAccess`) with a fixture
and no provider. `homeAgenda` never received a forecast, so laundry was always
planned under "ordinary conditions". This story makes weather real, end to
end.

- **Provider** (`packages/core/src/home/open-meteo.ts`). Open-Meteo sits
  behind the same port, so nothing downstream knows which service answered.
  - Hourly rain chance, humidity and temperature are folded into three-hour
    windows. The wettest hour sets a window's rain chance; empty hours are
    skipped, and a window with no readings is dropped rather than reported
    as dry.
  - `searchPlaces` uses Open-Meteo geocoding and returns picked labels such as
    "Pune, Maharashtra, India".
  - Every failure becomes a `ConnectorError` (`rate_limited` with
    Retry-After, `unavailable`, `timeout`, `unauthorized`, `malformed`,
    `not_configured`). The provider's own error text is never passed on.
  - Each request has a 5-second timeout.
  - With `OPEN_METEO_API_KEY` set, every request goes to the customer
    endpoints.
- **What leaves WonderHome.** Only two coordinates, rounded to two decimals
  (about 1.1 km), in both the request and the database: `numeric(5,2)` and
  `numeric(6,2)`, so a finer value cannot be stored. No name, address or
  member is ever sent.
- **Storage** (migration `20260927110000_weather_locations.sql`, **applied
  live**). One row per household holds the label, the rounded coordinates,
  who chose it and when (consent), and the last forecast with its fetch time.
  - RLS: every member reads; only an Admin inserts, updates or deletes; the
    insert must record the Admin as the chooser.
  - Checks: the forecast is a JSON array, and a forecast always has a fetch
    time.
- **Service** (`packages/core/src/home/weather-service.ts`).
  - `householdWeather` is the one way in. Its gates run in order: a
    provider, then an area, then the `home.weather` entitlement. Each answers
    `off` before anything leaves WonderHome.
  - It uses a forecast under an hour old as is. Otherwise it fetches, stores
    the result on the row with the server client, and records the sync
    outcome on the `integrations` row.
  - On an outage it records the failure on the connection only. The last
    forecast keeps serving (marked stale) for up to 6 hours, after which the
    answer is `unavailable` and plans assume ordinary weather. It never
    throws.
  - `setWeatherLocation` and `removeWeatherLocation` handle choosing an area
    and switching weather off (rule 12). Both are audited:
    `integration.connected`, and `integration.disconnected`, which moves out
    of `NOT_YET_BUILT`. This comes from the new generic
    `disconnectIntegration`, the contract's `revoke`.
- **Planning.** `homeAgenda` now plans under the household's own weather,
  unless a caller passes a forecast. It returns `weather: { status, place,
  drying }`, so the API route, the agent pipeline (`gather-assessments`) and
  the screens all plan under the same answer.
- **Screens.**
  - Integrations has a Weather section for Admins, with the privacy promise
    in plain words:
    - find your town, pick one of the places found, "Use this area";
    - "Change area" and "Switch weather off", which asks you to confirm.
  - A plan without weather says "not part of your plan". The page asks the
    entitlement itself, because with no area chosen the service answers "no
    area" before it consults the plan.
  - Home & Upkeep shows one weather card, and only when the weather changes
    a decision (washing won't dry, or drying is slow). A fine day, an outage
    or weather switched off say nothing.
- **Rate limit.** Area searches are limited per member by the new
  `weather.search` bucket (30 per 10 minutes). Each search is an outbound
  call.
- **OpenAPI.** The home agenda description now covers `weather`.

## Verified

- `npm run typecheck` and `npm run lint` are clean.
- Unit tests: 2494/2494. New: `open-meteo.test.ts` (18: window folding, what
  leaves, key routing, every error mapping, no leaked provider text, env
  gate) and `weather-service.test.ts` (13: gate order, fresh cache,
  fetch-store-mark-connected, stale fallback that never touches the forecast
  row, unavailable, foreign errors sanitised, parsing).
- `test:db`: 457/457 (home suite 22/22, with 7 new weather-area RLS tests (member
  read, outsider isolation, rounding enforced by the column type, non-Admin
  cannot change or remove, chooser must be self, forecast shape)).
- `npm run eval`: 46/46 with 0/14 unsafe.
- `npm run verify:live`: 159/159. The new table and column are checked.
- Live against the real Open-Meteo, through the dev server with
  `WONDERHOME_WEATHER_PROVIDER=open-meteo`:
  - "Pune" found six places. Choosing "Pune, Maharashtra, India" stored
    18.52 / 73.86 and a 17-window forecast, and marked the integration
    `connected`.
  - The page said "Rain is likely (91% chance), so washing will not dry
    outside."
  - Home & Upkeep showed the weather card at 360px and desktop, with no
    horizontal overflow.
  - `GET /api/v1/households/{id}/home` returned `weather.status: "ready"`.
  - Switching weather off removed the area and the connection. Both
    `integration.connected` and `integration.disconnected` are in the audit
    trail.
  - The plan without weather (free) showed the not-in-plan sentence and no
    search.
- Found and fixed during QA: the page offered the area search to a plan
  without weather, because the service answers "no area" before it
  consults the plan.

## Needs a person

- **Production is inert.** Open-Meteo's free API is for non-commercial use.
  Switching weather on for real households means setting
  `WONDERHOME_WEATHER_PROVIDER=open-meteo` on the deployment. Whether that
  also needs a paid `OPEN_METEO_API_KEY` is a decision about Open-Meteo's
  terms, so it was left for a person.
- **Outdoor work.** `planOutdoorWork` (from 13-005) is ready, but no outdoor
  job carries a planned time yet, so only laundry and drying use the
  forecast today.

## Test data cleanup

Ran after PR #137 merged:
- Deleted the QA account `a2df560f-7f7e-4036-af13-bfc68d027b28` with
  `qa-test-user.mjs`.
- Deleted its household `ddccd474-c437-4a8e-a926-476a39a5056f` ("Weather QA
  Home"): audit rows first, then the household. That cascades its weather
  area, integration row and the Pro subscription row added by hand for QA.
- Deleted this session's rate-limit counters.
- Deleted the local screenshots and QA scripts.

SQL counts for the household, weather area, integrations, subscription,
audit, counters and stored files are all 0.
