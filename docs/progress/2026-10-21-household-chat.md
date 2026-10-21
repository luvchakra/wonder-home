# Household chat, with the thing itself attached

2026-10-21 · story 12-015 · In Progress: waits on the migration reaching the live project

## What was asked

The owner asked for "an internal chat feature for each member, including household". Its messages are about WonderHome activities, and a "direct link or tasks can be mentioned in the chat so other member can look at them and take action". They also asked for:
- a chat icon on each Family member row;
- a way "to add members in incremental way";
- Family's labels aligned "so that there are no abrupt line breaks".

## What was built

- **Database** (`supabase/migrations/20261021030000_household_chat.sql`):
  - Tables `chat_threads`, `chat_participants` and `chat_messages`.
  - Each household has one household thread that everyone is in.
  - A direct thread is keyed by the pair, so it is found again rather than duplicated.
  - A direct thread that gains a third person becomes a group, and keeps its history.
  - RLS reads by the set form (`wh.my_chat_threads()`).
  - Threads and participants are written only through `chat_household_thread`, `chat_open_direct`, `chat_add_participants`, `chat_leave` and `chat_mark_read`. `chat_inbox` (security invoker) returns each chat's last message and unread count.
  - A message is written only as yourself, changed or taken back only by its writer, and never deleted.
  - A link must be a path on this site (check constraint).
- **Core** (`packages/core/src/chat/`):
  - `links.ts` builds an attachment from a bill, meal, event, thing to buy or screen.
  - `repository.ts` reads the record through the writer's own session, so the browser only ever names a kind and an id.
- **Screens**:
  - `/chat`: Everyone, then the chats, then Start a chat.
  - `/chat/[threadId]`: the messages and the composer. The Attach sheet is a picked list, never typed (rule 20). Your own messages can be changed or taken back. Add people picks one or several. A group can be left, with a question first. An open chat looks for new messages every 10 s while it is on screen.
  - `/chat/with/[memberId]`: opens the direct chat and goes to it.
- **Navigation**: Chat sits under More (Family & People). Family shows a chat icon beside each other person who signs in themselves, through `ExpandableRow`'s new `trailing` slot.
- **Family header**: Manage is now an icon with its name. `SectionHeader` lets its action move under the title instead of breaking the title mid-phrase.
- **Words, nav and help**: all in eight languages; the help is the new Chat section.

## Verified

- `chat/links.test.ts`: 4 pass.
- `scripts/test-chat-rls.mjs`: 8/8 on a fresh local database. It covers outsiders kept out, writing only as yourself, a direct chat read only by its two people, a group gaining history, a writer-only edit, no delete, the same-site link check, the unread counts and leaving.
- Typecheck, lint on the changed files, the full unit suite (3969 tests), `lint:help-links`, the production build and `check:bundle` are clean.
- Browser, production build, against the live project before the migration:
  - Family at 360px and 1280px: "Family members", its count, the Manage icon and Invite (short label on phones) sit on one line, with no horizontal scroll.
  - Chat is listed under More.
  - `/chat` shows "Chats didn't load" with Try again rather than breaking.

## Open / needs a person

- **Apply the migration on the live project.** This session's `apply_migration` calls were cancelled. Paste `supabase/migrations/20261021030000_household_chat.sql` into the Supabase SQL editor for project `kqxndableyysxqhxiorz`. Until it lands, `/chat` shows "Chats didn't load", so the PR stays a draft.
- Then browser QA at 360px and desktop, and merge.
- Also still to apply: `20261021031000_companion_sayings_cycle.sql` (08-023). Its call was cancelled too.
