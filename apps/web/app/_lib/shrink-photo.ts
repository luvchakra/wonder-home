/**
 * Photos are shrunk in the browser before they are sent. A phone camera's
 * picture is often bigger than the 4.5 MB a request may carry, and an
 * avatar never needs more than 512 pixels, so a few dozen kilobytes go up
 * instead of several megabytes.
 */

/** Big enough for every avatar size on a sharp screen; small enough that a family's worth of photos fits in one form post. */
const MAX_EDGE = 512;
/**
 * Shrinks a chosen photo to a 512px JPEG in the browser, so a phone camera's
 * 6 MB picture posts as a few dozen kilobytes. Falls back to the original
 * when the browser cannot read the image (the server then judges it).
 */
export async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}
