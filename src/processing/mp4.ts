import { AppError } from "../core/errors.ts";

/** Prioritize the one-pixel edges in dithered artwork. Quantizer control is
 * preferred; Mediabunny negotiates the explicit bitrate fallback when the
 * browser cannot encode with a quantizer. Neither path promises lossless RGB. */
export function mp4RateControl(width: number, height: number, frameRate: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      !Number.isFinite(frameRate) || frameRate <= 0)
    throw new AppError("dimensions");
  return {
    quantizer: 10,
    // 0.75 bits per pixel per frame, rather than a generic photographic preset.
    // Scale with both resolution and cadence; keep browser encoder requests bounded.
    bitrate: Math.round(Math.max(4_000_000, Math.min(160_000_000, width * height * frameRate * 0.75))),
    bitrateMode: "variable" as const,
  };
}
