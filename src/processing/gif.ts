import { AppError } from "../core/errors.ts";
import { duotone } from "../core/pipeline.ts";

const MAX_BYTES = 128 * 1024 * 1024;

/** GIF89a encoder for opaque, indexed, full-size frames. No quantization is needed:
 * the workbench's 256 duotone levels are the global color table. */
export class GifEncoder {
  private chunks: Uint8Array[] = [];
  private size = 0;
  private finished = false;
  private width: number;
  private height: number;
  constructor(width: number, height: number, shadow: string, highlight: string) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535)
      throw new AppError("dimensions");
    this.width = width;
    this.height = height;
    this.add(new TextEncoder().encode("GIF89a"));
    this.add(Uint8Array.of(width & 255, width >> 8, height & 255, height >> 8, 0xf7, 0, 0));
    const colors = duotone({ width: 256, height: 1, gray: Uint8Array.from({ length: 256 }, (_, i) => i) }, shadow, highlight);
    this.add(Uint8Array.from({ length: 768 }, (_, i) => colors.rgba[Math.floor(i / 3) * 4 + i % 3]));
    // NETSCAPE2.0: repeat indefinitely.
    this.add(Uint8Array.of(0x21, 0xff, 11, ...new TextEncoder().encode("NETSCAPE2.0"), 3, 1, 0, 0, 0));
  }
  private add(bytes: Uint8Array): void {
    this.size += bytes.length;
    if (this.size > MAX_BYTES) throw new AppError("videoSize");
    this.chunks.push(bytes);
  }
  writeFrame(index: Uint8Array, delay: number): void {
    if (this.finished || index.length !== this.width * this.height || !Number.isInteger(delay) || delay < 2 || delay > 65535)
      throw new AppError("videoExport");
    this.add(Uint8Array.of(0x21, 0xf9, 4, 4, delay & 255, delay >> 8, 0, 0));
    this.add(Uint8Array.of(0x2c, 0, 0, 0, 0, this.width & 255, this.width >> 8, this.height & 255, this.height >> 8, 0, 8));
    const bytes = lzw(index);
    const blocks = new Uint8Array(bytes.length + Math.ceil(bytes.length / 255) + 1);
    let offset = 0;
    for (let i = 0; i < bytes.length; i += 255) {
      const block = bytes.subarray(i, i + 255);
      blocks[offset++] = block.length;
      blocks.set(block, offset);
      offset += block.length;
    }
    this.add(blocks);
  }
  finish(): ArrayBuffer {
    if (this.finished) throw new AppError("videoExport");
    this.finished = true;
    this.add(Uint8Array.of(0x3b));
    const result = new Uint8Array(this.size);
    let offset = 0;
    for (const chunk of this.chunks) { result.set(chunk, offset); offset += chunk.length; }
    this.chunks = [];
    return result.buffer;
  }
}

/** GIF LZW, least significant bit first; reset the dictionary at 4096 codes. */
function lzw(index: Uint8Array): Uint8Array {
  const output = new Uint8Array(Math.ceil(index.length * 1.6) + 1024);
  let length = 0;
  let bits = 9, next = 258, packed = 0, pending = 0;
  const dictionary = new Map<number, number>();
  const emit = (code: number) => {
    packed |= code << pending;
    pending += bits;
    while (pending >= 8) { output[length++] = packed & 255; packed >>>= 8; pending -= 8; }
  };
  emit(256);
  let prefix = index[0];
  for (let i = 1; i < index.length; i++) {
    const suffix = index[i], key = prefix * 256 + suffix;
    const found = dictionary.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    // Decoder builds its dictionary one code later than the encoder.
    if (next >= (1 << bits) && bits < 12) bits++;
    if (next < 4096) dictionary.set(key, next++);
    else { emit(256); dictionary.clear(); next = 258; bits = 9; }
    prefix = suffix;
  }
  emit(prefix);
  if (next >= (1 << bits) && bits < 12) bits++;
  emit(257);
  if (pending) output[length++] = packed & 255;
  return output.slice(0, length);
}
