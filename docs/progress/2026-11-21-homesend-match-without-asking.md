# HomeSend matches without asking; undated school notices become notes; HD set in eval (14-076)

**Why.** The owner expects HomeSend to turn complex messages into WonderHome entries with as few questions as possible (2026-11-21).

**What changed.**
- **The reading knows the children at school.** `ai/classify-intake.ts` `IntakeContext.children` and `childrenLine`: each child's school and class from WonderHome's records, as roles ("Child 1: class 3 at …"), never a name or a health detail, told outside the untrusted fence as WonderHome's own facts (`minimiseContext`'s names-as-roles rule). `homesend/ingest.ts` `understand` loads it from `school/enrolments.ts` in the same wave as the timezone.
- **A notice naming a class matches roman or arabic.** `homebrain/memory-resolve.ts` `namesGrade` now uses `homesend/timetable.ts` `classOf` ("Std. III" = "3", "Class IV-B" = "4B"); a section on record must match.
- **Timetables** already give every child at the school their own column and ask only "Which class is X in?" for a class not on record (`timetable.ts` `planTimetable`); unchanged.
- **A school notice with nothing dated is a school note at once** (`homesend/school-note.ts`): no "When is it?" (`hometalk/intake-questions.ts` `openIntakeQuestion`), archived `kept_as_note` straight away with an audit row (`homesend/repository.ts` `keepAsNoteNow`, called from `apps/web/app/(auth)/home-send-auto.ts` `addIfAllowed`), and the reply sums it up in one line with no numbers (`whatsapp.keptNote`, 8 languages; `handedBackText`). Restore brings it back.
- **The 16 HD documents run in `npm run eval`** (`evaluation/cases-documents.ts`, `runners.ts` `observeDocument`, shared checks in `homesend-documents/check.ts`). Offline they score the recorded readings; with `--provider configured` the provider reads each case's text.
- Help: `home-send.body.20` gains the school-note sentence in all eight languages.

**Verified.** vitest over `packages/core/src/{homesend,hometalk,whatsapp,evaluation,conversation,i18n,ai,homebrain}` and `apps/web/app`: all pass. `npm run eval -- --cases HD-01…HD-16`: 16/16 offline. Typecheck, help links, tracker.

**Unverified live.** No model key in this container: no live provider read of the HD set, and the photo cases are read live from their text, not the image. The owner can run `npm run eval -- --cases HD-01,HD-02 --provider configured` once a key works.

**CodeQL.** One high alert each on #588 and #593. The check-run annotations are not readable through this session's tools, so the rule is not identified; the owner should open Security → Code scanning, filter `pr:593` / `pr:588`, and share the rule id.
