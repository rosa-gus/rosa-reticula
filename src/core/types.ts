export type Point = readonly [number, number];
export interface Parameters {
  width: number;
  contrast: number;
  curve: readonly Point[];
  palette: readonly number[];
  screen: number;
  pairs: number;
  protection: number;
  blur: number;
  shadows: readonly [number, number, number, number];
  signature: readonly [number, number, number, number];
  shadow: string;
  highlight: string;
  background: string;
}
export interface Frame {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}
export interface GrayFrame {
  width: number;
  height: number;
  gray: Uint8Array;
}
export interface Recipe {
  schemaVersion: 1;
  algorithm: "rosa-reticula-web/0.1.0";
  profile: { id: string; version: number; name: string };
  parameters: Parameters;
}
