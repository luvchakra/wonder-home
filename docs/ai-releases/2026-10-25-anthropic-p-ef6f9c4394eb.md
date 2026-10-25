# AI release evaluation — 2026-10-25

| | |
|---|---|
| Provider | anthropic |
| Model | understand claude-haiku-5-5, answer claude-sonnet-5-5, documents claude-opus-5 |
| Prompt version | `p-ef6f9c4394eb` |
| Context version | `c-4b8b34b17735` |
| Evaluation dataset version | `d-aa113dee8362` |
| Pass rate | 170/171 (99.4%) |
| Safety result | Unsafe Action Rate 0/20 (0%) unsafe |
| Releasable | **no** |

## Release gates (§21)

- **functional** — **FAIL**: Failing: HB-03 (provider_failure).
- **security** — pass: Unsafe Action Rate 0/20 (0%) unsafe; governance held in 55/55 (100%) of safety checks.
- **privacy** — **FAIL**: 23/24 privacy cases pass; the RLS and privacy database suites run in `npm run test:db`.
- **reliability** — pass: 2/2 provider-failure cases degrade as §16 says; 1 live provider failure(s) during this run.
- **product** — pass: HomeTalk grounding, HomeSend reconciliation and HomeBrain answers are all built from the one context engine (`context/builders.ts`), which is what the golden households are run through.
- **understanding** — pass: HomeSend understood 28/28 (100%) of its cases end to end and 28/28 (100%) in the right category; the bar is more than 95%.
- **voice** — pass: 25/25 Gemini tool sentences and 8/8 Alexa phrases read as the promised action; 30/30 actions placed in the capability matrix; 17/17 app-only actions refused over voice. A real Gemini Live and Alexa run need a person's account and are not decided here.
- **operations** — not yet: Telemetry exists: per-turn reply metadata, correction evidence (`ai_corrections`) and email forwarding events (`homesend_email_events`). Platform-admin JSON endpoints serve it: HomeSend and email monitoring, AI operations, and AI quality. The §14 alert conditions are evaluated there and logged at error level. What is missing: a rendered dashboard, and alert delivery to a person (no paging integration is configured).

## By surface

- hometalk: 129/129 (100%) · p50 2062ms · p95 5852ms · p99 6420ms (129 cases)
- homesend: 28/28 (100%) · p50 8885ms · p95 11028ms · p99 11188ms (28 cases)
- homebrain: 13/14 (92.9%) · p50 1636ms · p95 2947ms · p99 2947ms (14 cases)

## Accuracy (§8)

- extraction: 28/28 (100%)
- interpretation: 122/122 (100%)
- entity: 24/24 (100%)
- temporal: 39/39 (100%)
- match: 10/10 (100%)
- conflict: 1/1 (100%)
- action: 71/71 (100%)
- grounding: 117/117 (100%)
- safety: 55/55 (100%)

## Errors (§10)

- provider_failure: 1

## Failing cases

- HB-03: provider_failure

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
