// Inspection photo constants + the browser-side downscale helper.

/** Private storage bucket for inspection photos. Created in the migrations. */
export const PHOTO_BUCKET = "inspection-photos";

/** Longest edge after downscale. Phone originals are 3–10 MB; ~1600px JPEG is
 * plenty to show a scuffed wall and keeps uploads (and the free storage tier)
 * small. */
export const PHOTO_MAX_DIMENSION = 1600;

const JPEG_QUALITY = 0.8;

/**
 * Downscale an image file to a ≤{PHOTO_MAX_DIMENSION}px JPEG blob in the
 * browser. Falls back to the original file if decoding fails (e.g. an exotic
 * format the canvas can't read) — the bucket's 5 MB cap is the backstop.
 */
export async function downscalePhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      PHOTO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
