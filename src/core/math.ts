// Python round uses ties-to-even; Math.round does not.
export function roundEven(value: number): number {
  const floor = Math.floor(value),
    fraction = value - floor;
  return fraction === 0.5 ? floor + (floor % 2) : Math.round(value);
}
export function smoothstep(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}
export function composite(a: number, b: number, mask: number): number {
  return Math.floor((a * mask + b * (255 - mask) + 127) / 255);
}
export function rgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
