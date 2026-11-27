import { AppError, type ErrorCode } from "../core/errors.ts";
import { MAX_OUTPUT_PIXELS } from "../core/image-limits.ts";
import { animationPlan, illuminate, createLightField, validatePulse, type PulseSettings } from "../core/pulse.ts";
import { tonalBase, screenGray, duotone } from "../core/pipeline.ts";
import type { Frame, Parameters } from "../core/types.ts";
import { validateParameters } from "../profiles/schema.ts";
import { GifEncoder } from "./gif.ts";
import { mp4RateControl } from "./mp4.ts";

export interface AnimationRequest {
  frame: Frame;
  parameters: Parameters;
  pulse: PulseSettings;
  cycles: number;
  fps: number;
  format: "gif" | "mp4";
}
export type AnimationResponse =
  | { type: "progress"; progress: number }
  | { type: "result"; buffer: ArrayBuffer; mime: string }
  | { type: "error"; code: ErrorCode };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<AnimationRequest>) => void) | null;
  postMessage: (message: AnimationResponse, transfer?: Transferable[]) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    const result = await encodeAnimation(data, (progress) => scope.postMessage({ type: "progress", progress }));
    scope.postMessage({ type: "result", ...result }, [result.buffer]);
  } catch (error) {
    scope.postMessage({ type: "error", code: error instanceof AppError ? error.code : "videoExport" });
  }
};

async function encodeAnimation(data: AnimationRequest, progress: (value: number) => void) {
  const p = validateParameters(data.parameters), pulse = validatePulse(data.pulse);
  const { frame, format } = data;
  const { width, height } = frame;
  const plan = animationPlan(pulse, data.cycles, data.fps, format);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_OUTPUT_PIXELS || frame.rgba.length !== width * height * 4)
    throw new AppError("dimensions");
  if (width * height * plan.frames > 500_000_000) throw new AppError("videoSize");
  const base = tonalBase(frame, p), field = createLightField(width, height, pulse);
  const loopDuration = data.cycles / pulse.frequency;
  const render = (i: number) => {
    const seconds = i / plan.frames * loopDuration;
    return screenGray(illuminate(base, field(seconds, loopDuration), pulse, seconds), width, height, p);
  };
  if (format === "gif") {
    const encoder = new GifEncoder(width, height, p.shadow, p.highlight);
    for (let i = 0; i < plan.frames; i++) {
      const delay = Math.round((i + 1) * plan.frameDuration * 100) - Math.round(i * plan.frameDuration * 100);
      encoder.writeFrame(render(i).gray, delay);
      progress(Math.round((i + 1) / plan.frames * 100));
    }
    return { buffer: encoder.finish(), mime: "image/gif" };
  }
  // The MP4 encoder is loaded only on export. GIF has no third-party dependency.
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, canEncodeVideo } = await import("mediabunny");
  // H.264 expects even dimensions. Pad the right/bottom edge without resampling the retícula.
  const videoWidth = width + width % 2, videoHeight = height + height % 2;
  const frameRate = 1 / plan.frameDuration;
  const encoding = {
    quality: new Quality(mp4RateControl(videoWidth, videoHeight, frameRate)),
    latencyMode: "quality" as const,
    contentHint: "detail",
  };
  // Probe the same quality settings that will be used by the actual encoder.
  if (!await canEncodeVideo("avc", { width: videoWidth, height: videoHeight, frameRate, ...encoding }))
    throw new AppError("mp4Unsupported");
  const canvas = new OffscreenCanvas(videoWidth, videoHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AppError("canvas");
  const target = new BufferTarget();
  const output = new Output({ target, format: new Mp4OutputFormat({ fastStart: "in-memory" }) });
  const source = new CanvasSource(canvas, { codec: "avc", ...encoding });
  // This is the effective rate (frames / exact loop duration), not the rounded
  // FPS selector value. Negotiation and encoding therefore use the same cadence.
  output.addVideoTrack(source, { frameRate });
  try {
    await output.start();
    ctx.fillStyle = p.background;
    ctx.fillRect(0, 0, videoWidth, videoHeight);
    for (let i = 0; i < plan.frames; i++) {
      const rendered = duotone(render(i), p.shadow, p.highlight);
      ctx.putImageData(new ImageData(new Uint8ClampedArray(rendered.rgba), width, height), 0, 0);
      await source.add(i * plan.frameDuration, plan.frameDuration);
      progress(Math.round((i + 1) / plan.frames * 100));
    }
    source.close();
    await output.finalize();
    if (!target.buffer) throw new AppError("videoExport");
    return { buffer: target.buffer, mime: "video/mp4" };
  } catch (error) {
    await output.cancel();
    throw error;
  }
}
