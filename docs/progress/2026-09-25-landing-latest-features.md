# Landing page brought up to date

## What was done

The landing page now tells the product as it is today, and no longer claims
anything that isn't live.

**"New in WonderHome", ready today.** There are eight cards:

- your language across HomeTalk, reminders and screens (seven languages);
- reading a whole document into separate items, where a moved date updates
  and never duplicates;
- correcting it like a person ("No, almond milk");
- hands-free conversation;
- reminders that fit your day (timing per kind, snooze, the day's summary,
  one nudge per child per day);
- cover when help is away;
- receipts becoming purchase history;
- "Your data, your call" (download, or deletion with 30 days to change your
  mind).

"Coming soon" is unchanged: WhatsApp, forwarded email, Alexa and Gemini
voice, and paying for a plan. Each is built, and each waits on an account.

**Claims corrected.**
- The hero's "Grocery order delivered · ₹1,840" became "Grocery list ready
  · 7 items". Ordering from a shop isn't live.
- "Save time: groceries ordered, bills paid" became "lists built, bills
  lined up". WonderHome does not order or pay today.

**Features grid.** It grew from 12 to 16 cards, a full 4×4. It adds Family
time, Home & Upkeep, Reminders and Your language, and "AI Assistant" is now
named HomeTalk.

**Also.**
- The HomeTalk section mentions correcting it in plain words.
- The privacy footnote says you can download your data or have it deleted
  from Settings.

## Verified

- Typecheck and lint pass.
- In a browser with reduced motion, at 360px and 1280px:
  - every new line is present, and both old claims are gone;
  - the cards read cleanly;
  - there is no horizontal overflow.
- The landing e2e checks pin the section ids and headings, not this copy.
  CI runs them.
