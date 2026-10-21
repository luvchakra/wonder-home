# FamilyChat: the new name, a compact thread, and reactions

**Date:** 2026-10-21 · **Story:** 12-015 (follow-up) · **Asked by:** the owner

## What was done

- **The new name.** Users now see the feature as **FamilyChat**: nav, page titles, help, the inbox and thread fallback title, and the Home "Trending" lede. Like HomeTalk, the name is not translated. The household thread was "Family chat" and is now **Whole family**, translated in all eight languages, including the `reminder.chat.family` notice wording. Family's icon now reads "Message the whole family". Routes, the help section id `chat`, code identifiers and database objects are unchanged.
- **A compact thread** (`apps/web/app/chat/[threadId]/thread-view.tsx`):
  - One row per message. Your own messages sit on the right, everyone else's on the left.
  - The time sits inside the bubble at its bottom corner. An invisible copy of it keeps room on the last line, so it never covers a word.
  - A person's name shows only on the first message of their run. Gaps are 2px within a run and 8px between runs.
  - A Today / Yesterday / date chip marks each new day.
  - The per-message "…" row is gone. Every action (react, change, take back) opens from a long-press, a right-click or the smiley icon beside the bubble. On hover devices that icon shows only while the row is hovered.
  - Attachment cards inside a bubble are tighter.
- **The composer:**
  - A single row that grows as you type, with attach and send as icons.
  - The three notes are now one small line.
  - It is sticky above the tab bar and its raised button (`.wh-chat-composer` in `ui-theme.css`). While the message box has focus on a phone, the tab bar steps aside (`data-wh-typing`). This fixes the composer sitting behind the tab bar (rule 15).
- **Reactions:**
  - There are six emoji, one per person per message. Picking a different emoji changes yours, and picking the same one again removes it.
  - Reactions show as a pill under the bubble's corner with a count per emoji. Tapping the pill shows who reacted, with a way to remove your own.
  - The data is `chat_message_reactions` (migration `20261021070000_chat_reactions.sql`). The thread and household are copied from the message by a guard trigger, and the policies use the set forms (`wh.my_chat_threads()`, `wh.my_memberships()`).
  - Writes go through the security-invoker `public.chat_react`, called by `reactToChatMessageAction` (zod-checked emoji).
  - Reactions are read in the same request as the messages (a PostgREST embed). `readMessages` falls back to the messages alone while the table is absent.
  - Reactions raise no notices.
- **Kit:** a new `Popover` (`packages/core/src/components/ui/popover.tsx`), described in `design/DESIGN-NOTES.md`.
- **Pure helpers** live in `packages/core/src/chat/thread.ts`, with tests: `groupMessages`, `dayKind`, `tallyReactions`, `nextReaction` and `withMyReaction`.

## Verified

- `tsc` passes for apps/web and packages/core. ESLint on the changed app files is clean.
- Vitest: chat, notices, help, navigation and i18n, 180 tests passing.
- `npm run build -w apps/web` passes.
- These checks pass: `check:bundle`, `lint:help-links`, `lint:secrets`, `lint:migrations`, `lint:embeds` and `tracker --check`.
- `scripts/test-chat-rls.mjs` passes 12 of 12 on a local PostgreSQL 16. Three of those are new reaction cases:
  - a participant reacts, changes and removes a reaction;
  - an outsider and a helper in Whole family can neither read nor write;
  - nobody changes someone else's reaction, and a taken-back message takes no reactions.
- Browser QA against the production build, at 360px and 1280px, with two QA users:
  - the compact layout, and the composer clear of the tab bar (its bottom at 628px, the bar's top at 671px);
  - the tab bar stepping aside while typing, and the composer growing;
  - the long-press / right-click menu anchored on its bubble;
  - change, take back and send still working.
  - Reactions could not be exercised end to end, because the table is not live (below).

## Still open

- **The migration is not on the live project.** The `apply_migration` call was cancelled, and the table and function are absent (verified with `to_regclass`). The owner chose to ship without it for now (story 12-016, Blocked). Until it is applied, `readMessagesWithReactions` reports `reactionsOn: false`, the thread offers no reaction at all (rule 10), and the Chat help paragraph leaves reactions out. Apply `supabase/migrations/20261021070000_chat_reactions.sql` with `apply_migration`, then run `npm run verify:live`.
- **No before screenshots** were taken; the owner's own screenshot is the before.

## Cleanup

- The two QA accounts are deleted, and so is the QA household with its messages. A SQL count found 0 users, 0 profiles, 0 households and 0 messages left.
- The local server and the local PostgreSQL are stopped, and the scratch scripts are removed.
