import type { SupabaseClient } from "@supabase/supabase-js";

import { scanForMalware, platformMalwareScanConfig } from "../homesend/malware-scan";
import { detectIntakeFile, MAX_PDF_PAGES, pdfPageCount } from "../homesend/normalize";
import { assessUploadSecurity } from "../homesend/security";
import { REPORT_MAX_BYTES } from "./report-limits";

/**
 * An attached health report (story 21-012): checked the way HomeSend checks an
 * upload before anything keeps it. The type is decided from the bytes, never
 * the name; only a PDF or a JPEG, PNG or WebP picture is a report; the size is
 * what one upload form may send; a PDF's pages are bounded; and the
 * deployment's malware scanner, when one is configured, has the last word.
 */

export const HEALTH_REPORT_BUCKET = "health-records";

export { REPORT_ACCEPT, REPORT_MAX_BYTES } from "./report-limits";

export type ReportContentType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

const EXTENSION: Record<ReportContentType, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type ReportUploadCheck =
  | { ok: true; contentType: ReportContentType; extension: string }
  | { ok: false; reason: "empty" | "too_large" | "not_a_report" | "too_many_pages" | "unsafe" };

/** Plain words for each refusal, for the record sheets' own error line. */
export const REPORT_UPLOAD_REFUSAL: Record<Exclude<ReportUploadCheck, { ok: true }>["reason"], string> = {
  empty: "That file is empty.",
  too_large: "That file is too large — please use one under 4MB.",
  not_a_report: "Attach the report as a PDF or a photo (JPEG, PNG or WebP).",
  too_many_pages: `That PDF has more than ${MAX_PDF_PAGES} pages.`,
  unsafe: "That file could not be accepted. Please try another copy of the report.",
};

export async function checkReportUpload(bytes: Uint8Array, claimedType: string, filename: string | null): Promise<ReportUploadCheck> {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > REPORT_MAX_BYTES) return { ok: false, reason: "too_large" };
  const detected = detectIntakeFile(bytes, claimedType, filename);
  if (!detected.ok || (detected.family !== "image" && detected.family !== "document")) return { ok: false, reason: "not_a_report" };
  const contentType = detected.type as ReportContentType;

  if (detected.family === "document") {
    if (pdfPageCount(bytes) > MAX_PDF_PAGES) return { ok: false, reason: "too_many_pages" };
    const scan = await scanForMalware(bytes, contentType, platformMalwareScanConfig());
    if (scan.scanned && !scan.clean) return { ok: false, reason: "unsafe" };
  } else if ((await assessUploadSecurity(contentType, bytes)) !== "clean") {
    return { ok: false, reason: "unsafe" };
  }
  return { ok: true, contentType, extension: EXTENSION[contentType] };
}

/**
 * A short-lived link to a record's report, made through the viewer's own
 * session so the bucket's policy decides (`wh.may_see_health` on the record
 * that carries the file). Null when the record or its file is not theirs to see.
 */
export async function signedReportUrl(supabase: SupabaseClient, recordId: string, ttlSeconds = 60): Promise<string | null> {
  const { data, error } = await supabase.from("health_records").select("file_path").eq("id", recordId).maybeSingle();
  const path = (data as { file_path: string | null } | null)?.file_path;
  if (error || !path) return null;
  const signed = await supabase.storage.from(HEALTH_REPORT_BUCKET).createSignedUrl(path, ttlSeconds);
  return signed.error || !signed.data ? null : signed.data.signedUrl;
}

/** `<householdId>/<uuid>.<ext>` — the household folder is what the bucket's insert policy checks. */
export function reportPath(householdId: string, extension: string, id: string = crypto.randomUUID()): string {
  return `${householdId}/${id}.${extension}`;
}
