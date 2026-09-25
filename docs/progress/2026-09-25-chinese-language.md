# Chinese (Mandarin, Simplified) and Singapore; right-to-left deferred

**Date:** 2026-09-25 · **Stories:** 22-004 (catalog), 22-005 (HomeTalk yes/no), 22-008 (deferred)

## What was done
- **Chinese is the eighth language.** `zh` joins `LANGUAGE_CODES` as 中文（简体）,
  Mandarin written in Simplified characters, as in mainland China and Singapore.
  `i18n/messages/zh.ts` is a full catalog (every key the `Catalog` type
  requires) and loads lazily like the others.
- **Formats.** `intlLocale` gives `zh-Hans-<region>`, so a Singapore household
  reading Chinese sees `2026年9月25日`, Singapore dollars and its own clock.
  Singapore itself (SGD, Asia/Singapore, d/m/y, 12-hour) was already a region.
- **HomeTalk.** A bare 是/好的/可以/没问题… approves and 不/不要/取消/算了… declines,
  as a whole reply only, exactly like the other languages. Full-width
  punctuation (。！？) is stripped before reading. "好的，但是改成周五" is not a yes.
  The model is told "Simplified Chinese (Mandarin)" through `languageLine`, and
  the reply translator keeps the same token guarantees.
- **Copy.** The landing page says eight languages and lists 中文; the help
  guide's language article names Chinese.
- **22-008 right-to-left is Deferred** at the owner's request. The tracker
  (`scripts/build-progress.mjs`) gained a `Deferred` status so a deferred story is
  neither "not started" nor counted as done. Arabic still works as before; only
  the remaining per-screen RTL pass waits.

## Verified
- Typecheck, lint, core unit tests (196 files, 2913 tests), script tests (43),
  tracker check.
- Browser: a QA household switched to Singapore (with suggestions applied) and a
  member to 中文 through the real Language & Region pages. Settings, Home,
  HomeTalk, More and Today render in Chinese, `html lang="zh"`, no horizontal
  scroll at 360px, fine at 1280px.

## Still open
- Screens not yet localized (22-004) stay English in every language, Chinese included.
- Some catalog wording choices are worth a native reader's glance: 家政帮手 for
  househelper, "HomeBrain 核对" for the review.
