# PERF-11: lazy-loading form bodies — investigated, not shipped

**Outcome:** no code change and no budget change. The story (`docs/plans/2026-10-29-fast-and-secure-at-scale.md`, PERF-11) is **still open**. This note records what was measured and why the cheap version gains nothing, so the next session starts at the real seam.

## Baseline (production build, gzip first-load JS, `scripts/bundle-budget.mjs` logic)

| Route | First-load |
|---|---|
| `/` | 202.4 KB |
| `/calendar` | 203.7 KB |
| `/meals` | 206.3 KB |
| `/groceries` | 201.4 KB |
| `/family` | 201.9 KB |
| `/settings` | 191.3 KB |
| `/health` | 203.2 KB |
| `/bills` | 194.1 KB |
| `/ai` | 231.1 KB |

Shared by every route: 128.8 KB. Build-to-build noise is ±10 bytes to a few hundred bytes on untouched routes (chunk hashes), so only changes above about 1 KB mean anything. The baseline build started a few minutes before the experiment edits, so treat it as approximate.

## What was tried

On a branch, the eight Add forms of `HealthAddMenu` and the three suggestion buttons of `HealthReportPanel` moved behind `import()` (a `LazyForm` wrapper on `useLoadedLater`, plus a trigger-first `LazyFormTrigger` for the report panel, warmed on hover/focus/idle). Typecheck passed.

**Result:** `/health` 203,202 → 203,317 bytes (+115, i.e. noise). Nothing moved, because `app/health/page.tsx` also imports the row controls (`VitalActions`, `RoutineActions`, `RecordActions`, `GoalActions`, `SessionActions`, `EditIssueButton`, `IssueStatusActions`, `AppointmentStatusActions`, `CheckupActions`) from the **same modules** as the Add forms. One static importer keeps a whole module in the entry chunk. The Health forms chunk is about 18.4 KB gz (the plan's 15.2 KB figure still holds roughly).

The same holds for the others: `/meals` imports seven components from `meal-forms.tsx` (39 KB source) and `/calendar` two more; `/bills` imports eight from `finance-forms.tsx` (37 KB source). A split only pays when **every** importer on the route is lazy.

Because it moved no bytes and was untested in a browser, the change was reverted rather than shipped. No `perf/bundle-budget.json` ratchet was made.

## What the real fix is

For each form module (health ×8, `meal-forms`, `finance-forms`): move the `<Sheet>` + `<form>` body of every Add/Edit component into its own `*-sheet.tsx` file (as `AddRecipeSheet` already is for meals), keeping in the original file only the trigger pill, the open state and the one-click archive/remove actions. The trigger loads the sheet with `useLoadedLater`/`import()` on hover, focus or idle, and mounts it open on first tap. Row `*Actions` then import only small trigger files, so the form code leaves the entry chunk. Expected gain: about 18 KB gz on `/health`, 10–11 KB each on `/meals` and `/bills`.

Needs per form: a browser add + edit check at 360 px and desktop, as the story's acceptance says. Roughly 25 forms; best done as one PR per module so each can be checked.

## Verified
- `npx tsc --noEmit -p apps/web` clean during the experiment (reverted afterwards).
- `npm run budget:bundle` green on the unchanged tree.

## Open
- PERF-11 stays Not Started in the plan (not edited here).
