/**
 * Client-Side Image Compression Engine for BillLens PH
 *
 * Downscales high-resolution smartphone photos of hospital Itemized Statements of Account (ISAs)
 * to a maximum bounding dimension (default 1600px) and compresses to WebP/JPEG targeting ~250KB–500KB.
 * Preserves sharp text contrast for Gemini Vision OCR while reducing upload payload and latency.
 */

export interface CompressionOptions {
  /** Maximum width or height in pixels (maintains aspect ratio). Default: 1600 */
  maxDimension?: number;
  /** Target maximum file size in bytes. Default: 450 * 1024 (~450KB) */
  targetMaxBytes?: number;
  /** Preferred output MIME type. Falls back to image/jpeg if WebP encoding isn't supported. */
  preferredMimeType?: "image/webp" | "image/jpeg";
  /** Initial encoder quality (0 to 1). Default: 0.84 */
  initialQuality?: number;
  /** Minimum encoder quality floor (0 to 1) to protect OCR legibility. Default: 0.55 */
  minQuality?: number;
}

export interface CompressionResult {
  /** Compressed File ready for Supabase Storage upload */
  file: File;
  /** Underlying Blob payload */
  blob: Blob;
  /** Object URL for immediate viewfinder preview (call URL.revokeObjectURL when done) */
  previewUrl: string;
  /** Original file size in bytes */
  originalSize: number;
  /** Final compressed file size in bytes */
  compressedSize: number;
  /** Percentage saved, e.g. 78.4 means 78.4% smaller (0 if untouched) */
  compressionRatio: number;
  /** Output image width in pixels (0 for PDFs) */
  width: number;
  /** Output image height in pixels (0 for PDFs) */
  height: number;
  /** Output MIME type */
  mimeType: string;
  /** Whether the file was re-encoded/downscaled */
  wasCompressed: boolean;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxDimension: 1600,
  targetMaxBytes: 450 * 1024, // ~450 KB (sweet spot inside 250KB - 500KB target)
  preferredMimeType: "image/webp",
  initialQuality: 0.84,
  minQuality: 0.55,
};

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/**
 * Checks whether a file is an image or PDF supported by the BillLens scanner.
 */
export function isSupportedBillFile(file: File): boolean {
  if (file.type === "application/pdf") return true;
  if (SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) return true;
  // Fallback extension check for mobile browsers that omit MIME on HEIC/JPG
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"].includes(ext ?? "");
}

/**
 * Calculates scaled dimensions that fit within `maxDimension` while preserving aspect ratio.
 */
export function calculateScaledDimensions(
  originalWidth: number,
  originalHeight: number,
  maxDimension: number
): { width: number; height: number; wasScaled: boolean } {
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return {
      width: originalWidth,
      height: originalHeight,
      wasScaled: false,
    };
  }

  const aspectRatio = originalWidth / originalHeight;

  if (originalWidth >= originalHeight) {
    return {
      width: maxDimension,
      height: Math.max(1, Math.round(maxDimension / aspectRatio)),
      wasScaled: true,
    };
  } else {
    return {
      width: Math.max(1, Math.round(maxDimension * aspectRatio)),
      height: maxDimension,
      wasScaled: true,
    };
  }
}

/**
 * Loads a File/Blob into an HTMLImageElement or ImageBitmap for canvas drawing.
 */
async function decodeImageFile(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof window === "undefined") {
    throw new Error("compressBillImage must be executed in a browser environment.");
  }

  // Prefer createImageBitmap where supported (handles EXIF orientation automatically in modern browsers)
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall through to HTMLImageElement loader if createImageBitmap fails
    }
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(
          `Unable to decode image "${file.name}". If capturing on iOS, please use JPEG/Most Compatible or select a standard image/PDF.`
        )
      );
    };

    img.src = objectUrl;
  });
}

/**
 * Promisified wrapper around HTMLCanvasElement.toBlob.
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas encoding failed to produce a Blob."));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

/**
 * Replaces a filename's extension with the appropriate extension for the given MIME type.
 */
function buildOutputFileName(originalName: string, mimeType: string): string {
  const baseName = originalName.replace(/\.[^/.]+$/, "") || "hospital-bill";
  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  return `${baseName}.${ext}`;
}

/**
 * Compresses and downscales a hospital bill image on the client side.
 * - PDFs are passed through unaltered with metadata populated.
 * - High-resolution camera photos (e.g., 4000x3000px) are downscaled to max 1600px.
 * - Iteratively steps encoder quality to hit the ~250KB–500KB target range while preserving OCR sharpness.
 */
export async function compressBillImage(
  file: File,
  options?: CompressionOptions
): Promise<CompressionResult> {
  if (!isSupportedBillFile(file)) {
    throw new Error(
      `Unsupported file format "${file.type || file.name}". Please upload a JPEG, PNG, WebP, HEIC photo, or PDF document.`
    );
  }

  const config: Required<CompressionOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  // Pass-through for PDF statements (cannot be raster-compressed via canvas without losing vector text)
  if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  ) {
    return {
      file,
      blob: file,
      previewUrl: URL.createObjectURL(file),
      originalSize: file.size,
      compressedSize: file.size,
      compressionRatio: 0,
      width: 0,
      height: 0,
      mimeType: "application/pdf",
      wasCompressed: false,
    };
  }

  const decoded = await decodeImageFile(file);

  try {
    const { width, height, wasScaled } = calculateScaledDimensions(
      decoded.width,
      decoded.height,
      config.maxDimension
    );

    // If the image is already within dimensions, under the target byte budget, and web-safe, keep it if small enough
    const isAlreadyOptimal =
      !wasScaled &&
      file.size <= config.targetMaxBytes &&
      (file.type === "image/webp" || file.type === "image/jpeg");

    if (isAlreadyOptimal) {
      return {
        file,
        blob: file,
        previewUrl: URL.createObjectURL(file),
        originalSize: file.size,
        compressedSize: file.size,
        compressionRatio: 0,
        width,
        height,
        mimeType: file.type,
        wasCompressed: false,
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not initialize 2D canvas context for image compression.");
    }

    // Fill white background before drawing in case source is a transparent PNG scan
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.source, 0, 0, width, height);

    // Encode with preferred MIME type; fall back to image/jpeg if browser doesn't support WebP encoding
    let activeMimeType: string = config.preferredMimeType;
    let currentQuality = config.initialQuality;
    let encodedBlob = await canvasToBlob(canvas, activeMimeType, currentQuality);

    if (
      activeMimeType === "image/webp" &&
      encodedBlob.type !== "image/webp"
    ) {
      activeMimeType = "image/jpeg";
      encodedBlob = await canvasToBlob(canvas, activeMimeType, currentQuality);
    }

    // Iteratively step down quality if still above targetMaxBytes (~450KB), down to minQuality (0.55)
    const qualityStep = 0.08;
    while (
      encodedBlob.size > config.targetMaxBytes &&
      currentQuality - qualityStep >= config.minQuality
    ) {
      currentQuality = Number((currentQuality - qualityStep).toFixed(2));
      encodedBlob = await canvasToBlob(canvas, activeMimeType, currentQuality);
    }

    // Safety check: if the re-encoded image ended up larger than a web-compatible original that didn't need scaling, keep original
    if (
      !wasScaled &&
      encodedBlob.size >= file.size &&
      (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp")
    ) {
      return {
        file,
        blob: file,
        previewUrl: URL.createObjectURL(file),
        originalSize: file.size,
        compressedSize: file.size,
        compressionRatio: 0,
        width,
        height,
        mimeType: file.type,
        wasCompressed: false,
      };
    }

    const outputFileName = buildOutputFileName(file.name, activeMimeType);
    const compressedFile = new File([encodedBlob], outputFileName, {
      type: activeMimeType,
      lastModified: Date.now(),
    });

    const savingsRatio =
      file.size > 0
        ? Math.max(0, Number((((file.size - compressedFile.size) / file.size) * 100).toFixed(1)))
        : 0;

    return {
      file: compressedFile,
      blob: encodedBlob,
      previewUrl: URL.createObjectURL(compressedFile),
      originalSize: file.size,
      compressedSize: compressedFile.size,
      compressionRatio: savingsRatio,
      width,
      height,
      mimeType: activeMimeType,
      wasCompressed: true,
    };
  } finally {
    decoded.cleanup();
  }
}

/**
 * Formats byte counts into human-readable strings (e.g., "4.2 MB" -> "312 KB").
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, index);
  return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

