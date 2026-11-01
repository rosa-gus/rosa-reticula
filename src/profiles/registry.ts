import type { Parameters, Recipe } from "../core/types.ts";

export const original: Parameters = {
  width: 1200,
  contrast: 1.1,
  curve: [
    [0, 0],
    [0.015, 0.008],
    [0.04, 0.028],
    [0.1, 0.095],
    [0.22, 0.235],
    [0.4, 0.445],
    [0.6, 0.665],
    [0.8, 0.855],
    [1, 1],
  ],
  palette: [0, 0.02, 0.065, 0.16, 0.31, 0.49, 0.68, 0.82, 1],
  screen: 1,
  pairs: 0.85,
  protection: 0.15,
  blur: 1,
  shadows: [0.025, 0.1, 0.32, 0.58],
  signature: [0.035, 0.08, 0.14, 0.24],
  shadow: "#000000",
  highlight: "#f29191",
  background: "#000000",
};
export const profiles: Recipe[] = [
  makeProfile("rosa-original", "Rosa Original", original),
  makeProfile("rosa-dense", "Sombra densa", {
    ...original,
    contrast: 1.3,
    palette: [0, 0.035, 0.12, 0.3, 0.55, 0.78, 1],
    shadows: [0.015, 0.07, 0.42, 0.68],
    pairs: 1,
  }),
  makeProfile("rosa-soft", "Luz suave", {
    ...original,
    contrast: 0.95,
    screen: 0.65,
    pairs: 0.4,
    highlight: "#e9e9e5",
  }),
  makeProfile("bayer-study", "Estudo Bayer", {
    ...original,
    pairs: 0,
    protection: 0,
    shadows: [0, 0.001, 0.999, 1],
    palette: [0, 0.25, 0.5, 0.75, 1],
    curve: [
      [0, 0],
      [1, 1],
    ],
    contrast: 1,
  }),
];
function makeProfile(id: string, name: string, parameters: Parameters): Recipe {
  return {
    schemaVersion: 1,
    algorithm: "rosa-reticula-web/0.1.0",
    profile: { id, name, version: 1 },
    parameters: structuredClone(parameters),
  };
}
// Callers always receive their own copy; built-ins are never edited by controls.
export function copyRecipe(recipe: Recipe): Recipe {
  return structuredClone(recipe);
}
