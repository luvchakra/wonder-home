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

Last updated: 2026-10-18 (04-018 HomeTalk across screens done; 25-006 grocery catalog and 01-011 member phone numbers done; USDA linking queued as 25-007 at the owner's lower priority).

---

## A. The queue, in order

| # | Module | Story | What it is | Status | Needs |
|---|---|---|---|---|---|
| 1 | HomeFood | 25-003a | Meal shortfalls: each planned meal's ingredients, scaled to servings, minus stock and minus what is already to buy (units-safe). The meal sheet's **Add n to the list** (design §3.5) | Done — 2026-10-18, browser-checked | — |
| 2 | HomeFood | 25-003b | Receipts into stock: each kept receipt line gets a unit, **add to stock** (on by default) and **clears list entry**. The review shows stock before → after. Duplicate receipts are caught (design §3.8) | Done — 2026-10-18, browser-checked | — |
| 2a | HomeFood | 25-006 (P0) | The owner's ask: a shared grocery catalog (one platform table for every household) behind **Add an item**, searched like a quick-commerce app, with pictures, pack sizes and nutrients from a licensed source | Done — 2026-10-18, browser-checked | — |
| 2c | HomeFood | 25-009 / 25-010 (P0) | The owner's asks: Indian nutrition (IFCT 2017) for the catalog; a search of everyday choices with brands and pictures, no amounts until picked, natural amounts on every stepper; the sheet above the keyboard | Done — 2026-10-18, browser-checked | Written permission from ICMR–NIN for IFCT (the owner chose to load first and ask in parallel) |
| 2b | Family | 01-011 (P0) | The owner's ask: a phone number for every member, helpers included, and sign-in by phone, since a helper may have no email | Done — 2026-10-18, browser-checked | Phone sign-in goes live once a person connects an SMS provider in Supabase Auth and sets `NEXT_PUBLIC_PHONE_AUTH_ENABLED=true` |
| 3 | HomeFood | 25-003c | Use soon and depletion wording: "Use first" (a known expiry) and "Running low" are never mixed. Wording never claims stock it does not know, and never suggests something past an estimated date (design §3.6) | Not Started | — |
| 4 | HomeFood | 25-005 | "Make that 2 litres" corrects an amount: wire `readMakeThat` (`conversation/quantity.ts`) into `conversation/corrections.ts` | Not Started | — |
| 5 | HomeFood | 25-004 | Send to Cook over WhatsApp: an approved meal plan goes to a consenting helper through the official template. Built inert | Not Started | The template stays inert until a person registers it with Meta (`WHATSAPP_COOK_TEMPLATE_NAME`) |
| 6 | HomeTalk | H-1 | "How much do I owe this month?": a total of the bills in the window, as arithmetic from the records (rule 9), with each bill listed | Not Started | — |
| 7 | HomeTalk | H-2 | Corrections in the golden runner: replay "actually, make that Friday" and "not bread, eggs" against the executed action, as the route does, so `npm run eval` covers them | Not Started | — |
| 7a | HomeTalk | H-4 | A typed paragraph of several family facts ("Manan likes home-cooked food. He doesn't like outside food and Upasana likes cooking") is split into one fact each, with "he/she" resolved to the person just named. Gemini Live already does this per tool call | Not Started | — |
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
| Gemini Live said it could not update a family preference | 04-017 | Done: telling WonderHome what someone likes works by voice (`remember_family_fact`) |
| A shared grocery catalog with pictures and nutrients behind Add an item | 25-006 | Done: 1,559 curated items and Open Food Facts India products, searched by any name |
| USDA nutrition linked to the catalog, in phases | 25-007 | Queued, lower priority |
| Indian nutrient profiles for Indian foods | 25-009 | Done: IFCT 2017 (ICMR–NIN) for 399 items, credited |
| Fewer, everyday search results with brands and pictures; natural amounts (1 kg, 1.25 kg; eggs one at a time) | 25-010 | Done |
| Ask HomeTalk to open screens and keep talking while moving between them, with the glow showing on every screen | 04-018 | Done, #225 (golden HT-84 to HT-87) |
| The Add an item sheet hid behind the phone keyboard | 25-010 | Done: the sheet rises above the keyboard |
| A phone number for every member and helper, and sign-in by phone | 01-011 | Done; sign-in by phone waits on an SMS provider in Supabase Auth |
| HomeTalk said "no events in December" | 26-003 | Done, #213 |
| The calendar title squeezed on a phone | — | Done, #212 |
| HomePlaces office, Add a place, work facts | 24-005, 24-006, 24-007 | Done — #216; 24-005 and 24-006 browser-checked with a real Google Maps key on 2026-10-18 |
| WonderHome emails the member invite itself, from connect@wonderapps.biz (GoDaddy) | 01-010 | Done in code; the SMTP settings are in Vercel production. A real send is checked on production after the merge |
| A child asking about his own private appointment hears that one is coming up and that the adults can see the details | 26-003 / HomeBrain | Done (golden HT-82, HT-83) |

## C. Waiting only on a browser check

QA credentials now work in a session that has `apps/web/.env.local` (or `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as environment variables). Checked and Done on 2026-10-18: 26-001, 01-010, 00-012, 24-007.

Nothing is waiting. 24-005 and 24-006 were checked with a real Google Maps key on 2026-10-18.

## D. Decisions waiting on the owner

- Is Supabase email confirmation on for password sign-ups? Matching by email relies on a confirmed address.
- **Decided 2026-10-18:** a child is told his own appointment is on record and that the adults can see the details; WonderHome sends invite emails from connect@wonderapps.biz; `wonderapps_dashboard_read` stays on every table except `household_ai_credentials`.
- **Needs the owner to run once:** migration `20261018180000_dashboard_no_ai_credentials.sql` drops that policy (and the role's grant) on `household_ai_credentials`. This session's attempts to apply it to the live project were not approved, so it is in the repository but not yet live.
