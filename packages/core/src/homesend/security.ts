import type { HomeSendSecurityStatus } from "./items";

/**
 * A minimal, real content check for HomeSend uploads (architecture doc
 * section 12: "validate file signature, not only filename/MIME"). This is
 * deliberately small: it proves the bytes are actually the image format the
 * upload claims to be, the same gap a mislabeled or renamed file exploits.
 * It is not a malware scanner — nothing in this repo has a live scanning
 * provider (see CLAUDE.md's external-providers rule), so a "clean" result
 * here means "the file is what it says it is", not "safe against every
 * threat".
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

/** `clean` only when the bytes actually are the claimed content type — a renamed or mislabeled file is `rejected`. */
export function validateUploadSecurity(claimedContentType: string, bytes: Uint8Array): HomeSendSecurityStatus {
  const detected = detectImageMimeType(bytes);
  return detected !== null && detected === claimedContentType ? "clean" : "rejected";
}
