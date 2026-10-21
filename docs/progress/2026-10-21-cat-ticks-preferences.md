# 2026-10-21 — The cat walks and goes back and forth; a tick needs two taps to take back; Add preference on its list

## What and why
Four owner asks from one morning:
- **08-023, the cat.** "Repeat the quotes only when the stored list is finished", "make the cat move in the empty area" and arrows either side of Tell me another.
  - `companion_sayings_for` now offers every saying that suits the child: unheard ones first, then, once all are heard, the one heard longest ago.
  - Telling a saying again moves its `heard_at` forward (`school/sayings.ts`).
  - The migration is `20261021031000_companion_sayings_cycle.sql`. It adds an update policy for `heard_at` only.
  - The cat strolls up and down its column (`wh-cat-wander` in `ui-theme.css`), and stands still under reduced motion.
  - The left arrow goes back the way the child came this visit. The right arrow goes forward again. Tell me another always finds a new line (rule 14: one job each).
  - The controls sit across the card under the cat, so both arrows fit at 360 px.
- **08-024, the lost star.** Asmi showed 1 star and a 1-day streak yesterday and 0 today. The API log shows the cause:

  | Time (UTC, 20 Oct) | Request | What it was |
  |---|---|---|
  | 17:28 | `POST child_goal_checkins` | The tick for 20 Oct |
  | 18:12 | `DELETE …&on_day=eq.2026-10-20` | The done button's second tap (`undoCheckIn`) |

  The delete has no `verified_at=is.null` filter, so it was not a grown-up's "Not yet". The fix:
  - A done tick now takes two taps to take back. The first shows "Tap again to take it back", and that question lapses after 4 s.
  - Asmi's 20 Oct tick was restored on the live project (`child_goal_checkins`, verified at the original time).
- **10-015.** Add preference left the Meals header for the Preferences list's own heading (rule 12: it is still one tap away).

Help: `school` ¶10 (arrows, two taps to take back, the list going round in full) in all eight languages. The `updated` date is 2026-10-21.

## Verified
- Typecheck (web).
- ESLint on the changed web files.
- `test-companion-sayings-rls.mjs` 4/4.
- School, help and i18n unit tests.
- Production build.
- Browser at 360 px and 1280 px on a QA child household:
  - the arrows go back to the first line and forward to the second;
  - Tell me another finds a new line;
  - the cat's `top` moves (91 px after 5.5 s on a 216 px card);
  - one tap on a done tick asks, the question lapses after 4.5 s, and the check-in stays on record;
  - both arrows sit inside the card, with no horizontal scroll;
  - Preferences shows the sliders button and a single Add preference.

## Open
- **The sayings migration is not on the live project yet.** Two `apply_migration` calls were cancelled. Until it lands, the cat keeps the old rule (a heard saying never returns, then reminders only). `markSayingHeard` works either way.

## Cleanup
- QA account `7f949f08-5adc-47a4-b96f-d36ec639c3b1` and household `2c58955e-f091-498a-b66c-854f6e1485dd` are removed after the merge.
