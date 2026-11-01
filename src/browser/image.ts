import { AppError } from "../core/errors.ts";
import { MAX_INPUT_BYTES, MAX_OUTPUT_PIXELS } from "../core/image-limits.ts";
import {
  imageDimensions,
  validateInputDimensions,
} from "./image-dimensions.ts";
import type { Frame, Parameters } from "../core/types.ts";
import { roundEven } from "../core/math.ts";

export async function decode(file: File): Promise<ImageBitmap> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new AppError("fileType");
  if (file.size > MAX_INPUT_BYTES) throw new AppError("fileSize");
  validateInputDimensions(imageDimensions(await file.arrayBuffer()));
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new AppError("decode");
  }
  // Retain a post-decode check in case container and decoder dimensions differ.
  try {
    validateInputDimensions(bitmap);
  } catch (error) {
    bitmap.close();
    throw error;
  }
  return bitmap;
}
export function prepare(bitmap: ImageBitmap, p: Parameters): Frame {
  const width = Math.min(bitmap.width, p.width),
    height = Math.max(1, roundEven((bitmap.height * width) / bitmap.width));
  if (width * height > MAX_OUTPUT_PIXELS) throw new AppError("outputPixels");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
    colorSpace: "srgb",
  });
  if (!ctx) throw new AppError("canvasBrowser");
  ctx.fillStyle = p.background;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  canvas.width = 0;
  canvas.height = 0;
  return { width, height, rgba };
}
export function paint(canvas: HTMLCanvasElement, frame: Frame): void {
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d", { colorSpace: "srgb" });
  if (!context) throw new AppError("canvas");
  context.putImageData(
    new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height),
    0,
    0,
  );
}
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export async function exportPng(
  canvas: HTMLCanvasElement,
  name: string,
): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new AppError("png"))),
      "image/png",
    ),
  );
  download(blob, name);
}
