# Token habits: what this session's cost taught (2026-10-25)

The owner asked which habits in `CLAUDE.md` would cut token use and cost
most. The answer came from what one long session (about ten unrelated
requests, five PRs) actually spent turns on.

## Where the turns went

- **PR noise.** Each PR woke the session about six times (subscription
  created, two Vercel bot edits, check suite completed, merged). Every wake
  re-read the whole, growing conversation to say "nothing to do".
- **One long session.** Unrelated requests kept piling onto one
  conversation, so every later turn re-read all the earlier ones.
- **A large fixed read.** `CLAUDE.md` was 35 KB (about 9,000 tokens) on every
  turn; almost half of it (design principles, the agent platform summary)
  only matters for UI or HomeTalk/HomeSend work.
- **Throwaway scripts.** A one-case live run, an answer print and a one-line
  read were each rebuilt as scratch scripts, several times.
- **The time rule.** A `date` call on every reply, wakes included.

## What changed

- `CLAUDE.md` "Token economy" now says: one request per session; don't
  subscribe to PR activity when auto-merge is on; ask before investigating
  an ambiguous request; the smallest model that fits; delegate wide searches;
  live-model runs targeted first, the full run once per PR, last; and the
  time is converted from one the turn already has before running `date`.
- `CLAUDE.md` 35 KB → about 23 KB. Moved verbatim, with their invariants kept
  in place: the design principles and brand (now `docs/design-principles.md`;
  the 23 numbered titles stay, since code cites "rule N"), and the summary
  rules for the agent platform, external providers and notifications (each
  into its existing detail doc). Every heading cited from code is kept.
- `npm run eval -- --cases HT-117,HS-24 --runs 3` and
  `npm run eval -- --utterance "…"` (`evaluation/cli.ts`), so a defect is
  chased without a full run or a scratch script. Neither writes an artifact
  or reports gates.

## Verified

`npm run eval` 172/172 with every blocking gate; both new modes run
offline; `packages/core` typecheck; `lint:help-links` (it cites a
`CLAUDE.md` heading, kept).
