/**
 * Dependency-free, browser-side background removal for flat studio backdrops.
 *
 * The remover deliberately only follows background-like pixels that can be
 * reached from the perimeter. This is the important distinction from a plain
 * color-key: a white logo, eye highlight, or other enclosed area is preserved.
 */

export type BackgroundSampleMode = "auto" | "white" | "green";

export interface BackgroundRemovalOptions {
  enabled?: boolean;
  sampleMode?: BackgroundSampleMode;
  /** 0–1. Higher values accept a wider range around the sampled backdrop. */
  tolerance?: number;
  /** 0–1. Feathering applied around the accepted color range. */
  edgeSoftness?: number;
  /** 0–1. Removes white/green contamination from foreground edge pixels. */
  spillCleanup?: number;
}

/** Convenience input used by renderer APIs: a boolean only toggles removal. */
export type BackgroundRemovalInput = boolean | BackgroundRemovalOptions;

export interface ResolvedBackgroundRemovalOptions {
  enabled: boolean;
  sampleMode: BackgroundSampleMode;
  tolerance: number;
  edgeSoftness: number;
  spillCleanup: number;
}

export interface BackgroundColor {
  r: number;
  g: number;
  b: number;
}

export type DetectedBackgroundKind = "white" | "green" | "color";

export interface BorderBackgroundDetection {
  /** Robust median color of the dominant perimeter cluster. */
  color: BackgroundColor;
  kind: DetectedBackgroundKind;
  requestedMode: BackgroundSampleMode;
  /** 0–1 estimate based on perimeter coverage and cluster compactness. */
  confidence: number;
  /** Number of positions inspected in the perimeter band, including transparent ones. */
  perimeterPositions: number;
  perimeterSamples: number;
  matchingSamples: number;
}

export interface BackgroundRemovalResult {
  /** A new RGBA buffer. The input is never mutated. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
  options: ResolvedBackgroundRemovalOptions;
  /** Null when removal was disabled. */
  detection: BorderBackgroundDetection | null;
  /** 0–255 removal matte, one byte per pixel. */
  matte: Uint8Array;
  affectedPixels: number;
  removedPixels: number;
  softenedPixels: number;
}

export const DEFAULT_BACKGROUND_REMOVAL_OPTIONS: Readonly<ResolvedBackgroundRemovalOptions> =
  Object.freeze({
    enabled: false,
    sampleMode: "auto",
    tolerance: 0.32,
    edgeSoftness: 0.25,
    spillCleanup: 0.65,
  });

const MAX_PIXELS = 8_000_000;
const DETECTION_RADIUS = 0.105;
// Auto mode should only act when one compact color genuinely dominates the
// perimeter. Below this floor, the edge is more likely to be foreground or a
// natural scene than a removable studio backdrop.
const AUTO_DETECTION_CONFIDENCE_FLOOR = 0.45;
const SAMPLE_MODES = new Set<BackgroundSampleMode>(["auto", "white", "green"]);

interface PerimeterSample extends BackgroundColor {
  alpha: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampUnit(value: unknown, fallback: number): number {
  return clamp(finiteOr(value, fallback), 0, 1);
}

function normalizeSampleMode(value: unknown): BackgroundSampleMode {
  return typeof value === "string" && SAMPLE_MODES.has(value as BackgroundSampleMode)
    ? (value as BackgroundSampleMode)
    : DEFAULT_BACKGROUND_REMOVAL_OPTIONS.sampleMode;
}

export function resolveBackgroundRemovalOptions(
  input: BackgroundRemovalInput = {},
): ResolvedBackgroundRemovalOptions {
  const candidate = typeof input === "boolean" ? { enabled: input } : input;
  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : DEFAULT_BACKGROUND_REMOVAL_OPTIONS.enabled,
    sampleMode: normalizeSampleMode(candidate.sampleMode),
    tolerance: clampUnit(candidate.tolerance, DEFAULT_BACKGROUND_REMOVAL_OPTIONS.tolerance),
    edgeSoftness: clampUnit(
      candidate.edgeSoftness,
      DEFAULT_BACKGROUND_REMOVAL_OPTIONS.edgeSoftness,
    ),
    spillCleanup: clampUnit(
      candidate.spillCleanup,
      DEFAULT_BACKGROUND_REMOVAL_OPTIONS.spillCleanup,
    ),
  };
}

function assertRaster(
  data: ArrayLike<number>,
  width: number,
  height: number,
): number {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`Invalid raster dimensions: ${width} × ${height}`);
  }

  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > MAX_PIXELS) {
    throw new RangeError(
      `Image is too large to process safely (${width} × ${height}); ` +
        `the limit is ${MAX_PIXELS.toLocaleString()} pixels.`,
    );
  }

  if (data == null || data.length !== pixels * 4) {
    throw new RangeError(
      `Expected ${pixels * 4} RGBA values for ${width} × ${height}, ` +
        `received ${data?.length ?? 0}.`,
    );
  }

  return pixels;
}

/** Weighted RGB distance normalized to 0–1. */
function colorDistance(
  r: number,
  g: number,
  b: number,
  target: BackgroundColor,
): number {
  const red = r - target.r;
  const green = g - target.g;
  const blue = b - target.b;
  return Math.sqrt(0.299 * red * red + 0.587 * green * green + 0.114 * blue * blue) / 255;
}

function collectPerimeterSamples(
  data: ArrayLike<number>,
  width: number,
  height: number,
): { samples: PerimeterSample[]; positions: number } {
  // Sampling a shallow band is more stable than relying on a single row of
  // potentially antialiased or compressed pixels, while remaining perimeter-led.
  const band = Math.min(3, Math.max(1, Math.floor(Math.min(width, height) / 80) + 1));
  const samples: PerimeterSample[] = [];
  let positions = 0;

  const append = (x: number, y: number): void => {
    positions += 1;
    const offset = (y * width + x) * 4;
    const alpha = Number(data[offset + 3]);
    // Fully transparent RGB is unspecified and must not bias detection.
    if (alpha <= 8) return;
    samples.push({
      r: Number(data[offset]),
      g: Number(data[offset + 1]),
      b: Number(data[offset + 2]),
      alpha,
    });
  };

  for (let y = 0; y < band; y += 1) {
    for (let x = 0; x < width; x += 1) append(x, y);
  }
  for (let y = Math.max(band, height - band); y < height; y += 1) {
    for (let x = 0; x < width; x += 1) append(x, y);
  }
  for (let y = band; y < height - band; y += 1) {
    for (let x = 0; x < band; x += 1) append(x, y);
    for (let x = Math.max(band, width - band); x < width; x += 1) append(x, y);
  }

  return { samples, positions };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  values.sort((first, second) => first - second);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

function medianColor(samples: PerimeterSample[]): BackgroundColor {
  return {
    r: Math.round(median(samples.map((sample) => sample.r))),
    g: Math.round(median(samples.map((sample) => sample.g))),
    b: Math.round(median(samples.map((sample) => sample.b))),
  };
}

function dominantCluster(samples: PerimeterSample[]): BackgroundColor {
  if (samples.length === 0) return { r: 255, g: 255, b: 255 };

  // Coarse bins find the mode without letting a few foreground pixels touching
  // the frame pull the result away from a uniform backdrop.
  const bins = new Map<string, PerimeterSample[]>();
  for (const sample of samples) {
    const key = `${sample.r >> 5}:${sample.g >> 5}:${sample.b >> 5}`;
    const bin = bins.get(key);
    if (bin) bin.push(sample);
    else bins.set(key, [sample]);
  }

  let winner: PerimeterSample[] = [];
  for (const bin of bins.values()) {
    if (bin.length > winner.length) winner = bin;
  }

  let center = medianColor(winner);
  // Pull adjacent quantization bins back into the cluster, then use a median
  // so JPEG noise and isolated edge pixels do not skew the sampled color.
  for (let pass = 0; pass < 2; pass += 1) {
    const support = samples.filter(
      (sample) => colorDistance(sample.r, sample.g, sample.b, center) <= DETECTION_RADIUS,
    );
    if (support.length > 0) center = medianColor(support);
  }
  return center;
}

function detectedKind(color: BackgroundColor): DetectedBackgroundKind {
  const maximum = Math.max(color.r, color.g, color.b);
  const minimum = Math.min(color.r, color.g, color.b);
  if (minimum >= 210 && maximum - minimum <= 30) return "white";
  if (color.g >= color.r + 34 && color.g >= color.b + 34 && color.g >= 105) return "green";
  return "color";
}

function greenCluster(samples: PerimeterSample[]): BackgroundColor {
  const greenSamples = samples.filter(
    (sample) => sample.g >= sample.r + 24 && sample.g >= sample.b + 24 && sample.g >= 90,
  );
  return greenSamples.length > 0 ? dominantCluster(greenSamples) : { r: 0, g: 255, b: 0 };
}

export function detectBorderBackground(
  data: ArrayLike<number>,
  width: number,
  height: number,
  sampleMode: BackgroundSampleMode = "auto",
): BorderBackgroundDetection {
  assertRaster(data, width, height);
  const requestedMode = normalizeSampleMode(sampleMode);
  const perimeter = collectPerimeterSamples(data, width, height);
  const { samples } = perimeter;

  let color: BackgroundColor;
  if (requestedMode === "white") color = { r: 255, g: 255, b: 255 };
  else if (requestedMode === "green") color = greenCluster(samples);
  else color = dominantCluster(samples);

  const support = samples.filter(
    (sample) => colorDistance(sample.r, sample.g, sample.b, color) <= DETECTION_RADIUS,
  );
  const averageDistance =
    support.length === 0
      ? DETECTION_RADIUS
      : support.reduce(
          (total, sample) => total + colorDistance(sample.r, sample.g, sample.b, color),
          0,
        ) / support.length;
  const coverage = samples.length === 0 ? 0 : support.length / samples.length;
  const compactness = clamp(1 - averageDistance / DETECTION_RADIUS, 0, 1);

  return {
    color,
    kind:
      requestedMode === "white"
        ? "white"
        : requestedMode === "green"
          ? "green"
          : detectedKind(color),
    requestedMode,
    confidence: clamp(coverage * (0.75 + compactness * 0.25), 0, 1),
    perimeterPositions: perimeter.positions,
    perimeterSamples: samples.length,
    matchingSamples: support.length,
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function colorRange(options: ResolvedBackgroundRemovalOptions): {
  inner: number;
  outer: number;
} {
  // The control is perceptual rather than a raw 255-channel percentage. Even
  // at maximum it remains conservative enough for portrait foreground colors.
  const base = 0.006 + options.tolerance * 0.32;
  if (options.edgeSoftness === 0) return { inner: base, outer: base };
  const feather = options.edgeSoftness * (0.02 + base * 0.45);
  return {
    inner: Math.max(0, base - feather * 0.35),
    outer: Math.min(1, base + feather),
  };
}

function removalAmount(
  data: ArrayLike<number>,
  pixel: number,
  background: BackgroundColor,
  inner: number,
  outer: number,
): number {
  const offset = pixel * 4;
  // Transparent pixels are already removed. More importantly, treating them
  // as traversable background could let a guessed color flood into isolated
  // opaque artwork on an otherwise-transparent PNG.
  if (Number(data[offset + 3]) === 0) return 0;
  const distance = colorDistance(
    Number(data[offset]),
    Number(data[offset + 1]),
    Number(data[offset + 2]),
    background,
  );
  if (inner === outer) return distance <= inner ? 1 : 0;
  if (distance <= inner) return 1;
  if (distance >= outer) return 0;
  return 1 - smoothstep(inner, outer, distance);
}

function buildConnectedMatte(
  data: ArrayLike<number>,
  width: number,
  height: number,
  background: BackgroundColor,
  inner: number,
  outer: number,
): Uint8Array {
  const pixels = width * height;
  const matte = new Uint8Array(pixels);
  const visited = new Uint8Array(pixels);
  const queue = new Uint32Array(pixels);
  let head = 0;
  let tail = 0;

  const visit = (pixel: number): void => {
    if (visited[pixel] !== 0) return;
    visited[pixel] = 1;
    const amount = removalAmount(data, pixel, background, inner, outer);
    if (amount <= 0) return;
    matte[pixel] = Math.round(amount * 255);
    queue[tail] = pixel;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    visit(x);
    if (height > 1) visit((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    visit(y * width);
    if (width > 1) visit(y * width + width - 1);
  }

  // Four-way connectivity avoids leaking diagonally through two foreground
  // pixels that merely touch at their corners.
  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) visit(pixel - 1);
    if (x + 1 < width) visit(pixel + 1);
    if (y > 0) visit(pixel - width);
    if (y + 1 < height) visit(pixel + width);
  }

  return matte;
}

function maximumNeighborMatte(
  matte: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  let maximum = matte[y * width + x];
  const fromY = Math.max(0, y - 1);
  const toY = Math.min(height - 1, y + 1);
  const fromX = Math.max(0, x - 1);
  const toX = Math.min(width - 1, x + 1);
  for (let neighborY = fromY; neighborY <= toY; neighborY += 1) {
    for (let neighborX = fromX; neighborX <= toX; neighborX += 1) {
      maximum = Math.max(maximum, matte[neighborY * width + neighborX]);
    }
  }
  return maximum / 255;
}

function cleanSpill(
  output: Uint8ClampedArray,
  original: ArrayLike<number>,
  matte: Uint8Array,
  width: number,
  height: number,
  detection: BorderBackgroundDetection,
  outerRange: number,
  strength: number,
): void {
  if (strength <= 0) return;

  const isGreen = detection.kind === "green";
  const cleanupReach = outerRange + (isGreen ? 0.3 : 0.2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      if (output[offset + 3] === 0) continue;

      const proximity = maximumNeighborMatte(matte, width, height, x, y);
      if (proximity <= 0) continue;

      const ownRemoval = matte[pixel] / 255;
      const distance = colorDistance(
        Number(original[offset]),
        Number(original[offset + 1]),
        Number(original[offset + 2]),
        detection.color,
      );
      const affinity = clamp(1 - distance / cleanupReach, 0, 1);
      const contamination =
        ownRemoval > 0
          ? Math.min(0.92, ownRemoval)
          : Math.min(0.38, proximity * affinity * (isGreen ? 0.35 : 0.22));
      if (contamination <= 0) continue;

      const denominator = 1 - contamination;
      for (let channel = 0; channel < 3; channel += 1) {
        const source = Number(original[offset + channel]);
        const backgroundChannel =
          channel === 0
            ? detection.color.r
            : channel === 1
              ? detection.color.g
              : detection.color.b;
        const unmixed = clamp(
          (source - backgroundChannel * contamination) / denominator,
          0,
          255,
        );
        output[offset + channel] = Math.round(source + (unmixed - source) * strength);
      }

      // Chroma-key footage often has a narrow green rim outside the actual
      // key range. Suppress only green in pixels immediately beside the matte.
      if (isGreen) {
        const red = output[offset];
        const green = output[offset + 1];
        const blue = output[offset + 2];
        const neutralGreen = Math.max(red, blue);
        const excess = Math.max(0, green - neutralGreen);
        const chroma = clamp((excess - 3) / 96, 0, 1);
        output[offset + 1] = Math.round(
          green - excess * strength * proximity * chroma * 0.9,
        );
      }
    }
  }
}

export function removeBackgroundData(
  data: ArrayLike<number>,
  width: number,
  height: number,
  input: BackgroundRemovalInput = {},
): BackgroundRemovalResult {
  const pixels = assertRaster(data, width, height);
  const options = resolveBackgroundRemovalOptions(input);
  const output = new Uint8ClampedArray(data);

  if (!options.enabled) {
    return {
      data: output,
      width,
      height,
      options,
      detection: null,
      matte: new Uint8Array(pixels),
      affectedPixels: 0,
      removedPixels: 0,
      softenedPixels: 0,
    };
  }

  const detection = detectBorderBackground(data, width, height, options.sampleMode);
  if (
    options.sampleMode === "auto" &&
    (detection.perimeterSamples === 0 ||
      detection.perimeterSamples / detection.perimeterPositions < 0.75 ||
      detection.confidence < AUTO_DETECTION_CONFIDENCE_FLOOR)
  ) {
    return {
      data: output,
      width,
      height,
      options,
      detection,
      matte: new Uint8Array(pixels),
      affectedPixels: 0,
      removedPixels: 0,
      softenedPixels: 0,
    };
  }

  const range = colorRange(options);
  const matte = buildConnectedMatte(
    data,
    width,
    height,
    detection.color,
    range.inner,
    range.outer,
  );

  let affectedPixels = 0;
  let removedPixels = 0;
  let softenedPixels = 0;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const originalAlpha = Number(data[offset + 3]);
    const keep = 1 - matte[pixel] / 255;
    const alpha = Math.round(originalAlpha * keep);
    output[offset + 3] = alpha;
    if (alpha !== originalAlpha) affectedPixels += 1;
    if (originalAlpha > 0 && alpha === 0) removedPixels += 1;
    else if (alpha > 0 && alpha < originalAlpha) softenedPixels += 1;
  }

  cleanSpill(
    output,
    data,
    matte,
    width,
    height,
    detection,
    range.outer,
    options.spillCleanup,
  );

  return {
    data: output,
    width,
    height,
    options,
    detection,
    matte,
    affectedPixels,
    removedPixels,
    softenedPixels,
  };
}
