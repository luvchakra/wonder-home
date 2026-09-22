import { platformMalwareScanConfig, scanForMalware, type MalwareScanOutcome } from "./malware-scan";
import type { HomeSendSecurityStatus } from "./items";

/**
 * A minimal, real content check for HomeSend uploads (architecture doc
 * section 12: "validate file signature, not only filename/MIME"). The
 * magic-byte check proves the bytes are actually the image format the
 * upload claims to be, the same gap a mislabeled or renamed file exploits.
 * `malware-scan.ts` is the second, optional check — optional because
 * nothing in this repo has a live scanning provider configured (see
 * CLAUDE.md's external-providers rule), so `scanned: false` there means
 * exactly what it already meant before that file existed: a "clean" result
 * here says "the file is what it says it is, and nothing configured found
 * it unsafe", never "scanned safe against every threat".
 */

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((byte, index) => bytes[index] === byte);
}

function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  return riff === "RIFF" && webp === "WEBP";
}

/** The image format the bytes themselves say they are, independent of whatever the upload claimed. */
export function detectImageMimeType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (startsWith(bytes, JPEG_MAGIC)) return "image/jpeg";
  if (startsWith(bytes, PNG_MAGIC)) return "image/png";
  if (isWebp(bytes)) return "image/webp";
  return null;
}

/**
 * `clean` only when the bytes actually are the claimed content type, and
 * (whenever a scan actually ran) the provider did not flag them. A renamed
 * or mislabeled file is `rejected` regardless of the scan; a file a
 * configured provider flags is `rejected` even though its bytes matched.
 */
export function validateUploadSecurity(
  claimedContentType: string,
  bytes: Uint8Array,
  malwareScan: MalwareScanOutcome = { scanned: false },
): HomeSendSecurityStatus {
  const detected = detectImageMimeType(bytes);
  if (detected === null || detected !== claimedContentType) return "rejected";
  if (malwareScan.scanned && !malwareScan.clean) return "rejected";
  return "clean";
}

/**
 * The convenience every upload path actually calls: resolves the platform's
 * scanning config, runs the scan if one is configured, and folds the result
 * into the same verdict `validateUploadSecurity` always returned — so
 * wiring this in changes nothing about behaviour today (no provider is
 * configured) and everything about behaviour the day one is.
 */
export async function assessUploadSecurity(claimedContentType: string, bytes: Uint8Array): Promise<HomeSendSecurityStatus> {
  const scanOutcome = await scanForMalware(bytes, claimedContentType, platformMalwareScanConfig());
  return validateUploadSecurity(claimedContentType, bytes, scanOutcome);
}
