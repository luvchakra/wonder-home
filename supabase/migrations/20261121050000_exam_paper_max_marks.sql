-- A paper's maximum marks (2026-11-21): a syllabus sent to HomeSend ("20 Mks",
-- "MTUT 20") fills each paper's "What to study" and its max marks; the paper's
-- pencil edits both (rule 12, rule 23).
--
-- Safe in either order with the code: until this runs, papers are read and
-- saved without max marks (`school/exams.ts` retries without the column on
-- 42703/PGRST204). Old code never reads or writes it.
--
-- Rollback: alter table public.school_exam_papers drop column if exists max_marks;

alter table public.school_exam_papers
  add column if not exists max_marks smallint
  check (max_marks is null or max_marks between 1 and 1000);
