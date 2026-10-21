"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { readHouseholdKey } from "@wonderhome/core/ai/credentials";
import { platformKey, resolveModelKey } from "@wonderhome/core/ai/model-key";
import { routeToProvider } from "@wonderhome/core/ai/privacy";
import { loadDataUse } from "@wonderhome/core/ai/privacy-repository";
import { consume, may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { createHealthReportModel, reportModelId, type ReportSource } from "@wonderhome/core/health/report-model";
import { validateReportReading, type ReportReading } from "@wonderhome/core/health/report-reading";
import { saveReading } from "@wonderhome/core/health/report-readings";
import { extractPdfText } from "@wonderhome/core/health/report-text";
import { checkReportUpload, HEALTH_REPORT_BUCKET } from "@wonderhome/core/health/report-upload";
import { getRecord } from "@wonderhome/core/health/records";
import { getHealthProfile, listGuardedChildIds } from "@wonderhome/core/health/repository";
import { detectInstructionInjection } from "@wonderhome/core/homesend/injection";
import { requireMembership } from "@wonderhome/core/identity/households";
import { localMoment } from "@wonderhome/core/notifications/timing";

/**
 * "Read the report" (story 21-012). Every gate runs before any of the report
 * leaves: the plan, the person who may ask (the record's own person or their
 * guardian), that person's own "AI help with health" switch, a configured
 * provider, the household's agreement to send anything to it, and — health
 * being its own class — the household's agreement that health details may
 * reach it. Only then is the file read, through the person's own session so
 * the bucket's policy decides, and sent. The model proposes; the validator
 * keeps only what the report prints. Refusals are closed codes; the screen
 * says them in the person's language.
 */
export type ReportReadRefusal =
  | "not_in_plan"
  | "no_file"
  | "not_writer"
  | "person_off"
  | "no_provider"
  | "provider_off"
  | "health_not_allowed"
  | "limit"
  | "unreadable_file"
  | "failed";

export type ReportReadReply =
  | { ok: true; reading: ReportReading; readAt: string; kept: true }
  | { ok: true; reading: ReportReading; readAt: string; kept: false; notKept: "not_ready" | "failed" }
  | { ok: false; reason: ReportReadRefusal };

const schema = z.object({ householdId: z.uuid(), recordId: z.uuid() });

export async function readReportAction(input: { householdId: string; recordId: string }): Promise<ReportReadReply> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "failed" };
  const { householdId, recordId } = parsed.data;

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    // One wave: everything the gates need, none of it the report.
    const [entitlement, record, guarded, householdKey, policy] = await Promise.all([
      may(supabase, householdId, "health.tracking"),
      getRecord(supabase, householdId, recordId),
      listGuardedChildIds(supabase, householdId, membership.memberId),
      readHouseholdKey(householdId).catch(() => null),
      loadDataUse(supabase, householdId),
    ]);
    if (!entitlement.allowed) return { ok: false, reason: "not_in_plan" };
    if (!record || !record.filePath) return { ok: false, reason: "no_file" };
    if (record.memberId !== membership.memberId && !guarded.includes(record.memberId)) return { ok: false, reason: "not_writer" };

    const profile = await getHealthProfile(supabase, householdId, record.memberId).catch(() => null);
    if (profile && !profile.aiAssistanceEnabled) return { ok: false, reason: "person_off" };

    const key = resolveModelKey(householdKey, platformKey());
    const route = routeToProvider({ provider: key.provider, keySource: key.source, policy, hasContent: true });
    if (!route.ok) return { ok: false, reason: route.code === "no_provider_configured" ? "no_provider" : "provider_off" };
    if (!key.provider || !key.key) return { ok: false, reason: "no_provider" };
    if (!policy.allowedClasses.includes("health")) return { ok: false, reason: "health_not_allowed" };

    // A reading is spent from the same allowance a HomeTalk message is.
    const spent = await consume(supabase, householdId, "conversation.text").catch(() => may(supabase, householdId, "conversation.text"));
    if (!spent.allowed) return { ok: false, reason: "limit" };

    const download = await supabase.storage.from(HEALTH_REPORT_BUCKET).download(record.filePath);
    if (download.error || !download.data) return { ok: false, reason: "unreadable_file" };
    const bytes = new Uint8Array(await download.data.arrayBuffer());
    const check = await checkReportUpload(bytes, download.data.type || "application/octet-stream", record.filePath);
    if (!check.ok) return { ok: false, reason: "unreadable_file" };

    const text = check.contentType === "application/pdf" ? extractPdfText(bytes) : null;
    const base64 = Buffer.from(bytes).toString("base64");
    const source: ReportSource =
      text !== null ? { kind: "text", text } : check.contentType === "application/pdf" ? { kind: "pdf", base64 } : { kind: "image", mediaType: check.contentType, base64 };

    const output = await createHealthReportModel(key.provider, key.key)(source);
    if (!output) return { ok: false, reason: "failed" };

    const today = localMoment(new Date(), membership.household.timezone).dateKey;
    const reading = validateReportReading(output, { documentText: text, today, instructionsIgnored: text !== null && detectInstructionInjection(text).flagged });

    const saved = await saveReading(supabase, { householdId, memberId: membership.memberId }, {
      recordId,
      filePath: record.filePath,
      reading,
      provider: key.provider,
      model: reportModelId(key.provider),
    });
    if (!saved.kept) return { ok: true, reading, readAt: new Date().toISOString(), kept: false, notKept: saved.reason };
    revalidatePath("/health");
    return { ok: true, reading, readAt: saved.readAt, kept: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
