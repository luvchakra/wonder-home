# Chat: /, @ and #, Trending at home, and chat notifications

**Date:** 2026-10-21 · **Story:** 12-015 (Household chat) · **Asked by:** the owner

> "notification should be triggered for chat feature. design a way to easily
> refer various modules and people while sending a message. Like / can list all
> module related tasks in the app, @ can trigger name of all members in app,
> including pets and helpers, # can be used to make a term trending within the
> app. the trending words can be listed in home page."

## What was done

### Referring to things while writing (`packages/core/src/chat/composer.ts`)
Pure and tested (6 tests). It decides which picker the text at the caret asks
for, puts a pick back into the text, reads tags and ranks trending ones.

- **`/`** opens the attach picker: every bill, meal, event, thing to buy,
  pending school work and active home thing the writer can see, plus screens.
  School work and home things are new attachable kinds (`chat/links.ts`,
  `resolveLink`, `linkOptions`). A pick is the message's attachment, rebuilt on
  the server as before. It is never text.
- **`@`** lists every active member, helper and pet as "@" plus the name they
  are called. A mention may run over spaces ("@Upasana Ch").
- **`#`** lists the tags already used in the writer's chats, or makes a new
  one. A tag is letters (any script, marks included, so Devanagari works),
  digits and underscores, in lower case. Numbers alone are never a tag.
- In a message, a household name after "@" and a tag are shown in the primary
  colour (`piecesOf`, longest name first).
- The picker works by keyboard too: Enter or Tab picks the first item, and
  Escape closes it.
- The note above the message box says what each symbol does.

### Trending at home (`apps/web/app/_components/trending-tags.tsx`)
A card on Home lists the most-used tags of the last seven days. Each message
counts a tag once. The card reads only messages the viewer can read, through
RLS (`recentTaggedMessages`), so a tag from someone else's private chat never
trends for them. Each chip opens the chat the tag was last used in. The card is
hidden when chat is off or there are no tags.

### Notifications (`notifications/notices.ts`'s `chatNotices`, 7 tests)
A chat message is a notice like any other, derived from the record:
- one thread per reader per chat (`chat:{id}`), never sent to the writer;
- Family chat goes to every non-helper member, and a direct or group chat goes
  to its participants;
- the notice never carries the message text, only who wrote and how many
  messages are waiting;
- a mention makes it high priority ("Kunal mentioned you in Family chat");
- it resolves once they have read the chat.

The sweep runs after a send and after a chat is opened. The delivery clock
picks up any household with new chat messages.

Migration `20261021060000_chat_notices.sql` adds `chat_thread` to
`notifications_source_type_check` and an index on
`chat_messages(household_id, created_at)`. It was applied to the live project
and verified there.

Words (`chat.pick.*`, `chat.trending.*`, `chat.kind.school|home`), the
`reminder.chat.*` catalog entries and help (Chat) are in all eight languages.

## Verified
- Unit tests:
  - notifications, chat, help and i18n: 748 pass;
  - composer: 6 tests;
  - chat notices: 7 tests.
- Typecheck is clean (core and web), and ESLint is clean.
- `lint:help-links`, `check:bundle` and `lint:secrets` pass.
- Browser QA at 360px on a QA household:
  - `/` lists screens and records;
  - `@Upa` offers the member and `@Row` offers the pet;
  - `#Diwa` offers a new tag;
  - the sent message highlights both the mention and the tag;
  - Home shows "Trending at home" with no horizontal scroll;
  - the other member received "Kunal mentioned you in Family chat", saw it in
    /notifications, and it resolved once they opened the chat.

## Open
- Tags are counted from up to 500 recent tagged messages a reader can see.
  That bound suits a household. A busier one would want a summary table.
- A notice reaches push or email only through the usual
  `deliverNotification` gates, so it needs a channel set up.
