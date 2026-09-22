import { describe, expect, it } from "vitest";

import { detectImageMimeType, validateUploadSecurity } from "./security";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x00, 0x00, 0x00, 0x00, // size (irrelevant to detection)
  0x57, 0x45, 0x42, 0x50, // WEBP
]);
const NOT_AN_IMAGE = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"

describe("detectImageMimeType", () => {
  it("reads a real JPEG's magic bytes", () => {
    expect(detectImageMimeType(JPEG)).toBe("image/jpeg");
  });

  it("reads a real PNG's magic bytes", () => {
    expect(detectImageMimeType(PNG)).toBe("image/png");
  });

  it("reads a real WebP's RIFF/WEBP markers", () => {
    expect(detectImageMimeType(WEBP)).toBe("image/webp");
  });

  it("returns null for content that is not one of the three formats", () => {
    expect(detectImageMimeType(NOT_AN_IMAGE)).toBeNull();
  });

  it("returns null for a buffer too short to hold any magic sequence", () => {
    expect(detectImageMimeType(Uint8Array.from([0xff]))).toBeNull();
  });
});

describe("validateUploadSecurity", () => {
  it("is clean when the bytes match the claimed content type", () => {
    expect(validateUploadSecurity("image/jpeg", JPEG)).toBe("clean");
    expect(validateUploadSecurity("image/png", PNG)).toBe("clean");
    expect(validateUploadSecurity("image/webp", WEBP)).toBe("clean");
  });

  it("is rejected when a real image's bytes are relabeled as a different image type", () => {
    expect(validateUploadSecurity("image/png", JPEG)).toBe("rejected");
  });

  it("is rejected when the bytes are not an image at all, whatever the claimed type", () => {
    expect(validateUploadSecurity("image/jpeg", NOT_AN_IMAGE)).toBe("rejected");
  });

  it("defaults to clean on a magic-byte match with no scan supplied at all", () => {
    expect(validateUploadSecurity("image/jpeg", JPEG)).toBe("clean");
  });

  it("is clean when the bytes match and an actual scan found nothing", () => {
    expect(validateUploadSecurity("image/jpeg", JPEG, { scanned: true, clean: true })).toBe("clean");
  });

  it("is rejected when the bytes match but a configured scan flagged the file", () => {
    expect(validateUploadSecurity("image/jpeg", JPEG, { scanned: true, clean: false })).toBe("rejected");
  });

  it("is clean when the bytes match and the scan did not run at all", () => {
    expect(validateUploadSecurity("image/jpeg", JPEG, { scanned: false })).toBe("clean");
  });

  it("stays rejected for a bad magic-byte match even if a scan says clean", () => {
    // The scan verdict can never override the file simply not being what it claims.
    expect(validateUploadSecurity("image/png", JPEG, { scanned: true, clean: true })).toBe("rejected");
  });
});
