# The nightly E2E is green again: three undocumented endpoints, one with no session

## What was wrong
The nightly E2E run (`e2e-nightly.yml`) had been red since 18 October. The run
on 22 October (`7b31821`, #302) failed 3 of 320 tests, all in
`e2e/domains.spec.ts`, which derives its endpoint list from the route files on
disk:

- **Every served endpoint is in the OpenAPI document.** Three were not:
  `/notifications/email-off` (one-click unsubscribe, #258),
  `/notifications/dispatch` (the delivery clock, story 23-015) and
  `/households/{householdId}/voice/gemini/transcribe` (the Gemini Live
  transcript).
- **GET and POST `/notifications/email-off` refuse an anonymous caller with
  401.** This route has no session by design. RFC 8058 has the mail app POST
  to it with a signed token as the only credential, so a token that does not
  verify gets 400, and a GET redirects to the `/email-off` page, which asks
  first. The guard expected the standard 401 envelope.

## What changed
- `packages/core/src/api/openapi.ts` now describes all three endpoints. The
  unsubscribe endpoint is described with `security: []`, the same as
  `/voice/alexa`.
- `e2e/domains.spec.ts` lists `/notifications/email-off` in `PUBLIC_PATHS`,
  with a comment saying why, beside the other session-less endpoints.
  `unsubscribe.test.ts` already covers its token.

No product behaviour changed.

## Verified
- `openapi.test.ts` passes (9/9), and `npm run typecheck` is clean.
- Against a local production build with the CI placeholder Supabase env:
  `e2e/domains.spec.ts` passes 177/177, and the full suite passes 304 with
  12 skipped.

## Still open
- Two tests failed now and then on local reruns, though neither failed in
  CI:
  - `auth.spec.ts:106` ("an unusable recovery link…") failed 1 of 10 runs
    with `p[role="alert"]` matching two elements.
  - `landing.spec.ts:117` (reduced motion) failed once on the first full
    run with `#why h2` matching two headings, then passed 10 of 10.

  Both look like a brief moment where two copies of an element are on the
  page. They are worth a look if they ever turn the nightly red.
- The runs on 18 and 20 October failed before #258 existed. Their causes
  were not investigated, because the 22 October run on current `main`
  failed only on the three tests fixed here.
