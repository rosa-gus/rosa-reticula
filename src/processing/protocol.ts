import type { PulseSettings } from "../core/pulse.ts";
import type { ErrorCode } from "../core/errors.ts";
import type { Frame, Parameters } from "../core/types.ts";
export interface ProcessRequest {
  type: "process";
  revision: number;
  sourceId: number;
  parameters: Parameters;
  pulse?: { settings: PulseSettings; seconds: number; loopDuration: number };
  frame?: Frame;
}
export type ProcessResponse =
  | { type: "result"; revision: number; frame: Frame; elapsed: number }
  | { type: "error"; revision: number; code: ErrorCode };
