import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@wonderhome/core/db/server";
import { signedReportUrl } from "@wonderhome/core/health/report-upload";

export const dynamic = "force-dynamic";

/**
 * "Open the report" (story 21-012): a link that hands over a minute-long
 * signed address for the record's file. The record is read, and the link is
 * signed, through the viewer's own session, so RLS and the bucket's policy
 * (`wh.may_see_health` on the record that carries the file) decide — never
 * this handler. Anyone else gets a plain "not available".
 */
export async function GET(_request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  const notAvailable = () =>
    new NextResponse("This report is not available to you.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  if (!z.uuid().safeParse(recordId).success) return notAvailable();

  const supabase = await createClient();
  const url = await signedReportUrl(supabase, recordId, 60).catch(() => null);
  if (!url) return notAvailable();
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
