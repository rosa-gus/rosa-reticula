import encode from "@jsquash/webp/encode.js";

export function encodeLosslessWebp(image: ImageData): Promise<ArrayBuffer> {
  return encode(image, {
    lossless: 1,
    near_lossless: 100,
    exact: 1,
    method: 4,
  });
}
