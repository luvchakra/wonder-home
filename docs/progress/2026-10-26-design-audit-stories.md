# HomeTalk/HomeSend design audit: what remained, built (14-042 to 14-049)

The owner, 2026-10-26: "compare the design with current implementation, whatever remains to be implemented, add them as pending stories then start implementing the stories sequentially".

## What was done and why

An audit compared every claim in `docs/hometalk-homesend-design.md` with the code. What the code didn't do became stories 14-042 to 14-050 in `backlogs/14-AI-Orchestration-and-Learning.md`. Stories 14-042 to 14-049 were built in order, in one PR. 14-050 waits on the owner (see below).

- **14-042, small correctness fixes.**
  - A stored auto-add bar WonderHome doesn't offer is read as the highest bar, 99% (`household/auto-add-repository.ts`).
  - A WhatsApp answer to HomeTalk's open question is recorded as `clarification_answered`, with latency.
  - A voice note that HomeTalk answered now counts as "went to HomeTalk" for routing rule 2 (`whatsapp/intake.ts`).
  - The design doc's stale lines were corrected:
    - I-12 is live (#365);
    - a missing required detail gives **ask**, not prepare.
- **14-043, "how sure" on every "added on its own" message.**
  - `homesend/auto-add.ts` gained `sureWhy`, `sureClause` and `AddedOnItsOwn`.
  - `addIfAllowed` returns the % and the reason.
  - The WhatsApp reply, HomeTalk's hand-back and the app notice each say "N% sure — why". The app notice gives the score's reason, not the decision's.
- **14-044, item questions end well.**
  - An answer HomeTalk can't read gets one polite second ask, listing ways to say it (`secondAsk`, parameter `retried`).
  - A second miss moves on.
  - The closing line names every detail still missing: the required ones, and useful ones never asked.
  - `clarify.ts` now passes a short non-request ("lots") through as an attempt at the answer. Eval HT-155 covers this.
  - The "Still needed" E2E already existed (`e2e/screens.spec.ts`, the bill test).
- **14-045, HomeTalk-filed items get HomeSend's decision.** A `file_with_homesend` item that needs no question is added on its own where the household pre-approved it and it clears the bar. Otherwise it waits, as before.
- **14-046, a bare list on WhatsApp.**
  - "milk, eggs and bread" goes to HomeTalk as "Add milk, eggs, bread to the shopping list", and HomeTalk asks "How much of each…" once.
  - Each name must match an everyday catalog item by whole words (`groceryListNames`, `namesTheSameThing`). The catalog search matches substrings, and "asmi" finds "Rice, Jasmine", so a list of people stays HomeSend content.
- **14-047, WhatsApp words in the member's language.**
  - There is a new catalog area, `whatsapp.*`, in all eight languages.
  - It covers acknowledgements, "added on its own", the question reply, unsupported and too-large messages, and HomeTalk's first question about something just sent (`questionIn`).
  - Failure reasons reuse `homesend.failure.*`.
  - The language is the member's own choice, else the household's.
- **14-048, platform key alerts.**
  - `ai/platform-key-alert.ts` finds the open alert on `WONDERHOME_AI_KEY` by fingerprint.
  - The delivery clock emails the platform's owners and operators once per alert. A quota refusal waits 10 minutes, as for a household.
  - `GET /api/v1/platform-admin/ai-operations` returns `platformKeyAlert`.
  - Migration `20261026160000_ai_key_alerts_platform_notified.sql` adds `platform_notified_at`. It only adds a column, so it is safe in either order.
- **14-049, metrics.** `homesend/metrics.ts` now returns:
  - `addedOnItsOwn` and `addedByKind` (added on its own vs confirmed);
  - `safeRejectionByReason`.

Help: Connections ¶3 (WhatsApp) in all eight languages, covering the bare list, the % on "added on its own" replies, and replies in your language.

## Verified

- Typecheck of core and web.
- Unit tests for WhatsApp, HomeTalk, conversation, HomeSend, i18n, notifications, and the new platform-key-alert and auto-add-repository tests.
- Eval cases HS-29–35, HT-143–150 and HT-155.
- `npm run eval -- --utterance "Add milk, eggs, bread to the shopping list"` → "How much of each should I add? …".
- On the live database, the catalog search was checked: it matches "milk", "bread" and "eggs" as items, and "asmi" only inside "Jasmine".

## Acceptance tests

Afterwards the owner asked for extensive tests with expected results written first, including combinations of the approval settings. There are 174 acceptance cases (AT-A to AT-K), and all pass. Three failures came up while writing them; all three were mistakes in the tests, and none was a product defect. Report: `docs/testing/2026-10-26-hometalk-homesend-acceptance.md`.

## Open

- **14-050:** HomeTalk offering, unprompted, to fill in waiting items needs the owner's yes, because it starts a conversation.
- **Still English on WhatsApp:**
  - HomeSend intake rejections (`IngestRejected`);
  - connect-code replies, sent before the sender is known.
- **I-13:** tidying old Failed safely rows still needs the owner's yes.
- **Live provider eval of the intake model:** needs a key.

No QA accounts or test data were created in this work.
