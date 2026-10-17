# A family event opens to its full detail, with an invite link for people outside WonderHome

## What was done

**The event page** is `/family/events/[eventId]`. It opens from every event row on Family (`CalendarItem` now takes an `href`), from the Today "Reply" button, and from Home's expanded event row ("Open the plan"). The sections:
- **The details.** When, where, kind, who planned it, and "Good to know". The planner, anyone (for an unowned event) or an Admin can edit or cancel it, and a cancelled event can be brought back. It is never deleted, so its replies stay on record.
- **"Still to plan".** It lists what the event still needs, read by rules from its own fields (`planningGaps` in `family/event-detail.ts`, never a model): a place, who's coming, a note, and, for sociable kinds, an invite link. Once people are asked, it shows "Waiting for replies". Each gap carries the one action that fills it ("Add" opens the edit sheet; "Create a link" makes the link).
- **"Are you coming?"** A member who is asked answers yes, maybe or no.
- **"From the family".** Everyone's answer, plus checkbox chips to choose who is asked. A new RLS policy, `event_participants_write_event_owner`, lets the event's planner do this, not just an Admin.
- **"Invite with a link".** It creates a link, `/e/<token>` (32 random bytes). The link can be copied, shared through the phone's share sheet, replaced with a new one, or turned off.
- **"Replies through the link".** Each guest's name, answer, party size and note, and each reply can be removed.

**The public invite page** is `/e/<token>`. It is public by design and documented in `route-policy.ts`.
- **What it shows.** Only the event's title, time (in the household's timezone), place and the household's name, in the guest's own browser language.
- **The reply.** The guest gives their name, yes / maybe / no, how many, and an optional note. Replying again with the same name changes the answer.
- **How replies are written.** Only on the server (`replyThroughLink`, admin client), after the token matches again.
- **Rate limit.** Replies are limited per hashed client address (`event.reply`).
- **Dead links.** A link that is off or unknown says only that it isn't working. A cancelled or past event takes no replies.

**Why the token is stored as it is.** A household invitation grants membership, so it is kept only as a hash. This link can only show one event and take a reply, and the household needs to copy it again later, so it is kept as it is. It is readable by members only and revoked with `revoked_at`.

## Data

Migration `20261017190000_event_invite_links.sql`, applied live:
- `event_invite_links`: members read and create; revoke by update.
- `event_guests`: members read and delete; no session ever inserts a reply.
- The planner policy on `event_participants`.

## Verified

- **RLS.** `scripts/test-event-invites-rls.mjs`, 4/4.
- **Unit tests.** `planningGaps` tests, a route-policy test for `/e/`, and the family, i18n, security and component suites.
- **Typecheck, lint, migration lint, boundaries and secret lint** all pass.
- **`verify:live`.** 237/237, including the two new tables and anonymous reads denied.
- **Browser check at 360px and desktop with a QA household.** It covered the gap list, adding a place and note from a gap row, inviting a member, creating the link, a signed-out guest replying ("Ravi Kumar, 3 people") and the owner seeing it. "Still to plan" then read "Everything's planned", and nothing scrolled sideways.
- **Words and help.** Eight languages for both pages; the Family help section has a new paragraph.

## Open

- **No notification on a guest reply yet.** A new reply only shows on the event page. A reminder source for it would be the next step.
- **No HomeTalk path to the link.** The link is not offered through HomeTalk; the event page is the one place for it.
