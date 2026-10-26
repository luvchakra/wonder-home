# HomeTalk files the member's own words with HomeSend, never the masked copy (I-26)

2026-10-26. A privacy and correctness defect the owner hit at about 9:10 PM IST.

## What happened

The owner typed in HomeTalk: "Asmi has a karate grading exam next Sunday at 10 am at the Koramangala dojo". HomeTalk filed it with HomeSend (`file_with_homesend`), and the review said "Child B has a karate grading exam…", 70% sure, and offered "Add Child B as a child".

Live item `766961b2-3d90-4bbd-9ffc-7a398a9b5fea` (household `91ade341-…`) has `raw_text` "Child B has a karate grading exam next Sunday at 10 am at the" and `extracted.people` = ["Child B"].

## Cause

The conversation route sends the model the pseudonymised sentence (`minimiseContext`: "Asmi" → "Child B"). The model's reading is built by `intentFromModelOutput`, which sets `utterance` to the text the model was given, so the masked copy. The route's `toHousehold` put real names back into parameters and the target, but not into `utterance`. `fileWithHomeSend` (added in #337) passes `intent.utterance` to `ingestText`, so the masked sentence became the HomeSend item. HomeSend then read "Child B" as a child nobody has, and the review offered to add them.

The same field is used by `set_preference`'s proposal line ("Remember that …"): action `14af1618-…` on 23 Oct reads "Remember that Child B went on the Bounce school trip".

**The missing "Koramangala dojo" is not this bug.** The member's own stored message (`conversation_messages`, 15:40:45 UTC) is already "Asmi has a karate grading exam next Sunday at 10 am at the". So the sentence reached the server cut off. Masking never removes places, and the request splitter leaves this sentence whole (checked). The 70% and "the message is cut off before the location" are a fair reading of what arrived. Nothing in the composer caps length; the cause was probably sending early.

## The fix

- `reidentifyIntent` (`packages/core/src/ai/privacy.ts`) makes a model's reading the household's again: the member's own words as `utterance`, real names in parameters, target and `understanding.references`. The route (`apps/web/app/_lib/hometalk-turn.ts`) uses it for whole turns and for each part of a longer request. WhatsApp and voice turns go through the same route.
- `fileWithHomeSend` files nothing whose words still carry a placeholder, and asks for the name instead.
- `resolveIntakePeople` (`homesend/resolve.ts`) never treats a placeholder as a child to add. It asks who the item is for, even with one child. `ai/placeholders.ts` holds the check so the review can use it in the browser without `privacy.ts`.
- Evaluation: provider runs now mask and re-identify exactly as the route does (`maskedAsTheRouteDoes`). Every HomeTalk case fails with `privacy_leak` if the words or reading it keeps carry a placeholder. New expectation `kept`, and new case **HT-161** for this sentence.

HomeSend's own reading (`classifyIntake`) is not changed here. It sends the source text to the provider as written, names included, as it always has for documents, photos and forwards. It does not pseudonymise and re-identify. So a sentence told to HomeTalk now reaches HomeSend's provider with the child's name, the same as the 25 Oct item that scored 0.97. Making HomeSend pseudonymise text is a separate decision for the owner.

## Verified

- Unit tests: `file-with-homesend.test.ts` (masking → model reading → `reidentifyIntent` → `ingestText` receives the exact sentence, with Asmi resolved; a placeholder is never filed) and `resolve-unknown-child.test.ts` (never "Add Child B"; asks). `src/evaluation src/conversation src/ai src/homesend`: 1656 passed (after syncing with main).
- Typecheck: core and web clean. ESLint on `hometalk-turn.ts` clean.
- `npm run eval` (deterministic, full): 198/198, Unsafe Action Rate 0/23, every gate pass.
- Provider run (`--provider configured`) not run: this container has no `WONDERHOME_AI_KEY`.

## Rows with placeholders on the live project (left as they are)

Found with `~ '\m(Child|Adult|Helper) [A-Z]\M'`. None was changed.

- `home_send_items`: 1, `766961b2-3d90-4bbd-9ffc-7a398a9b5fea` (raw_text and extracted). Dismiss and resend it, or correct it in the review by picking Asmi. Never add "Child B".
- `conversation_messages` (assistant): 6, `46690621-…`, `65ac3397-…`, `4c65faba-…`, `38d39c25-…`, `8b81b864-…`, `8b19ac9a-…` (17 Oct, before names were restored into parameters).
- `conversation_actions.payload`: 4, `14af1618-…` (23 Oct, this bug), `832b3dac-…`, `2faa0bee-…`, `2a365694-…` (17 Oct).
- None in `memories`, `notifications`, `school_items`, `family_events`, `child_activity_notes`, `food_preferences`, `pet_preferences`, `event_guests` or `homesend_changes`.

No QA accounts or test data were created.
