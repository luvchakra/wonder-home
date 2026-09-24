# HomeTalk: message search in the header, no empty band above the tab bar

**What.**

- **Search in the header.** On HomeTalk the header now shows the WonderHome mark and a "Search messages" box in place of the page title. On desktop the box takes the place of the global search. Typing searches what the member said to WonderHome and what it said back:
  - it covers all of their own conversations in this household, newest first, up to 30 results;
  - each result shows who said it, the day and time (in the household's zone), and an excerpt with the words marked;
  - tapping a result that's on screen scrolls to it and briefly highlights it; one from further back opens in full inside the results;
  - the results panel shows a loading state, an empty state and an error state, and closes on Escape or a tap outside.
- **Bottom gap removed.** The empty band between the composer and the tab bar is gone. HomeTalk used to stop the full raised-button clearance (44px) above the bar, though the raised button only rises about 15px. It now stops just clear of the button.

**How.**

- **Search API.** `GET /api/v1/households/{id}/conversation?q=` returns `{ matches }`, through `searchMessages` in `conversation/repository.ts`. It reuses the existing route rather than adding a new one.
  - It reads only the caller's own sessions. A conversation another member shared with the household is not searched, and RLS still decides what is readable at all.
  - The query is escaped for `ilike` (`messageSearchPattern`, so `%`, `_` and `\` are literal), must be at least 2 characters, and is capped at 100.
  - The OpenAPI document describes the new parameter.
- **Search UI.** `apps/web/app/ai/conversation-search.tsx` waits 250ms after typing stops, cancels a search that's been superseded, and strips reply markdown before building excerpts. Every message now carries an anchor (`ChatMessage`'s new `id`), which is how a result scrolls to it.
- **Shell.** `MobileHeader` gains a `search` slot, and `AppShell` gains `headerSearch` and `fill`. The new token `--wh-tabbar-raised-overhang: 1.25rem` in `ui-theme.css` is used by `fill` screens and by HomeTalk's height calculation. Scrolling pages keep the full clearance.

**Verified.**

- `npm run typecheck` and `npm run lint` pass.
- The new `message-search.test.ts` passes (4 tests on the pattern and its escaping), as do the OpenAPI tests.
- Driven in Chromium at 360×780 and 1280×860 against a QA household with real turns:
  - the composer's disclaimer now ends 18px above the tab bar (it was 42px), just clear of the raised button;
  - no horizontal scroll;
  - the "Search messages" placeholder fits at 360px (158px of text and padding in a 164px field);
  - "grocery" found 2 messages and "ADD" found 4 (case-insensitive); "zzzqqq" showed "No messages mention …";
  - picking a result scrolled to that message and closed the panel;
  - another household's id returned 404.

**QA cleanup.**

- QA user `0b2091ce-e394-47ca-b586-0351b9b4322c` was deleted.
- Household `215cb42f-4167-4c47-a146-44e6e4bdd7a4` was deleted, along with its messages and grocery rows. A count confirmed zero were left.
