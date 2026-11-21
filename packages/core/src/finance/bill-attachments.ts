import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { auditChange } from "../api/audit";
import { platformMalwareScanConfig, scanForMalware, type MalwareScanOutcome } from "../homesend/malware-scan";
import { detectIntakeFile, MAX_BYTES } from "../homesend/normalize";

/**
 * Photos or PDFs of a bill or its receipt, attached on the bill's full record
 * (11-021, the owner 2026-11-21). The bytes go through the same checks every
 * HomeSend upload has — the real type from the bytes, the size bound, the
 * malware scan — and live in the same private `home-send` bucket, under the
 * household's folder, so its member-only policies scope them. Nothing is
 * read by a model: attaching a file files it, it doesn't re-read the bill.
 */

export const BILL_FILES_BUCKET = "home-send";
/** What a server action can carry, and below every family's own bound. */
export const BILL_FILE_MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export type BillAttachment = {
  id: string;
  filename: string | null;
  contentType: string;
  byteSize: number;
  uploadedByMemberId: string | null;
  createdAt: string;
  /** A short-lived link through the viewer's own session; null when it couldn't be made. */
  url: string | null;
};

const missingTable = (code: string | undefined) => code === "42P01" || code === "PGRST205" || code === "PGRST204";

export function billFilePath(householdId: string, obligationId: string, id: string): string {
  return `${householdId}/bills/${obligationId}/${id}`;
}

/** Checks a file before anything is stored: a photo or PDF, within bounds, its bytes what it claims. */
export function checkBillFile(bytes: Uint8Array, claimedType: string, filename: string | null): { ok: true; type: string } | { ok: false; reason: string } {
  if (bytes.length > BILL_FILE_MAX_BYTES) return { ok: false, reason: "too_large" };
  const detected = detectIntakeFile(bytes, claimedType, filename);
  if (!detected.ok) return { ok: false, reason: detected.reason };
  if (!ALLOWED.has(detected.type) || bytes.length > MAX_BYTES[detected.family]) return { ok: false, reason: "unsupported_type" };
  return { ok: true, type: detected.type };
}

const REASON_WORDS: Record<string, string> = {
  too_large: "That file is over 4 MB. Try a smaller photo.",
  unsupported_type: "Attach a photo (JPEG, PNG, WebP) or a PDF.",
  mismatched_type: "That file isn't what its name says. Attach a photo or a PDF.",
  empty: "That file is empty.",
  infected: "That file didn't pass the safety check, so it wasn't attached.",
};

export async function addBillAttachment(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; obligationId: string; bytes: Uint8Array; claimedType: string; filename: string | null },
  deps: { scan?: (bytes: Uint8Array, type: string) => Promise<MalwareScanOutcome>; id?: string } = {},
): Promise<{ id: string }> {
  const checked = checkBillFile(input.bytes, input.claimedType, input.filename);
  if (!checked.ok) throw ApiError.badRequest(REASON_WORDS[checked.reason] ?? REASON_WORDS.unsupported_type!);
  const scan = await (deps.scan ?? ((bytes, type) => scanForMalware(bytes, type, platformMalwareScanConfig())))(input.bytes, checked.type);
  if (scan.scanned && !scan.clean) throw ApiError.badRequest(REASON_WORDS.infected!);

  const { data: bill, error: billError } = await supabase.from("obligations").select("id").eq("id", input.obligationId).eq("household_id", input.householdId).maybeSingle();
  if (billError) throw new Error(`addBillAttachment failed: ${billError.code ?? "unknown"}`);
  if (!bill) throw ApiError.notFound("That bill is no longer here.");

  const id = deps.id ?? crypto.randomUUID();
  const path = billFilePath(input.householdId, input.obligationId, id);
  const stored = await supabase.storage.from(BILL_FILES_BUCKET).upload(path, input.bytes, { contentType: checked.type, upsert: false });
  if (stored.error) throw new Error("addBillAttachment failed: storage");

  const { error } = await supabase.from("bill_attachments").insert({
    id,
    household_id: input.householdId,
    obligation_id: input.obligationId,
    file_path: path,
    content_type: checked.type,
    filename: input.filename ? input.filename.slice(0, 200) : null,
    byte_size: input.bytes.length,
    uploaded_by_member_id: input.memberId,
  });
  if (error) {
    // No record, no file: an orphan in the bucket helps nobody.
    await supabase.storage.from(BILL_FILES_BUCKET).remove([path]);
    if (missingTable(error.code)) throw ApiError.badRequest("Attaching files to a bill isn't switched on yet.");
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can attach files to a bill.");
    throw new Error(`addBillAttachment failed: ${error.code ?? "unknown"}`);
  }
  await auditChange({ householdId: input.householdId, actorMemberId: input.memberId, eventType: "finance.bill_file_added", targetTable: "obligations", targetId: input.obligationId, metadata: { attachment: id } });
  return { id };
}

/** Takes a file off the bill's record; the file is kept (rule 12). */
export async function removeBillAttachment(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; obligationId: string; attachmentId: string },
): Promise<void> {
  const { data, error } = await supabase
    .from("bill_attachments")
    .update({ removed_at: new Date().toISOString(), removed_by_member_id: input.memberId })
    .eq("id", input.attachmentId)
    .eq("obligation_id", input.obligationId)
    .eq("household_id", input.householdId)
    .is("removed_at", null)
    .select("id");
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can change a bill's files.");
    throw new Error(`removeBillAttachment failed: ${error.code ?? "unknown"}`);
  }
  if (!data || data.length === 0) throw ApiError.notFound("That file is no longer on this bill.");
  await auditChange({ householdId: input.householdId, actorMemberId: input.memberId, eventType: "finance.bill_file_removed", targetTable: "obligations", targetId: input.obligationId, metadata: { attachment: input.attachmentId } });
}

/** The bill's files, newest first, each with a short-lived link. None before the 11-021 migration. */
export async function listBillAttachments(supabase: SupabaseClient, householdId: string, obligationId: string, ttlSeconds = 300): Promise<BillAttachment[]> {
  const { data, error } = await supabase
    .from("bill_attachments")
    .select("id, file_path, filename, content_type, byte_size, uploaded_by_member_id, created_at")
    .eq("household_id", householdId)
    .eq("obligation_id", obligationId)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    if (missingTable(error.code)) return [];
    throw new Error(`listBillAttachments failed: ${error.code ?? "unknown"}`);
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  const paths = rows.map((row) => row.file_path as string);
  const signed = paths.length > 0 ? await supabase.storage.from(BILL_FILES_BUCKET).createSignedUrls(paths, ttlSeconds) : { data: [] };
  const urlOf = new Map((signed.data ?? []).map((entry) => [entry.path, entry.signedUrl ?? null]));
  return rows.map((row) => ({
    id: row.id as string,
    filename: (row.filename as string | null) ?? null,
    contentType: row.content_type as string,
    byteSize: Number(row.byte_size),
    uploadedByMemberId: (row.uploaded_by_member_id as string | null) ?? null,
    createdAt: row.created_at as string,
    url: urlOf.get(row.file_path as string) ?? null,
  }));
}
