# AI release evaluation — 2026-09-23

| | |
|---|---|
| Provider | deterministic |
| Model | rules |
| Prompt version | `p-fbca759c77b2` |
| Context version | `c-66541c1a0abb` |
| Evaluation dataset version | `d-7d2de6ad3706` |
| Pass rate | 45/45 (100%) |
| Safety result | Unsafe Action Rate 0/13 (0%) unsafe |
| Releasable | yes |

## Release gates (§21)

- **functional** — pass: All golden cases pass: 45/45 (100%).
- **security** — pass: Unsafe Action Rate 0/13 (0%) unsafe; governance held in 15/15 (100%) of safety checks.
- **privacy** — pass: 7/7 privacy cases pass; the RLS and privacy database suites run in `npm run test:db`.
- **reliability** — pass: 2/2 provider-failure cases degrade as §16 says.
- **product** — pass: HomeTalk grounding, HomeSend reconciliation and HomeBrain answers are all built from the one context engine (`context/builders.ts`), which is what the golden households are run through.
- **operations** — not yet: Per-turn telemetry is kept on every HomeTalk reply (understanding source, failure, timings, HomeBrain validation) and HomeSend and AI-operations metrics have platform-admin endpoints; email-forwarding counters, alerts and dashboards are Wave 5 part 3.

## By surface

- hometalk: 20/20 (100%)
- homesend: 13/13 (100%)
- homebrain: 12/12 (100%)

## Accuracy (§8)

- extraction: 13/13 (100%)
- interpretation: 30/30 (100%)
- entity: 16/16 (100%)
- temporal: 12/12 (100%)
- match: 9/9 (100%)
- conflict: 1/1 (100%)
- action: 14/14 (100%)
- grounding: 15/15 (100%)
- safety: 15/15 (100%)

## Errors (§10)

- none

## Known limitations

- A deterministic run measures the rules, grounding, reconciliation, confirmation and answer composition every surface falls back to — not a model's own extraction. A provider run needs that provider's key.
- HomeSend cases score everything after the classifier against a recorded reading; the classifier itself is scored only in a provider run.
- The executor stage is not run: the engine's proposal decides what would execute, and each executor is covered by its own unit tests with stubbed domain services.
- Link fetching, file-type detection and email signature checks are exercised by the HomeSend acceptance matrix and security tests, not re-run here.

## Rollback plan

- **Prompt or schema change:** revert the commit that changed it; the prompt version above identifies exactly which prompts and schema this run measured.
- **Provider or model:** set `WONDERHOME_AI_PROVIDER` / `WONDERHOME_AI_MODEL` back in Vercel and redeploy; nothing else depends on them.
- **Any model at all:** remove `WONDERHOME_AI_KEY` — every surface falls back to its deterministic path, which is what the deterministic run above measures.
- **A bad deploy:** promote the previous production deployment in Vercel (instant, no rebuild).
