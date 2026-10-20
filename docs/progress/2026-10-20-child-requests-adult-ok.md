# A child's or helper's request goes to an adult for the final OK — 2026-10-20

## What and why
The owner, 2026-10-20: a child can ask HomeTalk for things, but the result must go to an adult for final approval before anything is written. Before this, a child's own "Confirm" carried out their proposal. Where autonomy for an outcome was set to execute, a child's grocery add ran with no question at all.

## What changed (story 04-026)
- **Never on its own.** `conversation/proposal.ts` turns an `execute` outcome into `needs_approval` for a child's or helper's own request. The engine's question becomes "Shall I send it to a grown-up to OK?".
- **Referred, never executed by the asker.** All three of a child's or helper's "go ahead" paths now refer instead of executing: the Confirm button, a spoken "yes", and "yes to both". Their Confirm reads "Ask a grown-up".
  - `conversation/referral.ts` records one `approvals` row for the exact proposal (its fingerprint), using the existing table that had sat unused. It is addressed to their guardian, else an Admin.
  - One `approval_needed` notification is sent.
  - The proposal remembers whom it waits on, so the card says "Waiting for Riya's OK" and offers only Cancel.
- **The adult answers on Notifications** under "Asking for your OK", with Approve and Decline (`_components/request-answer.tsx` → `approval-actions.ts` → `answerReferral`).
  - Who may answer is checked on the server: a guardian of the requester or an Admin, never the requester.
  - Approve re-checks the fingerprint and the 48-hour window, then runs the same executor as any approved HomeTalk action, on the adult's session.
  - Decline leaves everything as it was.
  - Either way, the requester is told in their own conversation, and the approval row and its notification are closed.

## Verified
- Typecheck passed (web and core).
- Unit tests: 809 passed across conversation, evaluation, hometalk and voicelink, including a new test in `consent.test.ts`.
- `npm run eval`: every gate passed except operations, which reads "not yet" as before. That includes functional 145/145 and Unsafe Action Rate 0/19.
- Browser at 360px, with a parent and a child test account on the live project:
  - the child asked "Plan a family outing this weekend" and tapped "Ask a grown-up"; the card said "Waiting for Riya's OK";
  - the parent saw the request under "Asking for your OK" and approved it;
  - the child's conversation said "Riya said yes…";
  - the same flow worked for "Add eggs to the shopping list".

## Open
- "This weekend" with no time is still kept as a plan to finish rather than put on the calendar. That is existing behaviour for everyone, not part of this change.
- The test household `544e4a4e-6527-4229-95d6-60f4f46142b0` is still on the live project: deletes from this session were cancelled. See the PR.
