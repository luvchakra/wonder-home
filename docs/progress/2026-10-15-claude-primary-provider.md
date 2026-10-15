# Claude as the live AI provider, and HomeSend reading on Claude

**Date:** 2026-10-15

## What was done

- **Production now runs on Anthropic Claude.** In the `wonderhome` Vercel
  project, `WONDERHOME_AI_PROVIDER` is `anthropic` and `WONDERHOME_AI_KEY` is
  an Anthropic key (production, preview and development). Before the switch
  the key answered a one-line test request. Production was redeployed and
  serves `home.wonderapps.biz`. `WONDERHOME_AI_MODEL` is unset, so the model
  is the code default, `claude-opus-5`.
- **HomeSend classification works on Claude.** Before this change every
  Claude intake call was refused with a 400, because the intake schema has 20
  nullable fields and Anthropic's strict structured output compiles at most
  16 union-typed parameters. Making those fields optional instead was refused
  as "Schema is too complex". `classifyIntake`'s Anthropic branch now reads
  through a non-strict `record_intake` tool. Its schema is still derived from
  the same Zod schema (`zodOutputFormat(IntakeExtractionSchema).schema`), but
  it is not compiled into a grammar. Two narrow repairs run before validation:
  - `withAbsentAsNull`: a key the model left out means null, or an empty
    list.
  - `unwrapToolInput`: in about one call in eight Claude nested the whole
    reading under one made-up key (`data`, `query`, `input`). The reading is
    unwrapped only when the outer object has none of the schema's fields.

  The result still goes through `IntakeExtractionSchema.safeParse` and
  `sanitizeIntakeExtraction`, as with every provider. Gemini and OpenAI are
  unchanged.

## Verified

- `npm run typecheck`, `npm run lint`, and the core unit tests (3,021 plus 8
  new ones in `src/ai/intake-claude-tool.test.ts`) all pass.
- The deterministic `npm run eval` passes 50/50, with every gate green except
  operations, which stays "not yet" as before.
- `npm run eval -- --provider configured` on Claude:
  - before the fix: HomeSend 0/16;
  - after the tool change: 12–14 of 16, with failures from wrapped inputs;
  - after the unwrap repair: HomeSend 16/16, HomeTalk 21/22, HomeBrain 11/12,
    and an unsafe-action rate of 0/14.

## Still open

- **HT-06 on Claude.** For "Move it to Friday", with a Science-project
  proposal waiting, Claude asks a clarifying question instead of moving the
  project. Gemini passed this case in its 2026-09-23 run. The functional gate
  stays red on Claude until it is fixed in the product, never by loosening the
  case.
- **Intermittent HomeBrain provider failures.** HB-03 or HB-10 fails once in
  about every two runs. The deterministic answer path covers it, but the
  privacy gate counts HB-03's failure.
- No release artifact was written to `docs/ai-releases/`. Further provider
  runs were held back at the owner's request to save Anthropic credits.
- **No rollback to Gemini without the Gemini key.** The old Gemini key was a
  write-only Vercel variable and was replaced, so going back needs a person to
  supply the key again.
- Three Anthropic keys and the Supabase service-role key were pasted into a
  chat session. The two unused Anthropic keys should be deleted in the
  Anthropic Console.

## Where the code lives

- `packages/core/src/ai/classify-intake.ts`: `CLAUDE_INTAKE_TOOL`,
  `withAbsentAsNull`, `unwrapToolInput`, and the Anthropic branch of
  `classifyIntake`.
- `packages/core/src/ai/intake-claude-tool.test.ts`
