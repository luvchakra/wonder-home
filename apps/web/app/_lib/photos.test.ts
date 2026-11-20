import { describe, expect, it } from "vitest";

import { postedPhoto, wantsPhotoRemoved } from "./photos";

/** A form with one file under "photo", as the recipe sheet posts it (25-050). */
function formWith(bytes: Uint8Array, type = "image/jpeg"): FormData {
  const form = new FormData();
  form.set("photo", new File([bytes as BlobPart], "picked", { type }));
  return form;
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

describe("a posted picture (recipes, members, groceries)", () => {
  it("is none when nothing was chosen, and saving goes on without it", async () => {
    await expect(postedPhoto(new FormData(), "photo")).resolves.toBeNull();
  });

  it("is judged by its bytes, not by what the browser claimed", async () => {
    await expect(postedPhoto(formWith(JPEG, "application/octet-stream"), "photo")).resolves.toMatchObject({ contentType: "image/jpeg" });
    await expect(postedPhoto(formWith(new TextEncoder().encode("<svg onload=alert(1)>"), "image/jpeg"), "photo")).rejects.toThrow(
      "Photos must be a JPEG, PNG or WebP image.",
    );
  });

  it("refuses one over 5 MB in a plain sentence", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(JPEG);
    await expect(postedPhoto(formWith(big), "photo")).rejects.toThrow("That photo is too large — please use one under 5MB.");
  });

  it("reads a removal only when it was asked for", () => {
    const form = new FormData();
    expect(wantsPhotoRemoved(form, "photo")).toBe(false);
    form.set("photo_remove", "1");
    expect(wantsPhotoRemoved(form, "photo")).toBe(true);
  });
});
