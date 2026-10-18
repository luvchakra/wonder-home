# Browser QA: member sign-in, invites, scrolling bars, Calendar, work facts

**Date:** 2026-10-18 · **Stories now Done:** 01-010, 00-012, 24-007, 26-001

## How it was checked
- A production build of `main` (#216) ran locally against the live Supabase project, using credentials the owner provided. They are in `apps/web/.env.local`, which is gitignored.
- The checks ran at 360×780 and 1280×900 with Playwright on the preinstalled Chromium.
- Three QA accounts were made with `scripts/qa-test-user.mjs` (an admin, a child, a helper), plus one QA household.
- A child member and a helper member were inserted with SQL, so their invite and email flows could be driven through the UI.

## What was seen
- **01-010, a member signs in as themselves.**
  - The Admin opened Anya in Family, tapped the pencil and set her **Sign-in email**. Family then showed it.
  - Anya's account then signed in by password and landed straight on the household's **child Home** ("Hi Anya!").
  - Her role held on the other screens:
    - Bills said "Not available to you".
    - Members was read-only.
    - Your plan was read-only ("An Admin can change it").
  - **Invite** on the helper made a link.
    - Send email opened a filled-in mail.
    - Copy link worked.
    - Share only appears where the browser has a share sheet; headless desktop Chromium has none.
  - Opened signed out, the link went to sign-in, then back to the invite. Accepting made the account the helper already on record: three members, roles head, child and helper, and no duplicate.
- **00-012, the bars step aside.**
  - The first version hid both bars on a single 120px flick.
  - The tab bar's threshold is now 280px, so the header goes at about 40px and the tab bar visibly later. A 20px scroll up brings both back.
  - The slide is now 300ms ease-out.
- **24-007.** Family shows "How they work: Hybrid" and the office hours.
- **26-001.**
  - Month, Week, Day and Year render at both sizes, with no sideways scroll and no error states.
  - An event added at 360px appears on its day.
- **No horizontal scroll.** On Family, `scrollWidth` reads 54px wider with a member's photo control open. That comes from the visually hidden file input, which existed before today. The page cannot actually scroll sideways: `scrollX` stays 0.

## Cleanup
- The QA household was deleted with the service-role client. The SQL tool's delete was cancelled.
- The three QA users were deleted.
- A count found 0 households, members, emails, invitations, events, audit rows, users and profiles left.
- The local server was stopped and the scratch files removed.

## Still open
- **24-005, 24-006.** The office picker and Add a place need `GOOGLE_MAPS_API_KEY` in the build being checked. Without it they are hidden by design, as they were here.
- **The service-role key** was pasted into the chat to enable this. The owner should rotate it.
