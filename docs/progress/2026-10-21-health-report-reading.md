# Health records: attach the report, read it, suggest next steps (story 21-012)

The owner, 2026-10-21: "give option to add the report, once added, there should
be ai analysis on the report. add suggestions based on the report, the
suggestions should be actionable, which can use existing WonderHome features and
modules".

## What was done
- **Attach.** Add a health record and Edit record take a PDF or a photo (≤4MB).
  The type is checked from the file's bytes, it passes the malware-scan seam
  (`health/report-upload.ts`), and it is stored at
  `health-records/<householdId>/<uuid>.<ext>` through the person's own session.
  Edit replaces or removes it (rule 12). The old file is deleted only once no
  record still uses it.
- **Open.** `/health/records/[recordId]/report` redirects to a signed link that
  lasts 60 seconds. The link is made with the viewer's session, so the bucket
  policy decides who can open it.
- **Read.** The record expands in place to show its notes, its report and "What
  the report says" (`_components/health-report-panel.tsx`). Only the record's
  person or their guardian can press "Read the report". Each refusal is its own
  plain sentence. The read runs only when all of these allow it:
  - the plan;
  - the person's "AI help with health" switch;
  - a configured AI provider;
  - the household's data-use agreement;
  - the `health` content class.

  The model (`health/report-model.ts`, through `provider-clients.ts`) only
  proposes findings. It works from the PDF's text layer (`health/report-text.ts`),
  or from the picture when there is none, and the report is fenced as untrusted
  content. `health/report-reading.ts` then decides what stays:
  - a finding stays only if its name and value appear in that text;
  - a flag stays only if the report prints its own flag mark;
  - "outside the range" is said only against the report's own printed range.

  Nothing is diagnosed.
- **Suggest.** The next steps come from rules, not the model
  (`health/report-suggestions.ts`). Each one opens an existing sheet already
  filled in, and nothing is saved until the person saves it:
  - book a follow-up appointment;
  - track BP, weight, pulse or blood sugar at home each week;
  - a recheck checkup in 3 or 6 months.

  When nothing is flagged, it shows one calm line instead.
- **Kept.** `health_record_readings`, from migration
  `20261021040000_health_report_readings.sql`. Who can read a row follows the
  record's own `wh.may_see_health`. There is no update policy, because a fresh
  reading is a new row.
- Words in all eight languages, and the Health help section updated (body 4).

## Verified
- Unit tests: 24 golden tests on the reading validator and the suggestions.
- DB test: `scripts/test-health-readings-rls.mjs` passed 10 of 10.
- Typecheck, lint and the production build are clean.
- Browser at 360px and 1280px:
  - a PDF attached in Add a health record was filed and stored;
  - the record opened in place;
  - Open the report returned a 303 redirect to the signed link;
  - with no local AI key, Read the report showed the "AI assistant isn't set up"
    refusal;
  - no horizontal scroll at either width.

## Still open, or needs a person
- **The migration hasn't been applied to the live project.** The session's
  `apply_migration` calls were cancelled, so it is in the owner's SQL artifact.
  Until it runs, a reading still shows on screen but isn't saved, and the panel
  says so.
- **No live model reading has been checked yet.** That needs a household with
  the AI Assistant set up and health details allowed in Settings → AI Assistant.
- Story 21-011 (an edit sheet for appointments) is still Not Started.
