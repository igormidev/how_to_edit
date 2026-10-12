/**
 * Browser-side newspaper cutout renderer.
 *
 * The implementation deliberately has no runtime dependencies. It uses a
 * chamfer distance field to grow the source alpha silhouette into a paper
 * border, then composites texture, optional ink/halftone, and a transparent
 * drop shadow with the Canvas 2D API.
 */

import {
  removeBackgroundData,
  resolveBackgroundRemovalOptions,
  type BackgroundRemovalOptions,
  type ResolvedBackgroundRemovalOptions,
} from "./backgroundRemoval";
import crumpledPaperMaterialUrl from "../assets/crumpled-paper-material.webp";

export type { BackgroundRemovalOptions, ResolvedBackgroundRemovalOptions } from "./backgroundRemoval";

export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelSize {
  width: number;
  height: number;
}

export interface PaperTextureOptions {
  enabled?: boolean;
  /** 0–1. Controls all paper color variation. */
  strength?: number;
  /** Approximate size, in source pixels, of broad paper mottling. */
  scale?: number;
  /** 0–1. Controls sparse fibers and darker flecks. */
  fibers?: number;
}

export interface ResolvedPaperTextureOptions {
  enabled: boolean;
  strength: number;
  scale: number;
  fibers: number;
}

export type NewspaperFilterTreatment = "halftone" | "crumpled" | "combined";

export interface OldNewspaperFilterOptions {
  enabled?: boolean;
  /** Visual print process. Halftone is the classic dot screen; crumpled adds folded relief. */
  treatment?: NewspaperFilterTreatment;
  /** Halftone ink amount from 0–1. Legacy crumpled-only depth fallback. */
  strength?: number;
  /** Independent fold depth from 0–1, applied after the ink pass. */
  crumpleStrength?: number;
  /** 0 keeps source color; 1 fades crumpled artwork fully into newspaper ink. */
  colorAging?: number;
  contrast?: number;
  /** -0.5–0.5. Positive values make the print lighter. */
  brightness?: number;
  /** 0–1. At 0 the ink is continuous; at 1 it uses a dot screen. */
  halftone?: number;
  /** Halftone cell size in source pixels. */
  dotSize?: number;
  /** Approximate distance, in source pixels, between the broadest crumple folds. */
  crumpleScale?: number;
  inkColor?: string;
}

export interface ResolvedOldNewspaperFilterOptions {
  enabled: boolean;
  treatment: NewspaperFilterTreatment;
  strength: number;
  colorAging: number;
  crumpleStrength: number;
  contrast: number;
  brightness: number;
  halftone: number;
  dotSize: number;
  crumpleScale: number;
  inkColor: string;
}

export type ShadowPreset = "none" | "subtle" | "lifted" | "dramatic";

export interface ShadowOptions {
  enabled?: boolean;
  preset?: ShadowPreset;
  color?: string;
  opacity?: number;
  blur?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface ResolvedShadowOptions {
  enabled: boolean;
  preset: ShadowPreset;
  color: string;
  opacity: number;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface NewspaperRenderOptions {
  /** Paper border size in source-image pixels. */
  borderWidth?: number;
  /** 0–1. Controls variation along the scissor-cut edge. */
  roughness?: number;
  /** Any integer; the same seed and inputs always produce the same cut. */
  seed?: number;
  /** Legacy shared paper color. Used by both layers unless overridden below. */
  paperColor?: string;
  /** Paper color immediately behind the source-image silhouette. */
  imagePaperColor?: string;
  /** Paper color used by the cut border around the source-image silhouette. */
  borderPaperColor?: string;
  /** Removes fully transparent source padding before rendering. */
  tightTrim?: boolean;
  /** Alpha values below this number are ignored while calculating trim. */
  alphaThreshold?: number;
  texture?: boolean | PaperTextureOptions;
  /** Legacy image ink/filter and shared-filter fallback. */
  oldFilter?: boolean | OldNewspaperFilterOptions;
  /** Independent ink/aging applied only to the paper border. */
  borderFilter?: boolean | OldNewspaperFilterOptions;
  /** Optional local border-color background removal, performed before trimming. */
  backgroundRemoval?: boolean | BackgroundRemovalOptions;
  shadow?: boolean | ShadowPreset | ShadowOptions;
}

export interface ResolvedNewspaperRenderOptions {
  borderWidth: number;
  roughness: number;
  seed: number;
  /** Resolved legacy shared color, retained for API compatibility. */
  paperColor: string;
  imagePaperColor: string;
  borderPaperColor: string;
  tightTrim: boolean;
  alphaThreshold: number;
  texture: ResolvedPaperTextureOptions;
  oldFilter: ResolvedOldNewspaperFilterOptions;
  borderFilter: ResolvedOldNewspaperFilterOptions;
  backgroundRemoval: ResolvedBackgroundRemovalOptions;
  shadow: ResolvedShadowOptions;
}

export interface RenderResult {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Placement of the (possibly trimmed) source rectangle in the result. */
  contentBounds: PixelBounds;
  /** Rectangular bounds of the irregular paper shape, excluding its shadow. */
  paperBounds: PixelBounds;
  /** Source rectangle used for the render, in original-image coordinates. */
  sourceBounds: PixelBounds;
  /** Visible alpha bounds in original-image coordinates. */
  originalAlphaBounds: PixelBounds;
  options: ResolvedNewspaperRenderOptions;
}

export interface GeneratedPaperMask {
  /** One alpha byte per output pixel. */
  data: Uint8Array;
  width: number;
  height: number;
  /** Where the top-left source pixel is located in the generated mask. */
  sourceOffsetX: number;
  sourceOffsetY: number;
}

export interface GeneratePaperMaskOptions {
  borderWidth?: number;
  roughness?: number;
  seed?: number;
  alphaThreshold?: number;
}

export interface PaperLayerMasks {
  /** Thresholded source silhouette aligned to the full generated paper raster. */
  imageMask: Uint8Array;
  /** Full irregular paper mask with the image silhouette removed. */
  borderMask: Uint8Array;
  width: number;
  height: number;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const DEFAULT_PAPER_COLOR = "#f6e0c0";
const DEFAULT_INK_COLOR = "#19140f";
const MAX_WORKING_PIXELS = 8_000_000;
const MAX_SOURCE_PIXELS = 4_000_000;
const MAX_WORKING_EDGE = 16_384;
const MAX_ALPHA_COMPONENTS = 100_000;
const SQRT_TWO = Math.SQRT2;

export const SHADOW_PRESETS: Readonly<Record<ShadowPreset, ResolvedShadowOptions>> =
  Object.freeze({
    none: Object.freeze({
      enabled: false,
      preset: "none",
      color: "#17120e",
      opacity: 0,
      blur: 0,
      offsetX: 0,
      offsetY: 0,
    }),
    subtle: Object.freeze({
      enabled: true,
      preset: "subtle",
      color: "#17120e",
      opacity: 0.2,
      blur: 10,
      offsetX: 2,
      offsetY: 5,
    }),
    lifted: Object.freeze({
      enabled: true,
      preset: "lifted",
      color: "#17120e",
      opacity: 0.28,
      blur: 20,
      offsetX: 4,
      offsetY: 10,
    }),
    dramatic: Object.freeze({
      enabled: true,
      preset: "dramatic",
      color: "#120e0a",
      opacity: 0.38,
      blur: 34,
      offsetX: 8,
      offsetY: 18,
    }),
  });

export const DEFAULT_RENDER_OPTIONS: Readonly<ResolvedNewspaperRenderOptions> =
  Object.freeze({
    borderWidth: 13,
    roughness: 0.32,
    seed: 1,
    paperColor: DEFAULT_PAPER_COLOR,
    imagePaperColor: DEFAULT_PAPER_COLOR,
    borderPaperColor: DEFAULT_PAPER_COLOR,
    tightTrim: true,
    alphaThreshold: 24,
    texture: Object.freeze({
      enabled: true,
      strength: 0.58,
      scale: 34,
      fibers: 0.48,
    }),
    oldFilter: Object.freeze({
      enabled: true,
      treatment: "halftone",
      strength: 1,
      crumpleStrength: 1,
      colorAging: 0,
      contrast: 1.24,
      brightness: 0,
      halftone: 0.7,
      dotSize: 3,
      crumpleScale: 72,
      inkColor: DEFAULT_INK_COLOR,
    }),
    borderFilter: Object.freeze({
      enabled: true,
      treatment: "halftone",
      strength: 1,
      crumpleStrength: 1,
      colorAging: 0,
      contrast: 1.24,
      brightness: 0,
      halftone: 0.7,
      dotSize: 3,
      crumpleScale: 72,
      inkColor: DEFAULT_INK_COLOR,
    }),
    backgroundRemoval: Object.freeze(resolveBackgroundRemovalOptions(false)),
    shadow: SHADOW_PRESETS.none,
  });

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

/**
 * Keeps interactive rendering inside a predictable memory budget. The output
 * still comfortably exceeds YouTube thumbnail and 1080p overlay dimensions.
 */
export function fitDimensionsToPixelBudget(
  width: number,
  height: number,
  maximumPixels = MAX_SOURCE_PIXELS,
): PixelSize {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`Invalid raster dimensions: ${width} × ${height}`);
  }
  if (!Number.isFinite(maximumPixels) || maximumPixels < 1) {
    throw new RangeError(`Invalid pixel budget: ${maximumPixels}`);
  }
  const pixelScale = Math.sqrt(maximumPixels / (width * height));
  const scale = Math.min(1, pixelScale, MAX_WORKING_EDGE / width, MAX_WORKING_EDGE / height);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export function expandPixelBounds(
  bounds: PixelBounds,
  padding: number,
  width: number,
  height: number,
): PixelBounds {
  const amount = Math.max(0, Math.floor(padding));
  const x = Math.max(0, bounds.x - amount);
  const y = Math.max(0, bounds.y - amount);
  const right = Math.min(width, bounds.x + bounds.width + amount);
  const bottom = Math.min(height, bounds.y + bounds.height + amount);
  return { x, y, width: right - x, height: bottom - y };
}

function assertRasterDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`Invalid raster dimensions: ${width} × ${height}`);
  }
  if (width * height > MAX_WORKING_PIXELS) {
    throw new RangeError(
      `Image is too large to process safely (${width} × ${height}). ` +
        `The renderer supports up to ${MAX_WORKING_PIXELS.toLocaleString()} working pixels.`,
    );
  }
}

function assertArrayLength(
  data: ArrayLike<number>,
  width: number,
  height: number,
  channels: number,
): void {
  assertRasterDimensions(width, height);
  const required = width * height * channels;
  if (data.length < required) {
    throw new RangeError(`Pixel array has ${data.length} values; expected at least ${required}.`);
  }
}

function normalizeSeed(seed: number): number {
  const normalized = Math.trunc(finiteOr(seed, DEFAULT_RENDER_OPTIONS.seed)) >>> 0;
  return normalized === 0 ? 0x9e3779b9 : normalized;
}

/** Mulberry32 PRNG. Useful for deterministic UI actions such as choosing a seed. */
export function createSeededRandom(seed: number): () => number {
  let state = normalizeSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashIntegerPair(x: number, y: number, seed: number): number {
  let value = normalizeSeed(seed);
  value ^= Math.imul(x | 0, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  value ^= Math.imul(y | 0, 0x165667b1);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Stateless deterministic noise in [0, 1), sampled on an integer lattice. */
export function hashNoise2D(x: number, y: number, seed = 1): number {
  return hashIntegerPair(Math.floor(x), Math.floor(y), seed) / 4294967296;
}

/** Smooth value noise in [-1, 1]. */
export function valueNoise2D(x: number, y: number, seed = 1): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(0, 1, x - x0);
  const ty = smoothstep(0, 1, y - y0);
  const topLeft = hashNoise2D(x0, y0, seed);
  const topRight = hashNoise2D(x0 + 1, y0, seed);
  const bottomLeft = hashNoise2D(x0, y0 + 1, seed);
  const bottomRight = hashNoise2D(x0 + 1, y0 + 1, seed);
  const top = topLeft + (topRight - topLeft) * tx;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * tx;
  return (top + (bottom - top) * ty) * 2 - 1;
}

/** Layered smooth noise in approximately [-1, 1]. */
export function fractalNoise2D(
  x: number,
  y: number,
  seed = 1,
  octaves = 3,
  persistence = 0.52,
): number {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let normalization = 0;
  const octaveCount = clamp(Math.floor(finiteOr(octaves, 3)), 1, 8);

  for (let octave = 0; octave < octaveCount; octave += 1) {
    total += valueNoise2D(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    normalization += amplitude;
    amplitude *= clamp(finiteOr(persistence, 0.52), 0.05, 0.95);
    frequency *= 2;
  }

  return normalization === 0 ? 0 : total / normalization;
}

/** Finds the smallest rectangle containing pixels whose alpha meets threshold. */
export function computeAlphaBounds(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  alphaThreshold = 1,
): PixelBounds | null {
  assertArrayLength(rgba, width, height, 4);
  const threshold = clamp(Math.round(finiteOr(alphaThreshold, 1)), 1, 255);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    let offset = (y * width * 4) + 3;
    for (let x = 0; x < width; x += 1, offset += 4) {
      if (rgba[offset] >= threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return maxX < minX
    ? null
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

interface AlphaComponent {
  bounds: PixelBounds;
  size: number;
}

function computeAlphaComponents(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  alphaThreshold: number,
): AlphaComponent[] {
  assertArrayLength(rgba, width, height, 4);
  const threshold = clamp(Math.round(finiteOr(alphaThreshold, 1)), 1, 255);
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const components: AlphaComponent[] = [];

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] !== 0) continue;
    if (rgba[start * 4 + 3] < threshold) {
      visited[start] = 1;
      continue;
    }

    let head = 0;
    let tail = 1;
    let componentSize = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    queue[0] = start;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head];
      head += 1;
      componentSize += 1;
      const y = Math.floor(index / width);
      const x = index - y * width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const neighborMinY = Math.max(0, y - 1);
      const neighborMaxY = Math.min(height - 1, y + 1);
      const neighborMinX = Math.max(0, x - 1);
      const neighborMaxX = Math.min(width - 1, x + 1);
      for (let neighborY = neighborMinY; neighborY <= neighborMaxY; neighborY += 1) {
        const row = neighborY * width;
        for (let neighborX = neighborMinX; neighborX <= neighborMaxX; neighborX += 1) {
          const neighbor = row + neighborX;
          if (neighbor === index || visited[neighbor] !== 0) continue;
          if (rgba[neighbor * 4 + 3] < threshold) continue;
          visited[neighbor] = 1;
          queue[tail] = neighbor;
          tail += 1;
        }
      }
    }

    components.push({
      size: componentSize,
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      },
    });
    if (components.length > MAX_ALPHA_COMPONENTS) {
      throw new Error(
        "The image transparency contains too many isolated fragments to process safely.",
      );
    }
  }

  return components;
}

/**
 * Finds the bounds of the largest 8-connected alpha component.
 *
 * The threshold affects geometry only; rendering still composites the original
 * soft alpha pixels.
 */
export function computeLargestAlphaComponentBounds(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  alphaThreshold = DEFAULT_RENDER_OPTIONS.alphaThreshold,
): PixelBounds | null {
  const components = computeAlphaComponents(rgba, width, height, alphaThreshold);
  let largest: AlphaComponent | null = null;
  for (const component of components) {
    if (!largest || component.size > largest.size) largest = component;
  }
  return largest ? { ...largest.bounds } : null;
}

/**
 * Unions meaningful disconnected alpha components while rejecting export dust.
 * This keeps separate people, lettering, and decorations in a tight crop instead
 * of silently dropping everything outside the single largest shape.
 */
export function computeMeaningfulAlphaBounds(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  alphaThreshold = DEFAULT_RENDER_OPTIONS.alphaThreshold,
): PixelBounds | null {
  const components = computeAlphaComponents(rgba, width, height, alphaThreshold);
  if (components.length === 0) return null;

  let largestSize = 0;
  for (const component of components) largestSize = Math.max(largestSize, component.size);
  const minimumSize = Math.min(largestSize, Math.max(2, Math.min(64, Math.ceil(largestSize * 0.001))));
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (const component of components) {
    if (component.size < minimumSize) continue;
    minX = Math.min(minX, component.bounds.x);
    minY = Math.min(minY, component.bounds.y);
    maxX = Math.max(maxX, component.bounds.x + component.bounds.width - 1);
    maxY = Math.max(maxY, component.bounds.y + component.bounds.height - 1);
  }

  return maxX < minX
    ? null
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Same as computeAlphaBounds, for one-byte masks rather than RGBA pixels. */
export function computeMaskBounds(
  mask: Uint8Array,
  width: number,
  height: number,
  threshold = 1,
): PixelBounds | null {
  assertArrayLength(mask, width, height, 1);
  const resolvedThreshold = clamp(Math.round(finiteOr(threshold, 1)), 0, 255);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (mask[row + x] >= resolvedThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return maxX < minX
    ? null
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Fast two-pass chamfer distance transform. Non-zero mask pixels have distance
 * zero; all other pixels receive their approximate Euclidean distance to the
 * nearest non-zero pixel.
 */
export function computeChamferDistance(
  mask: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  assertArrayLength(mask, width, height, 1);
  const pixelCount = width * height;
  const distances = new Float32Array(pixelCount);
  const infinity = width + height + 1;

  for (let index = 0; index < pixelCount; index += 1) {
    distances[index] = mask[index] === 0 ? infinity : 0;
  }

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const index = row + x;
      let distance = distances[index];
      if (x > 0) distance = Math.min(distance, distances[index - 1] + 1);
      if (y > 0) {
        distance = Math.min(distance, distances[index - width] + 1);
        if (x > 0) {
          distance = Math.min(distance, distances[index - width - 1] + SQRT_TWO);
        }
        if (x + 1 < width) {
          distance = Math.min(distance, distances[index - width + 1] + SQRT_TWO);
        }
      }
      distances[index] = distance;
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    const row = y * width;
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = row + x;
      let distance = distances[index];
      if (x + 1 < width) distance = Math.min(distance, distances[index + 1] + 1);
      if (y + 1 < height) {
        distance = Math.min(distance, distances[index + width] + 1);
        if (x + 1 < width) {
          distance = Math.min(distance, distances[index + width + 1] + SQRT_TWO);
        }
        if (x > 0) {
          distance = Math.min(distance, distances[index + width - 1] + SQRT_TWO);
        }
      }
      distances[index] = distance;
    }
  }

  return distances;
}

/**
 * Grows a one-channel source alpha silhouette into an irregular paper mask.
 * This function is DOM-free, making the procedural cut easy to unit test.
 */
export function generatePaperMask(
  sourceAlpha: Uint8Array | Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  options: GeneratePaperMaskOptions = {},
): GeneratedPaperMask {
  assertArrayLength(sourceAlpha, sourceWidth, sourceHeight, 1);
  const borderWidth = clamp(
    finiteOr(options.borderWidth, DEFAULT_RENDER_OPTIONS.borderWidth),
    0,
    512,
  );
  const roughness = clamp(finiteOr(options.roughness, DEFAULT_RENDER_OPTIONS.roughness), 0, 1);
  const seed = normalizeSeed(finiteOr(options.seed, DEFAULT_RENDER_OPTIONS.seed));
  const alphaThreshold = clamp(
    Math.round(finiteOr(options.alphaThreshold, DEFAULT_RENDER_OPTIONS.alphaThreshold)),
    1,
    255,
  );
  // Broad, slow width variation carries most of the handmade character. The
  // independent tooth term stays close to one pixel even for very wide borders.
  // `roughness` maps to the approximate maximum proportional width wobble:
  // 0.25 means a cut can drift roughly a quarter of the base border width.
  const broadAmplitude = borderWidth * roughness;
  const toothAmplitude = roughness === 0 ? 0 : 0.35 + roughness * 0.65;
  const roughnessAmplitude = broadAmplitude + toothAmplitude;
  const padding = Math.ceil(borderWidth + roughnessAmplitude + 2);
  const width = sourceWidth + padding * 2;
  const height = sourceHeight + padding * 2;
  assertRasterDimensions(width, height);

  const core = new Uint8Array(width * height);
  for (let y = 0; y < sourceHeight; y += 1) {
    const sourceRow = y * sourceWidth;
    const targetRow = (y + padding) * width + padding;
    for (let x = 0; x < sourceWidth; x += 1) {
      if (sourceAlpha[sourceRow + x] >= alphaThreshold) core[targetRow + x] = 255;
    }
  }

  if (computeMaskBounds(core, width, height) === null) {
    throw new Error("Cannot create a paper cutout from a fully transparent image.");
  }

  const distances = computeChamferDistance(core, width, height);
  const mask = new Uint8Array(width * height);
  const noiseScale = Math.max(8, borderWidth * 2.1);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const index = row + x;
      if (core[index] !== 0) {
        mask[index] = 255;
        continue;
      }

      const distance = distances[index];
      if (distance > borderWidth + roughnessAmplitude + 0.75) continue;

      let cutOffset = 0;
      if (roughnessAmplitude > 0) {
        const broad = fractalNoise2D(x / noiseScale, y / noiseScale, seed, 3, 0.5);
        const tooth = hashNoise2D(x, y, seed + 0x7f4a7c15) * 2 - 1;
        cutOffset = broad * broadAmplitude + tooth * toothAmplitude;
      }
      const localBorder = Math.max(0, borderWidth + cutOffset);
      const signedCoverage = localBorder - distance;
      mask[index] = Math.round(clamp(signedCoverage + 0.62, 0, 1) * 255);
    }
  }

  return {
    data: mask,
    width,
    height,
    sourceOffsetX: padding,
    sourceOffsetY: padding,
  };
}

/**
 * Splits a generated paper shape into two non-overlapping visual layers.
 *
 * A hard threshold is intentional here: it guarantees that the image-paper
 * and border-paper masks reconstruct the original paper alpha exactly. The
 * source's soft alpha is still preserved when the original/ink image is drawn
 * later, so antialiased hair and edge pixels remain smooth.
 */
export function splitPaperLayerMasks(
  sourceAlpha: Uint8Array | Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  paperMask: GeneratedPaperMask,
  alphaThreshold = DEFAULT_RENDER_OPTIONS.alphaThreshold,
): PaperLayerMasks {
  assertArrayLength(sourceAlpha, sourceWidth, sourceHeight, 1);
  assertArrayLength(paperMask.data, paperMask.width, paperMask.height, 1);
  if (
    paperMask.sourceOffsetX < 0 ||
    paperMask.sourceOffsetY < 0 ||
    paperMask.sourceOffsetX + sourceWidth > paperMask.width ||
    paperMask.sourceOffsetY + sourceHeight > paperMask.height
  ) {
    throw new RangeError("The source rectangle does not fit inside the generated paper mask.");
  }

  const threshold = clamp(Math.round(finiteOr(alphaThreshold, 1)), 1, 255);
  const imageMask = new Uint8Array(paperMask.width * paperMask.height);
  const borderMask = new Uint8Array(paperMask.data);

  for (let y = 0; y < sourceHeight; y += 1) {
    const sourceRow = y * sourceWidth;
    const targetRow = (y + paperMask.sourceOffsetY) * paperMask.width + paperMask.sourceOffsetX;
    for (let x = 0; x < sourceWidth; x += 1) {
      if (sourceAlpha[sourceRow + x] < threshold) continue;
      const targetIndex = targetRow + x;
      imageMask[targetIndex] = paperMask.data[targetIndex];
      borderMask[targetIndex] = 0;
    }
  }

  return {
    imageMask,
    borderMask,
    width: paperMask.width,
    height: paperMask.height,
  };
}

/** Supports the color forms used by the app palettes without touching the DOM. */
export function parseCssColor(color: string, fallback = DEFAULT_PAPER_COLOR): RgbColor {
  const value = color.trim().toLowerCase();
  const shortHex = /^#([0-9a-f]{3})$/i.exec(value);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("").map((channel) => parseInt(channel + channel, 16));
    return { r, g, b };
  }

  const longHex = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(value);
  if (longHex) {
    return {
      r: parseInt(longHex[1].slice(0, 2), 16),
      g: parseInt(longHex[1].slice(2, 4), 16),
      b: parseInt(longHex[1].slice(4, 6), 16),
    };
  }

  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(value);
  if (rgb) {
    return {
      r: clamp(Math.round(Number(rgb[1])), 0, 255),
      g: clamp(Math.round(Number(rgb[2])), 0, 255),
      b: clamp(Math.round(Number(rgb[3])), 0, 255),
    };
  }

  if (fallback !== color) return parseCssColor(fallback, DEFAULT_PAPER_COLOR);
  return { r: 246, g: 224, b: 192 };
}

function isPaperEdge(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  const index = y * width + x;
  if (mask[index] === 0) return false;
  return (
    x === 0 ||
    y === 0 ||
    x + 1 === width ||
    y + 1 === height ||
    mask[index - 1] < 128 ||
    mask[index + 1] < 128 ||
    mask[index - width] < 128 ||
    mask[index + width] < 128
  );
}

function paintPaperTextureData(
  output: Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  color: string,
  texture: ResolvedPaperTextureOptions,
  seed: number,
  edgeMask: Uint8Array,
): void {
  assertArrayLength(output, width, height, 4);
  assertArrayLength(mask, width, height, 1);
  assertArrayLength(edgeMask, width, height, 1);
  const base = parseCssColor(color);
  const strength = texture.enabled ? clamp(texture.strength, 0, 1) : 0;
  const scale = clamp(texture.scale, 4, 256);
  const fibers = clamp(texture.fibers, 0, 1);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const index = row + x;
      const alpha = mask[index];
      if (alpha === 0) continue;

      const broad = valueNoise2D(x / scale, y / scale, seed + 47);
      const medium = valueNoise2D(x / (scale * 0.31), y / (scale * 0.31), seed + 911);
      const grain = hashNoise2D(x, y, seed + 3571) * 2 - 1;
      const fiberNoise = hashNoise2D(x * 3 + (y % 3), Math.floor(y / 2), seed + 7919);
      const fleck = fiberNoise > 1 - fibers * 0.012 ? (fiberNoise - (1 - fibers * 0.012)) * 50 : 0;
      const edgeAging = isPaperEdge(edgeMask, width, height, x, y)
        ? 3.5 + strength * 2.5
        : 0;
      const variation = strength * (broad * 13 + medium * 7 + grain * 5 - fleck * 28);
      const rgbaIndex = index * 4;

      output[rgbaIndex] = clamp(Math.round(base.r + variation - edgeAging), 0, 255);
      output[rgbaIndex + 1] = clamp(
        Math.round(base.g + variation * 0.92 - edgeAging * 0.86),
        0,
        255,
      );
      output[rgbaIndex + 2] = clamp(
        Math.round(base.b + variation * 0.72 - edgeAging * 0.62),
        0,
        255,
      );
      output[rgbaIndex + 3] = alpha;
    }
  }
}

/** Produces textured RGBA paper pixels from a one-channel mask. */
export function createPaperTextureData(
  mask: Uint8Array,
  width: number,
  height: number,
  color: string,
  texture: ResolvedPaperTextureOptions = DEFAULT_RENDER_OPTIONS.texture,
  seed = DEFAULT_RENDER_OPTIONS.seed,
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(width * height * 4);
  paintPaperTextureData(output, mask, width, height, color, texture, seed, mask);
  return output;
}

/**
 * Textures independent image/border masks directly into one allocation.
 * Supplying the full paper mask for edge aging prevents a fake dark seam where
 * the two internal layers meet. With matching colors this is pixel-identical to
 * texturing the legacy shared mask.
 */
export function createLayeredPaperTextureData(
  layers: PaperLayerMasks,
  fullPaperMask: Uint8Array,
  imageColor: string,
  borderColor: string,
  texture: ResolvedPaperTextureOptions = DEFAULT_RENDER_OPTIONS.texture,
  seed = DEFAULT_RENDER_OPTIONS.seed,
): Uint8ClampedArray {
  assertArrayLength(layers.imageMask, layers.width, layers.height, 1);
  assertArrayLength(layers.borderMask, layers.width, layers.height, 1);
  assertArrayLength(fullPaperMask, layers.width, layers.height, 1);
  const output = new Uint8ClampedArray(layers.width * layers.height * 4);
  paintPaperTextureData(
    output,
    layers.borderMask,
    layers.width,
    layers.height,
    borderColor,
    texture,
    seed,
    fullPaperMask,
  );
  paintPaperTextureData(
    output,
    layers.imageMask,
    layers.width,
    layers.height,
    imageColor,
    texture,
    seed,
    fullPaperMask,
  );

  return output;
}

function resolveTexture(
  texture: NewspaperRenderOptions["texture"],
): ResolvedPaperTextureOptions {
  const defaults = DEFAULT_RENDER_OPTIONS.texture;
  if (texture === false) return { ...defaults, enabled: false };
  if (texture === true || texture === undefined) return { ...defaults, enabled: true };
  return {
    enabled: texture.enabled ?? true,
    strength: clamp(finiteOr(texture.strength, defaults.strength), 0, 1),
    scale: clamp(finiteOr(texture.scale, defaults.scale), 4, 256),
    fibers: clamp(finiteOr(texture.fibers, defaults.fibers), 0, 1),
  };
}

function resolveOldFilter(
  filter: boolean | OldNewspaperFilterOptions | undefined,
): ResolvedOldNewspaperFilterOptions {
  const defaults = DEFAULT_RENDER_OPTIONS.oldFilter;
  if (filter === false) return { ...defaults, enabled: false };
  if (filter === true || filter === undefined) return { ...defaults, enabled: true };
  return {
    enabled: filter.enabled ?? true,
    treatment:
      filter.treatment === "crumpled" || filter.treatment === "halftone" || filter.treatment === "combined"
        ? filter.treatment
        : defaults.treatment,
    strength: clamp(finiteOr(filter.strength, defaults.strength), 0, 1),
    crumpleStrength: clamp(
      finiteOr(filter.crumpleStrength,
        filter.treatment === "crumpled"
          ? finiteOr(filter.strength, defaults.crumpleStrength)
          : defaults.crumpleStrength),
      0, 1,
    ),
    colorAging: clamp(finiteOr(filter.colorAging, defaults.colorAging), 0, 1),
    contrast: clamp(finiteOr(filter.contrast, defaults.contrast), 0.2, 3),
    brightness: clamp(finiteOr(filter.brightness, defaults.brightness), -0.5, 0.5),
    halftone: clamp(finiteOr(filter.halftone, defaults.halftone), 0, 1),
    dotSize: clamp(finiteOr(filter.dotSize, defaults.dotSize), 1.25, 20),
    crumpleScale: clamp(finiteOr(filter.crumpleScale, defaults.crumpleScale), 12, 256),
    inkColor: filter.inkColor ?? defaults.inkColor,
  };
}

function filterInkAmount(filter: ResolvedOldNewspaperFilterOptions): number {
  return filter.treatment === "crumpled" ? filter.colorAging : filter.strength;
}

function hasCrumpleRelief(filter: ResolvedOldNewspaperFilterOptions): boolean {
  return filter.enabled && filter.treatment !== "halftone" && filter.crumpleStrength > 0;
}

export function resolveShadowOptions(
  shadow: NewspaperRenderOptions["shadow"],
): ResolvedShadowOptions {
  if (shadow === false || shadow === "none") return { ...SHADOW_PRESETS.none };
  if (shadow === true) return { ...SHADOW_PRESETS.subtle };
  if (shadow === undefined) return { ...DEFAULT_RENDER_OPTIONS.shadow };
  if (typeof shadow === "string") return { ...SHADOW_PRESETS[shadow] };

  const preset = shadow.preset ?? DEFAULT_RENDER_OPTIONS.shadow.preset;
  const base = SHADOW_PRESETS[preset];
  const enabled = shadow.enabled ?? base.enabled;
  return {
    enabled,
    preset: enabled ? preset : "none",
    color: shadow.color ?? base.color,
    opacity: enabled ? clamp(finiteOr(shadow.opacity, base.opacity), 0, 1) : 0,
    blur: enabled ? clamp(finiteOr(shadow.blur, base.blur), 0, 256) : 0,
    offsetX: enabled ? clamp(finiteOr(shadow.offsetX, base.offsetX), -512, 512) : 0,
    offsetY: enabled ? clamp(finiteOr(shadow.offsetY, base.offsetY), -512, 512) : 0,
  };
}

export function resolveRenderOptions(
  options: NewspaperRenderOptions = {},
): ResolvedNewspaperRenderOptions {
  const sharedPaperColor = options.paperColor ?? DEFAULT_RENDER_OPTIONS.paperColor;
  const sharedFilter = options.oldFilter;
  return {
    borderWidth: clamp(
      finiteOr(options.borderWidth, DEFAULT_RENDER_OPTIONS.borderWidth),
      0,
      512,
    ),
    roughness: clamp(finiteOr(options.roughness, DEFAULT_RENDER_OPTIONS.roughness), 0, 1),
    seed: normalizeSeed(finiteOr(options.seed, DEFAULT_RENDER_OPTIONS.seed)),
    paperColor: sharedPaperColor,
    imagePaperColor: options.imagePaperColor ?? sharedPaperColor,
    borderPaperColor: options.borderPaperColor ?? sharedPaperColor,
    tightTrim: options.tightTrim ?? DEFAULT_RENDER_OPTIONS.tightTrim,
    alphaThreshold: clamp(
      Math.round(finiteOr(options.alphaThreshold, DEFAULT_RENDER_OPTIONS.alphaThreshold)),
      1,
      255,
    ),
    texture: resolveTexture(options.texture),
    oldFilter: resolveOldFilter(sharedFilter),
    borderFilter: resolveOldFilter(options.borderFilter ?? sharedFilter),
    backgroundRemoval: resolveBackgroundRemovalOptions(options.backgroundRemoval),
    shadow: resolveShadowOptions(options.shadow),
  };
}

/**
 * Creates an RGBA ink layer. White areas become transparent paper, and darker
 * areas receive progressively denser ink dots.
 */
export function createOldNewspaperInkData(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  filter: OldNewspaperFilterOptions | ResolvedOldNewspaperFilterOptions =
    DEFAULT_RENDER_OPTIONS.oldFilter,
): Uint8ClampedArray {
  assertArrayLength(rgba, width, height, 4);
  const resolved = resolveOldFilter(filter);
  const ink = parseCssColor(resolved.inkColor, DEFAULT_INK_COLOR);
  const output = new Uint8ClampedArray(width * height * 4);
  // The reference uses the classic 45° clustered-dot newspaper screen.
  const angle = Math.PI / 4;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const sourceAlpha = rgba[index + 3] / 255;
      if (sourceAlpha === 0) continue;

      const luminance =
        (rgba[index] * 0.2126 + rgba[index + 1] * 0.7152 + rgba[index + 2] * 0.0722) /
        255;
      const leveled = clamp(
        (luminance - 0.5) * resolved.contrast + 0.5 + resolved.brightness,
        0,
        1,
      );
      // The warm duotone reference follows roughly paperMix = grayscale^0.67.
      const coverage = 1 - Math.pow(leveled, 0.67);
      const rotatedX = (x * cosine + y * sine) / resolved.dotSize;
      const rotatedY = (-x * sine + y * cosine) / resolved.dotSize;
      const cellX = rotatedX - Math.floor(rotatedX) - 0.5;
      const cellY = rotatedY - Math.floor(rotatedY) - 0.5;
      const distanceFromCenter = Math.sqrt(cellX * cellX + cellY * cellY);
      const dotRadius = Math.sqrt(coverage) * 0.7;
      const dotEdge = 0.09 / Math.max(1, resolved.dotSize / 3);
      const dot =
        (1 - smoothstep(dotRadius - dotEdge, dotRadius + dotEdge, distanceFromCenter)) *
        smoothstep(0.008, 0.06, coverage);
      const screenedCoverage = Math.max(coverage * 0.18, dot);
      const pressGrain = 0.92 + hashNoise2D(x, y, 0x59c31) * 0.08;
      const finalCoverage =
        resolved.treatment === "crumpled"
          ? clamp(coverage * pressGrain, 0, 1)
          : coverage +
            (screenedCoverage - coverage) * clamp(resolved.halftone, 0, 1);

      output[index] = ink.r;
      output[index + 1] = ink.g;
      output[index + 2] = ink.b;
      output[index + 3] = Math.round(clamp(sourceAlpha * finalCoverage, 0, 1) * 255);
    }
  }

  return output;
}

/**
 * Creates deterministic press wear for the border-paper layer.
 *
 * A border has no source luminance to print, so its ink is synthesized from
 * edge aging, broad press variation, sparse flecks, and the same 45-degree dot
 * screen used by the image filter. The familiar ink controls therefore remain
 * meaningful while the layer stays completely independent from the image.
 */
export function createBorderNewspaperInkData(
  mask: Uint8Array,
  width: number,
  height: number,
  filter: boolean | OldNewspaperFilterOptions | ResolvedOldNewspaperFilterOptions =
    DEFAULT_RENDER_OPTIONS.borderFilter,
  seed = DEFAULT_RENDER_OPTIONS.seed,
): Uint8ClampedArray {
  assertArrayLength(mask, width, height, 1);
  const resolved = resolveOldFilter(filter);
  const output = new Uint8ClampedArray(width * height * 4);
  const inkAmount = filterInkAmount(resolved);
  if (!resolved.enabled || inkAmount <= 0) return output;

  const ink = parseCssColor(resolved.inkColor, DEFAULT_INK_COLOR);
  const angle = Math.PI / 4;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const normalizedSeed = normalizeSeed(seed);
  const variationScale = Math.max(12, resolved.dotSize * 5);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const maskAlpha = mask[pixelIndex] / 255;
      if (maskAlpha === 0) continue;

      const broad =
        fractalNoise2D(x / variationScale, y / variationScale, normalizedSeed + 0x183d, 3, 0.54) *
          0.5 +
        0.5;
      const grain = hashNoise2D(x, y, normalizedSeed + 0x5f37);
      const speck = smoothstep(0.91, 0.995, grain);
      const edge = isPaperEdge(mask, width, height, x, y) ? 1 : 0;
      const baseCoverage = 0.025 + broad * 0.07 + edge * 0.12 + speck * 0.34;
      const coverage = clamp(
        (baseCoverage - 0.12) * resolved.contrast + 0.12 - resolved.brightness * 0.28,
        0,
        1,
      );

      const rotatedX = (x * cosine + y * sine) / resolved.dotSize;
      const rotatedY = (-x * sine + y * cosine) / resolved.dotSize;
      const cellX = rotatedX - Math.floor(rotatedX) - 0.5;
      const cellY = rotatedY - Math.floor(rotatedY) - 0.5;
      const distanceFromCenter = Math.sqrt(cellX * cellX + cellY * cellY);
      const dotRadius = Math.sqrt(coverage) * 0.7;
      const dotEdge = 0.09 / Math.max(1, resolved.dotSize / 3);
      const dot =
        (1 - smoothstep(dotRadius - dotEdge, dotRadius + dotEdge, distanceFromCenter)) *
        smoothstep(0.008, 0.06, coverage);
      const screenedCoverage = Math.max(coverage * 0.2, dot);
      const finalCoverage =
        resolved.treatment === "crumpled"
          ? clamp(coverage * (0.88 + grain * 0.12), 0, 1)
          : coverage +
            (screenedCoverage - coverage) * clamp(resolved.halftone, 0, 1);
      const rgbaIndex = pixelIndex * 4;

      output[rgbaIndex] = ink.r;
      output[rgbaIndex + 1] = ink.g;
      output[rgbaIndex + 2] = ink.b;
      output[rgbaIndex + 3] = Math.round(
        clamp(maskAlpha * finalCoverage * inkAmount, 0, 1) * 255,
      );
    }
  }

  return output;
}

export interface CrumpleReliefField {
  /** Signed light response in the range -1 (fold shadow) to 1 (fold highlight). */
  data: Float32Array;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

export interface CrumpleMaterialMap {
  /** Normalized luminance relief in the range -1 (valley) to 1 (ridge). */
  data: Float32Array;
  width: number;
  height: number;
}

let crumpleMaterialPromise: Promise<CrumpleMaterialMap | null> | null = null;

async function loadCrumpleMaterialMap(): Promise<CrumpleMaterialMap | null> {
  if (crumpleMaterialPromise) return crumpleMaterialPromise;
  crumpleMaterialPromise = (async () => {
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.decoding = "async";
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("Crumpled-paper material failed to load."));
        element.src = crumpledPaperMaterialUrl;
      });
      const maximumEdge = 760;
      const reduction = Math.min(1, maximumEdge / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(2, Math.round(image.naturalWidth * reduction));
      const height = Math.max(2, Math.round(image.naturalHeight * reduction));
      const canvas = makeCanvas(width, height);
      const context = context2d(canvas, true);
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const luminance = new Float32Array(width * height);
      let total = 0;

      for (let pixelIndex = 0; pixelIndex < luminance.length; pixelIndex += 1) {
        const rgbaIndex = pixelIndex * 4;
        const value =
          (pixels[rgbaIndex] * 0.2126 +
            pixels[rgbaIndex + 1] * 0.7152 +
            pixels[rgbaIndex + 2] * 0.0722) /
          255;
        luminance[pixelIndex] = value;
        total += value;
      }

      const mean = total / luminance.length;
      let squaredDifference = 0;
      for (const value of luminance) squaredDifference += (value - mean) ** 2;
      const standardDeviation = Math.max(0.035, Math.sqrt(squaredDifference / luminance.length));
      const normalization = standardDeviation * 2.15;
      for (let index = 0; index < luminance.length; index += 1) {
        luminance[index] = clamp((luminance[index] - mean) / normalization, -1, 1);
      }
      return { data: luminance, width, height };
    } catch {
      // The procedural fallback below keeps rendering functional offline even
      // if a browser fails to decode the bundled WebP material.
      return null;
    }
  })();
  return crumpleMaterialPromise;
}

interface CrumplePoint {
  x: number;
  y: number;
}

function mirrorMaterialCoordinate(value: number, size: number): number {
  if (size <= 1) return 0;
  const maximum = size - 1;
  const period = maximum * 2;
  const wrapped = ((value % period) + period) % period;
  return wrapped <= maximum ? wrapped : period - wrapped;
}

function sampleCrumpleMaterial(
  material: CrumpleMaterialMap,
  x: number,
  y: number,
): number {
  const sampleX = mirrorMaterialCoordinate(x, material.width);
  const sampleY = mirrorMaterialCoordinate(y, material.height);
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const x1 = Math.min(material.width - 1, x0 + 1);
  const y1 = Math.min(material.height - 1, y0 + 1);
  const amountX = sampleX - x0;
  const amountY = sampleY - y0;
  const top =
    material.data[y0 * material.width + x0] * (1 - amountX) +
    material.data[y0 * material.width + x1] * amountX;
  const bottom =
    material.data[y1 * material.width + x0] * (1 - amountX) +
    material.data[y1 * material.width + x1] * amountX;
  return top * (1 - amountY) + bottom * amountY;
}

/** Paints the compressed dimple at the center of a crush cluster. */
function paintCrumplePinch(
  lighting: Float32Array,
  width: number,
  height: number,
  center: CrumplePoint,
  radius: number,
  strength: number,
  lightAngle: number,
): void {
  const reach = Math.max(2, radius);
  const minimumX = Math.max(0, Math.floor(center.x - reach));
  const maximumX = Math.min(width - 1, Math.ceil(center.x + reach));
  const minimumY = Math.max(0, Math.floor(center.y - reach));
  const maximumY = Math.min(height - 1, Math.ceil(center.y + reach));

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const deltaX = x - center.x;
      const deltaY = y - center.y;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance >= reach) continue;
      const normalizedDistance = distance / reach;
      const envelope = 1 - smoothstep(0.08, 1, normalizedDistance);
      const direction = Math.cos(Math.atan2(deltaY, deltaX) - lightAngle);
      const rimDistance = (normalizedDistance - 0.24) / 0.15;
      const rim = Math.exp(-rimDistance * rimDistance);
      const coreDistance = normalizedDistance / 0.14;
      const core = Math.exp(-coreDistance * coreDistance);
      lighting[y * width + x] +=
        (direction * 0.5 * envelope + direction * 0.36 * rim - core * 0.48) * strength;
    }
  }
}

function paintCrumpleSegment(
  lighting: Float32Array,
  width: number,
  height: number,
  start: CrumplePoint,
  end: CrumplePoint,
  creaseWidth: number,
  strength: number,
  polarity: number,
  taperStart = true,
  taperEnd = true,
): void {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared < 0.01) return;
  const length = Math.sqrt(lengthSquared);
  const reach = creaseWidth * 2.8;
  const minimumX = Math.max(0, Math.floor(Math.min(start.x, end.x) - reach));
  const maximumX = Math.min(width - 1, Math.ceil(Math.max(start.x, end.x) + reach));
  const minimumY = Math.max(0, Math.floor(Math.min(start.y, end.y) - reach));
  const maximumY = Math.min(height - 1, Math.ceil(Math.max(start.y, end.y) + reach));

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const projection =
        ((x - start.x) * deltaX + (y - start.y) * deltaY) / lengthSquared;
      if (projection < -0.04 || projection > 1.04) continue;
      const clampedProjection = clamp(projection, 0, 1);
      const closestX = start.x + deltaX * clampedProjection;
      const closestY = start.y + deltaY * clampedProjection;
      const signedDistance =
        ((x - closestX) * -deltaY + (y - closestY) * deltaX) / length;
      if (Math.abs(signedDistance) > reach) continue;

      const endTaper =
        (taperStart ? smoothstep(0, 0.13, clampedProjection) : 1) *
        (taperEnd ? 1 - smoothstep(0.87, 1, clampedProjection) : 1);
      const highlightedDistance =
        (signedDistance + polarity * creaseWidth * 0.72) / (creaseWidth * 0.58);
      const shadowedDistance =
        (signedDistance - polarity * creaseWidth * 0.58) / (creaseWidth * 0.68);
      const centerDistance = signedDistance / Math.max(0.32, creaseWidth * 0.3);
      const highlight = Math.exp(-highlightedDistance * highlightedDistance) * 0.62;
      const shadow = Math.exp(-shadowedDistance * shadowedDistance) * 0.67;
      const seam = Math.exp(-centerDistance * centerDistance) * 0.12;
      lighting[y * width + x] +=
        (highlight - shadow - seam) * strength * endTaper;
    }
  }
}

/**
 * Builds a bounded, low-resolution lighting field for deeply crushed paper.
 *
 * A bundled material map supplies the organic large/medium/micro fold mix,
 * while seeded low-frequency buckling and a restrained set of paths keep each
 * cut unique. If the material is unavailable, the procedural paths remain a
 * complete fallback. The field is capped so camera images and hand sprites
 * stay interactive in the browser.
 */
export function createCrumpleReliefField(
  sourceWidth: number,
  sourceHeight: number,
  foldScale = DEFAULT_RENDER_OPTIONS.oldFilter.crumpleScale,
  seed = DEFAULT_RENDER_OPTIONS.seed,
  material: CrumpleMaterialMap | null = null,
): CrumpleReliefField {
  assertRasterDimensions(sourceWidth, sourceHeight);
  const reduction = Math.max(1, Math.ceil(Math.max(sourceWidth, sourceHeight) / 760));
  const width = Math.max(2, Math.ceil(sourceWidth / reduction));
  const height = Math.max(2, Math.ceil(sourceHeight / reduction));
  const smallestEdge = Math.max(2, Math.min(width, height));
  const cellSize = clamp(
    finiteOr(foldScale, DEFAULT_RENDER_OPTIONS.oldFilter.crumpleScale) / reduction,
    6,
    Math.max(8, smallestEdge * 0.46),
  );
  const normalizedSeed = normalizeSeed(seed);
  const data = new Float32Array(width * height);
  const broadScale = cellSize * 1.7;
  const middleScale = cellSize * 0.56;
  // The source material's dominant folds are roughly 84px apart. Matching that
  // landmark to the user's fold-size control keeps its meaning intuitive.
  const materialScale = material ? clamp(84 / cellSize, 0.42, 8) : 1;
  const materialDirectionX = hashNoise2D(5, 23, normalizedSeed + 0x1a8f) < 0.5 ? -1 : 1;
  const materialDirectionY = hashNoise2D(13, 31, normalizedSeed + 0xe4b7) < 0.5 ? -1 : 1;
  const materialWarpReach = cellSize * materialScale * 0.2;
  const materialTravelX = (width - 1) * materialScale;
  const materialTravelY = (height - 1) * materialScale;
  const materialFreeX = material
    ? material.width - materialTravelX - materialWarpReach * 2
    : 0;
  const materialFreeY = material
    ? material.height - materialTravelY - materialWarpReach * 2
    : 0;
  const randomMaterialOffsetX = material
    ? hashNoise2D(3, 11, normalizedSeed + 0x2f91)
    : 0;
  const randomMaterialOffsetY = material
    ? hashNoise2D(19, 7, normalizedSeed + 0x7c35)
    : 0;
  const materialOffsetX = material
    ? materialFreeX >= 0
      ? materialDirectionX > 0
        ? materialWarpReach + randomMaterialOffsetX * materialFreeX
        : material.width - materialWarpReach - randomMaterialOffsetX * materialFreeX
      : randomMaterialOffsetX * material.width
    : 0;
  const materialOffsetY = material
    ? materialFreeY >= 0
      ? materialDirectionY > 0
        ? materialWarpReach + randomMaterialOffsetY * materialFreeY
        : material.height - materialWarpReach - randomMaterialOffsetY * materialFreeY
      : randomMaterialOffsetY * material.height
    : 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const broadLeft = valueNoise2D(
        (x - 1) / broadScale,
        y / broadScale,
        normalizedSeed + 0x41e7,
      );
      const broadRight = valueNoise2D(
        (x + 1) / broadScale,
        y / broadScale,
        normalizedSeed + 0x41e7,
      );
      const broadAbove = valueNoise2D(
        x / broadScale,
        (y - 1) / broadScale,
        normalizedSeed + 0x41e7,
      );
      const broadBelow = valueNoise2D(
        x / broadScale,
        (y + 1) / broadScale,
        normalizedSeed + 0x41e7,
      );
      const middleLeft = valueNoise2D(
        (x - 1) / middleScale,
        y / middleScale,
        normalizedSeed + 0xb8a3,
      );
      const middleRight = valueNoise2D(
        (x + 1) / middleScale,
        y / middleScale,
        normalizedSeed + 0xb8a3,
      );
      const middleAbove = valueNoise2D(
        x / middleScale,
        (y - 1) / middleScale,
        normalizedSeed + 0xb8a3,
      );
      const middleBelow = valueNoise2D(
        x / middleScale,
        (y + 1) / middleScale,
        normalizedSeed + 0xb8a3,
      );
      const broadSlope =
        (broadLeft - broadRight) * cellSize * 0.105 +
        (broadAbove - broadBelow) * cellSize * 0.078;
      const middleSlope =
        (middleLeft - middleRight) * cellSize * 0.03 +
        (middleAbove - middleBelow) * cellSize * 0.022;
      const paperGrain = hashNoise2D(x, y, normalizedSeed + 0x6c19) - 0.5;
      let materialLight = 0;
      if (material) {
        const warpScale = cellSize * 1.8;
        const warpX =
          valueNoise2D(x / warpScale, y / warpScale, normalizedSeed + 0x593d) *
          cellSize *
          materialScale *
          0.2;
        const warpY =
          valueNoise2D(x / warpScale, y / warpScale, normalizedSeed + 0xad17) *
          cellSize *
          materialScale *
          0.2;
        materialLight = sampleCrumpleMaterial(
          material,
          materialOffsetX + x * materialScale * materialDirectionX + warpX,
          materialOffsetY + y * materialScale * materialDirectionY + warpY,
        );
      }
      data[index] = material
        ? materialLight * 0.94 + broadSlope * 0.2 + middleSlope * 0.12 + paperGrain * 0.018
        : broadSlope * 1.3 + middleSlope * 0.88 + paperGrain * 0.028;
    }
  }

  const lightX = -0.49;
  const lightY = -0.62;
  const random = createSeededRandom(normalizedSeed + 0x934f);
  const foldCount = Math.round(
    material
      ? clamp(((width + height) / cellSize) * 0.18, 3, 9)
      : clamp(((width + height) / cellSize) * 0.58, 7, 24),
  );
  for (let foldIndex = 0; foldIndex < foldCount; foldIndex += 1) {
    const structural = foldIndex < Math.min(6, foldCount);
    const totalLength = structural
      ? Math.hypot(width, height) * (0.28 + random() * 0.36)
      : cellSize * (0.72 + random() * 1.9);
    const segmentCount = structural
      ? 5 + Math.floor(random() * 4)
      : 2 + Math.floor(random() * 4);
    const creaseWidth = clamp(
      cellSize * (structural ? 0.055 + random() * 0.045 : 0.026 + random() * 0.035),
      0.68,
      6.4,
    );
    const foldStrength =
      (structural ? 0.78 + random() * 0.32 : 0.38 + random() * 0.54) *
      (material ? 0.34 : 1);
    const polarity = random() < 0.5 ? -1 : 1;
    let angle = random() * Math.PI * 2;
    let point: CrumplePoint = {
      x: width * (0.08 + random() * 0.84),
      y: height * (0.08 + random() * 0.84),
    };
    const segmentLength = totalLength / segmentCount;

    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      angle += (random() - 0.5) * (structural ? 0.72 : 1.05);
      let next: CrumplePoint = {
        x: point.x + Math.cos(angle) * segmentLength * (0.72 + random() * 0.56),
        y: point.y + Math.sin(angle) * segmentLength * (0.72 + random() * 0.56),
      };
      if (next.x < 0 || next.x >= width) {
        angle = Math.PI - angle;
        next = {
          ...next,
          x: clamp(next.x, 0, width - 1),
        };
      }
      if (next.y < 0 || next.y >= height) {
        angle = -angle;
        next = {
          ...next,
          y: clamp(next.y, 0, height - 1),
        };
      }
      paintCrumpleSegment(
        data,
        width,
        height,
        point,
        next,
        creaseWidth,
        foldStrength,
        polarity,
        segmentIndex === 0,
        segmentIndex === segmentCount - 1,
      );

      if (segmentIndex > 0 && random() < (material ? 0.28 : 0.48)) {
        const branchAngle =
          angle + (random() < 0.5 ? -1 : 1) * (0.55 + random() * 0.65);
        const branchLength = segmentLength * (0.35 + random() * 0.5);
        paintCrumpleSegment(
          data,
          width,
          height,
          point,
          {
            x: clamp(point.x + Math.cos(branchAngle) * branchLength, 0, width - 1),
            y: clamp(point.y + Math.sin(branchAngle) * branchLength, 0, height - 1),
          },
          creaseWidth * 0.58,
          foldStrength * 0.62,
          -polarity,
        );
      }
      point = next;
    }
  }

  // Real crushed paper has several compression points. Each creates a dark
  // dimple and a fan of irregular, tapered wrinkles rather than one long line.
  const areaInCells = (width * height) / (cellSize * cellSize);
  const pinchCount = Math.round(
    material ? clamp(areaInCells * 0.035, 1, 4) : clamp(areaInCells * 0.13, 3, 10),
  );
  for (let pinchIndex = 0; pinchIndex < pinchCount; pinchIndex += 1) {
    const center: CrumplePoint = {
      x: width * (0.06 + random() * 0.88),
      y: height * (0.06 + random() * 0.88),
    };
    const radius = cellSize * (0.18 + random() * 0.2);
    const pinchStrength = (0.64 + random() * 0.42) * (material ? 0.36 : 1);
    const lightAngle = Math.atan2(lightY, lightX);
    paintCrumplePinch(
      data,
      width,
      height,
      center,
      radius,
      pinchStrength,
      lightAngle,
    );

    const spokeCount = material
      ? 5 + Math.floor(random() * 5)
      : 7 + Math.floor(random() * 9);
    const spokeOffset = random() * Math.PI * 2;
    for (let spokeIndex = 0; spokeIndex < spokeCount; spokeIndex += 1) {
      let angle =
        spokeOffset +
        (spokeIndex / spokeCount) * Math.PI * 2 +
        (random() - 0.5) * 0.46;
      const totalLength = cellSize * (0.42 + random() * 1.22);
      const segmentCount = 2 + Math.floor(random() * 4);
      const segmentLength = totalLength / segmentCount;
      const polarity = random() < 0.5 ? -1 : 1;
      const baseWidth = clamp(cellSize * (0.022 + random() * 0.035), 0.52, 3.4);
      let point = center;

      for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
        angle += (random() - 0.5) * 0.72;
        const progress = segmentIndex / segmentCount;
        const next = {
          x: clamp(
            point.x + Math.cos(angle) * segmentLength * (0.68 + random() * 0.68),
            0,
            width - 1,
          ),
          y: clamp(
            point.y + Math.sin(angle) * segmentLength * (0.68 + random() * 0.68),
            0,
            height - 1,
          ),
        };
        paintCrumpleSegment(
          data,
          width,
          height,
          point,
          next,
          baseWidth * (1 - progress * 0.5),
          pinchStrength * (0.88 - progress * 0.34),
          polarity,
          false,
          segmentIndex === segmentCount - 1,
        );
        point = next;
      }
    }
  }

  // Short, low-amplitude creases fill the spaces between the dominant folds.
  // Their length, direction and polarity vary so the result reads as handled
  // paper, never a repeated crack or Voronoi texture.
  const secondaryCount = Math.round(
    material
      ? clamp(areaInCells * 0.2, 7, 24)
      : clamp(areaInCells * 1.15, 18, 92),
  );
  for (let creaseIndex = 0; creaseIndex < secondaryCount; creaseIndex += 1) {
    let point: CrumplePoint = {
      x: random() * (width - 1),
      y: random() * (height - 1),
    };
    let angle = random() * Math.PI * 2;
    const segmentCount = 1 + Math.floor(random() * 3);
    const totalLength = cellSize * (0.16 + random() * 0.52);
    const segmentLength = totalLength / segmentCount;
    const polarity = random() < 0.5 ? -1 : 1;
    const strength = (0.2 + random() * 0.42) * (material ? 0.38 : 1);
    const creaseWidth = clamp(cellSize * (0.012 + random() * 0.018), 0.42, 1.8);

    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      angle += (random() - 0.5) * 0.9;
      const next = {
        x: clamp(point.x + Math.cos(angle) * segmentLength, 0, width - 1),
        y: clamp(point.y + Math.sin(angle) * segmentLength, 0, height - 1),
      };
      paintCrumpleSegment(
        data,
        width,
        height,
        point,
        next,
        creaseWidth,
        strength,
        polarity,
        segmentIndex === 0,
        segmentIndex === segmentCount - 1,
      );
      point = next;
    }
  }

  for (let index = 0; index < data.length; index += 1) {
    data[index] = clamp(data[index], -1, 1);
  }

  return { data, width, height, sourceWidth, sourceHeight };
}

function sampleCrumpleRelief(field: CrumpleReliefField, x: number, y: number): number {
  const sampleX =
    field.sourceWidth <= 1 ? 0 : (x / (field.sourceWidth - 1)) * (field.width - 1);
  const sampleY =
    field.sourceHeight <= 1 ? 0 : (y / (field.sourceHeight - 1)) * (field.height - 1);
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const x1 = Math.min(field.width - 1, x0 + 1);
  const y1 = Math.min(field.height - 1, y0 + 1);
  const amountX = sampleX - x0;
  const amountY = sampleY - y0;
  const top =
    field.data[y0 * field.width + x0] * (1 - amountX) +
    field.data[y0 * field.width + x1] * amountX;
  const bottom =
    field.data[y1 * field.width + x0] * (1 - amountX) +
    field.data[y1 * field.width + x1] * amountX;
  return top * (1 - amountY) + bottom * amountY;
}

function shadeCrumpledChannel(channel: number, light: number, strength: number): number {
  const shapedLight = Math.sign(light) * Math.pow(Math.abs(light), 0.78);
  if (light >= 0) {
    return channel + (255 - channel) * shapedLight * strength * 0.68;
  }
  return channel * (1 + shapedLight * strength * 0.78);
}

/**
 * Applies crumpled-paper relief independently to image and border pixels.
 * Alpha is copied verbatim, so the procedural surface can never introduce a
 * rectangular background around a cutout.
 */
export function createLayeredCrumpleReliefData(
  rgba: Uint8ClampedArray | Uint8Array,
  layers: PaperLayerMasks,
  imageFilter: boolean | OldNewspaperFilterOptions | ResolvedOldNewspaperFilterOptions,
  borderFilter: boolean | OldNewspaperFilterOptions | ResolvedOldNewspaperFilterOptions,
  seed = DEFAULT_RENDER_OPTIONS.seed,
  material: CrumpleMaterialMap | null = null,
): Uint8ClampedArray {
  assertArrayLength(rgba, layers.width, layers.height, 4);
  assertArrayLength(layers.imageMask, layers.width, layers.height, 1);
  assertArrayLength(layers.borderMask, layers.width, layers.height, 1);
  const resolvedImage = resolveOldFilter(imageFilter);
  const resolvedBorder = resolveOldFilter(borderFilter);
  const output = new Uint8ClampedArray(rgba);
  const fields = new Map<number, CrumpleReliefField>();

  const fieldFor = (scale: number): CrumpleReliefField => {
    const normalizedScale = Math.round(scale * 100) / 100;
    const existing = fields.get(normalizedScale);
    if (existing) return existing;
    const field = createCrumpleReliefField(
      layers.width,
      layers.height,
      normalizedScale,
      seed + 0x35af,
      material,
    );
    fields.set(normalizedScale, field);
    return field;
  };

  for (let y = 0; y < layers.height; y += 1) {
    for (let x = 0; x < layers.width; x += 1) {
      const pixelIndex = y * layers.width + x;
      const filter =
        layers.imageMask[pixelIndex] > 0
          ? resolvedImage
          : layers.borderMask[pixelIndex] > 0
            ? resolvedBorder
            : null;
      if (
        !filter ||
        !hasCrumpleRelief(filter)
      ) {
        continue;
      }

      const rgbaIndex = pixelIndex * 4;
      if (output[rgbaIndex + 3] === 0) continue;
      const light = sampleCrumpleRelief(fieldFor(filter.crumpleScale), x, y);
      output[rgbaIndex] = shadeCrumpledChannel(output[rgbaIndex], light, filter.crumpleStrength);
      output[rgbaIndex + 1] = shadeCrumpledChannel(
        output[rgbaIndex + 1],
        light,
        filter.crumpleStrength,
      );
      output[rgbaIndex + 2] = shadeCrumpledChannel(
        output[rgbaIndex + 2],
        light,
        filter.crumpleStrength,
      );
    }
  }

  return output;
}

export function getSourceDimensions(source: CanvasImageSource): PixelSize {
  const candidate = source as unknown as {
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
    width?: number;
    height?: number;
  };
  const width =
    positiveInteger(candidate.naturalWidth) ??
    positiveInteger(candidate.videoWidth) ??
    positiveInteger(candidate.displayWidth) ??
    positiveInteger(candidate.width);
  const height =
    positiveInteger(candidate.naturalHeight) ??
    positiveInteger(candidate.videoHeight) ??
    positiveInteger(candidate.displayHeight) ??
    positiveInteger(candidate.height);

  if (width === undefined || height === undefined) {
    throw new TypeError("The image source has no usable intrinsic width and height.");
  }
  if (!Number.isSafeInteger(width * height)) {
    throw new RangeError(`Invalid raster dimensions: ${width} × ${height}`);
  }
  return { width, height };
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error("renderNewspaper requires a browser document and the Canvas 2D API.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement, readFrequently = false): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", readFrequently ? { willReadFrequently: true } : undefined);
  if (!context) throw new Error("Canvas 2D is unavailable in this browser.");
  return context;
}

function imageDataFromPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ImageData {
  // TypeScript 5.7+ distinguishes ArrayBuffer from SharedArrayBuffer-backed
  // typed arrays, while ImageData only accepts the former in the DOM typings.
  const browserPixels = new Uint8ClampedArray(pixels.length);
  browserPixels.set(pixels);
  return new ImageData(browserPixels, width, height);
}

function extractAlpha(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const alpha = new Uint8Array(width * height);
  for (let sourceIndex = 3, targetIndex = 0; targetIndex < alpha.length; sourceIndex += 4) {
    alpha[targetIndex] = rgba[sourceIndex];
    targetIndex += 1;
  }
  return alpha;
}

interface ShadowMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function shadowMargins(shadow: ResolvedShadowOptions): ShadowMargins {
  if (!shadow.enabled || shadow.opacity === 0) return { left: 0, right: 0, top: 0, bottom: 0 };
  const spread = Math.ceil(shadow.blur * 2 + 2);
  return {
    left: Math.max(0, spread - Math.floor(shadow.offsetX)),
    right: Math.max(0, spread + Math.ceil(shadow.offsetX)),
    top: Math.max(0, spread - Math.floor(shadow.offsetY)),
    bottom: Math.max(0, spread + Math.ceil(shadow.offsetY)),
  };
}

function rgbaColor(color: string, opacity: number): string {
  const parsed = parseCssColor(color, "#000000");
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${clamp(opacity, 0, 1)})`;
}

/**
 * Renders a high-resolution transparent PNG-ready newspaper cutout.
 *
 * The promise-based API is convenient for debounced React effects today and
 * leaves room for moving the same pure processing stages into a Worker later.
 */
export async function renderNewspaper(
  source: CanvasImageSource,
  options: NewspaperRenderOptions = {},
): Promise<RenderResult> {
  const resolved = resolveRenderOptions(options);
  const intrinsicSourceSize = getSourceDimensions(source);
  const sourceSize = fitDimensionsToPixelBudget(
    intrinsicSourceSize.width,
    intrinsicSourceSize.height,
  );
  assertRasterDimensions(sourceSize.width, sourceSize.height);
  const sourceCanvas = makeCanvas(sourceSize.width, sourceSize.height);
  const sourceContext = context2d(sourceCanvas, true);

  try {
    sourceContext.drawImage(source, 0, 0, sourceSize.width, sourceSize.height);
  } catch (error) {
    throw new Error("The selected image could not be drawn to a canvas.", { cause: error });
  }

  let fullImageData: ImageData;
  try {
    fullImageData = sourceContext.getImageData(0, 0, sourceSize.width, sourceSize.height);
  } catch (error) {
    throw new Error(
      "The image pixels could not be read. If the image came from a URL, load it with CORS enabled.",
      { cause: error },
    );
  }

  if (resolved.backgroundRemoval.enabled) {
    const removed = removeBackgroundData(
      fullImageData.data,
      sourceSize.width,
      sourceSize.height,
      resolved.backgroundRemoval,
    );
    fullImageData = imageDataFromPixels(removed.data, sourceSize.width, sourceSize.height);
    sourceContext.clearRect(0, 0, sourceSize.width, sourceSize.height);
    sourceContext.putImageData(fullImageData, 0, 0);
  }

  const originalAlphaBounds = computeMeaningfulAlphaBounds(
    fullImageData.data,
    sourceSize.width,
    sourceSize.height,
    resolved.alphaThreshold,
  );
  if (!originalAlphaBounds) {
    throw new Error("The selected image is fully transparent.");
  }

  const sourceBounds: PixelBounds = resolved.tightTrim
    ? expandPixelBounds(originalAlphaBounds, 2, sourceSize.width, sourceSize.height)
    : { x: 0, y: 0, width: sourceSize.width, height: sourceSize.height };
  const croppedImageData = sourceContext.getImageData(
    sourceBounds.x,
    sourceBounds.y,
    sourceBounds.width,
    sourceBounds.height,
  );
  const croppedAlpha = extractAlpha(
    croppedImageData.data,
    sourceBounds.width,
    sourceBounds.height,
  );
  // Tight mode grows paper around the dominant subject silhouette. Loose mode
  // intentionally treats the complete source canvas as an opaque sheet, so its
  // transparent padding becomes a visible rectangular paper backing.
  const sourceAlpha = resolved.tightTrim
    ? croppedAlpha
    : new Uint8Array(sourceBounds.width * sourceBounds.height).fill(255);
  const paperMask = generatePaperMask(sourceAlpha, sourceBounds.width, sourceBounds.height, {
    borderWidth: resolved.borderWidth,
    roughness: resolved.roughness,
    seed: resolved.seed,
    alphaThreshold: resolved.alphaThreshold,
  });
  const maskBounds = computeMaskBounds(paperMask.data, paperMask.width, paperMask.height);
  if (!maskBounds) throw new Error("The paper mask is unexpectedly empty.");

  const layerMasks = splitPaperLayerMasks(
    croppedAlpha,
    sourceBounds.width,
    sourceBounds.height,
    paperMask,
    resolved.alphaThreshold,
  );
  const paperPixels = createLayeredPaperTextureData(
    layerMasks,
    paperMask.data,
    resolved.imagePaperColor,
    resolved.borderPaperColor,
    resolved.texture,
    resolved.seed,
  );
  const layerCanvas = makeCanvas(paperMask.width, paperMask.height);
  const layerContext = context2d(layerCanvas);
  layerContext.putImageData(
    imageDataFromPixels(paperPixels, paperMask.width, paperMask.height),
    0,
    0,
  );

  if (resolved.borderFilter.enabled && filterInkAmount(resolved.borderFilter) > 0) {
    const borderInkPixels = createBorderNewspaperInkData(
      layerMasks.borderMask,
      paperMask.width,
      paperMask.height,
      resolved.borderFilter,
      resolved.seed + 0x61c9,
    );
    const borderInkCanvas = makeCanvas(paperMask.width, paperMask.height);
    context2d(borderInkCanvas).putImageData(
      imageDataFromPixels(borderInkPixels, paperMask.width, paperMask.height),
      0,
      0,
    );
    layerContext.drawImage(borderInkCanvas, 0, 0);
  }

  const croppedCanvas = makeCanvas(sourceBounds.width, sourceBounds.height);
  context2d(croppedCanvas).putImageData(croppedImageData, 0, 0);
  const contentX = paperMask.sourceOffsetX;
  const contentY = paperMask.sourceOffsetY;

  const imageInkAmount = filterInkAmount(resolved.oldFilter);
  if (!resolved.oldFilter.enabled || imageInkAmount < 1) {
    layerContext.save();
    layerContext.globalAlpha = resolved.oldFilter.enabled
      ? 1 - imageInkAmount
      : 1;
    layerContext.drawImage(croppedCanvas, contentX, contentY);
    layerContext.restore();
  }

  if (resolved.oldFilter.enabled && imageInkAmount > 0) {
    const inkPixels = createOldNewspaperInkData(
      croppedImageData.data,
      sourceBounds.width,
      sourceBounds.height,
      resolved.oldFilter,
    );
    const inkCanvas = makeCanvas(sourceBounds.width, sourceBounds.height);
    context2d(inkCanvas).putImageData(
      imageDataFromPixels(inkPixels, sourceBounds.width, sourceBounds.height),
      0,
      0,
    );
    layerContext.save();
    layerContext.globalAlpha = imageInkAmount;
    layerContext.drawImage(inkCanvas, contentX, contentY);
    layerContext.restore();
  }

  if (
    hasCrumpleRelief(resolved.oldFilter) || hasCrumpleRelief(resolved.borderFilter)
  ) {
    const crumpleMaterial = await loadCrumpleMaterialMap();
    const composited = layerContext.getImageData(0, 0, paperMask.width, paperMask.height);
    const relieved = createLayeredCrumpleReliefData(
      composited.data,
      layerMasks,
      resolved.oldFilter,
      resolved.borderFilter,
      resolved.seed,
      crumpleMaterial,
    );
    layerContext.putImageData(
      imageDataFromPixels(relieved, paperMask.width, paperMask.height),
      0,
      0,
    );
  }

  const margins = shadowMargins(resolved.shadow);
  const outputWidth = maskBounds.width + margins.left + margins.right;
  const outputHeight = maskBounds.height + margins.top + margins.bottom;
  assertRasterDimensions(outputWidth, outputHeight);
  const canvas = makeCanvas(outputWidth, outputHeight);
  const outputContext = context2d(canvas);

  if (resolved.shadow.enabled && resolved.shadow.opacity > 0) {
    outputContext.shadowColor = rgbaColor(resolved.shadow.color, resolved.shadow.opacity);
    outputContext.shadowBlur = resolved.shadow.blur;
    outputContext.shadowOffsetX = resolved.shadow.offsetX;
    outputContext.shadowOffsetY = resolved.shadow.offsetY;
  }
  outputContext.drawImage(
    layerCanvas,
    maskBounds.x,
    maskBounds.y,
    maskBounds.width,
    maskBounds.height,
    margins.left,
    margins.top,
    maskBounds.width,
    maskBounds.height,
  );

  const contentBounds: PixelBounds = {
    x: margins.left + contentX - maskBounds.x,
    y: margins.top + contentY - maskBounds.y,
    width: sourceBounds.width,
    height: sourceBounds.height,
  };

  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
    contentBounds,
    paperBounds: {
      x: margins.left,
      y: margins.top,
      width: maskBounds.width,
      height: maskBounds.height,
    },
    sourceBounds: { ...sourceBounds },
    originalAlphaBounds: { ...originalAlphaBounds },
    options: resolved,
  };
}

/** PNG helper used by both clipboard and save/download UI actions. */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`The browser could not encode the canvas as ${type}.`));
      },
      type,
      quality,
    );
  });
}
