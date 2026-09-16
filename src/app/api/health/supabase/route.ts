import { NextResponse } from "next/server";

import { checkSupabaseHealth } from "@/lib/supabase/health";

export const dynamic = "force-dynamic";

/**
 * Reports whether the app can reach the pinned WonderHome Supabase project.
 *
 * Returns 200 when the project is reachable, 503 otherwise. Only the project
 * ref is echoed back — never a key.
 */
export async function GET() {
  const health = await checkSupabaseHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
