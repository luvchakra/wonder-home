"use server";

import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { clearPlace, markPlace } from "@wonderhome/core/homeplaces/repository";
import { placesFrom } from "@wonderhome/core/homeplaces/service";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * Save a place HomePlaces offered, mark it "not for us", or undo either.
 *
 * The browser names only the reply and the place. The place itself is read
 * from that reply's stored metadata on the server, so nothing a browser makes
 * up can land in the household's place book. RLS decides who may write (an
 * adult or Admin); a child's tap is refused there.
 */
const schema = z.object({
  householdId: z.uuid(),
  messageId: z.uuid(),
  placeId: z.string().min(1).max(300),
  status: z.enum(["saved", "not_for_us", "clear"]),
});

export async function setPlaceAction(input: z.input<typeof schema>): Promise<{ ok: true } | { error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "That place could not be found." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const { data } = await supabase
      .from("conversation_messages")
      .select("metadata")
      .eq("household_id", parsed.data.householdId)
      .eq("id", parsed.data.messageId)
      .eq("role", "assistant")
      .maybeSingle();
    const place = placesFrom(data?.metadata).find((entry) => entry.placeId === parsed.data.placeId);
    if (!place) return { error: "That place could not be found." };
    if (parsed.data.status === "clear") {
      await clearPlace(supabase, { householdId: parsed.data.householdId, placeId: place.placeId });
    } else {
      await markPlace(supabase, {
        householdId: parsed.data.householdId,
        memberId: membership.memberId,
        place: { placeId: place.placeId, name: place.name, address: place.address, kind: place.kind, location: place.location, mapsUri: place.mapsUri },
        status: parsed.data.status,
      });
    }
    return { ok: true };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
}
