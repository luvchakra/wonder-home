# Multilingual HomeTalk (story 22-005)

**Date:** 2026-09-24 · **Module:** 22 Internationalization & Localization · **PR:** i18n PR 2a

## What was done

A person whose language is Hindi, Marathi, Spanish, French, German or Arabic
can now talk to HomeTalk in it, and gets the reply in it. No gate decides
anything differently: every reply is still decided, carried out, validated and
recorded in English, and translation is the last step.

- **Understanding (`ai/model-client.ts`).**
  - `RuntimeContext` gains `language`.
  - `systemFor` adds `languageLine`, which tells the model the person may use
    their language, English, or a mix.
  - The model returns the same language-neutral intent as for English.
  - What deterministic code parses (a day, a time, a number, a unit, a slot)
    comes back in English words.
  - The household's own words (an item, a task, a reminder, a name) are kept
    as said, because localization never changes what is stored.
- **Hello and thanks (`conversation/rules.ts`).** A greeting or a thank-you
  in any of the seven languages is read by the rules. A household served by
  the rules alone is greeted instead of being told "I did not follow that".
  Browser QA found that gap with "नमस्ते".
- **Yes and no (`conversation/intent.ts`).** `classifyShortReply` reads a
  bare yes or no in all seven languages, in their own scripts and as commonly
  typed in Latin letters. It matches whole replies only, like the English
  ones, so "हाँ, पर कल" is not a yes.
- **Replies (`conversation/reply-language.ts`).**
  1. `protectForTranslation` takes out every fact in one pass over the text,
     replacing each with a token ⟦n⟧: names, **bold** values, dates, times,
     amounts, numbers, link targets and the brand names.
  2. The provider's `createReplyTranslator` translates the remaining words.
     It has its own 8-second timeout and one retry.
  3. `checkTranslation` accepts the result only if:
     - every token appears exactly once;
     - it has no digit of its own in any script;
     - it has no new link, `**` or address;
     - its length is plausible for a translation.
  4. Anything else (no model, a failed call or a failed check) shows the
     validated English.
- **Consent (`mayTranslate`, `REPLY_CLASSES`).** The words sent for
  translation carry no names or numbers, but they can still be about a child,
  a health matter or money. So a reply is translated only when the household
  has agreed that every content class it carries may reach its provider.
  - Each HomeTalk action is placed in `REPLY_CLASSES` exactly once. A HomeBrain
    answer carries the classes of its relevant facts. An agenda summary or a
    "why?" answer is assumed to carry all of them.
  - Fair use and the hourly model budget apply, as they do to every model
    call.
  - When a reply stays in English, the person sees one line in their own
    language saying the true reason (`englishNoticeKey`, in all seven
    catalogs):
    - `notPermitted`: the household has not agreed to send it;
    - `noModel`: no model provider is available;
    - `unchecked`: the translation failed its check.

    Browser QA found the first draft saying "not agreed" when no provider
    was configured at all, which is why the reasons are now separate.
- **The record (`hometalk-turn.ts`, `conversation/repository.ts`).**
  - `homeTalkTurn` now wraps `turnInEnglish`.
  - A message's `content` stays the validated English. That is what the model
    reads as history, what a summary quotes and what an audit shows.
  - The shown words, or the reason they are English, are kept in
    `metadata.localized`. `listMessages` returns them, so `/ai` shows the
    same words after a reload.
  - External voice channels (Gemini Voice, Alexa) are left alone, because
    their own assistant speaks in its own voice and language.
- **Prompt version.** The language line and the translator prompt are part of
  `promptVersion()`'s hash, so an evaluation run records which ones it used.

## Verified

- **Unit tests.**
  - `reply-language.test.ts` has 19 tests covering protection order and
    tokens, restoring spans, missing, extra and invented tokens, Devanagari
    digits, markup, length, every fallback, consent by class, the class map
    and the notice reasons.
  - There are new tests for the engine (a Hindi yes or no settles a proposal,
    "हाँ, पर कल" does not), the short-reply reader, the greeting rules,
    `systemFor`'s language line and the translator prompt.
- **`npm run verify`** passed: 2776 unit tests, the database suites, 268 e2e
  tests and every lint gate. After the two QA fixes, lint, typecheck, the
  unit tests (2778), `tracker --check` and the secret lint passed again.
- **Browser QA** at 360px and 1280px, on the local build against the live
  project, as a synthetic Hindi-speaking member in a fresh household:
  - "नमस्ते" was greeted and "धन्यवाद" was thanked.
  - "हाँ" was read as a yes: "nothing is waiting for a yes".
  - "add milk/bread to the list" added the item.
  - Every reply showed the validated English with the Hindi `noModel` line.
    This environment has no model key, so this is the true reason.
  - A reload showed the same words.
  - `conversation_messages` kept the English as `content` and
    `metadata.localized = {language: "hi", text: null, fallback: "no_model"}`.
  - Nothing overflowed at either width.
- **Not verified live.** No live translation was run through a real model.
  This session has no model key it may use, so the protect → translate →
  check path is covered only by the unit tests with a stand-in translator.
  Someone who uses Hindi (or any other language) on the production
  deployment should confirm that a grocery add comes back translated, with
  the item's name unchanged.

## Still open

- **22-006 localized notifications.** Reminder titles and bodies are still
  English strings. They are next, as structured events rendered for each
  recipient.
- **Speech.** The in-app microphone recognises speech, and reads replies
  aloud, in the household's voice language (`/settings/voice`). A Hindi
  speaker should set that to Hindi. It is not yet derived from the person's
  language.
- **Search.** Conversation search matches the English record of a reply, not
  its translation.
- **Items said in another language.** "दूध" is kept as said, so it is not
  matched to a tracked "Milk". This is deliberate, and a household that mixes
  languages on one list will see both.

## Where the code lives

`packages/core/src/conversation/reply-language.ts`, `ai/model-client.ts`
(`languageLine`, `translationSystemFor`, `createReplyTranslator`),
`conversation/intent.ts`, `conversation/repository.ts`,
`apps/web/app/_lib/hometalk-turn.ts` (`inTheirLanguage`),
`apps/web/app/ai/page.tsx`.

## Cleanup

Done after the merge (#163, `4fa9b79`):
- The QA household "QA Bhasha Home" (`b4c00db1-efd4-443f-be14-9c4c1124d015`)
  was deleted with every row in it, including the two grocery items and the
  conversation.
- The QA account `60ea533c-4691-455b-b0a2-e2874f64198a` was deleted.
- The scratch scripts, screenshots and logs were removed, and the dev server
  was stopped.

A count over every `household_id` table in `public` and `wh`, the auth users
and Storage found nothing left.
