# Token economy: a smaller CLAUDE.md, narrower reads, a UI check script

## What was done and why
Every turn re-reads CLAUDE.md, the conversation so far and every tool result, so cost is roughly context size × turns. This pass cut the always-loaded contract and changed how a session reads the repo.

- **CLAUDE.md shrunk by 62%.** Every rule is kept. Rule numbers 1–23 and every heading that code cites (about 200 files cite CLAUDE.md, many by rule number) are unchanged. The long reference detail moved verbatim into `docs/`, with a short pointer left under the same heading:
  - `docs/agent-platform.md`: HomeTalk, HomeBrain, HomeSend, HomePlaces, voice, evaluation, production hardening, the agent pipeline.
  - `docs/external-providers.md`: weather, films, careers, billing, payments, WhatsApp, partner keys.
  - `docs/notifications.md`: module 23 (smart notifications).
  - `docs/design-brand.md`: brand sheet and palette hexes.
  - `docs/hosting.md`: Vercel team and project table.
- **Token economy section added** to CLAUDE.md, placed under *Mandatory startup* so every-session rules sit at the top.
- **Mandatory startup no longer reads whole large files.** The contract used to list about 299 KB of whole-file reads, including `tracking/PROGRESS.md` (129 KB), `design/DESIGN-NOTES.md` (73 KB) and `design/PRODUCT-DIRECTION-v4-talk-to-wonderhome.md` (50 KB). The same documents are now grepped for the story or screen at hand.
- **`scripts/ui-check.mjs` added.** It opens a path at a chosen width, optionally clicks by `role:name`, prints each matched element's text and box one per line, flags horizontal overflow, and can write a 1x JPEG at quality 60 cropped to the matches.

## Measurements

### CLAUDE.md (always loaded)
| | Before | After | Change |
|---|---|---|---|
| Bytes | 90,127 | 34,291 | −62.0% |
| Words | 13,387 | 5,014 | −62.5% |
| Lines | 1,244 | 220 | −82.3% |
| Tokens, estimated (bytes ÷ 4) | ≈ 22,500 | ≈ 8,600 | ≈ −13,900 per turn |

`apps/web/AGENTS.md` (678 bytes, loaded through `apps/web/CLAUDE.md`) is unchanged. No other CLAUDE.md or AGENTS.md is loaded.

### This session's transcript
The only transcript on this machine is this session's, with 6 assistant turns:
- Input 12, cache read 427,614, cache creation 183,795, output 4,791. Total context tokens: about 611k.
- Average context about 101,900 tokens per turn (max 105,844). CLAUDE.md was about 22% of that, by the estimate above.
- At the new size the same six turns would carry about 84k fewer context tokens, about 14% of this session's total.
- The transcript records one tool result (241 characters), so per-tool sink data is not available for this session. The largest files a session can be pointed at are listed by size in CLAUDE.md's *Read narrowly* bullet.

### Startup reads (mandated files, read whole, bytes)
| Set | Before | After |
|---|---|---|
| Non-UI session: steps 2, 3, 4, 6 | ≈ 198,600 (≈ 50k tokens) | ≈ 11,700 whole (TECH-STACK, IMPLEMENTATION-ORDER, API, SECURITY) plus targeted greps |
| UI session: adds steps 5 and 6 | ≈ 299,300 (≈ 75k tokens) | the same plus greps of UI-UX, DESIGN-NOTES and PRODUCT-DIRECTION |

### Largest files (now flagged "never read whole")
`docs/PROGRESS.md` 236 KB · `tracking/PROGRESS.md` 129 KB · `design/DESIGN-NOTES.md` 73 KB · `design/PRODUCT-DIRECTION-v4-talk-to-wonderhome.md` 50 KB · `package-lock.json` 365 KB · locale files under `packages/core/src/i18n/messages/areas/` up to 254 KB · `apps/web/app/_lib/hometalk-turn.ts` 123 KB · `supabase/migrations/20261020231000_companion_sayings.sql` 174 KB · `docs/testing/HOMETALK-HOMEBRAIN-INTEGRATION-TEST-CASES.md` 87 KB · design mockup PNGs about 2 MB each.

## Verification
- **No rule lost.** A script compared the 561 backticked tokens in the old CLAUDE.md with the new CLAUDE.md plus the five moved `docs/` files. Result: 0 missing (after restoring six that had been trimmed: `/help#release-notes`, `api-deployments-free-per-day`, `created_at`, `docs/progress/2026-10-19-performance-pass.md`, `mcp__Supabase__execute_sql`, and the full `qa-test-user.mjs delete` command).
- **Headings cited by code.** All 23 cited section headings still exist. Design rules are numbered 1–23 in order.
- **`scripts/ui-check.mjs`** was run against a local static page at 360 px:
  - it printed each heading, button and textbox with text and box, and clicked a button and found the text it revealed;
  - it reported `scrollWidth=536` against a 360 px viewport as `HORIZONTAL OVERFLOW`;
  - it wrote a 344×252 JPEG of 10,311 bytes;
  - it exited 2 when a `--find` matched nothing.
- **Fast checks** are listed in the PR description.

## Deliberate changes
- **Startup reads narrowed.** The same documents are still the sources, but they are grepped for the relevant story, screen or topic rather than read whole.
- **History removed, rules kept.** Anecdotes and rationale asides were cut, for example "this bit Househelper", the PR #191 deploy-cap incident, the owner's Health "Unit" box quote, the 17 ms RLS timing, and the three-migrations story. Dates and ticket IDs stay in brackets.
- **New rules:** the Token economy section and the "never read whole" list.

## Open
- **Vercel preview for this branch.** `vercel.json`'s `git.deploymentEnabled` turns automatic deploys off only for `claude/**` and `feature/**`, so a push to a `ccr-*` branch creates one deployment. The ignore script also builds on `docs/` changes, since `docs/` is not in its docs-only list. Adding `ccr-*` to the disabled list, and `docs/` to the ignore list, would save slots on token-economy PRs like this one. That is a deploy-policy change, so it is left for the owner.
- **Connected MCP servers add per-turn context.** The Vercel server alone exposes 200+ tools, and the Supabase and GitHub servers add more. Their schemas are not in CLAUDE.md, but they are part of each turn's context. Disconnecting unused servers for a session is the largest lever after this change, and it sits outside the repo.
- **No QA accounts, households or live rows were created** in this session, so there is nothing to clean up.

## Where it lives
- `CLAUDE.md`: *Mandatory startup*, *Token economy*, and the pointer sections.
- `docs/agent-platform.md`, `docs/external-providers.md`, `docs/notifications.md`, `docs/design-brand.md`, `docs/hosting.md`.
- `scripts/ui-check.mjs`.
