# Landing page and Help brought up to date

**Date:** 2026-09-26

## What was done

**Landing page, "New in WonderHome"** (`apps/web/app/_screens/landing/whats-new.tsx`).
- *Ready today* grows from 8 to 12 cards (three full rows on desktop, a list on a phone):
  - **Your home, in your language** now says every screen, HomeTalk, reminders and Help — and that sign-in follows the phone's language.
  - New: **Ready in minutes** (guided setup), **Sees what's coming** (the two-week look-ahead on Today, from real records only), **Share the load** (workload and a suggested swap an Admin accepts), **Budgets that add up** (per kind of bill, per currency, never converted).
  - Kept: reads the whole document, correct it like a person, hands-free conversation, reminders that fit your day, cover when help is away, receipts become history, your data your call.
- *Coming soon* grows from 4 to 8, each built but waiting on an account or a deployment switch: WhatsApp, forwarded email, Alexa & Gemini voice, Pay your way, **Weather-aware plans**, **Calendar & school portal**, **Apps you trust** (partner keys), **Smart-home devices**. None of these is claimed as ready.
- `e2e/landing.spec.ts` now pins all eight "Coming soon" items (it pinned four).

**Help guide** — new paragraphs and FAQs, in all eight languages, quoting each screen's own label in that language:
- Language: sign-in, sign-up and Help follow the browser's language before sign-in; Help's search understands your language.
- Bills: budgets (utilities, rent, school fees…; month, quarter or year; never block a bill; other currencies listed beside, never added).
- Outcomes: Share the load on Manage household → Responsibilities, and that nothing changes until an Admin accepts.
- Your plan: when paid plans begin you pay on the provider's page, Billing keeps payments and invoices, cancellations wait for the period end.
- Home & upkeep: weather is used only where it is switched on.
- Connections: partner keys, where switched on — scoped, shown once, revocable, sandbox keys change nothing.
- FAQs: "Can I set a budget?" and "Can other apps connect to WonderHome?". Search keywords added for share the load and partner apps.

## Verified
- `tsc` core and web, eslint (web), import boundaries (956 files), core unit tests 204 files / 2998 tests, including the Help per-language tests (each new FAQ, in every language, lands on its own section through the search).
- Browser, 360px and 1280px, reduced motion: landing shows 12 ready and 8 coming-soon cards, no horizontal overflow; Help in English and (signed out, browser set to Chinese) in Chinese shows every new paragraph and FAQ; a typed "can I set a budget" and "其他应用可以连接吗" answer from the new FAQs.
- No QA account or data was needed.

## Open
- Weather, calendar/school sync, partner keys and smart-home devices go from "Coming soon" to "Ready today" once a deployment switches each on; the card and the Help paragraph should move with it.
