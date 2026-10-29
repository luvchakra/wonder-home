# Advisor gate: parse flat lints, fail on a vacuous pass

**Bug.** Run 40887617901 of "Supabase advisors" printed "0 known WARN findings … No new advisor findings" while the live project had 26 WARNs and 154 unused-index INFOs. The Management API returns one flat lint per finding (`detail` on the lint, no `findings[]`); `summarize` read only `lint.findings`, so every WARN vanished and the INFO count read 0.

**Fix** (`scripts/advisor-gate.mjs`, `scripts/advisor-gate.test.mjs`):
- `lintsOf` accepts `{lints}`, `{result:{lints}}`, `{result:[…]}` or a bare array.
- `summarize` accepts a flat lint (itself the finding) or a grouped one (`findings[]`, detail falling back to the lint's). Keys stay `name|detail-prefix`, so `perf/advisor-baseline.json` is unchanged (it has no `pg_net` entry).
- A 200 that parses to zero lints while the baseline is non-empty exits 1, printing only the response's top-level keys and the first lint's keys.

**Verified.** `node --test scripts/advisor-gate.test.mjs` (6 pass: every shape, flat/grouped INFO counts, the empty-parse message); eslint clean. Not run against the live API (no token in the cloud container).

**Open.** After merge, re-run "Supabase advisors" from the Actions tab. Expected: 26 WARNs matched and INFO unused_index 154; if it fails, the log now names the response keys.
