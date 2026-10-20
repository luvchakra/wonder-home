"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { forgetPlace, markPlace, notePlace } from "@wonderhome/core/homeplaces/repository";
import { requireMembership } from "@wonderhome/core/identity/households";
import { mapsLink } from "@wonderhome/core/places/provider";
import { hitRateLimit } from "@wonderhome/core/security/rate-limit";

import { pickedPlace } from "../_lib/places";

/**
 * The place book's own changes: forget a place (a saved one stops coming
 * first, a turned-down one may be suggested again) or keep a note on it.
 * The browser names only the row; RLS decides who may write (an adult or
 * Admin), so a child's tap is refused there whatever the screen showed.
 */
const forgetSchema = z.object({ householdId: z.uuid(), id: z.uuid() });
const noteSchema = z.object({ householdId: z.uuid(), id: z.uuid(), note: z.string().max(300) });

export async function forgetPlaceAction(input: z.input<typeof forgetSchema>): Promise<{ ok: true } | { error: string }> {
  const parsed = forgetSchema.safeParse(input);
  if (!parsed.success) return { error: "That place could not be found." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await forgetPlace(supabase, parsed.data);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
  revalidatePath("/places");
  return { ok: true };
}

export async function notePlaceAction(input: z.input<typeof noteSchema>): Promise<{ ok: true } | { error: string }> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { error: "Keep the note under 300 characters." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await notePlace(supabase, { householdId: parsed.data.householdId, id: parsed.data.id, note: parsed.data.note.trim() || null });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
  revalidatePath("/places");
  return { ok: true };
}

export type AddPlaceState = { result?: "saved" | "pick" | "busy" | "failed"; /** When the last save landed: the form starts fresh after it. */ savedAt?: number };

/**
 * Adds a place to the book from the Places screen (HomePlaces 24-006).
 *
 * The browser sends only the id of the place picked from the search list and
 * an optional note. The place itself is read again from the provider here, so
 * nothing a browser makes up lands in the book. It counts against the same
 * hourly budget as HomeTalk's place answers (`places.find`), since each one is
 * a paid lookup. RLS decides who may write: an adult or an Admin.
 */
export async function addPlaceAction(_previous: AddPlaceState, formData: FormData): Promise<AddPlaceState> {
  const householdId = z.uuid().safeParse(formData.get("householdId"));
  if (!householdId.success) return { result: "failed" };
  if (!String(formData.get("place_id") ?? "").trim()) return { result: "pick" };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId.data);
    if (membership.memberType !== "adult") return { result: "failed" };
    if (!(await hitRateLimit(createAdminClient(), "places.find", householdId.data))) return { result: "busy" };
    const place = await pickedPlace(membership, formData.get("place_id"), formData.get("place_session"));
    if (!place) return { result: "failed" };
    await markPlace(supabase, {
      householdId: householdId.data,
      memberId: membership.memberId,
      place: {
        placeId: place.placeId,
        name: place.name,
        address: place.formattedAddress,
        kind: null,
        location: { latitude: place.latitude, longitude: place.longitude },
        mapsUri: mapsLink({ name: place.name, formattedAddress: place.formattedAddress, placeId: place.placeId }),
      },
      status: "saved",
      origin: "added",
    });
    const note = String(formData.get("note") ?? "").trim().slice(0, 300);
    if (note) {
      const { data } = await supabase.from("household_places").select("id").eq("household_id", householdId.data).eq("place_id", place.placeId).maybeSingle();
      if (data?.id) await notePlace(supabase, { householdId: householdId.data, id: data.id as string, note });
    }
    revalidatePath("/places");
    return { result: "saved", savedAt: Date.now() };
  } catch {
    return { result: "failed" };
  }
}
