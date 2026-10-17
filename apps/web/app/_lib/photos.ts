import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@wonderhome/core/api/errors";

/**
 * Photos posted with a form (onboarding's people steps): checked, stored in
 * the private `avatars` bucket under the household's folder, and named by
 * path only — reads mint a short-lived signed URL. The bucket's policies
 * (members read, Admins write, keyed on the household folder) are the
 * boundary; this only refuses what is plainly not a photo first.
 */

const MAX_BYTES = 5 * 1024 * 1024;

/** The image kinds a photo may be, by their first bytes rather than by what the browser claims. */
function sniff(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** The photo posted under `name`, or null when none was chosen. Throws a readable refusal for anything that is not a usable photo. */
export async function postedPhoto(formData: FormData, name: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const file = formData.get(name);
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_BYTES) throw ApiError.badRequest("That photo is too large — please use one under 5MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniff(bytes);
  if (!contentType) throw ApiError.badRequest("Photos must be a JPEG, PNG or WebP image.");
  return { bytes, contentType };
}

export function wantsPhotoRemoved(formData: FormData, name: string): boolean {
  return formData.get(`${name}_remove`) === "1";
}

export function memberPhotoPath(householdId: string, memberId: string): string {
  return `${householdId}/${memberId}`;
}

export function petPhotoPath(householdId: string, petId: string): string {
  return `${householdId}/pets/${petId}`;
}

export async function storePhoto(supabase: SupabaseClient, path: string, photo: { bytes: Uint8Array; contentType: string }): Promise<void> {
  const { error } = await supabase.storage.from("avatars").upload(path, photo.bytes, { upsert: true, contentType: photo.contentType });
  if (error) throw new Error(`photo upload failed: ${error.message}`);
}

export async function deletePhoto(supabase: SupabaseClient, path: string): Promise<void> {
  await supabase.storage.from("avatars").remove([path]);
}
