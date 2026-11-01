import type { Frame, GrayFrame, Parameters } from "./types.ts";
import { composite, rgb, roundEven, smoothstep } from "./math.ts";
import { bayer, pairedRanks, quantizationTables } from "./screens.ts";
import { gaussianBlur } from "./blur.ts";

export function tonalBase(frame: Frame, p: Parameters): Uint8Array {
  const gray = new Uint8Array(frame.width * frame.height),
    background = rgb(p.background);
  let total = 0;
  for (let i = 0; i < gray.length; i++) {
    const offset = i * 4,
      alpha = frame.rgba[offset + 3];
    const r = composite(frame.rgba[offset], background[0], alpha);
    const g = composite(frame.rgba[offset + 1], background[1], alpha);
    const b = composite(frame.rgba[offset + 2], background[2], alpha);
    gray[i] = Math.floor((r * 19595 + g * 38470 + b * 7471 + 32768) / 65536);
    total += gray[i];
  }
  const mean = Math.floor(total / gray.length + 0.5),
    contrast = Math.fround(p.contrast);
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    let index = 0;
    while (index < p.curve.length - 2 && p.curve[index + 1][0] <= v / 255)
      index++;
    const [x0, y0] = p.curve[index],
      [x1, y1] = p.curve[index + 1];
    lut[v] = roundEven(255 * (y0 + ((y1 - y0) * (v / 255 - x0)) / (x1 - x0)));
  }
  for (let i = 0; i < gray.length; i++) {
    const adjusted = Math.max(
      0,
      Math.min(
        255,
        Math.trunc(
          Math.fround(mean + Math.fround(contrast * (gray[i] - mean))),
        ),
      ),
    );
    gray[i] = lut[adjusted];
  }
  return gray;
}

export function screenGray(
  base: Uint8Array,
  width: number,
  height: number,
  p: Parameters,
): GrayFrame {
  const blur = gaussianBlur(base, width, height, p.blur);
  const regular = quantizationTables(p.palette, 16),
    paired = quantizationTables(p.palette, 256);
  const tone = new Uint8Array(256),
    protection = new Uint8Array(256),
    signature = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    tone[v] = roundEven(
      255 *
        smoothstep(p.shadows[0], p.shadows[1], v / 255) *
        (1 - smoothstep(p.shadows[2], p.shadows[3], v / 255)),
    );
    protection[v] = roundEven(255 * (1 - p.protection * smoothstep(4, 18, v)));
    signature[v] = roundEven(
      255 *
        p.pairs *
        smoothstep(p.signature[0], p.signature[1], v / 255) *
        (1 - smoothstep(p.signature[2], p.signature[3], v / 255)),
    );
  }
  const gray = new Uint8Array(base.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x,
        v = base[i];
      const weight = Math.floor(
        (tone[v] * protection[Math.abs(v - blur[i])]) / 255,
      );
      const reference = composite(
        regular[bayer[y % 4][x % 4] * 256 + v],
        v,
        weight,
      );
      const pairs = composite(
        paired[pairedRanks[(y % 16) * 16 + (x % 16)] * 256 + v],
        v,
        weight,
      );
      const treated = composite(pairs, reference, signature[v]);
      gray[i] =
        p.screen === 1
          ? treated
          : composite(treated, v, roundEven(p.screen * 255));
    }
  return { width, height, gray };
}
export function duotone(
  frame: GrayFrame,
  shadow: string,
  highlight: string,
): Frame {
  const dark = rgb(shadow),
    light = rgb(highlight),
    rgba = new Uint8ClampedArray(frame.gray.length * 4);
  const tables = dark.map((a, c) =>
    Uint8Array.from({ length: 256 }, (_, v) =>
      roundEven(a + ((light[c] - a) * v) / 255),
    ),
  );
  for (let i = 0; i < frame.gray.length; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = tables[c][frame.gray[i]];
    rgba[i * 4 + 3] = 255;
  }
  return { width: frame.width, height: frame.height, rgba };
}
export function treat(frame: Frame, p: Parameters): GrayFrame {
  return screenGray(tonalBase(frame, p), frame.width, frame.height, p);
}
