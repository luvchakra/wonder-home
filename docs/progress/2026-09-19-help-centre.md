# Get Help: the user guide, the FAQ, and searching them

**Date:** 2026-09-19 · **Kind:** feature (user request, outside the backlog)

## What was done

`/help` carries a sixteen-section user guide in four groups, ten FAQ entries,
and an assistant that searches both. It is reachable from the avatar menu
(new), from More, and from Settings.

**The guide is data, not markup.** Sections live in
`packages/core/src/help/guide.ts` with an id, a summary, body paragraphs and
search keywords. That is what lets an answer point at the exact section it
came from, and it means the FAQ answers *are* links into the guide rather
than a second copy of it that drifts.

**The assistant is retrieval, and says so.** It scores the question against
the guide — rarer words count for more, titles and curated keywords count
for more than body text, and a written FAQ answer wins over a section because
somebody has already written the short version. Below a confidence floor it
says it does not know and offers the contents instead.

No language model is involved, and the heading on the box says as much. That
is a smaller promise than a model makes, and unlike a model it cannot invent
a feature WonderHome does not have — which for a help screen is the more
important property. It also needs no key, so it works on every deployment.

**The avatar became a menu.** It used to be a plain link to Settings, which
left nowhere to put anything else and gave no hint where it led. It is now a
Radix dropdown with Settings & profile, Get Help, What WonderHome believes,
and Everything else — Radix because focus movement, escape, outside click and
announcing that the trigger opens something are exactly the parts a
hand-rolled popover gets wrong.

## Verified

- Typecheck, lint, 738 unit tests (16 new for the search), production build.
- 6 new E2E tests, full suite 194 passed. The two worth naming: every answer
  the assistant can produce — for every section title, every FAQ question,
  and a handful of things somebody would type while stuck — lands on a
  section that exists; and the guide is checked against the claims this
  codebase is careful never to make, so it cannot quietly drift ahead of
  the product.

## Still open

- The guide is English only.
- There is no contact route for a question the guide cannot answer; it
  points at the assistant, which can at least act on the household.
- If a model key is configured, the search could be reranked by it. The
  seam is `answerQuestion`, and nothing downstream would change.

## Where

`packages/core/src/help/guide.ts`, `search.ts`,
`packages/core/src/components/shell/viewer-menu.tsx`,
`apps/web/app/help/`, `apps/web/app/_components/guide-assistant.tsx`,
`e2e/help.spec.ts`.
