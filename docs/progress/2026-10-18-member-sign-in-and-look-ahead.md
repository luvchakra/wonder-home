# Every member signs in as themselves; the bars step aside; HomeTalk looks ahead

**Date:** 2026-10-18 · **Stories:** 01-010, 00-012 (both In Progress, browser check to do), HomeEvents 26-003

## Every member signs in as themselves (01-010)

**What it does**
- **Recording the email.** An Admin opens a person in Family (or Househelp), taps the pencil and fills in **Sign-in email**, beside the date of birth. It is stored in `household_member_emails`. Only Admins write it; Admins and the member read it.
- **Matching on sign-in.** A sign-in whose *verified* email matches becomes that member, with the role they already have, so a child stays a child. Any sign-in method counts: password, Google or any provider Supabase verifies. The match is made by `wh.claim_members_by_email`, called:
  - after a password sign-in;
  - in the OAuth callback;
  - whenever a signed-in person has no household (`membershipsOrClaimed`, which covers the email-confirmation link).

  What they then see follows their role, as for every other member.
- **What never links.**
  - An unconfirmed email.
  - A removed member.
  - A person already in that household.
- **Invite.** **Invite** on a member without an account opens a sheet.
  - **Create invite link** makes a single-use link that expires after 7 days. A new link stops the old one.
  - **Send email** opens the Admin's own mail app with the link filled in. WonderHome has no mail provider, so it never claims to send.
  - **Share** opens the phone's share sheet (WhatsApp and the rest).
  - **Copy link** copies it.
- **What an invite allows.** It may be for a child, but only the child already on record, and it never creates a child. Accepting keeps the member's own role, never the invitation's. A member with no role at all gets one from their type.
- **Recorded.** Audit events `member.email_set`, `member.email_cleared` and `member.signed_in_by_email`.

**Migration**
- `20261018160000_member_sign_in_by_email.sql`, applied to the live project through the Supabase MCP.
- Verified by query: 4 policies, both functions, nullable invitation email, and the child check.
- `verify-live-project.mjs` checks the table. It could not run here: there is no `.env.local`.

## The bars step aside while reading (00-012)

`ScrollChrome` handles it:
- On a phone, scrolling down hides the header first, then the tab bar with its raised button.
- Any scroll up, the top of the page and the end of the page bring both back.
- Desktop is unchanged, and HomeTalk's own scroller keeps its bars.
- Reduced motion hides the bars without the slide.

## HomeTalk looks ahead (owner's screenshot)

"What's the next upcoming event?" got "your week looks clear", and "How about the public holiday?" got "no holiday information". HomeBrain's facts stop at a week and hold no holidays.

`calendar/answer.ts`'s `readLookAhead` reads by rules:
- "next/upcoming" events;
- any holiday question;
- upcoming birthdays.

`lookAheadReply` answers from the calendar a year ahead: the next one and the two after it, for that person only. A question naming bills or school stays HomeBrain's. Golden cases HT-76 to HT-80 cover it, including the screenshot's exact two-turn conversation and a private event.

## Verified
- DB: 607/607, including `test-member-sign-in-rls.mjs` (9 tests).
- `npm run eval`: 110/110, unsafe 0/17.
- Core unit tests.
- Typecheck, migration lint, security, help links (help in 8 languages for Family and Calendar), and tracker check.
- A local build.

## Still open
- **Browser check at 360px and desktop** of the email field, the Invite sheet and the scrolling bars. This session had no QA credentials (`apps/web/.env.local`), so 01-010 and 00-012 stay In Progress until a session with them drives it.
- **Supabase email confirmation.** Matching relies on it being on for password sign-ups; Google emails are already verified.
- **Sending the email.** Sending the invite from WonderHome itself would need a mail provider, which is a person's decision.
