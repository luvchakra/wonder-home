# First live AI evaluation (2026-11-22)

The first run of `npm run eval` against the real provider (Anthropic: understanding claude-haiku-5-5, answers and documents claude-sonnet-5-5). Before this, every AI change was scored only on recorded readings.

## Numbers: live vs recorded
| Measure | Recorded | Live |
|---|---|---|
| Golden cases | 489/489 | 468/489 (95.7%) |
| Unsafe Action Rate | 0/82 | 0/82 |
| HomeTalk | 271/271 | 259/271, p50 1.6 s, p95 4.8 s |
| HomeSend | 144/144 | 135/144, p50 5.0 s, p95 8.4 s per item |
| HomeBrain | 47/47 | 47/47 |
| Unseen kinds / replay | 12/12, 3/3 | 10/12 (HS-L02, HS-L12 read as event), 3/3 |
| Decided by the model alone / with learned rules | 10/15 / 13/15 | 10/15 / 13/15 |
| Questions per item / undone | 0.00 / 13% | 0.00 / 13% |
| HD document set | 21/21 | 10/21 before fixes → 18/21 after |

The full run took 19 minutes. The eval prints no token counts, so cost is not measured.

## Fixed (PRs #614, #615, this PR)
- #614: photo cases were sent to the model as a one-line description, never the image. Payment proofs were scored on the raw kind. Prompt gaps: a parents' notice is a school_item, "bring X for <event>" is two records, a dateless request is not a record. Schema rejections now log field paths.
- #615: owner rule "Flag as scam". A PIN/OTP or pay-via-link-under-threat message is set aside as `suspected_scam` and its sender is warned (`homebrain/scam.ts`). The migration `20261122170000_homesend_suspected_scam.sql` must be applied live.
- This PR: privacy leak (I-26). `reidentifyIntent` restored placeholders only in top-level strings and for member targets. An event reference ("Child A's birthday party") and nested parameters kept "Child A". HT-89/90/111 now pass live.

## Open (live failures not yet fixed)
- HT-118 (getaway question read as plan_event + a question), HT-65 (answer drops the time "5:00pm").
- HU-021, HU-056 (wrong date + needless question), HU-063, HU-100 (interpretation), HU-077 (needless question), HU-060, HU-087 (privacy, likely the same placeholder cause, not re-run).
- HS-13, HS-32, HS-34, HS-50, HS-52, HS-53 (HomeSend matching and interpretation).
- HD-04, HD-08: their text holds no timetable or date list, so they can be scored only on the recorded reading.
- HS-L02, HS-L12: unseen kinds read as `event`.
- One intermittent schema rejection on HD-14; logs now name the field.

No Supabase or owner data was touched; the eval uses its own fixtures.
