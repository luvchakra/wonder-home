# Replies that read well and take you there

**Date:** 2026-09-20 · **Kind:** product-direction P0 (v4 §7 conversation as a control surface; §3 "one decision at a time") · follows the Household Brain note

## What was done

Assistant replies were one run-on sentence of plain text, and a reply that
said "the electricity bill is due tomorrow" left the person to go and find
it. Now:

- **A reply format** (`packages/core/src/conversation/reply-format.ts`):
  paragraphs, a bullet list (`- ` lines), `**bold**`, and links written
  `[label](/path)` — and nothing else. `parseReply` turns text into blocks
  of text, emphasis and *vetted* links: a path is allowed only when it is
  one of `APP_PLACES`, the seventeen screens of the app with a line each on
  what is there. A link to anywhere else — an outside URL, an API route, a
  path the model made up — comes out as its label and nothing more. Raw
  HTML is text. That is the whole safety argument for letting a model
  write links.
- **A renderer** (`components/ui/reply-text.tsx`): the blocks as `<p>`,
  `<ul>`, `<strong>` and real Next `Link`s, in the assistant bubble. Member
  messages stay plain.
- **The model writes in it**: `describeReplyFormat()` is appended to the
  answer composer's prompt — short paragraphs, a list for three or more
  things, bold for the one thing that matters, links only to the listed
  paths, at the end of the sentence they help.
- **The deterministic answers do too**: the status answer is now a bold
  count, one bullet per need with its reason and a link to the screen it
  belongs to (each need carries the domain's own `href` from the agenda),
  and "Today has the day's plan" when all is quiet; a day's events link to
  Family; "Added **Milk** to the groceries" links the list; "Remembered:
  **…**" links What WonderHome believes; every not-yet-doable line links
  the screen where the person can do it themselves; help links the guide.

## Verified

- `reply-format.test.ts` (7 cases): the grammar; outside and API links
  reduced to labels; HTML never rendered; numbered lists; `linkTo` only for
  known places; every place a distinct app path. `status.test.ts` updated
  to the new shape.
- Static screenshot of a formatted reply in the chat bubble at 390px:
  bold count, two bullets with arrows to Bills and School, a closing
  paragraph with an inline link — reads cleanly, nothing clipped.
- `packages/core` vitest 1,160 pass; `npm run typecheck`, `lint`, `test`,
  `build`, `test:e2e` — see the PR.

## Still open

- Deep links with a query (`/groceries?tab=list`) are allowed by the
  parser; the model is only told the bare paths. Per-item links (a specific
  bill) would need item ids in the facts.
- Notifications and any other surface that shows a reply as plain text
  should use `plainText()`; nothing does yet because nothing else shows one.
