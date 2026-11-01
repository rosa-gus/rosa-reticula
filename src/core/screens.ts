import { roundEven } from "./math.ts";

export const bayer = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
export function pairScreen(): Uint8Array {
  const ranks = new Uint8Array(256);
  for (let cy = 0; cy < 4; cy++)
    for (let cx = 0; cx < 4; cx++) {
      const cell = bayer.map((row) => [...row]),
        rank = bayer[cy][cx];
      if (rank < 4) {
        const [dx, dy] = [
          [1, 0],
          [0, 1],
          [3, 0],
          [0, 3],
        ][rank];
        [cell[2][2], cell[dy][dx]] = [cell[dy][dx], cell[2][2]];
      }
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++)
          ranks[(cy * 4 + y) * 16 + cx * 4 + x] = cell[y][x] * 16 + rank;
    }
  return ranks;
}
export const pairedRanks = pairScreen();
export function quantizationTables(
  palette: readonly number[],
  count: number,
): Uint8Array {
  const table = new Uint8Array(count * 256);
  for (let v = 0; v < 256; v++) {
    const value = v / 255;
    let lower = 0;
    while (lower < palette.length - 2 && palette[lower + 1] <= value) lower++;
    const low = palette[lower],
      high = palette[lower + 1],
      fraction = (value - low) / (high - low);
    for (let rank = 0; rank < count; rank++)
      table[rank * 256 + v] = roundEven(
        255 * (fraction > (rank + 0.5) / count ? high : low),
      );
  }
  return table;
}
