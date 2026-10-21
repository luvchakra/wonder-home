import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReportFinding, ReportReading } from "./report-reading";

/**
 * Keeping a report's reading (story 21-012, `health_record_readings`). A
 * reading is visible exactly as its record is and written only by the
 * record's person or their guardian — RLS decides both. Readings are only
 * ever added; reading again adds a newer one, and a reading belongs to the
 * file it read (`file_path`), so replacing the report leaves the old reading
 * behind rather than showing it against the new file.
 *
 * Until the table reaches a project (PGRST205 / 42P01), reads come back
 * empty and a save says it could not be kept yet, never throws: the fresh
 * reading is still shown for that request.
 */

export type StoredReading = {
  id: string;
  recordId: string;
  filePath: string;
  reading: ReportReading;
  provider: string;
  model: string;
  readAt: string;
};

const SELECT = "id, record_id, file_path, findings, test_date, checked_against, instructions_ignored, dropped_count, provider, model, read_at";

type Row = Record<string, unknown>;

export function isMissingTable(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

function toStored(row: Row): StoredReading {
  const findings = Array.isArray(row.findings) ? (row.findings as ReportFinding[]) : [];
  return {
    id: row.id as string,
    recordId: row.record_id as string,
    filePath: row.file_path as string,
    reading: {
      readable: findings.length > 0,
      testDate: (row.test_date as string | null) ?? null,
      findings,
      dropped: Number(row.dropped_count ?? 0),
      checkedAgainst: row.checked_against === "quote" ? "quote" : "text",
      instructionsIgnored: row.instructions_ignored === true,
    },
    provider: row.provider as string,
    model: row.model as string,
    readAt: row.read_at as string,
  };
}

/**
 * The newest reading of each record's current file, among the household's
 * most recent readings (bounded). Starts alongside the page's other reads:
 * it needs no record ids, and RLS leaves out what this viewer may not see.
 */
export async function listRecentReadings(supabase: SupabaseClient, householdId: string, limit = 60): Promise<{ available: boolean; readings: StoredReading[] }> {
  const { data, error } = await supabase.from("health_record_readings").select(SELECT).eq("household_id", householdId).order("read_at", { ascending: false }).limit(limit);
  if (error) {
    if (isMissingTable(error)) return { available: false, readings: [] };
    return { available: true, readings: [] };
  }
  return { available: true, readings: ((data as Row[] | null) ?? []).map(toStored) };
}

/** The newest reading for each record, of the file the record carries now. */
export function latestByRecord(readings: readonly StoredReading[], records: readonly { id: string; filePath: string | null }[]): Map<string, StoredReading> {
  const current = new Map(records.filter((record) => record.filePath).map((record) => [record.id, record.filePath]));
  const latest = new Map<string, StoredReading>();
  for (const reading of readings) {
    if (current.get(reading.recordId) !== reading.filePath) continue;
    const kept = latest.get(reading.recordId);
    if (!kept || kept.readAt < reading.readAt) latest.set(reading.recordId, reading);
  }
  return latest;
}

export type SaveReadingResult = { kept: true; readAt: string } | { kept: false; reason: "not_ready" | "failed" };

export async function saveReading(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  input: { recordId: string; filePath: string; reading: ReportReading; provider: string; model: string },
): Promise<SaveReadingResult> {
  const { data, error } = await supabase
    .from("health_record_readings")
    .insert({
      household_id: actor.householdId,
      record_id: input.recordId,
      file_path: input.filePath,
      findings: input.reading.findings,
      test_date: input.reading.testDate,
      checked_against: input.reading.checkedAgainst,
      instructions_ignored: input.reading.instructionsIgnored,
      dropped_count: input.reading.dropped,
      provider: input.provider,
      model: input.model,
      created_by_member_id: actor.memberId,
    })
    .select("read_at")
    .single();
  if (error) return { kept: false, reason: isMissingTable(error) ? "not_ready" : "failed" };
  return { kept: true, readAt: (data as Row).read_at as string };
}

/** Readings of a file the record no longer carries (replaced or removed): they describe a report that is gone. Best effort. */
export async function forgetReadingsOf(supabase: SupabaseClient, householdId: string, recordId: string, filePath: string): Promise<void> {
  await supabase.from("health_record_readings").delete().eq("household_id", householdId).eq("record_id", recordId).eq("file_path", filePath);
}
