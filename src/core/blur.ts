// Three extended-box passes per axis, matching Pillow's GaussianBlur strategy.
// Fixed-point weights and intermediate byte rounding are part of the treatment.
export function gaussianBlur(
  input: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  if (radius === 0) return input.slice();
  const f = Math.fround;
  const sigma2 = f(f(f(radius) * f(radius)) / 3);
  const length = f(Math.sqrt(12 * sigma2 + 1)),
    integer = Math.floor((length - 1) / 2);
  const numerator = f(
    (2 * integer + 1) * f(integer * (integer + 1) - f(3 * sigma2)),
  );
  const fraction = f(numerator / f(6 * f(sigma2 - (integer + 1) ** 2)));
  const boxRadius = f(integer + fraction),
    whole = Math.floor(boxRadius);
  const weight = Math.floor(f(16777216 / f(f(boxRadius * 2) + 1)));
  const farWeight = Math.floor((16777216 - (whole * 2 + 1) * weight) / 2);
  let source = input.slice(),
    target = new Uint8Array(input.length);
  for (const vertical of [false, true]) {
    const lineLength = vertical ? height : width,
      lines = vertical ? width : height;
    const stride = vertical ? width : 1,
      lineStride = vertical ? 1 : width;
    for (let pass = 0; pass < 3; pass++) {
      for (let line = 0; line < lines; line++) {
        const offset = line * lineStride;
        const at = (x: number) =>
          source[offset + Math.max(0, Math.min(lineLength - 1, x)) * stride];
        let sum = 0;
        for (let x = -whole; x <= whole; x++) sum += at(x);
        for (let x = 0; x < lineLength; x++) {
          target[offset + x * stride] = Math.floor(
            (sum * weight +
              (at(x - whole - 1) + at(x + whole + 1)) * farWeight +
              8388608) /
              16777216,
          );
          sum += at(x + whole + 1) - at(x - whole);
        }
      }
      [source, target] = [target, source];
    }
  }
  return source;
}
