/**
 * Client-side image compression for note attachments.
 *
 * Resizes raster images to fit within `maxEdge` (longest side) and
 * re-encodes them as WebP at the given quality. EXIF metadata is dropped
 * by virtue of going through canvas. SVG and animated GIF are returned
 * untouched — canvas can't preserve animation, and SVG is text already.
 */

export interface CompressOptions {
  /** Longest-edge cap in pixels. Default 2560. */
  maxEdge?: number;
  /** WebP quality, 0..1. Default 0.85. */
  quality?: number;
}

export interface CompressResult {
  blob: Blob;
  contentType: string;
  fileName: string;
}

const DEFAULT_MAX_EDGE = 2560;
const DEFAULT_QUALITY = 0.85;

/**
 * Best-effort detection of an animated GIF. Looks for the
 * `NETSCAPE2.0` application extension marker that animated GIFs carry.
 * Static GIFs do not contain this marker.
 */
async function isAnimatedGif(file: File): Promise<boolean> {
  if (file.type !== "image/gif") return false;
  try {
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    // Search for ASCII "NETSCAPE2.0" — bytes 4E 45 54 53 43 41 50 45 32 2E 30
    const needle = [0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30];
    outer: for (let i = 0; i <= head.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (head[i + j] !== needle[j]) continue outer;
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function replaceExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  return `${stem}.${ext}`;
}

function targetDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

async function encodeViaOffscreenCanvas(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas === "undefined") return null;
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: "image/webp", quality });
  } catch {
    return null;
  }
}

async function encodeViaHtmlCanvas(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", quality),
    );
  } catch {
    return null;
  }
}

/**
 * Compress an image File. Returns the original if compression isn't
 * applicable (SVG, animated GIF, decode failure, encode failure).
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<CompressResult> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_QUALITY;

  const passthrough: CompressResult = {
    blob: file,
    contentType: file.type || "application/octet-stream",
    fileName: file.name,
  };

  if (!file.type.startsWith("image/")) return passthrough;
  if (file.type === "image/svg+xml") return passthrough;
  if (await isAnimatedGif(file)) return passthrough;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return passthrough;
  }

  const { width, height } = targetDimensions(bitmap.width, bitmap.height, maxEdge);

  const blob =
    (await encodeViaOffscreenCanvas(bitmap, width, height, quality)) ??
    (await encodeViaHtmlCanvas(bitmap, width, height, quality));

  bitmap.close?.();

  if (!blob) return passthrough;

  // If WebP came out larger than the source (rare, but happens for
  // already-optimized JPEGs at small dimensions), keep the original.
  if (blob.size >= file.size) return passthrough;

  return {
    blob,
    contentType: "image/webp",
    fileName: replaceExtension(file.name, "webp"),
  };
}
