import { AppError } from "../core/errors.ts";
import manifest from "../assets/examples/manifest.json";
import { decode } from "./image.ts";

export type Example = (typeof manifest)[number];
export const examples: readonly Example[] = manifest;
const assets = import.meta.glob<string>(
  "../assets/examples/*.{jpg,jpeg,png,webp}",
  {
    eager: true,
    query: "?url",
    import: "default",
  },
);

export async function sample(example: Example): Promise<ImageBitmap> {
  const url = assets[`../assets/examples/${example.file}`];
  if (!url) throw new AppError("sampleMissing");
  const response = await fetch(url);
  if (!response.ok) throw new AppError("sampleLoad");
  const blob = await response.blob();
  return decode(new File([blob], example.file, { type: blob.type }));
}
