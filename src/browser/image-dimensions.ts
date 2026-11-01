import { AppError, InputImageSizeError } from "../core/errors.ts";
import { MAX_INPUT_PIXELS } from "../core/image-limits.ts";

export interface ImageDimensions {
  width: number;
  height: number;
}

/** Read container headers without allocating a decoded pixel buffer. */
export function imageDimensions(buffer: ArrayBuffer): ImageDimensions {
  const bytes = new Uint8Array(buffer),
    view = new DataView(buffer);
  const tag = (offset: number, value: string) =>
    [...value].every(
      (char, index) => bytes[offset + index] === char.charCodeAt(0),
    );
  const dimensions = (width: number, height: number): ImageDimensions => {
    if (!width || !height) throw new AppError("decode");
    return { width, height };
  };
  if (
    bytes.length >= 24 &&
    tag(0, "\x89PNG\r\n\x1a\n") &&
    view.getUint32(8) === 13 &&
    tag(12, "IHDR")
  )
    return dimensions(view.getUint32(16), view.getUint32(20));

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) break;
      // SOF markers specify encoded dimensions; DHT, JPG, and DAC do not.
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        if (size < 8) break;
        return dimensions(
          view.getUint16(offset + 5),
          view.getUint16(offset + 3),
        );
      }
      offset += size;
    }
  }

  if (bytes.length >= 20 && tag(0, "RIFF") && tag(8, "WEBP")) {
    const end = view.getUint32(4, true) + 8;
    if (end > bytes.length) throw new AppError("decode");
    for (let offset = 12; offset + 8 <= end; ) {
      const size = view.getUint32(offset + 4, true),
        data = offset + 8;
      if (data + size > end) break;
      if (tag(offset, "VP8X") && size >= 10) {
        const u24 = (at: number) =>
          bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
        return dimensions(u24(data + 4) + 1, u24(data + 7) + 1);
      }
      if (tag(offset, "VP8 ") && size >= 10 && tag(data + 3, "\x9d\x01\x2a"))
        return dimensions(
          view.getUint16(data + 6, true) & 0x3fff,
          view.getUint16(data + 8, true) & 0x3fff,
        );
      if (tag(offset, "VP8L") && size >= 5 && bytes[data] === 0x2f) {
        const packed = view.getUint32(data + 1, true);
        return dimensions(
          (packed & 0x3fff) + 1,
          ((packed >>> 14) & 0x3fff) + 1,
        );
      }
      offset = data + size + (size % 2);
    }
  }
  throw new AppError("decode");
}

export function validateInputDimensions({
  width,
  height,
}: ImageDimensions): void {
  if (width * height > MAX_INPUT_PIXELS)
    throw new InputImageSizeError(width, height);
}
