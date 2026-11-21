# HomeSend finds the record a document is about: a syllabus updates its exam (14-078)

**Asked (owner, 2026-11-21):** "it should correlate that the syllabus is related with the existing MTUT2 Timetable. and then look through the subjects and update each subject notes properly". He forwarded the Grade 5 syllabus PDF. It was kept as a note ("Nothing in it has a date…") even though Asmi's Mid-Term Unit Test 2 was already on record from the timetable.

## What was built
- **Correlation, as a HomeSend step** (`homesend/exam-match.ts`). Before a school reading is filed as new or kept as a note, it is matched against the household's own exams. A match uses four kinds of evidence:
  - **name:** `examKey` drops years, classes and document words, and abbreviates, so "Mid Term Unit Test 2 -2026-27 / Grade 5: Syllabus" = "Mid-Term Unit Test 2" = "MTUT2".
  - **class:** `classOf`, so Grade 5 = Std. V; a different grade never matches.
  - **school:** `sameSchool`, so "Podar International School (Cambridge)" = "PODAR Innovation Centre … Cambridge Schools".
  - **window:** the last paper is no more than 60 days past.

  The evidence is kept for "Why?". Pure and household-scoped; tested in `exam-match.test.ts`.
- **The model is told what it needs.** The reading schema gains `syllabus`: rows copied exactly, script and all, one part per line, and `examRef`. The prompt lists the household's open exams (name, class, days, subjects; no names, notes or health) inside the untrusted fence (`classify-intake.ts` `examsLine`, built in `ingest.ts`). `examRef` is used only to choose between exams the evidence already fits.
- **The update** (`homesend/syllabus-apply.ts`, called first in `home-send-auto.ts` `addIfAllowed`):
  - Each row goes to its paper's "What to study" and max marks (`paperFor`: Computing = Computing Theory, Maths = Mathematics, Hindi/French options; two candidate papers means no guess).
  - A subject with no paper is named in the reply and kept on the exam's notes.
  - Only what differs is written: the same syllabus twice changes nothing, and a revision updates in place and says so.
  - One `homesend_changes` row (`updated`, domain `school_exam`) per exam holds every paper's previous words and marks, so Undo (`home-send-actions.ts` `reverseChange` → `restoreExamSyllabus`) puts them all back at once.
  - It is confirmed above the household's bar and Checking below it.
  - The item is routed to the exam, never kept as a note.
- **Neighbours:**
  - A syllabus that came first is attached when the timetable arrives (`attachKeptSyllabi`, from `addTimetable`).
  - A revised timetable for an exam on record moves its days and adds new subjects in place. It never creates a second exam, and Undo restores the days and stands the added papers down.
- **Max marks:** new column `school_exam_papers.max_marks` (migration `20261121050000_exam_paper_max_marks.sql`, safe in either order: reads and writes retry without the column). The paper's pencil edits "Max marks", and the paper shows "Out of 20".
- **Reply** (`timetable-words.ts` `syllabusReply`, WhatsApp and HomeTalk): "📚 Syllabus for Asmi's Mid-Term Unit Test 2 (Grade 5).\nI added what to study to 8 subjects: English, Hindi, French, Marathi, Mathematics, Science, Computing Theory, Humanities.\nSee or undo: …/school?child=…#exams-…" In 8 languages.

## Verified
- HD-17 to HD-21 are in the HD set (`npm run eval`, recorded readings):
  - HD-17: syllabus after the timetable, all 8 subjects, max marks 20, three scripts byte for byte.
  - HD-18: syllabus before the timetable, kept as a note.
  - HD-19: Grade 6, no update for Asmi.
  - HD-20: revised syllabus, Science only.
  - HD-21: Art with no paper, listed.
- Also passing: `syllabus-apply.test.ts` (the exact reply, notes block idempotent), the homesend, whatsapp, ai, school, i18n and help tests, typecheck, and `lint:help-links`.
- Not verified live: the model's reading of the real PDF (no provider key in these containers), and the database path end to end (no app environment here).

## Open
- 14-079: ask "Is this for …?" when two exams of one child both fit. Today that case is kept as a note.
- 14-080: datesheet, hall ticket and result attach to the exam, and a fee reminder attaches to the school fee bill.
- The fixture is a text copy of the PDF, not a synthetic PDF: Devanagari in a generated PDF needs fonts this container doesn't have.
- The owner's PDF, sent before this shipped, was kept as a note. Resending it, or a newer timetable arriving (`attachKeptSyllabi`), attaches it.
