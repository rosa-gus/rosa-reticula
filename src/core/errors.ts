// Stable codes cross the Worker boundary; only the UI translates them.
export const errorCodes = [
  "storedProfiles",
  "prepare",
  "fileType",
  "fileSize",
  "decode",
  "inputPixels",
  "outputPixels",
  "canvasBrowser",
  "canvas",
  "png",
  "sampleMissing",
  "sampleLoad",
  "workerStopped",
  "workerRestart",
  "dimensions",
  "reloadImage",
  "processing",
  "recipeSize",
  "recipeJson",
  "profileName",
  "profileLimit",
  "profileSave",
  "unknown",
  "language",
  "recipeObject",
  "recipeWidth",
  "recipeWidthInteger",
  "recipePalette",
  "recipePaletteEnds",
  "recipeCurve",
  "recipeCurvePoint",
  "recipeCurveAxis",
  "recipeCurveEnds",
  "recipeContrast",
  "recipeScreen",
  "recipePairs",
  "recipeProtection",
  "recipeBlur",
  "recipeShadows",
  "recipeSignature",
  "recipeVersion",
  "recipeProfile",
  "recipeProfileVersion",
  "recipeVersionInteger",
  "recipeOrder",
  "recipeColor",
] as const;
export type ErrorCode = (typeof errorCodes)[number];
export type RecipeErrorCode = Extract<ErrorCode, `recipe${string}`>;
export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.name = "AppError";
    this.code = code;
  }
}

export class InputImageSizeError extends AppError {
  readonly width: number;
  readonly height: number;
  constructor(width: number, height: number) {
    super("inputPixels");
    this.width = width;
    this.height = height;
  }
}
