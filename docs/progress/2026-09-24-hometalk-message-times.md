# HomeTalk: a time on every message, a date between days

**What.** HomeTalk now shows when each message was said, the way WhatsApp does:

- **Time on each bubble.** The time sits small in the bottom corner of each bubble, as in "4:07 PM". On a short message it sits beside the last words. When the text needs the full width, it drops to its own line in the corner.
- **Date between days.** A centred date pill separates the days: "Today", "Yesterday", then the full date, as in "September 7, 2026".

**How.**

- **Formatting.** `packages/core/src/conversation/message-time.ts` holds `messageTime`, `messageDay` and `messageDayLabel`. They always format in the household's own time zone (`households.timezone`), never the server's or the browser's. The page is rendered on a server in UTC and again in the browser, and one shared zone keeps the two identical (no hydration mismatch). It also makes "Today" the household's today.
  - "Yesterday" is worked out on the calendar date itself, so a daylight-saving day can't make yesterday look like two days ago.
  - An unknown zone falls back to UTC rather than breaking the page.
- **Where the times come from.** History comes from `conversation_messages.created_at`. New turns, replies, live-conversation transcripts, recaps and decision replies are stamped when they arrive. The "thinking" placeholder has no time and never starts a new day.
- **Kit components** (in `ai-message.tsx`): `ChatMessage` takes a new `sentAt` prop and renders it as a `<time dateTime>`, and `ChatDayDivider` is the date pill. `design/DESIGN-NOTES.md` is updated.

**Verified.**

- `npm run typecheck`, `npm run lint` and the new `message-time.test.ts` all pass. The six tests cover the time format, the household's day versus the server's, Today/Yesterday/full date, month and year boundaries, midnight in the household's zone, and an unknown zone.
- Checked in Chromium at 360×780 and 1280×860 with a QA household in Asia/Kolkata, after backdating two of its turns in SQL:
  - the dividers read "September 7, 2026", "Yesterday" and "Today";
  - 10:37 UTC showed as 4:07 PM;
  - no hydration errors;
  - no horizontal scroll.

**QA cleanup.**

- QA user `2d099189-6d34-4d58-965c-5bfb86b3fed4` was deleted.
- Household `0bdb9350-db69-4c2d-aef3-fd3fa27b5123` was deleted, along with its messages. A count confirmed zero were left.
