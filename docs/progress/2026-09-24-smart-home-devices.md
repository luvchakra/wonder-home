# Optional device connectors (story 17-008)

**Date:** 2026-09-24 · **Kind:** story · **Module:** 17 External Integrations (now complete)

## What was done

Smart-home devices now come in through the same connector contract as school,
calendar, email and commerce (17-001). As before, a household with no devices
gets every outcome, reasoned from schedule and history.

- **One canonical payload** (`home/device-connector.ts`). Every adapter
  produces a `DevicePayload`: the device id and name, one of `SIGNAL_KINDS`,
  a value, a time and an optional confidence. `translateDeviceReadings` gives
  a reason for every record it skips. A record is skipped for:
  - no device id;
  - a kind WonderHome does not use;
  - no usable value;
  - an unbelievable time;
  - being too old to change anything (each kind has its own freshness window
    in `signals.ts`);
  - being a duplicate within the batch.

  A provider's confidence is capped at 0.95, because a device reports and
  never confirms.
- **A device is stated, never inferred.** The first time a provider reports a
  device, it becomes a `home_device_links` row linked to nothing. An Admin
  says which appliance it is, or ignores it. Only readings from a linked,
  not-ignored device become `home_device_signals`. The maintenance agenda
  (13-002/13-008) already reads those signals, so a linked device can bring a
  service forward.
- **Reconciliation by provider identity** within the household:
  - The household's link survives a provider renaming the device.
  - A re-sync skips readings it has already recorded, through
    `integration_events`.
  - The new unique index `(household_id, device_key, kind, observed_at)` backs
    this up in the database.
  - Readings from devices nobody has linked yet, or that are ignored, are
    deliberately not logged. That way, linking a device later still records
    whatever of it is fresh.
- **Outages** (`home/device-sync.ts`). Following the other syncs:
  - The provider is asked first. A failure changes the connection's health
    and nothing else.
  - A rate limit's own `retryAfterSeconds` is carried back to the caller.
  - A partial sync keeps its readings and marks the connection degraded.
- **Two clients, on purpose** (`home/device-repository.ts`):
  - The household's decisions go through the Admin's session. RLS and a
    column grant allow only `asset_id` and `ignored` to change.
  - Devices and readings are written by the service role, only from the sync
    route, after it has checked the caller is an Admin. Evidence a member
    could write is not evidence.
- **Retention.** Device readings join the 60-day integration-events class.
  The Privacy Centre's wording says so.
- **API:**
  - `POST /households/{id}/integrations/smart-home/sync` requires the Admin
    role and `integrations.deep`. It answers 409 until a provider is live.
  - `GET /households/{id}/devices` returns the household's devices.
  - `PATCH /households/{id}/devices/{linkId}` sets the appliance or the
    ignored flag.
  - All three are in the OpenAPI document.
- **UI.** Integrations gains a Devices section when a smart-home provider is
  connected or has reported devices:
  - Each row has a tinted tile, the device's full name (wrapped, never cut)
    and one line saying whether its readings count and when it last reported.
  - It has two icon actions. "Which appliance" is a picker of the household's
    appliances; it can add a new one inline (name and kind), so a household
    is never stuck (rule 20). The other action is ignore / use again (rule 12;
    a device goes when its provider is disconnected).

### Fixed along the way

The browser run surfaced React's warning "An async function with
useActionState was called outside of a transition". Confirm dialogs called
their action by hand, so `pending` never turned on and a confirm could be
double-tapped. The same pattern was in 16 components: the new device controls,
backup services, remove member, retire pet, responsibilities, school items,
helpers, finance, and eight health forms. Each call now runs inside
`startTransition`. After the change, the browser run logged no warnings.

## Verified

- 21 unit tests in `home/device-connector.test.ts`. They cover translation,
  keys, planning, and the sync's order (failure, rate limit, partial, wrong
  kind, not live).
- Home database suite: 31 tests, 5 of them new:
  - Devices are seen by the household and created only by a sync.
  - An Admin changes only the appliance and the ignored flag; other members
    and outsiders change nothing.
  - A device cannot be linked to another household's appliance.
  - The same reading is recorded once.
  - Disconnecting takes the devices with it.
- Tenant isolation: 9 tests. Migration lint passed.
- Migration `20260927170000_home_device_links` was applied to the live
  project. `verify:live` passed 177/177, including the new table.
- Browser QA on the real project, at 360px and desktop, with no horizontal
  overflow:
  - Two seeded devices were listed with their full names.
  - The door sensor was linked to a new "Front door" fixture added inline
    from the picker.
  - The washer was ignored and then used again.
  - `GET /devices` agreed with the screen.
  - A PATCH to an unknown device returned 404.
- The sync route returns 404 under `next dev` for every
  `integrations/*/sync` route, including the long-standing ones. They are
  present in the production build's route manifest, and the gate's
  production build and e2e run exercise them.

## Still open

- No device provider is live. Going live needs credentials, a consent flow,
  a real adapter registered as `smart_home:<provider>`, and integration tests.
  See `CLAUDE.md`, "External providers".
- Syncing is on demand. Scheduling it through the job queue is future work,
  as for the other connectors.

## Where

- `packages/core/src/home/device-connector.ts`, `device-sync.ts`,
  `device-repository.ts`
- `supabase/migrations/20260927170000_home_device_links.sql`
- `apps/web/app/(auth)/device-actions.ts`,
  `apps/web/app/_components/device-link-controls.tsx`, and the Devices
  section of `apps/web/app/household/integrations/page.tsx`
- The three routes under `apps/web/app/api/v1/households/[householdId]/`

## Test data cleanup

Recorded after the merge, below.
