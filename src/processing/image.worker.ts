import { MAX_OUTPUT_PIXELS } from "../core/image-limits.ts";
import { AppError } from "../core/errors.ts";
import type { Frame, GrayFrame } from "../core/types.ts";
import type { ProcessRequest, ProcessResponse } from "./protocol.ts";
import { duotone, screenGray, tonalBase } from "../core/pipeline.ts";
import { validateParameters } from "../profiles/schema.ts";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ProcessRequest>) => void) | null;
  postMessage: (message: ProcessResponse, transfer?: Transferable[]) => void;
};
let source: Frame | undefined,
  sourceId = -1;
let base: Uint8Array | undefined, treated: GrayFrame | undefined;
let toneKey = "",
  screenKey = "";
scope.onmessage = ({ data }) => {
  if (data.type !== "process") return;
  try {
    const started = performance.now(),
      p = validateParameters(data.parameters);
    if (data.frame) {
      const frame = data.frame;
      if (
        frame.width < 1 ||
        frame.height < 1 ||
        frame.width * frame.height > MAX_OUTPUT_PIXELS ||
        frame.rgba.length !== frame.width * frame.height * 4
      )
        throw new AppError("dimensions");
      source = frame;
      sourceId = data.sourceId;
      toneKey = "";
      screenKey = "";
    }
    if (!source || sourceId !== data.sourceId)
      throw new AppError("reloadImage");
    const nextToneKey = JSON.stringify([
      sourceId,
      p.contrast,
      p.curve,
      p.background,
    ]);
    if (nextToneKey !== toneKey || !base) {
      base = tonalBase(source, p);
      toneKey = nextToneKey;
      screenKey = "";
    }
    const nextScreenKey = JSON.stringify([
      toneKey,
      p.palette,
      p.screen,
      p.pairs,
      p.protection,
      p.blur,
      p.shadows,
      p.signature,
    ]);
    if (nextScreenKey !== screenKey || !treated) {
      treated = screenGray(base, source.width, source.height, p);
      screenKey = nextScreenKey;
    }
    const frame = duotone(treated, p.shadow, p.highlight);
    scope.postMessage(
      {
        type: "result",
        revision: data.revision,
        frame,
        elapsed: performance.now() - started,
      },
      [frame.rgba.buffer as ArrayBuffer],
    );
  } catch (error) {
    scope.postMessage({
      type: "error",
      revision: data.revision,
      code: error instanceof AppError ? error.code : "processing",
    });
  }
};
