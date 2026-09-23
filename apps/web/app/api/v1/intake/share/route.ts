import { NextResponse } from "next/server";
import { hitRateLimit } from "@wonderhome/core/security/rate-limit";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient, getVerifiedUser } from "@wonderhome/core/db/server";
import { ingestFile, ingestText, IngestRejected } from "@wonderhome/core/homesend/ingest";
import { clientIpFromHeaders, hashClientIp, mayCreateShareHandoff } from "@wonderhome/core/homesend/rate-limit";
import { countRecentShareHandoffs, createShareHandoff, pruneExpiredShareHandoffs } from "@wonderhome/core/homesend/share-handoff";
import { listMemberships } from "@wonderhome/core/identity/households";

/**
 * The PWA Web Share Target's landing point (Phase 4) — `manifest.webmanifest`'s
 * `share_target` points the OS share sheet here, once installed. This is a
 * real full-page form POST from the OS, not a `fetch` call: it always ends in
 * a redirect (Post/Redirect/Get), never a JSON body, so it bypasses
 * `defineRoute` the same way the email webhook does (which also needs the raw
 * request before any of that machinery runs).
 *
 * Deliberately public — `e2e/domains.spec.ts`'s anonymous-caller sweep is
 * told so via `PUBLIC_PATHS`. Anonymous is exactly who this exists for: the
 * share sheet is reachable whether or not the person has ever signed in on
 * this device. If they have (and have a household — see the comment below),
 * the content is classified and saved immediately, same as a manual
 * upload/paste. If not, it is staged in `homesend_share_handoffs` and handed
 * back through `/sign-in?next=...`, which the `/home-send` page resumes.
 */

/** The hosting platform's request ceiling, less multipart overhead — what the type of file is, the pipeline decides from its bytes. */
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

function redirectTo(path: string, origin: string): NextResponse {
  return NextResponse.redirect(new URL(path, origin), 303);
}

export async function POST(request: Request): Promise<Response> {
  const { origin } = new URL(request.url);
  const formData = await request.formData();

  const combinedText = [formData.get("title"), formData.get("text"), formData.get("url")]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n\n")
    .trim()
    .slice(0, 4000);

  const shared = formData.get("photo");
  const photo = shared instanceof File && shared.size > 0 ? shared : null;

  if (photo && photo.size > UPLOAD_MAX_BYTES) return redirectTo("/home-send?shareError=size", origin);
  if (!photo && combinedText.length === 0) return redirectTo("/home-send", origin);

  const user = await getVerifiedUser();
  // A signed-in visitor with no household yet (mid-onboarding) is the one
  // case this does not also hand off — rare enough, and `/welcome` has no
  // "resume after" step of its own to hand a token to, that losing the
  // share here is an honest edge rather than a second path worth building.
  const membership = user ? (await listMemberships(await createClient()))[0] : undefined;

  if (user && membership) {
    const supabase = await createClient();
    const actor = { householdId: membership.household.id, memberId: membership.memberId };
    // The same per-member intake limit the upload and paste forms use (Wave 5 §15).
    const limiter = createAdminClient();
    if (!(await hitRateLimit(limiter, "homesend.intake", membership.memberId))) return redirectTo("/home-send?shareError=rate_limited", origin);
    try {
      // The same one pipeline every other HomeSend input goes through; a
      // file it refuses is still kept, failed safely, in the inbox.
      if (photo) {
        await ingestFile(supabase, actor, { bytes: new Uint8Array(await photo.arrayBuffer()), claimedType: photo.type, filename: photo.name || null });
      } else {
        await ingestText(supabase, actor, { text: combinedText }, { limit: (bucket) => hitRateLimit(limiter, bucket, membership.memberId) });
      }
    } catch (thrown) {
      return redirectTo(`/home-send?shareError=${thrown instanceof IngestRejected ? "size" : "upload"}`, origin);
    }
    return redirectTo("/home-send", origin);
  }

  const admin = createAdminClient();
  // Best-effort — a failed cleanup here must never block the actual share;
  // the real sweep (`/platform/retention`) is what guarantees this happens.
  await pruneExpiredShareHandoffs(admin).catch(() => undefined);

  // The one genuinely anonymous write in this pipeline — rate-limited by IP
  // hash, never the address itself. An unidentifiable caller (no forwarding
  // header at all) is let through: this is a throttle against abuse, not an
  // authorization gate.
  const ip = clientIpFromHeaders(request.headers);
  const ipHash = ip ? hashClientIp(ip) : null;
  if (ipHash) {
    const recentCount = await countRecentShareHandoffs(admin, ipHash);
    if (!mayCreateShareHandoff(recentCount).allowed) return redirectTo("/home-send?shareError=rate_limited", origin);
  }

  const token = photo
    ? await createShareHandoff(admin, { kind: "file", fileBytes: Buffer.from(await photo.arrayBuffer()), fileContentType: photo.type }, ipHash)
    : await createShareHandoff(admin, { kind: "text", rawText: combinedText }, ipHash);

  return redirectTo(`/sign-in?next=${encodeURIComponent(`/home-send?handoff=${token}`)}`, origin);
}

export const dynamic = "force-dynamic";
