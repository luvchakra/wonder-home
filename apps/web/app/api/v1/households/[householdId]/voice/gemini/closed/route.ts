import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { classifyKeyFailure, noteKeyFailure } from "@wonderhome/core/ai/key-alerts";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";

import { geminiLiveGate } from "@/app/_lib/gemini-live";

/**
 * Gemini closed a live voice session, and said why (the owner, 2026-10-26).
 *
 * The socket runs in the browser, so only the page hears Google's reason. It
 * reports the close code and words here; when they say the household's key is
 * out of credits, out of quota or not valid, the alert is recorded against
 * that key (`ai/key-alerts.ts`) and an Admin is told. Nothing else is kept,
 * and the key never leaves this server.
 */
type Params = { params: Promise<{ householdId: string }> };

const schema = z.object({ code: z.number().int().min(0).max(4999).nullable(), reason: z.string().max(500) });

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;
  return defineRoute({ authenticate: requireUser }, async () => {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Send the close code and reason.");
    const supabase = await createClient();
    await requireMembership(supabase, householdId);
    const alert = classifyKeyFailure("google", null, parsed.data.reason);
    if (!alert) return { recorded: false };
    const { key } = await geminiLiveGate(supabase, householdId);
    if (!key.key || key.provider !== "google") return { recorded: false };
    await noteKeyFailure(key.key, "google", alert);
    return { recorded: true };
  })(request);
}

export const dynamic = "force-dynamic";
