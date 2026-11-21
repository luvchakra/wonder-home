# A timetable read late still becomes exam days (14-077)

**Why.** The owner's exam timetable photo (20 Nov) was first kept for want of a model. He sent it again, and that copy was added as a plain school item. Then the first copy was read at 05:10 UTC on 21 Nov and he got "I've kept it in HomeSend, where you can see it or undo anything". His words: "why it still needs to keep in HomeSend, why can't it directly add in the application".

**Causes found in the code, and fixes.**
1. **No timetable from the reading.** The re-read path is the same as a first read: the same image, prompt, tool schema and `acceptReading`. A stronger model is used only after an `output_rejected`. But any schedule field the schema rejected threw the whole reading away. Examples are a row's `dueDate` in another shape ("3 Dec"), an empty column heading, or a number in a cell.
   - Now `ai/classify-intake.ts` `repairSchedule` mends those slips.
   - `parseReading` keeps the rest of the reading when only the schedule still doesn't fit.
   - Not checkable from here: whether item A's stored `extracted` (not `understanding`) holds a `schedule`. The schedule is stored on `extracted`.
2. **"Which class is X in?" was never asked.** `timetable-apply.ts` called `askNeedsYou` without `askedAt`, behind a type cast. `askedAt.toISOString()` threw, and the `.catch` swallowed it. It now passes `askedAt` and logs a failure.
   - Only one question per item can be open (`needs_you_items_one_open`), so a second child was never asked either. Children are now asked one at a time: answering closes the question and asks the next child (`answerClassQuestion`, `questionId`).
3. **A timetable waiting on that question was filed as a note** on the next deadlines pass. `deadlines.ts` `CLASS_OPEN` now holds it while the question is open; `needs-you-run.ts` marks open questions.
4. **The late read added nothing and said "kept".**
   - `homesend/repository.ts` `findAddedTwin` matches the same content hash, or the same kind and title, routed within 14 days. On a match, `setAsideAsAlreadyRecorded` sets the late copy aside and the reply says "✅ That's already in Kids & School: *…*. I didn't add it twice." This is wired in `apps/web/app/_lib/homesend-after-model-read.ts`.
   - A timetable whose table couldn't be read says so plainly (`whatsapp.ack.tableUnread`) and is never filed as a note (`school-note.ts` `looksLikeTimetable`).
   - The generic reply no longer says "kept … undo anything" when nothing was added: it says "Nothing was added yet. Open it in HomeSend to finish it", in 8 languages and in `handedBackText`.
5. **Deadline clock.** Age was not the cause. `endingFor` ends a waiting school item as a note on the next pass whatever its age. The cause was the missing timetable, so the item was a school item with no date.

**Regression.** `homesend/reread-timetable.test.ts` follows the sequence (first read fails, a resend is added, then the late read) with the synthetic timetable's reading (HD-01).

**Verified.** vitest over the touched areas (3291 passed), typecheck and build. **Unverified live:** no model key in this container, so there is no live read of the photo. Whether a real model now fills `schedule` for this photo needs the owner to resend it.
