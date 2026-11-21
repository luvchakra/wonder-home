# Bills: a bill's full record (11-021)

2026-11-21 · second of the owner's seven Bills follow-ups.

## What changed
- A bill row's chevron still opens it in place (rule 21) and now ends with **Full record** → `/bills/[id]`. That page reads everything in one `Promise.all` wave:
  - the bill's facts;
  - every payment with when, how (11-019) and who; a month paid in parts lists each part;
  - **Where it came from**: the HomeSend item that added the bill (via `homesend_changes.entity_id`), with **Open what was sent** as a 5-minute signed link made through the viewer's own session. A rejected file is never linked. A bill nobody sent in says "Added by hand";
  - **Files**: an Admin attaches a photo or PDF and can take one off;
  - **Changes** (Admins only, since `audit_events` is Admin-read by RLS): the bill's own trail, with titles from `describeAuditEvent`.
- **Attachments**: `finance/bill-attachments.ts`.
  - A file gets the same checks as every HomeSend upload: its real type from the bytes, photos and PDFs only, 4 MB, the malware scan, and the `homesend.intake` rate limit.
  - Stored in the existing private `home-send` bucket under `<household>/bills/<bill>/<id>`, so the bucket's member-folder policies apply.
  - The record is a new `bill_attachments` table. Taking a file off sets `removed_at`, never a delete (rule 12).
  - It does not go through HomeSend ingest, so attaching never creates or re-reads a bill.
- **Audit**: new events `finance.bill_added`, `bill_changed`, `bill_marked_paid`, `bill_marked_unpaid`, `bill_file_added` and `bill_file_removed`. Each is in the sensitive-actions registry with a description. They are recorded after the response.

## Safe in either order
`20261121170000_bill_attachments.sql` adds a new table (RLS in set forms: members read, Admins write) and a partial index on `audit_events (household_id, target_id, created_at desc)`. Before it runs, files read as none, and attaching says it isn't switched on yet and removes the stored object.

## Verified
- `finance/bill-attachments.test.ts` (6) and `security/sensitive-actions.test.ts` pass.
- Typecheck passes. These lints pass: service-role, input-boundary, migrations, knowledge registry, embeds, import boundaries.
- Build and bundle check pass. No signed-in browser check, because the container has no `apps/web/.env.local`.

## Open
- The owner runs the SQL.
- "Changes" titles are English, as on Settings → Activity.
- Members who aren't Admins see payments, source and files, not the change trail.

## Code
- `apps/web/app/bills/[id]/page.tsx`, `bill-files.tsx`
- `apps/web/app/(auth)/bill-file-actions.ts`
- `packages/core/src/finance/bill-attachments.ts`
- `api/audit.ts` (`listAuditEventsFor`), `security/sensitive-actions.ts`
