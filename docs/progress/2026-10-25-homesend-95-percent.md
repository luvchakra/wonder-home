# HomeSend: more than 95% sure before anything is added on its own (2026-10-25)

## What and why

The owner asked that a message sent to HomeSend be understood with more than
95% confidence (the right category, and the details read correctly) before
WonderHome creates the entry.

Before this change, a model's own "high" counted as 0.9, and that alone was
enough to auto-apply a clear grocery or school item where the household had
set that outcome to "execute". Nothing checked the reading against what was
actually sent.

- `packages/core/src/homesend/verify.ts` (new): `checkReading` compares a
  reading with the text it came from. The kind must have what that kind
  needs (a bill's amount or due date, an event's date, a receipt's shop and
  lines, a health document's record type). Its name, amount, payee, shop and
  date must all be found in the text. Generic kind words ("bill", "exam")
  don't count as a match for a name. A photo or a file has no text, so it is
  never verified.
- `understanding.ts`: `checkedConfidence` gives 0.97 only to a model "high"
  that was verified, never more than a voice note's transcript confidence;
  anything else stays at most 0.9. The understanding now carries `score` and
  `check`.
- `confirmation.ts`: auto-apply needs `score` strictly above
  `AUTO_APPLY_FLOOR` (0.95). Otherwise the item is prepared for a person,
  and the reason names what could not be checked ("WonderHome couldn't check
  the amount against what was sent, so a person looks first."). Items read
  before this change have no score and never auto-apply.
- `ingest.ts` and the eval runner pass the source text (only text that was
  itself what got read; a photo's caption is not the photo).
- Evaluation: a blocking `understanding` release gate (`report.ts`) needs
  HomeSend above 95% end to end and above 95% in the right category. Five new
  golden cases: HS-24 (an invented name), HS-25 (a photo), HS-26 (a voice
  note heard at 93%) all wait for a person; HS-27 (an electricity bill) and
  HS-28 (a dinner invitation) give a provider run more categories to score.
- Help: the HomeSend section says when something is added on its own, in all
  eight languages. Platform doc and CLAUDE.md updated.

## Verified

- `npm run eval`: 171/171 cases, HomeSend 28/28, every blocking gate passes,
  including `understanding`. With the bar set to 0, HS-24, HS-25 and HS-26
  fail (wrong_action), so the cases test the new rule.
- `vitest run packages/core/src/homesend packages/core/src/evaluation`: 489
  passed (new `verify.test.ts`, updated `confirmation.test.ts`).
- Typecheck of `packages/core` and `apps/web`; `npm run lint:help-links`.

## Open, needs a person

- The deterministic run scores everything after the classifier against
  recorded readings. The model's own category and field accuracy is only
  measured by `npm run eval -- --provider configured`, which needs
  `WONDERHOME_AI_KEY`. This session had no key, so the >95% figure for the
  live model is not yet measured. Run it and record it with `--write`.
- 28 HomeSend cases is a small sample for a 95% bar (one failure is 96.4%,
  two is 92.9%). The golden set should grow with real (anonymised) messages
  the household sends.
