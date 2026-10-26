# HomeTalk offers to fill in waiting items (14-050); the rest of WhatsApp's words (14-051)

The owner, 2026-10-26: "go ahead with 14-050 and further". That message was the yes that 14-050 waited on, because the offer starts a conversation on its own.

## What was done

- **14-050: HomeTalk offers to fill in waiting items.** Code: `hometalk/details-offer.ts`, `intake-questions.ts`, and the `fill_homesend_details` action.
  - **When it is offered:** an adult opens HomeTalk, and something from the last two weeks waits in HomeSend missing a detail HomeTalk can ask about.
  - **What it says:** "2 things in HomeSend need a detail — Maths worksheet and Diwali dinner. Shall we fill them in now? Say yes, or no to leave them." The words are in all eight languages.
  - **Limits:**
    - at most once every twelve hours;
    - never over a question HomeTalk is still waiting on;
    - written with the service role, like the welcome, so a server without one makes no offer.
  - **The replies:**
    - "Yes" asks the first item's first question, with the rest queued behind it. After each item comes the next: "Next, **Diwali dinner**: Which day is it?".
    - "No" leaves them all waiting.
    - Anything else is read as a new request.
  - **Wiring:** the new action has a `REPLY_CLASSES` entry, a place in the voice matrix (the HomeSend details row), the scope "none", the proposal kind "draft", and evals HT-156 and HT-157.
  - **The engine:** a bare "yes" with no proposal pending used to be answered "There is nothing waiting for a yes right now". When the open question is this offer, the yes now answers it (`engine.ts`). The eval caught this.
  - **The page:** the offer returns its own session and message, so the first load shows it. The browser check found that without this, it appeared only after a reload.
- **14-051: the rest of WhatsApp's words.**
  - HomeSend's refusals carry a closed code (`IngestRejected.code`), and WhatsApp says them from `whatsapp.rejected.*`.
  - A connect-code reply uses the linked member's language (`whatsapp.link.*`).
  - Still English, because nobody is known yet: the "not connected yet" reply, and the answer to a code that names nobody.
- **Tracker fix.** In #366 I wrote "Done — PR #366" in the status column of 14-042 to 14-049. The tracker counts only the exact word "Done", so those stories showed as unfinished. The status column now says "Done", and the PR number is in the notes.

## Verified

- **Unit tests:** OF-01 to OF-21 (details offer), plus the WhatsApp tests for the connect reply in the member's language, a refusal in Hindi and a code that names nobody.
- **Eval:** 194/194; unsafe actions 0/23.
- **Signed-in screens E2E against the live project:** 18/18 on four consecutive runs, including a fresh build followed by a run.
  - One earlier run, the first after a fresh build, had a single failure. It did not reproduce, and its output was overwritten before I captured it.
  - That run came after the fix for the error screen described below. The E2E server runs without a service role on purpose, and the first version of the page broke there (`/ai` showed the error screen). It now skips the offer instead.
- **Browser check on the live project,** with a production build and a server holding the service role, at 360 px and on desktop:
  - the offer showed on the first load, and only once after a reload;
  - "yes" → "First, Diwali dinner: Which day is it?";
  - "Saturday 7 November" was saved as 2026-11-07, and HomeTalk asked the next question;
  - no sideways scroll at 360 px or on desktop.
  - The household and account the check created were deleted. A SQL count confirms no QA or E2E accounts or households are left.

## Open

- A live provider evaluation of the intake model needs a key.
- I-13: tidying old Failed safely rows still needs the owner's yes.
