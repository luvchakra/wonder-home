# HomeSend 2.0, part 1: one pipeline for every input (story 14-011, Wave 3)

**Date:** 2026-09-23
**Story:** 14-011 (new, P0, module 14). In Progress: this note covers part 1 of 3.
**Spec:** `design/HOMESEND-2.0-WAVE-3.md` ("WonderHome Wave 3 — HomeSend 2.0", Product Council approved), committed with this work.

## Why

HomeSend took photos and pasted text, and each entry point ran its own copy of the classify step:
- the upload form;
- the composer's paperclip;
- the share target;
- the share-handoff resume;
- the email webhook, which had its own reimplementation.

Wave 3 asks for:
- text, files, audio, links and email all going through the same canonical understanding pipeline (§21);
- untrusted content that can never become instructions (§16);
- a persistent inbox that never loses what arrived (§14);
- idempotent intake (§15).

## What was done

**One pipeline**, `packages/core/src/homesend/ingest.ts`:
- `ingestFile`, `ingestText` and `ingestLink` go secure intake → normalize → `understand`. `confirmTranscript` is the second half of a voice note.
- Every entry point now calls it: upload, paste, paperclip, share target, share handoff, and the email webhook via `understand`. `classify-and-save.ts` is gone.
- Every provider (model, speech, web, malware scanner) sits behind `IngestDeps`, so the whole pipeline runs in tests with stand-ins.

**The canonical understanding**, `understanding.ts` (§8). `IntakeUnderstanding` holds:
- the content summary, entities, facts with their evidence, and references;
- candidate actions from a fixed list, derived from the kind — the model never chooses an action;
- a change signal (new, update, cancellation);
- safety, and provenance (channel, transcript confidence, URL, subject, sender, file type);
- confidence in words: High, Medium or Low.

**The classifier** (`ai/classify-intake.ts`):
- It reads PDFs as documents, so scanned PDFs too (Claude document block, Gemini inline data, OpenAI file part).
- It returns `summary`, `people`, `facts`, `needs` (several now, with the first kept as v1's `secondary`), `change` and `confidence`.
- The deterministic backstop now also drops any string carrying a database id (§8), and keeps a school item's date, which the §10 reconciliation example needs.
- New golden scenarios: CI-W3-01…04.

**New inputs** (§3):
- **Files**, `normalize.ts`. The type is decided from the bytes:
  - JPEG, PNG, WebP;
  - PDF: `%PDF-` in the first kilobyte;
  - TXT and CSV: valid UTF-8, no NUL bytes;
  - WebM, OGG, MP3, WAV and FLAC voice notes. M4A is recognised only to be refused honestly, because the speech service cannot read it.
  - A claimed type that does not match the bytes is refused.
- **Links**, `link-fetch.ts`. SSRF protection:
  - only http/https on the default ports, no credentials in the URL;
  - blocked hostnames: localhost, `.local`, `.internal` and similar;
  - blocked addresses: private, loopback, link-local (including cloud metadata), carrier-grade NAT, documentation, multicast, and IPv6 including IPv4-mapped and NAT64;
  - every resolved address must be public, and the connection is pinned to the checked address, so DNS rebinding cannot swap it;
  - at most three redirects, each re-checked;
  - 1 MB page and 5 MB PDF limits, and an 8-second timeout;
  - no cookies or auth ever sent;
  - HTML reduced to text, with scripts, styles, comments and hidden elements dropped.
- **Voice notes**, `audio.ts`, transcribed by the household's speech service:
  - A transcript below 0.75 confidence, or below 0.9 for one that mentions paying, ordering or money, is shown and waits for the person to confirm or retype it. It is never acted on (§17).
  - No speech service means the note fails safely, and the inbox says why.
- **Email**: an HTML-only email is now reduced to text and read. Before, it was acknowledged and dropped. The subject is kept.

**Prompt-injection defense**, `injection.ts` (§16):
- Content is fenced as untrusted, and a copy of the fence inside the content is defanged.
- The system prompt states the rule.
- Instructions aimed at WonderHome are flagged in both the input and the output. The review step says they were ignored, and the reading can still only propose the fixed kinds of action.

**Idempotency** (§15):
- A sha256 content hash is kept on every item. Sending the same thing again finds the pending item ("You already sent this — it's waiting for your review").
- Email keeps its provider-id upsert.

**Persistent inbox** (§14): three lists, all read from the table on every load.
- **Needs your review.**
- **Failed safely**: the reason in words, plus fill-in-by-hand and dismiss icon buttons.
- **Recently handled.**

**Review UI** (§13):
- "What I found" shows the summary, the source and when ("A PDF you sent · 23 Sep"), confidence in words, and the ignored-instructions line.
- The transcript check sits in the same place.
- The composer's paperclip sheet takes every new input too.

**Migration** `20260924090000_homesend_multimodal_intake.sql`:
- new sources: `audio_note`, `link`, `email_attachment` (with its parent-email constraint);
- the `failed` status, with a required `failure_reason`;
- `understanding`, `content_type`, `content_hash`, `source_url`, `subject`, `parent_item_id`, `transcript_confidence` and `routed_at`;
- `raw_text` raised to 12,000 characters;
- share handoffs can stage any file type;
- a backfill moves refused uploads that were left looking pending into "Failed safely". Two live rows moved.

**Fixed along the way:**
- Server Actions were on Next's default 1 MB body limit, so most phone photos were refused before HomeSend saw them. It is now 4.5 MB, matching the hosting platform's ceiling, and the forms promise 4 MB.
- The PWA share target only accepted images; it now offers PDFs, text files and audio too.

## Verified

- Unit: 1917 total, all passing. HomeSend's 179 include:
  - injection (17);
  - normalize (21);
  - link fetch (55: every blocked range, DNS-resolves-private, redirect to metadata, redirect limit, streamed and declared size, PDF, timeout);
  - audio (13);
  - the pipeline end to end with a stand-in model (15: school message, duplicate, link, blocked link, photo and PDF, mislabelled file, scanner flag, unreadable, no provider or outage, injection, clean voice note, uncertain payment voice note then confirmed, no speech service, m4a).
- Classifier golden scenarios: 15 including the four new ones.
- Database: `test-homesend-rls.mjs` passes 53, covering new-source content rules, failed-needs-reason, hash format, understanding round-trip, the 12k text limit, the attachment-parent-actor rules and PDF handoffs.
- Migration applied live via `apply_migration`. `npm run verify:live` passes 123/123; six new column checks were added to it.
- Browser QA against the live project, at 360px and at 1280px, with no horizontal scroll at either:
  - a pasted message carrying an injection attempt: review step, ignored-instructions line;
  - reload: still in "Needs your review";
  - the same paste again: "already waiting";
  - a metadata link and a localhost link: Failed safely, "not a public web page";
  - a PDF: "A PDF you sent";
  - a PDF disguised as a JPEG: Failed safely, safety check;
  - a WAV voice note: Failed safely, no speech service;
  - a TXT file;
  - fill-in-by-hand on a failed item;
  - routing one to Groceries, with Undo.
- Cleanup: the QA household ("Rao Home"), its 5 uploaded files and the QA user were removed, and `next-env.d.ts` was reverted.
- Not run here: a live model or speech provider. This sandbox has neither key, so the model and transcript paths are covered by the stand-in tests.

## Still open

- **Part 2:**
  - email attachments stored and read as their own items (the schema is ready);
  - multiple recipients;
  - resolving people through Wave 1 (`references[].candidates`) and asking "Asmi or Manan?";
  - update and cancellation reconciliation that changes the existing record, with undo restoring it;
  - the multi-impact review ("I found 2 things").
- **Part 3:**
  - the confirmation strategy (auto-apply only where policy allows);
  - HomeSend metrics.
- **Larger uploads** (up to the pipeline's 8–10 MB) need direct-to-storage uploads, because the hosting platform caps a request at 4.5 MB.
- **P1 file types** (DOC/DOCX, XLS/XLSX) are not read yet. CSV is.
- **Live email** stays inert until a person configures Resend (DNS, API key, webhook secret). It is never labelled connected until then.
- **Older QA account:** `42dc16e3-8e5b-463f-8f6a-965f69261bb6`, from an earlier session, is still untouched because this session did not create it. Delete it with `node scripts/qa-test-user.mjs delete 42dc16e3-8e5b-463f-8f6a-965f69261bb6` if nobody needs it.
