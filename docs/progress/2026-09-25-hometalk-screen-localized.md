# HomeTalk screen in each person's language (story 22-004, one screen)

## What was done

`/ai` now reads its own wording from the catalog in all seven languages
(en, hi, mr, es, fr, de, ar). That is about 80 new keys:
`hometalk.ui.*`, `hometalk.composer.*`, `hometalk.preview.*` and
`hometalk.search.*`. Story 22-005 already put WonderHome's replies into the
person's language. With this change the screen around those replies follows
the language too:

- the greeting, the intro, the suggestions and their heading;
- Confirm / Change / Cancel, "already on record", Edit and "Try again";
- the jump to the latest message, the editing banner and the footer line;
- the composer: its accessible name, placeholder, attach, speak and send,
  every voice state (listening, transcribing, paused, thinking, speaking,
  the live-engine picker) and the three-step strip;
- the action preview's frame: its title, state words, section headings and
  "can be undone";
- the error lines, and "Today" and "Yesterday" with the reader's clock (12h
  or 24h) on every message time;
- the conversation search: its label, placeholder and clear button, the
  searching, failed and no-match lines, the result count with each
  language's own plural forms, and "You".

How it is built:

- The assistant, the composer, the action preview and the search are client
  components. The page builds their words on the server, in
  `app/ai/hometalk-labels.ts` (`assistantLabels`, `conversationSearchLabels`),
  and passes them in as `labels`. Nothing in the browser holds a catalog.
- `TalkComposer` and `ActionPreview` in the core kit take an optional
  `labels` prop and default to English. Any other screen that uses them keeps
  working unchanged.
- A suggestion is shown in the person's language but sends its English
  sentence. The rules path reads English, and the model path reads either.
  "Actually, let me change that." stays an English utterance for the same
  reason.
- `{engine}`, `{who}`, `{name}` and `{query}` stay placeholders in the
  catalog and are filled in on the client. The search's result count is
  rendered per count on the server, up to the most one search returns (50),
  so Arabic's dual and few forms are exact.
- `messageTime`/`messageDayLabel` take an optional style: locale, 12h or
  24h, and the "Today" and "Yesterday" words.

## Still English, deliberately

- The action preview's content (the summary, the changes and the "because"
  line) comes from the engine as English. That is the record.
- The browser tab title. Metadata can render before the session sets the
  viewer's language, as on every other screen.

## Verified

- Typecheck, lint, the migration, embed, boundary and secret lints, the
  tracker check, the brand check, the security suite (12/12) and eval all
  pass.
- The unit suite passes 2903/2903, including the catalog completeness and
  placeholder tests and the message-time tests.
- Browser QA on the real project as a Hindi-speaking member, at 360px and
  1280px:
  - the empty state, the suggestions, the composer and its accessible name
    were all in Hindi, and so were the footer and the action preview frame;
  - after "Add milk to the grocery list", the reply was in English with the
    Hindi notice, because there is no model provider locally to translate
    it (22-005's honest fallback);
  - the search for "milk" showed "6 संदेश", "आज · 8:22 am" and "आप", and the
    clear button's label was in Hindi;
  - there was no horizontal overflow at either width.

## Still open

22-004 stays In Progress. Today, Family, More and the domain screens still
read English literals. They move to the catalog the same way, one screen at
a time.

## Cleanup

QA user `e876f5eb-bac1-46aa-8b8f-3f57e86648c3` and household
`e85b1af7-da7c-439c-8e2e-a72369ffb589` ("Talk QA Home") are removed once this
PR merges.
