import type { RecipeErrorCode } from "../core/errors.ts";
import { AppError } from "../core/errors.ts";
import type { Parameters, Recipe } from "../core/types.ts";

const hex = /^#[0-9a-f]{6}$/i;
function fail(code: RecipeErrorCode): never {
  throw new AppError(code);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("recipeObject");
  return value as Record<string, unknown>;
}
function number(
  value: unknown,
  min: number,
  max: number,
  name: RecipeErrorCode,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(name);
  return value;
}
function ordered(
  value: unknown,
  size: number | null,
  name: RecipeErrorCode,
): number[] {
  if (
    !Array.isArray(value) ||
    (size !== null && value.length !== size) ||
    value.length < 2 ||
    value.length > 32
  )
    fail(name);
  const points = value.map((v) => number(v, 0, 1, name));
  if (points.some((v, i) => i > 0 && v <= points[i - 1])) fail("recipeOrder");
  return points;
}
export function validateParameters(value: unknown): Parameters {
  const p = object(value);
  const width = number(p.width, 1, 4096, "recipeWidth");
  if (!Number.isInteger(width)) fail("recipeWidthInteger");
  const palette = ordered(p.palette, null, "recipePalette");
  if (palette[0] !== 0 || palette.at(-1) !== 1) fail("recipePaletteEnds");
  if (!Array.isArray(p.curve) || p.curve.length < 2 || p.curve.length > 32)
    fail("recipeCurve");
  const curve = p.curve.map((point: unknown) => {
    if (!Array.isArray(point) || point.length !== 2) fail("recipeCurvePoint");
    return [
      number(point[0], 0, 1, "recipeCurve"),
      number(point[1], 0, 1, "recipeCurve"),
    ] as const;
  });
  ordered(
    curve.map((p) => p[0]),
    null,
    "recipeCurveAxis",
  );
  if (curve[0][0] !== 0 || curve.at(-1)![0] !== 1) fail("recipeCurveEnds");
  const color = (key: string) => {
    if (typeof p[key] !== "string" || !hex.test(p[key])) fail("recipeColor");
    return p[key] as string;
  };
  return {
    width,
    contrast: number(p.contrast, 0, 3, "recipeContrast"),
    curve,
    palette,
    screen: number(p.screen, 0, 1, "recipeScreen"),
    pairs: number(p.pairs, 0, 1, "recipePairs"),
    protection: number(p.protection, 0, 1, "recipeProtection"),
    blur: number(p.blur, 0, 5, "recipeBlur"),
    shadows: ordered(p.shadows, 4, "recipeShadows") as [
      number,
      number,
      number,
      number,
    ],
    signature: ordered(p.signature, 4, "recipeSignature") as [
      number,
      number,
      number,
      number,
    ],
    shadow: color("shadow"),
    highlight: color("highlight"),
    background: color("background"),
  };
}
export function parseRecipe(value: unknown): Recipe {
  const r = object(value),
    profile = object(r.profile);
  if (r.schemaVersion !== 1 || r.algorithm !== "rosa-reticula-web/0.1.0")
    fail("recipeVersion");
  if (
    typeof profile.id !== "string" ||
    !profile.id.length ||
    profile.id.length > 100 ||
    typeof profile.name !== "string" ||
    !profile.name.trim() ||
    profile.name.length > 80
  )
    fail("recipeProfile");
  const version = number(profile.version, 1, 100000, "recipeProfileVersion");
  if (!Number.isInteger(version)) fail("recipeVersionInteger");
  return {
    schemaVersion: 1,
    algorithm: r.algorithm,
    profile: { id: profile.id, name: profile.name, version },
    parameters: validateParameters(r.parameters),
  };
}
