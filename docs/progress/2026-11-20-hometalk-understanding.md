# HomeTalk understanding: take what was said, ask only what must be asked

**Date:** 2026-11-20 · **Story:** 04-032 · **PRs:** #583 (the owner's sentence), and the follow-up PR (the wider set)

## The owner's turn

Fri 20 Nov, 10:08 pm: "add a reminder for tomorrow doctor appointment at 1 o'clock". HomeTalk replied "⏰ What time should I remind you — for example "9am" or "6:30pm"?" and offered Today / Tomorrow / Sunday to tap.

**Cause (traced in code; reproduced with the model's reading in `conversation/owner-reminder-turn.test.ts`):**

1. The model read it correctly: a reminder, `when: "tomorrow"`, `time: "1 o'clock"`. `conversation/reminder-time.ts` could only read "1", "1pm" and "13:00". "1 o'clock" failed to parse, and that failure became the question.
2. `grounding.ts` filed every reminder-time question as `awaiting: "day"`. `hometalk/choices.ts` builds the chips from that slot, so a time question got day chips.
3. A day picked from those chips replaced the day and kept the time that couldn't be read, so the same question would have come back.
4. The rules (used when no model answers, and to fill in what a model left out) only took a day or time from the end of a reminder. "for tomorrow … at 1 o'clock" in the middle was not read.

**Now:** the turn is recorded at once as a **doctor's appointment for the speaker in Health & Fitness, tomorrow at 1pm**, private. Its own reminders follow `health/reminders.ts`: the evening before, and on the day at 7am (or two hours before, if that is earlier). The reply ends with "I took "1 o'clock" as 1pm — say "1am" if not", and Undo is available.

Why an appointment rather than a reminder: the product already has a home for appointments (`record_health_appointment`, recorded at once under record-first, with a reminder policy). A bare reminder would go off *at* 1pm, which is when the person needs to be leaving, not hearing about it. Someone else's appointment ("Asmi's dentist") stays a reminder, because who a health record is for is never assumed. "Remind me to book the dentist" also stays a reminder.

## The owner's second try, 11:25 pm (third PR)

He typed "add a reminder for tomorrow Dr apartment at 1 o'clock" ("Dr apartment" is dictation for "doctor appointment"). HomeTalk replied "📝 I have prepared this, and not done it: book a Dr apartment appointment. It is waiting for you." After he approved it: "Approved — noted, though there is nothing I can do about this on my own yet." No appointment was saved, and the day and time disappeared from the replies.

**Cause.** Production reads with the model: the rules could not have produced this reading, because "Dr apartment" has no appointment word in it. #583 had added `record_health_appointment` to the model prompt. The model picked it, with `typeText: "Dr apartment"` and no `appointmentType`. `canExecute` requires that type, so the engine downgraded the turn to "prepared". The proposal summary said "Book a … appointment" and dropped the day and time. On approval, the route found nothing it could run and answered with `notYetDoable`'s default, leaving the action marked approved.

**Fix (engine, so it covers the model path and the rules path alike).**
- `settleAppointment` makes every appointment reading whole before anything is decided:
  - "Dr", "doc", "docter", "apartment", "apointment" and "appt" are read as a doctor's appointment.
  - The speaker is the target when the model left it unset.
  - A non-health appointment becomes the reminder the person asked for, with their own words, day and time.
  - Someone else's appointment stays a reminder.
- The summary says "Add your doctor appointment tomorrow at 1 o'clock" and never "Book".
- Appointments recorded by HomeTalk now have Undo, which cancels them, never deletes them.
- A recording the executor can't run is never held as "prepared": the one missing detail is asked instead.
- An approved action that can't run is closed as failed, with its reason, instead of waiting forever.
- A test fails if any recording action has no executor case.

**HomeTalk's reply now, word for word:**

> 🩺 Added your doctor appointment tomorrow (Sat 21 Nov) at 1pm. See [Health & Fitness](/health). I'll remind you on the day at 7am.
> I took "1 o'clock" as 1pm — say "1am" if not.
> Say **undo** to take it back ↩️

**Regression cases:** HT-305 to HT-309 (the sentence itself, "dr appt", "doc appointment", "doctor apointment", Hinglish "reminder kal dr appointment 1 baje"). The model's own reading of "Dr apartment" is covered in `owner-reminder-turn.test.ts`. A real provider run still needs a key, which this container doesn't have.

**His approved action from 11:26 pm** was left as "approved" by the old code. It was not read or changed here: no database access from this session. From now on, such an action is closed as failed with its reason.

## What was measured

There is a new **understanding set** of 100 sentences (`evaluation/cases-understanding.ts`, `npm run eval -- --set understanding`). They are typed the way people type: no punctuation, "tmrw", "pls", "kal subah 8 baje", "half kg tomatoes", "milk khatam ho gaya", "6 30 pm", spoken "one o clock", follow-ups such as "no, 1 am" and "at 1 o'clock". They cover reminders, health appointments, calendar plans, dated news, To Buy, meals, bills (recorded, never paid), absences, school, health, repairs, places, questions about the household's own records, preferences and notes, screens, multi-part sentences and corrections. Each case says what a sensible person expects recorded and whether a question is justified.

This container has **no provider key**, so every number below is the **rules path**: what HomeTalk does when the model is down, and what fills in anything the model leaves out. The model's own reading still needs one provider run (`npm run eval -- --set understanding --provider configured`).

| Rules path, 100 requests | `main` before #583 | after #583 | now |
|---|---|---|---|
| Understood fully in one go | 45 | 52 | **91** |
| A question nobody needed | 48 | 43 | **10** |
| Filed as the wrong thing | 6 | 5 | **1** |
| Questions per request (mean) | 0.50 | 0.44 | **0.11** |

The 91 passing sentences now gate releases as part of the golden set: 462/462 pass, Unsafe Action Rate 0/82, and every blocking gate passes.

## Causes, grouped

1. **Times as people say them** ("1 o'clock", "half past 6", "6 30 pm", "7 in the evening", "noon", "5 baje"). New `conversation/time-of-day.ts`. With no am/pm, the words around the time ("tonight", "dinner", "morning") pick the half of the day. Otherwise 7–11 is the morning and 1–6 the afternoon. If that time has already passed today, the other half is used. The reply says which half it took.
2. **A question whose answers don't match it.** Questions now carry their slot (`day` | `time`), and chips come from the slot. A "what time" question always gets time chips. A time answer completes the original request.
3. **A day or time said anywhere in the sentence.** Reminder rules now take a day and time from anywhere, in any order, with or without "to": "remind me friday 6 30 pm to collect the cake", "reminder tomorrow morning 8 o'clock gas cylinder book karna". A time with no day means today, or tomorrow once that time has passed.
4. **Day words.** "the 25th", "2 Oct", "day after tmrw", "in 2 hours", and Hinglish "kal / parso / aaj / subah / shaam / raat / baje" (`normalise.ts` `everyday`; "kal" next to a word about the past is left alone, because then it means yesterday). Polite lead-ins (pls, kindly, "do the needful and") are dropped. A bug that read "day after tomorrow" as "tomorrow" in reminders and meal plans is fixed. HomeSend keeps its own written-date reading: the wider phrase list is `SPOKEN_DAY_PHRASE`, for HomeTalk only.
5. **To Buy.** An amount and a thing on their own ("half kg tomatoes", "get 3 bottles of coke for the party"), the amount after the thing ("curd 1 packet"), "a dozen eggs" inside a list, "X khatam ho gaya" → we're out of X, "ek packet maggi add karo".
6. **Plans, meals and dated news said as statements.** "family movie night sunday evening", "dinner tonight is pasta", "make poha for breakfast on sunday", "Plan dinner with the Sharmas" (guests, not a recipe), "Riya's birthday party on Saturday at 4", "tomorrow 5pm cricket coaching for Manan", "note that the plumber comes on monday". Dated news goes through HomeSend as before.
7. **Absences and payments.** "Sunita won't come tomorrow", "I'm travelling to Delhi from friday to sunday" (recorded from its first day), "electricity bill paid 2840".
8. **Corrections.** "No, 1 am" and "at 1 o'clock" straight after a reminder or appointment change its time, through the usual corrective action with Undo.

## Still weak (not gating; `STILL_WEAK` says why for each)

- A whole-weekend plan is *prepared* rather than recorded.
- Amounts in words ("twelve hundred") in bill sentences.
- Absences are one day at a time ("till monday" goes to HomeSend to be read).
- "AC not cooling in the bedroom"; "where can we take the kids" (read as a calendar question); a household fact with no person ("the wifi password is on the fridge").
- Multi-part sentences: the conversation route splits them (`decompose.ts` splits both test sentences correctly), but the evaluation runner does not, so they score as weak.
- Not checked in this session: the **model's** own reading of the 100 sentences (no key), a **browser check on a QA household** (no service-role key or `.env.local` in this container, so `qa-test-user.mjs` can't run; no QA data was created), and **latency**. The owner's timestamps (10:08 → 10:09) are minute-rounded, so they bound the turn only to 0–119 s. Measuring model time against our time needs a key on the production build. The structural fix for a slow turn is already queued as 14-056 (one structured answer-or-intent call).

## Open decision for the owner

A grocery with no amount ("add milk") still asks "How much?". That follows the owner's rule of 2026-10-26. Today's brief asked for "quantity missing → 1 or the usual from history". The two rules conflict, so the owner has to choose; the question was sent to the coordinator.

## Where the code lives

`conversation/time-of-day.ts`, `appointment-reading.ts`, `reminder-time.ts`, `rules.ts`, `normalise.ts`, `temporal.ts`, `quantity.ts`, `corrections.ts`, `grounding.ts`, `bill-talk.ts`; `hometalk/choices.ts`; `evaluation/cases-understanding.ts`, `cli.ts` (`--set understanding`), `runners.ts` (observes time); help: "Talk to WonderHome" in all eight languages.
