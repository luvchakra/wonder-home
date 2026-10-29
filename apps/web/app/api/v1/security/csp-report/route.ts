import { CSP_REPORT_MAX_BYTES, recordCspReports } from "@wonderhome/core/security/csp-report";

/**
 * Browsers post Content-Security-Policy violations here (SEC-05). Unauthenticated by nature, so it
 * keeps nothing but a bounded, redacted log line (`security/csp-report.ts`) and always answers 204.
 */
export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared <= CSP_REPORT_MAX_BYTES) {
    try {
      const text = await request.text();
      if (text.length <= CSP_REPORT_MAX_BYTES) recordCspReports(JSON.parse(text));
    } catch {
      // Not a report; nothing to keep.
    }
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
