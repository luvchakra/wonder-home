# WonderHome — HomeEvents

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 26-001 | Family Calendar foundation | Done | Formerly 12-009. C1 (design/FAMILY-CALENDAR-PHASE0.md, D1–D7 approved 2026-10-18) built: migration `20261018120000` (visibility, all-day, repeat rules, exceptions, DoP&T holidays, preferences, family events on every plan), `packages/core/src/calendar/`, `/calendar` Month/Week/Day/Year, the Today tab is Calendar. Migration live 2026-10-18 (applied by the owner in the SQL editor, verified by query). Browser-checked 2026-10-18 against the live project at 360px and 1280px with QA accounts (cleaned up afterwards): Month, Week, Day and Year at both sizes with no sideways scroll; adding an event at 360px put it on its day |
| 2 | P0 | 26-002 | Calendar module adapters | Not Started | Formerly 12-010. C2: school, meals, bills, health, helpers, upkeep, outcomes and orders on the calendar, each through its own visibility rules; "Busy" for health; dedupe by source |
| 3 | P1 | 26-003 | HomeTalk plans with the calendar | In Progress | Formerly 12-011. Read half done (2026-10-18): a question over a month-sized span ("any events in December?", "the next few months") is answered by rules from `calendarRange` for the speaker (`calendar/answer.ts`, `resolveCalendarSpan`, golden HT-26/HT-27); day and week questions keep HomeBrain's answer. A month question about another part of the home ("which bills are due this month?") is HomeBrain's, not a calendar list (`asksTheCalendar`); the golden set checks each member's month against visibility (HT-56 to HT-64). "What's the next upcoming event?", "how about the public holiday?" and "any birthdays coming up?" are answered from the calendar a year ahead (`readLookAhead`, `lookAheadReply`), never "your week is clear" (HT-76 to HT-80). Still to do: C3: plan_event with participants and conflicts, find_free_time, moving and cancelling events, answers read from the projection |
| 4 | P1 | 26-004 | Calendar reminders and holiday region | Not Started | Formerly 12-012. C4: reminders to every participant, a daily digest option, holiday region in Settings → Language & Region |
| 5 | P2 | 26-005 | Calendar notices over WhatsApp | Not Started | Formerly 12-013. C5: only if wanted; the official template, shared with Groceries' Send to Cook |
| 6 | P2 | 26-006 | Google and Outlook calendars | Not Started | Formerly 12-014. C6: only after a separate approval |
| 7 | P1 | 26-007 | Home's next event says what kind it is | Done | The owner's report, 2026-10-18 (PR #232): a school trip came up on Home as a "Family moment" with a heart and "Plan together". The card now takes the next family-kind event (family time, outing, birthday, gathering, travel, special occasion), and only when there is none the next event of any kind, said as what it is: "School event" with the school tile and "Open event" to that event's page, "Appointment" likewise, "Family moment" with "Plan together" for the rest. `CalendarItem` gives school events and appointments the calendar's own tiles, and its Protected badge wraps under a short title instead of being cut. Words in eight languages. Browser-checked at 360px and 1280px: a protected school trip alone reads School event / Open event (the event page opens); with a family picnic three days later the card is the picnic, Family moment / Plan together; no horizontal scroll |
| 8 | P1 | 26-008 | Today with nothing booked doesn't call itself a free day | Done | The owner's report, 2026-10-18 (PR #235): the day view said "Nothing planned — a free day" right above Today's plan of meals, bills and school. Today with no events is now one card, "Nothing on the calendar today.", holding the Today's plan link; another empty day reads "No events — nothing is on the calendar for this day." Eight languages. Checked at 360px |
| 9 | P1 | 26-009 | Decorated invitations, and a big postcard on WhatsApp | Done | The owner, 2026-10-18 (PR #236): an event's invite link wears one of nine designs (birthday, anniversary, wedding, festival, puja, housewarming, baby, get-together, classic), chosen from the event's kind and title by rules (`family/invite-templates.ts`, `suggestTemplate`) until the household picks one on the event page, with an optional line for guests (never the notes). The guest page is the decorated `InvitationCard`; `e/[token]/opengraph-image.tsx` draws the same design as a 1200×630 postcard that WhatsApp shows large, in the household's language (Devanagari and other scripts through Noto for just the characters used). Migration `20261018270000` live (`invite_template`, `invite_message`). Checked: all nine postcards rendered; the guest page at 360px and desktop; picking Festival and a line on the event page showed on the page |
| 10 | P1 | 26-010 | A member's birthday is the whole day, not 5:30 am to 5:30 am | Done | The owner's report, 2026-10-18 (PR #236): the member-occasion trigger wrote a birthday as UTC midnight to midnight, so in India the event read "5:30 am – 5:30 am". It now writes the household's local day as an all-day event, and the rows already written were moved onto that day (same migration). DB test; `verify:live` checks no timed member occasion is left |
| 11 | P1 | 26-011 | Event cards say who is going, and use their width | Done | The owner's report, 2026-10-18 (PR #236): Home's event card showed every family member's avatar although only Asmi was going, and squeezed the title and time beside a second kind tile and the button. Now every event list (Home's card, Today's focus, Family's Upcoming, a child's Home) says when the same way — "All day" for an all-day event, never a midnight time (`_lib/event-when.ts`) — and its place; Home's card and Family's list name who is going from the event's own list ("With Asmi", or on Home "Nobody from the family is asked yet" with a button to ask), and the card gives the title the full width with the action beside who is going. Today's rows wear the event's kind, not always a heart, and no longer cut the time. Every event row tucks its kind's tile under the date leaf, so the title, time and place take the row's width and a time no longer wraps. Checked at 360px and 1280px: a school trip only Asmi goes to reads "With Asmi QA"; a birthday reads "All day" |
| 12 | P1 | 26-012 | A tall, phone-shaped invitation, and a preview before saving | Done | The owner, 2026-10-18 (PR #237): Share invitation sends the invitation as a 1080×1350 picture with the link (`e/[token]/card`, one renderer with the link preview, `render-invitation.tsx`), so it shows whole in a chat; the wide picture stays as the link preview, since a chat only shows a wide one large. Preview in the design picker shows the invitation with the design and line picked, before saving. Checked: three designs drawn tall; the wedding preview at 360px; Share invitation opened the picture where the browser can't share files |
| 13 | P1 | 26-013 | "More family time!" only on family events | Done | The owner, 2026-10-18 (PR #241): Home's event card closed every event with "More family time!", a school event or an office review included. It now shows only for family kinds (family time, outing, birthday, gathering, travel, special occasion; `momentLook.family` in `_screens/home-dashboard.tsx`). Checked at 360px: a school event has no line, a movie night does |
| 14 | P1 | 26-014 | An event's "Where" is picked from Google Maps | Done | The owner, 2026-10-19 (screenshot of Edit the plan). Adding or editing an event, an adult searches Google Maps for Where (`EventPlaceField`, the same `PlaceSearchField` as the place book). The server re-reads a picked place by its id (`eventPlaceFromForm` → `decideEventPlace`, `places/event-place.ts`) and keeps its name, address and id (`family_events.location_address`, `location_place_id`, migration `20261019130000`, live). A typed place such as Home is kept as written, and a pick that cannot be read keeps the typed words. The event page shows the address with Open in Google Maps, and the guest invitation page gives directions; a typed place has no link. Help: Calendar ¶3 in 8 languages |
| 15 | P1 | 26-015 | The invitation link carries the guest's name | Done | The owner, 2026-10-19 (screenshot of the guest reply page's empty "Your name"). A phone's share sheet never says which contact was chosen, so the name is picked in WonderHome first: "Who is it for? (optional)" above the link in `EventLinkShare`, with Pick from contacts where the browser has the Contact Picker API (Android Chrome; one contact, name only, each time). The copied and shared link becomes `/e/<token>?to=<name>` and the share text names them; the guest page reads `?to=` (`guestNameFrom`: control characters dropped, 80 characters) into "Your name" as a default the guest can change, and trusts it for nothing else. Help: Calendar ¶8 in 8 languages

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
HomeEvents is the owner's name for everything about the household's calendar: family events and who can see them, birthdays and occasions, public holidays, the Calendar tab's Month, Week, Day and Year, and — in later phases — every other module's dates, HomeTalk planning, reminders and outside calendars. It started as the Family Calendar stories in module 12 and was named HomeEvents on 2026-10-18; stories 12-009 to 12-014 moved here with their old ids kept in the notes. The design is `design/FAMILY-CALENDAR-PHASE0.md` (D1–D7 approved 2026-10-18), and C1 shipped in #211.

## Dependencies
- `CLAUDE.md`
- `design/FAMILY-CALENDAR-PHASE0.md`
- `packages/core/src/calendar/`, `packages/core/src/family/`
- Module 12 (Family Time & Social) for the events themselves

## Stories

### Story 26-001 — Family Calendar foundation
**Epic:** HomeEvents
**Priority:** P0
**Goal:** One calendar the whole household reads, built as a projection of the records that already exist: family events (with visibility, all-day, recurrence and single-occurrence exceptions), birthdays and occasions on the household's own clock, and curated public holidays, in Month (default), Week, Day and Year views with the day's agenda, filters, an add/edit sheet that checks conflicts, and pinch zoom. The Today tab becomes Calendar (D1).

### Story 26-002 — Calendar module adapters
**Epic:** HomeEvents
**Priority:** P0
**Goal:** School, meals, bills, health, helpers, upkeep, outcomes and orders appear on the calendar through their own readers and visibility rules, each opening its own screen; someone else's health appointment is hidden or "Busy" (D4).

### Story 26-003 — HomeTalk plans with the calendar
**Epic:** HomeEvents
**Priority:** P1
**Goal:** HomeTalk puts events on the calendar with participants and conflicts, finds free time, moves and cancels events through approval, and answers "what do we have next week?" from the same projection.

### Story 26-004 — Calendar reminders and holiday region
**Epic:** HomeEvents
**Priority:** P1
**Goal:** Event reminders reach every participant, not only the owner; an optional daily digest; the holiday region is chosen in Settings → Language & Region.

### Story 26-005 — Calendar notices over WhatsApp
**Epic:** HomeEvents
**Priority:** P2
**Goal:** Only if wanted: event notices to a consenting helper or member through the official WhatsApp template.

### Story 26-006 — Google and Outlook calendars
**Epic:** HomeEvents
**Priority:** P2
**Goal:** Two-way sync with Google and Outlook calendars, only after a separate approval.

### Story 26-007 — Home's next event says what kind it is
**Epic:** HomeEvents
**Priority:** P1
**Goal:** Home's next-event card is named, drawn and acted on as the kind of event it is, so a school trip is never shown as a family moment.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.

### Story 26-015 — The invitation link carries the guest's name
**Epic:** HomeEvents
**Priority:** P1
**Goal:** When a household sends an invitation link to one person, that person's reply page opens with their name already filled in, without the household typing it twice or the guest typing it at all.

**Acceptance criteria**
- The invitation box offers "Who is it for? (optional)"; on a phone that has the Contact Picker API, a Pick from contacts button fills it from one chosen contact's name, and nothing else is read from the address book.
- The link shown, copied and shared carries the name (`?to=`), and the share text addresses the guest by name; with no name, the link and text are exactly as before.
- The guest page opens with "Your name" set to that name, cleaned and capped, and the guest can change it; the reply is written only from what the form posts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- Tests, typecheck, lint and build pass; the help section says what changed.

