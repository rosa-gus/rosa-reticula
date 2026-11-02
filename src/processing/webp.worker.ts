import { init } from "@jsquash/webp/encode.js";
import wasmUrl from "@jsquash/webp/codec/enc/webp_enc.wasm?url";
import simdWasmUrl from "@jsquash/webp/codec/enc/webp_enc_simd.wasm?url";
import { encodeLosslessWebp } from "./webp.ts";

export type WebpResponse =
  | { type: "result"; buffer: ArrayBuffer }
  | { type: "error" };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ImageData>) => void) | null;
  postMessage: (message: WebpResponse, transfer?: Transferable[]) => void;
};

scope.onmessage = async ({ data }) => {
  try {
    await init({
      locateFile: (path: string) =>
        path.endsWith("webp_enc_simd.wasm") ? simdWasmUrl : wasmUrl,
    });
    const buffer = await encodeLosslessWebp(data);
    scope.postMessage({ type: "result", buffer }, [buffer]);
  } catch {
    scope.postMessage({ type: "error" });
  }
};
