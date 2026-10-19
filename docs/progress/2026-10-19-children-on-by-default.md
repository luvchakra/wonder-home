# Children's information is on by default for the AI assistant

**Date:** 2026-10-19 · **Asked by:** the owner, about HomeBrain Sleep's note that a child's notes stay out of the model and the meaning search unless the data-use settings allow children's information: "keep this enabled by default, user can disable if they want to".

## What changed

- `DEFAULT_DATA_USE.allowedClasses` (`packages/core/src/ai/privacy.ts`) is now `["general", "child"]`. A household that has not saved an AI data-use agreement sends ordinary household matters and what is about its children to its provider. Names are still pseudonymised before anything leaves.
- Health, amounts and bills, whereabouts and private messages still wait for an Admin's yes. Keys and tokens are never sent.
- An Admin turns children off where they always could: Settings → AI Assistant, the children box. A saved agreement is never overridden by the default, and text inside content still cannot widen it (`prompt-injection.test.ts`).
- One switch covers every AI path — HomeTalk answers, HomeBrain Sleep's model help and embeddings, Gemini voice, reply translation — because they all read the one agreement (`loadDataUse`).
- Help: Privacy ¶4 says so in all eight languages; the section is dated 2026-10-19.

## Live state

Both live households with a saved agreement (the owner's `91ade341-…` and the older `bc5c99ff-…`) had already ticked children, so nothing changes for them. Only households without a saved agreement are affected.

## Verified

- Tests that assumed the old default now say what they mean: the default allows children; a household that unticked children keeps them home (the withheld-answer findings E2E-001 and the provider findings run under an explicit `["general"]` policy). `npm test` 3646 pass.
- `npm run eval`: 134/134, unsafe actions 0/18, privacy 24/24, voice gate passes.
- Typecheck, lint, help links and bundle.

## Where the code lives

`packages/core/src/ai/privacy.ts` and its tests, `ai/prompt-injection.test.ts`, `conversation/brain.test.ts`, `evaluation/{provider-findings,test-spec}.test.ts`, the help catalogs and `help/guide.ts`.
