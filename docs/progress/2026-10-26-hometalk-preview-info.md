# A finished turn's action preview behind an "i" (14-054)

**Why.** The owner, 2026-10-26, 9:13 PM IST: "do not show separate card for action preview, rather show a small i icon left to time, clicking on i should pop up the action preview". Their yes to building it came in this session. This follows 14-053 (#380), which only hid the card on turns that just asked a question.

## What was built

- **`ui/preview-info`** (`PreviewInfo`): a 16 px "i" with a 44 px tap target, named "Details of what WonderHome did" in eight languages (`hometalk.preview.details`).
  - On a desktop (`sm` and up) it opens the same `ActionPreview` in a `Popover`; on a phone, in a bottom `Sheet`.
  - Radix handles Escape, a tap outside and focus. Focus returns to the "i" however the preview closes.
- **`ChatMessage`** takes the "i" as `timeLead`, just left of the time in the reply's corner. `ChatTimeRoom lead` keeps room for it on the last line, so the time doesn't drop to a line of its own.
- **`assistant.tsx`**: a reply whose preview is settled (done, nothing to change, failed, left alone, prepared, or a turn that only asked) shows the "i" and no card.
  - **A preview waiting for a decision keeps its inline card** with Confirm / Change / Cancel, or "Ask a grown-up". A decision is never hidden behind an icon.
  - "Can be undone" shows only on a done turn whose preview says so, never under a question.
- **Help**: HomeTalk ¶2 in all eight languages says where the "i" is and that a request waiting for your OK keeps its details and buttons under the reply.

## Verified

- Unit tests (`ui/preview-info.test.tsx`):
  - a named button, closed, with no card content;
  - placed before the time;
  - the time's room widens only with an "i".
- Signed-in E2E (`e2e/screens.spec.ts`), mobile and desktop, live project:
  - a done turn shows the "i" and no card;
  - a waiting payment shows its inline card with Confirm;
  - the "i" is a 44 px target, sitting left of the time on the same line;
  - Enter opens the preview with "Can be undone.", Escape closes it and focus returns to the "i";
  - a tap opens it too;
  - no overflow.
- Browser screenshots at 360 px and 1280 px with a throwaway account:
  - the footer reads "ⓘ 9:49 pm" on one line;
  - on a phone the bottom sheet opens; on a desktop the popover sits above the reply;
  - the decision card stays below its reply.
- The QA account (`716b150a-…`) and household (`af8049b0-…`) were deleted and confirmed gone.

## Open

- On a phone the sheet's title and the card's own "Action preview" header both show; harmless, kept so the card is identical wherever it appears.
