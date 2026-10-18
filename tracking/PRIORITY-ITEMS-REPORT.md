# Priority items report

This is the queue to use when the owner says **"work on the next high-priority story"**. Take the first row below whose status is **Next** or **Not Started**, and whose "Needs" column is empty. Work it to a merged PR. Then update this file in that same PR: mark the row, and add any follow-up the work leaves open.

**What counts as priority.** The owner set this on 2026-10-18. There are four high-priority modules, worked one after another in this order:

1. **HomePlaces** (`backlogs/24-HomePlaces.md`)
2. **HomeFood** (`backlogs/25-HomeFood.md`)
3. **HomeTalk** (`backlogs/04-Conversation-Voice-and-Text.md`, plus HomeTalk follow-ups that live in other backlogs)
4. **HomeEvents** (`backlogs/26-HomeEvents.md`)

Within a module, P0 comes before P1, and P1 before P2. The owner's own direct asks are in section B, and they come before anything new.

**Rules that stay true.**
- The backlogs are the source of truth for a story's status. This file is the order. When the two disagree, fix this file.
- "Done" needs a browser check at 360px and on desktop (CLAUDE.md). Until a session has QA credentials, a story whose code is complete stays **In Progress — browser check**. It is listed in section C, not re-queued.
- A row that waits on a person (a decision, a credential, a Meta template) says so in "Needs". Skip it, and don't build around it.

Last updated: 2026-10-18 (after #216 and the browser checks).

---

## A. The queue, in order

| # | Module | Story | What it is | Status | Needs |
|---|---|---|---|---|---|
| 1 | HomeFood | 25-003a | Meal shortfalls: each planned meal's ingredients, scaled to servings, minus stock and minus what is already to buy (units-safe). The meal sheet's **Add n to the list** (design §3.5) | Done — 2026-10-18, browser-checked | — |
| 2 | HomeFood | 25-003b | Receipts into stock: each kept receipt line gets a unit, **add to stock** (on by default) and **clears list entry**. The review shows stock before → after. Duplicate receipts are caught (design §3.8) | **Next** | — |
| 3 | HomeFood | 25-003c | Use soon and depletion wording: "Use first" (a known expiry) and "Running low" are never mixed. Wording never claims stock it does not know, and never suggests something past an estimated date (design §3.6) | Not Started | — |
| 4 | HomeFood | 25-005 | "Make that 2 litres" corrects an amount: wire `readMakeThat` (`conversation/quantity.ts`) into `conversation/corrections.ts` | Not Started | — |
| 5 | HomeFood | 25-004 | Send to Cook over WhatsApp: an approved meal plan goes to a consenting helper through the official template. Built inert | Not Started | The template stays inert until a person registers it with Meta (`WHATSAPP_COOK_TEMPLATE_NAME`) |
| 6 | HomeTalk | H-1 | "How much do I owe this month?": a total of the bills in the window, as arithmetic from the records (rule 9), with each bill listed | Not Started | — |
| 7 | HomeTalk | H-2 | Corrections in the golden runner: replay "actually, make that Friday" and "not bread, eggs" against the executed action, as the route does, so `npm run eval` covers them | Not Started | — |
| 8 | HomeTalk | H-3 | The place book's lede still says places come "from HomeTalk". Reword it in 8 languages to include **Add a place** | Not Started | — |
| 9 | HomeEvents | 26-002 (P0) | Calendar module adapters: school, meals, bills, health ("Busy" for others), helpers, upkeep, outcomes and orders on the calendar, each through its own visibility rules, deduped by source | Not Started | — |
| 10 | HomeEvents | 26-003 (rest) | HomeTalk plans with the calendar (C3): `plan_event` with participants and clash checks, find free time, move and cancel events, answers read from the projection. The read half is done | In Progress | — |
| 11 | HomeEvents | 26-004 | Calendar reminders to every participant, an optional daily digest, and a holiday region in Settings → Language & Region | Not Started | — |
| 12 | HomeEvents | 26-005 | Calendar notices over WhatsApp, sharing the Send to Cook template | Not Started | The owner wants it, and the template is approved |
| 13 | HomeEvents | 26-006 | Google and Outlook calendars | Not Started | A separate approval from the owner |
| 14 | HomeTalk | 04-017 | Voice evaluation: the real Gemini Live and Alexa runs | In Progress | A person's Gemini and Alexa accounts |

## B. The owner's direct asks (2026-10-18)

| Ask | Story | Status |
|---|---|---|
| Every family member logs in as themselves, matched by the email in their details, with any login method, and lands in the household with their role's menus | 01-010 | Done — #215, browser-checked 2026-10-18 |
| An Invite button on each member: send an email, and a shareable link through WhatsApp and other apps | 01-010 | Done — #215, browser-checked 2026-10-18 |
| Hide the top and then the bottom bar while scrolling | 00-012 | Done — browser-checked; tab bar now waits until 280px so the top goes visibly first |
| HomeTalk answers "next event" and "public holiday" from the calendar | 26-003 | Done, #215 (golden HT-76 to HT-80) |
| Detailed cross-module HomeTalk test cases | — | Done, #214 (HT-28 to HT-75) |
| What's new section on Home | — | Done, #213 |
| HomeTalk said "no events in December" | 26-003 | Done, #213 |
| The calendar title squeezed on a phone | — | Done, #212 |
| HomePlaces office, Add a place, work facts | 24-005, 24-006, 24-007 | #216 merged. 24-007 Done; 24-005 and 24-006 need a browser check with a Google Maps key |

## C. Waiting only on a browser check

QA credentials now work in a session that has `apps/web/.env.local` (or `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as environment variables). Checked and Done on 2026-10-18: 26-001, 01-010, 00-012, 24-007.

- **24-005, 24-006** The office picker and Add a place need `GOOGLE_MAPS_API_KEY` in the build that is checked; without it they are hidden by design. Check them on a build with the key.

## D. Decisions waiting on the owner

- Should a child see his own private health appointment? Today he is told nothing is on record (household D, Kabir).
- Should WonderHome send invite emails itself? That needs a mail provider. Today **Send email** opens the Admin's own mail app.
- Is Supabase email confirmation on for password sign-ups? Matching by email relies on a confirmed address.
- What should the `wonderapps_dashboard_read` policy on 32 live tables become? It is not in the repo and includes `household_ai_credentials`. It was flagged on 2026-10-18 and left unchanged.
