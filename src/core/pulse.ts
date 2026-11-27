import { AppError } from "./errors.ts";

export interface PulseSettings {
  model: "organic" | "point";
  speed: number;
  scale: number;
  complexity: number;
  pulsation: number;
  seed: number;
  frequency: number;
  intensity: number;
  radius: number;
  softness: number;
  minimum: number;
  x: number;
  y: number;
  curve: "breath" | "beat" | "triangle";
  polarity: "light" | "dark";
}

export const defaultPulse: PulseSettings = {
  model: "organic", speed: 0.5, scale: 0.45, complexity: 0.6,
  pulsation: 0.5, seed: 1,
  frequency: 0.5, intensity: 0.7, radius: 0.4, softness: 0.8,
  minimum: 0.1, x: 0.5, y: 0.5, curve: "breath", polarity: "light",
};

export function validatePulse(p: PulseSettings): PulseSettings {
  const ranges = {
    speed: [0, 2], scale: [0.08, 1], complexity: [0, 1], pulsation: [0, 1],
    frequency: [0.2, 3], intensity: [0, 1], radius: [0.05, 1.5],
    softness: [0, 1], minimum: [0, 1], x: [0, 1], y: [0, 1],
  } as const;
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const [min, max] = ranges[key];
    if (!Number.isFinite(p[key]) || p[key] < min || p[key] > max)
      throw new AppError("pulseSettings");
  }
  if (!["organic", "point"].includes(p.model) ||
      !Number.isInteger(p.seed) || p.seed < 0 || p.seed > 0xffffffff ||
      !["breath", "beat", "triangle"].includes(p.curve) ||
      !["light", "dark"].includes(p.polarity)) throw new AppError("pulseSettings");
  return { ...p };
}

/** Radius is a fraction of the shortest side, keeping the light circular. */
export function lightMask(width: number, height: number, p: PulseSettings): Float32Array {
  const mask = new Float32Array(width * height);
  const radius = p.radius * Math.min(width, height);
  const inner = 1 - p.softness;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const distance = Math.hypot(x + 0.5 - p.x * width, y + 0.5 - p.y * height) / radius;
      const u = p.softness === 0 ? (distance < 1 ? 0 : 1) : Math.max(0, Math.min(1, (distance - inner) / p.softness));
      mask[y * width + x] = 1 - u * u * (3 - 2 * u);
    }
  }
  return mask;
}

export function pulseLevel(p: PulseSettings, seconds: number): number {
  const phase = ((seconds * p.frequency) % 1 + 1) % 1;
  return p.intensity * (p.minimum + (1 - p.minimum) * pulseWave(phase, p.curve));
}

function pulseWave(phase: number, curve: PulseSettings["curve"]): number {
  phase = ((phase % 1) + 1) % 1;
  return curve === "triangle" ? 1 - Math.abs(2 * phase - 1)
    : curve === "beat" ? Math.sin(Math.PI * phase) ** 8
    : (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

/** Illuminate the tonal base before screening; never brighten the finished raster. */
export function illuminate(base: Uint8Array, mask: Float32Array, p: PulseSettings, seconds: number): Uint8Array {
  const gray = new Uint8Array(base.length);
  // The organic field already contains local pulse phases. A global envelope
  // would make every region fade together and lose the ambient idle effect.
  const level = p.model === "organic" ? p.intensity : pulseLevel(p, seconds);
  const target = p.polarity === "dark" ? 0 : 255;
  for (let i = 0; i < base.length; i++)
    gray[i] = Math.round(base[i] + (target - base[i]) * mask[i] * level);
  return gray;
}

export type LightField = (seconds: number, loopDuration: number) => Float32Array;

/** One sampler shared by preview and export. Point light is static; the organic
 * field combines warped noise layers with independent, periodic trajectories. */
export function createLightField(width: number, height: number, settings: PulseSettings): LightField {
  const p = validatePulse(settings);
  if (p.model === "point") {
    const mask = lightMask(width, height, p);
    return () => mask;
  }
  return organicField(width, height, p);
}

function hash(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495) ^ seed;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const u = fade(x - ix), v = fade(y - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

function organicField(width: number, height: number, p: PulseSettings): LightField {
  const shortest = Math.min(width, height);
  // Sample the smooth light field on a bounded grid, then interpolate it to the
  // raster. The dither itself is still calculated at the full output resolution.
  const step = Math.max(1, shortest * p.scale / (8 + 24 * p.complexity), width / 256, height / 256);
  const cols = Math.max(2, Math.ceil(width / step) + 1);
  const rows = Math.max(2, Math.ceil(height / step) + 1);
  const grid = new Float32Array(cols * rows);
  const mask = new Float32Array(width * height);
  const layers = Array.from({ length: 5 }, (_, i) => ({
    seed: (p.seed + Math.imul(i + 1, 0x9e3779b9)) >>> 0,
    phase: hash(i, 17, p.seed) * Math.PI * 2,
    frequency: 2 ** i,
    weight: i === 0 ? 1 : Math.max(0, Math.min(1, p.complexity * 4 - (i - 1))) * 0.5 ** i,
  })).filter((layer) => layer.weight > 0);
  const totalWeight = layers.reduce((total, layer) => total + layer.weight, 0);
  return (seconds, loopDuration) => {
    const phase = ((seconds / loopDuration) % 1 + 1) % 1;
    const angle = phase * Math.PI * 2;
    // More travel per loop gives a higher speed without a discontinuity at the
    // seam. Different harmonics and phases keep the layers from moving in unison.
    const travel = p.speed * loopDuration * 0.22;
    const paths = layers.map((layer, i) => ({
      ...layer,
      dx: travel * (Math.cos(angle + layer.phase) + 0.3 * Math.sin(2 * angle - layer.phase)),
      dy: travel * (Math.sin(angle - layer.phase) + 0.3 * Math.cos(3 * angle + layer.phase)) * (i % 2 ? -1 : 1),
    }));
    const warpX = travel * Math.cos(angle + 0.7), warpY = travel * Math.sin(angle - 1.3);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const nx = x / (cols - 1) * width / shortest / p.scale;
        const ny = y / (rows - 1) * height / shortest / p.scale;
        const wx = (noise(nx * 0.65 + warpX, ny * 0.65 + warpY, p.seed ^ 0xa53a9d31) - 0.5) * (0.4 + p.complexity * 1.6);
        const wy = (noise(nx * 0.65 - warpY, ny * 0.65 + warpX, p.seed ^ 0x6c8e9cf5) - 0.5) * (0.4 + p.complexity * 1.6);
        let value = 0;
        for (const layer of paths)
          value += noise((nx + wx) * layer.frequency + layer.dx, (ny + wy) * layer.frequency + layer.dy, layer.seed) * layer.weight;
        const u = Math.max(0, Math.min(1, (value / totalWeight - 0.25) * 2));
        const shape = u * u * (3 - 2 * u);
        const localPhase = noise(nx * 0.7 + 31, ny * 0.7 - 23, p.seed ^ 0x27d4eb2d) * 3;
        const wave = pulseWave(seconds * p.frequency + localPhase, p.curve);
        const envelope = 1 - p.pulsation + p.pulsation * wave;
        grid[y * cols + x] = p.minimum + (1 - p.minimum) * shape * envelope;
      }
    }
    for (let y = 0; y < height; y++) {
      const gy = y / Math.max(1, height - 1) * (rows - 1);
      const iy = Math.min(rows - 2, Math.floor(gy)), fy = gy - iy;
      for (let x = 0; x < width; x++) {
        const gx = x / Math.max(1, width - 1) * (cols - 1);
        const ix = Math.min(cols - 2, Math.floor(gx)), fx = gx - ix;
        const top = grid[iy * cols + ix] * (1 - fx) + grid[iy * cols + ix + 1] * fx;
        const bottom = grid[(iy + 1) * cols + ix] * (1 - fx) + grid[(iy + 1) * cols + ix + 1] * fx;
        mask[y * width + x] = top * (1 - fy) + bottom * fy;
      }
    }
    return mask;
  };
}

export interface AnimationPlan {
  frames: number;
  duration: number;
  frameDuration: number;
}

export function animationPlan(p: PulseSettings, cycles: number, fps: number, format: "gif" | "mp4"): AnimationPlan {
  validatePulse(p);
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 6 || ![12, 24, 30].includes(fps))
    throw new AppError("pulseSettings");
  const duration = cycles / p.frequency;
  const frames = Math.max(2, Math.round(duration * fps));
  // GIF timestamps have a 10 ms resolution. Distribute rounding over the frames.
  const actualDuration = format === "gif" ? Math.round(duration * 100) / 100 : duration;
  return { frames, duration: actualDuration, frameDuration: actualDuration / frames };
}
