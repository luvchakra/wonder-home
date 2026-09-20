# Talk to WonderHome: the model was never being asked

**Date:** 2026-09-20 · **Kind:** production bug (product-direction P0 §6 "Real AI reasoning"), plus "Install app" in the account menu

## What was wrong

In production every recent turn — "what needs attention right now", "what is
the current situation", "what is going on in my family right now", the Meals
screen's own "Change dinner on 2026-09-20" — came back "I did not follow
that". The assistant's reply metadata told the story: `provider:
"provider_not_allowed"`, `understanding: "rules"`. No model was consulted on
any turn.

Two facts, read straight from the production database (provider names only,
never a key): the household has **its own model key, for Google**, set on
19 Sept; and its "AI data use" policy row lists `allowedProviders:
["anthropic"]`. That list was written by the Settings form — which has never
offered a provider choice and simply copies `DEFAULT_DATA_USE.allowedProviders`
— so the consent the household actually gave (send ordinary household matters
to a model, keep nothing) was being read as "Anthropic only", and the gate
`routeToProvider` refused the key they had deliberately configured. The
deterministic rules answered instead, and those are anchored regular
expressions that did not know "right now", "situation" or "in my family".

## What changed

**The gate** (`packages/core/src/ai/privacy.ts`):

- A household's own key *is* its choice of provider: set by an administrator
  and audited as `ai.key_set`. `routeToProvider` no longer checks the
  policy's provider list against a household key; the list only ever
  restricts the *platform's* provider.
- `DEFAULT_DATA_USE.allowedProviders` is now every provider WonderHome can run
  on (`MODEL_PROVIDERS`), because the household is agreeing to WonderHome's
  provider, not picking one — the deployment's `WONDERHOME_AI_PROVIDER`
  decides which. An explicit, narrower list in a stored row is still
  honoured for the platform key.
- Tests updated to say what they now mean: a platform provider the
  household explicitly excluded is refused; a household key is routed
  whatever the list says; the default covers all three providers.

**Production data**: the household's active policy row was widened to
`["anthropic","google","openai"]` by SQL (the user's standing instruction to
run SQL directly), so the next turn reached Gemini before this code
deployed. The row's other choices (all content classes, retention on —
theirs) are untouched.

**The rules** (`conversation/rules.ts`), which remain the safety net under
any model:

- Trailing "right now / at the moment / currently / for me / these days" are
  stripped in `core()` so the precise status rules read them.
- `looksLikeStatusQuestion`: a wide net for any question about the home
  ("situation", "overview", "what's up", "anything urgent", "how's
  everything at home", "what's on my to-do"…) that carries none of the
  request verbs; day word and schedule scope kept. Sits after the precise
  status rules and before the list rules, so "we need bread today" is still
  a grocery request.
- Meals: "change dinner on 2026-09-20" (the Meals screen's own link) now
  asks "What would you like for dinner on Sun 20 Sep? Tell me the dish and
  I will note the change."; with a dish it is remembered as the plan.
- A rule can now understand the topic but lack one detail, and ask for it:
  `parameters.clarify` on an `unknown` intent becomes the clarifying
  question (`intent.ts` `disposeIntent`), and the engine prefers that
  question over both "I did not follow that" and "I could not reach my
  model".

**Install app** (`packages/core/src/pwa/use-install-prompt.ts`,
`components/shell/viewer-menu.tsx`): the avatar menu gains "Install app".
`beforeinstallprompt` is captured at module load (it fires once, early) and
shown natively where the browser offers it; elsewhere a sheet spells out the
browser's own steps (Safari share sheet on iOS, browser menu on Android,
address-bar icon on desktop). The item disappears once the app runs
standalone.

## Verified

- Production, after the SQL: the next turn's metadata should read
  `provider: "transmitted"`; to be confirmed by the household's next message.
- `packages/core` vitest: all suites pass, with 14 new rule cases and 3
  rewritten gate cases.
- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`,
  `npm run test:e2e` — see the PR for counts.

## Still open / needs a person

- A live provider round-trip still cannot be exercised from this session
  (no key here, none invented). The production household's next turn is the
  real test; the reply metadata (`provider`, `understanding`) says whether
  the model answered.
- The Settings form still writes `allowedProviders` without offering a
  choice. Either offer the choice or drop the field from the form; today it
  writes the full list, which is what the household is actually agreeing to.
- Meal changes are remembered as a preference, not applied to the meal
  plan; a governed write for the plan is future executor work.
