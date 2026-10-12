/** Torn-only Canvas renderer extracted from Presscut animationRenderer.ts.
 * See references/presscut-port.md for exact source hashes and containment adaptation.
 */
import type { TornAssemblyFlow, VideoSettings } from "./types";
import { resolveTornTimeline } from "./tornTimeline";
import { hashNoise2D, type PixelBounds } from "./newspaperRenderer";
import { compactTornPaperSchedule, createTornPaperPieces, resolveTornPieceState, type TornPaperPiece } from "./tornPaper";
export interface Point {
  x: number;
  y: number;
}

export interface PreparedAnimationSprite {
  canvas: HTMLCanvasElement;
  /** Bounds used for visual centering; normally the paper bounds without shadow. */
  visibleBounds: PixelBounds;
  /** Optional anatomical registration point in canvas pixels. */
  anchor?: Point;
}

export interface AnimationResources {
  artwork: PreparedAnimationSprite;
  seed: number;
}

export interface SpriteLayout {
  scale: number;
  x: number;
  y: number;
  visibleLeft: number;
  visibleTop: number;
  visibleWidth: number;
  visibleHeight: number;
  centerX: number;
  centerY: number;
}


const TORN_LAYOUT_CACHE_LIMIT = 12;
const TORN_APPEARANCE_CACHE_LIMIT = 2;
const TORN_APPEARANCE_MAX_SIZE = Object.freeze({ width: 1728, height: 972 });
const tornLayoutCache = new Map<string, readonly TornPaperPiece[]>();
const spritePaperColorCache = new WeakMap<HTMLCanvasElement, string>();

interface TornPieceAppearance {
  readonly id: string;
  readonly core: HTMLCanvasElement;
  /** Bright torn stock that lives strictly beneath, and outside, the core. */
  readonly underlay: HTMLCanvasElement;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceToOriginalX: number;
  readonly sourceToOriginalY: number;
  readonly hasContent: boolean;
}

const tornAppearanceCache = new WeakMap<
  HTMLCanvasElement,
  Map<number, ReadonlyMap<string, TornPieceAppearance>>
>();
const tornScheduleCache = new WeakMap<
  HTMLCanvasElement,
  Map<string, readonly TornPaperPiece[]>
>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function layoutSprite(
  sprite: PreparedAnimationSprite,
  centerX: number,
  centerY: number,
  maximumWidth: number,
  maximumHeight: number,
  scaleMultiplier = 1,
): SpriteLayout {
  const bounds = sprite.visibleBounds;
  const scale =
    Math.min(maximumWidth / bounds.width, maximumHeight / bounds.height) * scaleMultiplier;
  const x = centerX - (bounds.x + bounds.width / 2) * scale;
  const y = centerY - (bounds.y + bounds.height / 2) * scale;
  return {
    scale,
    x,
    y,
    visibleLeft: x + bounds.x * scale,
    visibleTop: y + bounds.y * scale,
    visibleWidth: bounds.width * scale,
    visibleHeight: bounds.height * scale,
    centerX,
    centerY,
  };
}

/** Scales normalized torn-piece travel against the complete rendered sprite. */
export function resolveTornPieceTranslation(
  normalizedX: number,
  normalizedY: number,
  renderedWidth: number,
  renderedHeight: number,
): Point {
  const x = Number.isFinite(normalizedX) ? normalizedX : 0;
  const y = Number.isFinite(normalizedY) ? normalizedY : 0;
  const width = Math.max(0, Number.isFinite(renderedWidth) ? renderedWidth : 0);
  const height = Math.max(0, Number.isFinite(renderedHeight) ? renderedHeight : 0);
  return { x: x * width, y: y * height };
}

export interface TornTransformBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface TornRenderLayerPlan {
  readonly movingUnderlays: boolean;
  readonly movingCores: boolean;
  readonly tornSeams: boolean;
  readonly exactSprite: boolean;
}

/**
 * Keeps a rotated/scaled fragment inside the output frame by changing only its
 * translation. The skill adapter also calls this existing helper for direct
 * motion to satisfy the required all-fragments-inside-frame rule.
 */
export function clampTornPieceTranslationToFrame(
  frameWidth: number,
  frameHeight: number,
  pivot: Point,
  bounds: TornTransformBounds,
  translation: Point,
  scale: number,
  rotation: number,
  inset = 0,
  requireContainment = false,
): Point {
  const width = Math.max(0, Number.isFinite(frameWidth) ? frameWidth : 0);
  const height = Math.max(0, Number.isFinite(frameHeight) ? frameHeight : 0);
  const safePivot = {
    x: Number.isFinite(pivot.x) ? pivot.x : width / 2,
    y: Number.isFinite(pivot.y) ? pivot.y : height / 2,
  };
  const safeScale = Math.max(0, Number.isFinite(scale) ? scale : 1);
  const safeRotation = Number.isFinite(rotation) ? rotation : 0;
  const safeInset = clamp(Number.isFinite(inset) ? inset : 0, 0, Math.min(width, height) / 2);
  const cosine = Math.cos(safeRotation);
  const sine = Math.sin(safeRotation);
  const corners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom },
  ].map((point) => {
    const localX = (point.x - safePivot.x) * safeScale;
    const localY = (point.y - safePivot.y) * safeScale;
    return {
      x: safePivot.x + localX * cosine - localY * sine,
      y: safePivot.y + localX * sine + localY * cosine,
    };
  });
  const left = Math.min(...corners.map((point) => point.x));
  const right = Math.max(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const bottom = Math.max(...corners.map((point) => point.y));
  const safeTranslation = {
    x: Number.isFinite(translation.x) ? translation.x : 0,
    y: Number.isFinite(translation.y) ? translation.y : 0,
  };
  const clampAxis = (
    value: number,
    objectStart: number,
    objectEnd: number,
    frameEnd: number,
  ): number => {
    // Identity must always remain legal: a final artwork deliberately aligned
    // close to an edge must not jump inward at the assembly/settle boundary.
    const minimum = Math.min(safeInset - objectStart, 0);
    const maximum = Math.max(frameEnd - safeInset - objectEnd, 0);
    return clamp(value, minimum, maximum);
  };
  const result = {
    x: clampAxis(safeTranslation.x, left, right, width),
    y: clampAxis(safeTranslation.y, top, bottom, height),
  };
  if (!requireContainment) return result;
  // Port adaptation: the website allows identity even when a rotated edge tile
  // extends outside the frame. Constrain only that exceptional overflow, with
  // zero inset so the exact final artwork never moves away from its target.
  return {
    x: clamp(result.x, -left, width - right),
    y: clamp(result.y, -top, height - bottom),
  };
}

/** Declarative pass ordering used by both preview and MOV export. */
export function resolveTornRenderLayerPlan(
  phase: "blank" | "assemble" | "settle" | "hold",
): TornRenderLayerPlan {
  switch (phase) {
    case "assemble":
      return {
        movingUnderlays: true,
        movingCores: true,
        tornSeams: true,
        exactSprite: false,
      };
    case "settle":
      return {
        movingUnderlays: false,
        movingCores: false,
        tornSeams: true,
        exactSprite: true,
      };
    case "hold":
      return {
        movingUnderlays: false,
        movingCores: false,
        tornSeams: false,
        exactSprite: true,
      };
    case "blank":
    default:
      return {
        movingUnderlays: false,
        movingCores: false,
        tornSeams: false,
        exactSprite: false,
      };
  }
}

function drawSprite(
  context: CanvasRenderingContext2D,
  sprite: PreparedAnimationSprite,
  layout: SpriteLayout,
  offsetX = 0,
  offsetY = 0,
  opacity = 1,
  rotation = 0,
): void {
  context.save();
  context.globalAlpha = clamp(opacity, 0, 1);
  context.translate(layout.centerX + offsetX, layout.centerY + offsetY);
  context.rotate(rotation);
  context.drawImage(
    sprite.canvas,
    layout.x - layout.centerX,
    layout.y - layout.centerY,
    sprite.canvas.width * layout.scale,
    sprite.canvas.height * layout.scale,
  );
  context.restore();
}

function spritePaperColor(sprite: PreparedAnimationSprite): string {
  const cached = spritePaperColorCache.get(sprite.canvas);
  if (cached) return cached;

  const fallback = "#dfcfb0";
  const remember = (color: string) => {
    spritePaperColorCache.set(sprite.canvas, color);
    return color;
  };
  try {
    const sample = document.createElement("canvas");
    sample.width = 28;
    sample.height = 28;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) return remember(fallback);
    const bounds = sprite.visibleBounds;
    context.drawImage(
      sprite.canvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      sample.width,
      sample.height,
    );
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    const colors: Array<{ red: number; green: number; blue: number; light: number }> = [];
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 180) continue;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const light = red * 0.299 + green * 0.587 + blue * 0.114;
      if (light > 92) colors.push({ red, green, blue, light });
    }
    colors.sort((left, right) => right.light - left.light);
    const selected = colors.slice(0, Math.max(1, Math.ceil(colors.length * 0.42)));
    if (selected.length === 0) return remember(fallback);
    const totals = selected.reduce(
      (sum, color) => ({
        red: sum.red + color.red,
        green: sum.green + color.green,
        blue: sum.blue + color.blue,
      }),
      { red: 0, green: 0, blue: 0 },
    );
    const channel = (value: number) =>
      Math.round(value / selected.length).toString(16).padStart(2, "0");
    const resolved = `#${channel(totals.red)}${channel(totals.green)}${channel(totals.blue)}`;
    return remember(resolved);
  } catch {
    return remember(fallback);
  }
}


function tornPiecesForSeed(
  seed: number,
  flow: TornAssemblyFlow,
): readonly TornPaperPiece[] {
  const normalizedSeed = Math.trunc(seed) >>> 0;
  const cacheKey = `${normalizedSeed}:${flow}`;
  const cached = tornLayoutCache.get(cacheKey);
  if (cached) return cached;
  const pieces = [...createTornPaperPieces({
    seed: normalizedSeed,
    flow,
    rows: 3,
    columns: 4,
    vertexJitter: 0.18,
    edgeRoughness: 0.16,
    edgePoints: 4,
  })].sort((left, right) => left.reveal.order - right.reveal.order);
  if (tornLayoutCache.size >= TORN_LAYOUT_CACHE_LIMIT) {
    const oldestKey = tornLayoutCache.keys().next().value;
    if (oldestKey !== undefined) tornLayoutCache.delete(oldestKey);
  }
  tornLayoutCache.set(cacheKey, pieces);
  return pieces;
}

function traceTornPieceInSource(
  context: CanvasRenderingContext2D,
  piece: TornPaperPiece,
  sourceWidth: number,
  sourceHeight: number,
  offsetX: number,
  offsetY: number,
): void {
  context.beginPath();
  piece.points.forEach((point, index) => {
    const x = point.x * sourceWidth - offsetX;
    const y = point.y * sourceHeight - offsetY;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

function isOuterTornSegment(
  start: TornPaperPiece["points"][number],
  end: TornPaperPiece["points"][number],
): boolean {
  const epsilon = 1e-8;
  return (
    (Math.abs(start.x) <= epsilon && Math.abs(end.x) <= epsilon) ||
    (Math.abs(start.x - 1) <= epsilon && Math.abs(end.x - 1) <= epsilon) ||
    (Math.abs(start.y) <= epsilon && Math.abs(end.y) <= epsilon) ||
    (Math.abs(start.y - 1) <= epsilon && Math.abs(end.y - 1) <= epsilon)
  );
}

function forEachInternalTornSegment(
  piece: TornPaperPiece,
  callback: (
    start: TornPaperPiece["points"][number],
    end: TornPaperPiece["points"][number],
    index: number,
  ) => void,
): void {
  for (let index = 0; index < piece.points.length; index += 1) {
    const start = piece.points[index];
    const end = piece.points[(index + 1) % piece.points.length];
    if (!isOuterTornSegment(start, end)) callback(start, end, index);
  }
}

function exposedFiberColor(sprite: PreparedAnimationSprite): string {
  const match = /^#([0-9a-f]{6})$/i.exec(spritePaperColor(sprite));
  const channels = match
    ? [
        Number.parseInt(match[1].slice(0, 2), 16),
        Number.parseInt(match[1].slice(2, 4), 16),
        Number.parseInt(match[1].slice(4, 6), 16),
      ]
    : [223, 207, 176];
  const white = [255, 253, 246];
  const amount = 0.68;
  const mixed = channels.map((channel, index) =>
    Math.round(channel + (white[index] - channel) * amount),
  );
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function createTornAppearanceSource(
  sprite: PreparedAnimationSprite,
): HTMLCanvasElement {
  const scale = Math.min(
    1,
    TORN_APPEARANCE_MAX_SIZE.width / sprite.canvas.width,
    TORN_APPEARANCE_MAX_SIZE.height / sprite.canvas.height,
  );
  if (scale >= 1) return sprite.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sprite.canvas.width * scale));
  canvas.height = Math.max(1, Math.round(sprite.canvas.height * scale));
  const context = canvas.getContext("2d");
  if (context) {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(sprite.canvas, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

function containsOpaquePaper(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  const pixels = context.getImageData(0, 0, width, height).data;
  // The strongest shadow preset peaks below half alpha; this threshold keeps
  // shadow-only grid cells from consuming a visible reveal slot.
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] >= 128) return true;
  }
  return false;
}

function maskToStrongArtworkAlpha(
  target: CanvasRenderingContext2D,
  appearanceSource: HTMLCanvasElement,
  sourceX: number,
  sourceY: number,
  width: number,
  height: number,
): void {
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const maskContext = mask.getContext("2d", { willReadFrequently: true });
  if (!maskContext) {
    target.clearRect(0, 0, width, height);
    return;
  }
  maskContext.drawImage(appearanceSource, -sourceX, -sourceY);
  const image = maskContext.getImageData(0, 0, width, height);
  for (let index = 0; index < image.data.length; index += 4) {
    const opaquePaper = image.data[index + 3] >= 128;
    image.data[index] = 255;
    image.data[index + 1] = 255;
    image.data[index + 2] = 255;
    image.data[index + 3] = opaquePaper ? 255 : 0;
  }
  maskContext.putImageData(image, 0, 0);
  target.globalCompositeOperation = "destination-in";
  target.drawImage(mask, 0, 0);
}

function drawIrregularTornUnderlay(
  context: CanvasRenderingContext2D,
  piece: TornPaperPiece,
  sourceWidth: number,
  sourceHeight: number,
  offsetX: number,
  offsetY: number,
  pulpWidth: number,
  color: string,
  seed: number,
): void {
  context.lineCap = "round";
  context.lineJoin = "round";
  forEachInternalTornSegment(piece, (start, end, segmentIndex) => {
    const startX = start.x * sourceWidth - offsetX;
    const startY = start.y * sourceHeight - offsetY;
    const endX = end.x * sourceWidth - offsetX;
    const endY = end.y * sourceHeight - offsetY;
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) return;

    const tangentX = dx / length;
    const tangentY = dy / length;
    const midpointX = (startX + endX) / 2;
    const midpointY = (startY + endY) / 2;
    const towardOutsideX =
      midpointX - (piece.center.x * sourceWidth - offsetX);
    const towardOutsideY =
      midpointY - (piece.center.y * sourceHeight - offsetY);
    let outwardX = -tangentY;
    let outwardY = tangentX;
    if (outwardX * towardOutsideX + outwardY * towardOutsideY < 0) {
      outwardX *= -1;
      outwardY *= -1;
    }

    const sampleCount = Math.max(2, Math.ceil(length / (pulpWidth * 0.82)));
    const boundary: Point[] = [];
    const outside: Point[] = [];
    const segmentSeed =
      seed + piece.row * 0x1f3d + piece.column * 0x5a91 + segmentIndex * 0x2d7;
    for (let sample = 0; sample <= sampleCount; sample += 1) {
      const baseT = sample / sampleCount;
      const positionNoise = hashNoise2D(sample, segmentIndex + 17, segmentSeed);
      const t =
        sample === 0 || sample === sampleCount
          ? baseT
          : clamp(
              baseT +
                (positionNoise - 0.5) * (0.46 / sampleCount),
              0,
              1,
            );
      const baseX = startX + dx * t;
      const baseY = startY + dy * t;
      const widthNoise = hashNoise2D(sample + 31, segmentIndex + 73, segmentSeed);
      const notchNoise = hashNoise2D(sample + 107, segmentIndex + 11, segmentSeed);
      const tuftNoise = hashNoise2D(sample + 173, segmentIndex + 149, segmentSeed);
      let widthMultiplier = 0.34 + widthNoise * 0.92;
      if (notchNoise < 0.16) widthMultiplier *= 0.18 + notchNoise * 1.9;
      if (tuftNoise > 0.9) widthMultiplier *= 1.35 + (tuftNoise - 0.9) * 4;
      const tangentShift =
        (hashNoise2D(sample + 211, segmentIndex + 37, segmentSeed) - 0.5) *
        pulpWidth *
        0.58;
      boundary.push({ x: baseX, y: baseY });
      outside.push({
        x: baseX + outwardX * pulpWidth * widthMultiplier + tangentX * tangentShift,
        y: baseY + outwardY * pulpWidth * widthMultiplier + tangentY * tangentShift,
      });
    }

    context.beginPath();
    context.moveTo(boundary[0].x, boundary[0].y);
    for (let index = 1; index < boundary.length; index += 1) {
      context.lineTo(boundary[index].x, boundary[index].y);
    }
    for (let index = outside.length - 1; index >= 0; index -= 1) {
      context.lineTo(outside[index].x, outside[index].y);
    }
    context.closePath();
    context.globalAlpha = 0.96;
    context.fillStyle = color;
    context.fill();

    // Occasional short pulls break the silhouette without recreating the long,
    // comb-like fibers that made the old treatment feel decorative.
    for (let sample = 1; sample < outside.length - 1; sample += 1) {
      const pullNoise = hashNoise2D(sample + 257, segmentIndex + 83, segmentSeed);
      if (pullNoise < 0.78) continue;
      const point = outside[sample];
      const pullLength = pulpWidth * (0.18 + (pullNoise - 0.78) * 2.2);
      const side =
        (hashNoise2D(sample + 293, segmentIndex + 197, segmentSeed) - 0.5) *
        pulpWidth *
        0.24;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.lineTo(
        point.x + outwardX * pullLength + tangentX * side,
        point.y + outwardY * pullLength + tangentY * side,
      );
      context.globalAlpha = 0.52 + pullNoise * 0.34;
      context.lineWidth = Math.max(0.55, pulpWidth * 0.09);
      context.strokeStyle = "rgb(255, 253, 246)";
      context.stroke();
    }
  });
}

function createTornPieceAppearance(
  sprite: PreparedAnimationSprite,
  piece: TornPaperPiece,
  seed: number,
  appearanceSource: HTMLCanvasElement,
): TornPieceAppearance {
  const sourceWidth = appearanceSource.width;
  const sourceHeight = appearanceSource.height;
  const shortEdge = Math.min(sourceWidth, sourceHeight);
  const pulpWidth = Math.max(2.2, shortEdge * 0.0062);
  const fringe = Math.ceil(pulpWidth * 2.15);
  const xs = piece.points.map((point) => point.x * sourceWidth);
  const ys = piece.points.map((point) => point.y * sourceHeight);
  const sourceX = Math.max(0, Math.floor(Math.min(...xs) - fringe));
  const sourceY = Math.max(0, Math.floor(Math.min(...ys) - fringe));
  const sourceRight = Math.min(
    sourceWidth,
    Math.ceil(Math.max(...xs) + fringe),
  );
  const sourceBottom = Math.min(
    sourceHeight,
    Math.ceil(Math.max(...ys) + fringe),
  );
  const tileWidth = Math.max(1, sourceRight - sourceX);
  const tileHeight = Math.max(1, sourceBottom - sourceY);
  const fiberColor = exposedFiberColor(sprite);
  const core = document.createElement("canvas");
  core.width = tileWidth;
  core.height = tileHeight;
  const coreContext = core.getContext("2d", { willReadFrequently: true });
  let hasContent = false;
  if (coreContext) {
    coreContext.save();
    traceTornPieceInSource(
      coreContext,
      piece,
      sourceWidth,
      sourceHeight,
      sourceX,
      sourceY,
    );
    coreContext.clip();
    coreContext.drawImage(appearanceSource, -sourceX, -sourceY);
    coreContext.restore();
    hasContent = containsOpaquePaper(coreContext, tileWidth, tileHeight);
  }

  const underlay = document.createElement("canvas");
  underlay.width = tileWidth;
  underlay.height = tileHeight;
  const underlayContext = underlay.getContext("2d");
  if (underlayContext) {
    underlayContext.save();
    drawIrregularTornUnderlay(
      underlayContext,
      piece,
      sourceWidth,
      sourceHeight,
      sourceX,
      sourceY,
      pulpWidth,
      fiberColor,
      seed,
    );

    // Hard-thresholding keeps shadow-only cells and detached transparent
    // rectangles out of a transparent video export.
    underlayContext.globalAlpha = 1;
    maskToStrongArtworkAlpha(
      underlayContext,
      appearanceSource,
      sourceX,
      sourceY,
      tileWidth,
      tileHeight,
    );

    // This is paper beneath the fragment, not white ink painted on its face.
    // Removing the owning polygon also means neighboring cores naturally hide
    // the stock as soon as the fragments reconnect.
    underlayContext.globalCompositeOperation = "destination-out";
    traceTornPieceInSource(
      underlayContext,
      piece,
      sourceWidth,
      sourceHeight,
      sourceX,
      sourceY,
    );
    underlayContext.fillStyle = "#000";
    underlayContext.fill();
    underlayContext.restore();
  }

  return Object.freeze({
    id: piece.id,
    core,
    underlay,
    sourceX,
    sourceY,
    sourceToOriginalX: sprite.canvas.width / sourceWidth,
    sourceToOriginalY: sprite.canvas.height / sourceHeight,
    hasContent,
  });
}

function tornAppearancesForPieces(
  sprite: PreparedAnimationSprite,
  pieces: readonly TornPaperPiece[],
  seed: number,
): ReadonlyMap<string, TornPieceAppearance> {
  const normalizedSeed = Math.trunc(seed) >>> 0;
  let spriteCache = tornAppearanceCache.get(sprite.canvas);
  if (!spriteCache) {
    spriteCache = new Map();
    tornAppearanceCache.set(sprite.canvas, spriteCache);
  }
  const cached = spriteCache.get(normalizedSeed);
  if (cached) return cached;
  const appearanceSource = createTornAppearanceSource(sprite);
  const appearances = pieces.map((piece) =>
    createTornPieceAppearance(
      sprite,
      piece,
      normalizedSeed,
      appearanceSource,
    ),
  );
  const byId = new Map(
    appearances.map((appearance) => [appearance.id, appearance] as const),
  );
  if (spriteCache.size >= TORN_APPEARANCE_CACHE_LIMIT) {
    const oldestKey = spriteCache.keys().next().value;
    if (oldestKey !== undefined) spriteCache.delete(oldestKey);
  }
  spriteCache.set(normalizedSeed, byId);
  return byId;
}

function scheduledTornPieces(
  sprite: PreparedAnimationSprite,
  pieces: readonly TornPaperPiece[],
  appearances: ReadonlyMap<string, TornPieceAppearance>,
  seed: number,
  flow: TornAssemblyFlow,
): readonly TornPaperPiece[] {
  const cacheKey = `${Math.trunc(seed) >>> 0}:${flow}`;
  let spriteCache = tornScheduleCache.get(sprite.canvas);
  if (!spriteCache) {
    spriteCache = new Map();
    tornScheduleCache.set(sprite.canvas, spriteCache);
  }
  const cached = spriteCache.get(cacheKey);
  if (cached) return cached;
  const visibleIds = new Set(
    [...appearances.values()]
      .filter((appearance) => appearance.hasContent)
      .map((appearance) => appearance.id),
  );
  const scheduled = compactTornPaperSchedule(pieces, visibleIds);
  if (spriteCache.size >= TORN_LAYOUT_CACHE_LIMIT) {
    const oldestKey = spriteCache.keys().next().value;
    if (oldestKey !== undefined) spriteCache.delete(oldestKey);
  }
  spriteCache.set(cacheKey, scheduled);
  return scheduled;
}

function drawTornAppearance(
  context: CanvasRenderingContext2D,
  appearance: TornPieceAppearance,
  layout: SpriteLayout,
  layer: "underlay" | "core",
): void {
  const sourceScaleX = layout.scale * appearance.sourceToOriginalX;
  const sourceScaleY = layout.scale * appearance.sourceToOriginalY;
  const x = layout.x + appearance.sourceX * sourceScaleX;
  const y = layout.y + appearance.sourceY * sourceScaleY;
  const width = appearance.core.width * sourceScaleX;
  const height = appearance.core.height * sourceScaleY;
  context.drawImage(
    layer === "core" ? appearance.core : appearance.underlay,
    x,
    y,
    width,
    height,
  );
}

interface TornPieceRenderPlacement {
  readonly piece: TornPaperPiece;
  readonly appearance: TornPieceAppearance;
  readonly visible: boolean;
  readonly opacity: number;
  readonly translation: Point;
  readonly rotation: number;
  readonly scale: number;
  readonly center: Point;
}

function tornAppearanceBounds(
  appearance: TornPieceAppearance,
  layout: SpriteLayout,
): TornTransformBounds {
  const sourceScaleX = layout.scale * appearance.sourceToOriginalX;
  const sourceScaleY = layout.scale * appearance.sourceToOriginalY;
  const left = layout.x + appearance.sourceX * sourceScaleX;
  const top = layout.y + appearance.sourceY * sourceScaleY;
  return {
    left,
    top,
    right: left + appearance.core.width * sourceScaleX,
    bottom: top + appearance.core.height * sourceScaleY,
  };
}

function resolveTornPieceRenderPlacement(
  sprite: PreparedAnimationSprite,
  layout: SpriteLayout,
  piece: TornPaperPiece,
  appearance: TornPieceAppearance,
  assemblyProgress: number,
  motion: VideoSettings["tornMotion"],
  frameWidth: number,
  frameHeight: number,
): TornPieceRenderPlacement {
  const state = resolveTornPieceState(piece, assemblyProgress, motion);
  const renderedWidth = sprite.canvas.width * layout.scale;
  const renderedHeight = sprite.canvas.height * layout.scale;
  const center = {
    x: layout.x + piece.center.x * renderedWidth,
    y: layout.y + piece.center.y * renderedHeight,
  };
  let translation = resolveTornPieceTranslation(
    state.x,
    state.y,
    renderedWidth,
    renderedHeight,
  );
  {
    // Port adaptation: apply Presscut's existing containment helper to both motions.
    translation = clampTornPieceTranslationToFrame(
      frameWidth,
      frameHeight,
      center,
      tornAppearanceBounds(appearance, layout),
      translation,
      state.scale,
      state.rotation,
      Math.max(2, Math.min(frameWidth, frameHeight) * 0.008),
      true,
    );
  }
  return {
    piece,
    appearance,
    visible: state.visible && state.opacity > 0,
    opacity: state.opacity,
    translation,
    rotation: state.rotation,
    scale: state.scale,
    center,
  };
}

function withTornPieceTransform(
  context: CanvasRenderingContext2D,
  placement: TornPieceRenderPlacement,
  draw: () => void,
): void {
  const { center, translation } = placement;
  context.save();
  context.globalAlpha = clamp(placement.opacity, 0, 1);
  context.translate(center.x + translation.x, center.y + translation.y);
  context.rotate(placement.rotation);
  context.scale(placement.scale, placement.scale);
  context.translate(-center.x, -center.y);
  draw();
  context.restore();
}

function drawMovingTornLayer(
  context: CanvasRenderingContext2D,
  placement: TornPieceRenderPlacement,
  layout: SpriteLayout,
  layer: "underlay" | "core",
): void {
  if (!placement.visible) return;
  withTornPieceTransform(context, placement, () => {
    drawTornAppearance(context, placement.appearance, layout, layer);
  });
}

function tornSegmentKey(
  start: TornPaperPiece["points"][number],
  end: TornPaperPiece["points"][number],
): string {
  const pointKey = (point: TornPaperPiece["points"][number]) =>
    `${Math.round(point.x * 1e9)},${Math.round(point.y * 1e9)}`;
  const startKey = pointKey(start);
  const endKey = pointKey(end);
  return startKey < endKey ? `${startKey}:${endKey}` : `${endKey}:${startKey}`;
}

function drawTornSeam(
  context: CanvasRenderingContext2D,
  placement: TornPieceRenderPlacement,
  sprite: PreparedAnimationSprite,
  layout: SpriteLayout,
  seamOpacity: number,
  seenSegments: Set<string>,
): void {
  if (!placement.visible || seamOpacity <= 0) return;
  const renderedWidth = sprite.canvas.width * layout.scale;
  const renderedHeight = sprite.canvas.height * layout.scale;
  withTornPieceTransform(context, placement, () => {
    let hasPath = false;
    context.beginPath();
    forEachInternalTornSegment(placement.piece, (start, end) => {
      const key = tornSegmentKey(start, end);
      if (seenSegments.has(key)) return;
      seenSegments.add(key);
      context.moveTo(
        layout.x + start.x * renderedWidth,
        layout.y + start.y * renderedHeight,
      );
      context.lineTo(
        layout.x + end.x * renderedWidth,
        layout.y + end.y * renderedHeight,
      );
      hasPath = true;
    });
    if (!hasPath) return;
    // source-atop prevents the seam from manufacturing alpha in transparent
    // parts of the source image while retaining an exact two-pixel visual line.
    context.globalCompositeOperation = "source-atop";
    context.globalAlpha = clamp(placement.opacity * seamOpacity, 0, 1);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2 / Math.max(0.001, placement.scale);
    context.strokeStyle = "rgba(38, 31, 24, 0.72)";
    context.stroke();
  });
}

export function drawTornAnimation(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  resources: AnimationResources,
  settings: VideoSettings,
  normalizedTime: number,
  layout: SpriteLayout,
): void {
  const timeline = resolveTornTimeline(normalizedTime);
  if (!timeline.visible) return;
  const plan = resolveTornRenderLayerPlan(timeline.phase);
  if (plan.exactSprite) {
    drawSprite(context, resources.artwork, layout);
  }
  if (!plan.movingUnderlays && !plan.movingCores && !plan.tornSeams) {
    return;
  }

  const rawPieces = tornPiecesForSeed(resources.seed, settings.tornFlow);
  const appearances = tornAppearancesForPieces(
    resources.artwork,
    rawPieces,
    resources.seed,
  );
  const pieces = scheduledTornPieces(
    resources.artwork,
    rawPieces,
    appearances,
    resources.seed,
    settings.tornFlow,
  );
  const placements = pieces.flatMap((piece) => {
    const appearance = appearances.get(piece.id);
    return appearance
      ? [
          resolveTornPieceRenderPlacement(
            resources.artwork,
            layout,
            piece,
            appearance,
            timeline.assemblyProgress,
            settings.tornMotion,
            width,
            height,
          ),
        ]
      : [];
  });

  // Physical stack order: every exposed stock is below every printed face.
  // Thus a neighboring face hides the white tear immediately upon reconnecting.
  if (plan.movingUnderlays) {
    for (const placement of placements) {
      drawMovingTornLayer(context, placement, layout, "underlay");
    }
  }
  if (plan.movingCores) {
    for (const placement of placements) {
      drawMovingTornLayer(context, placement, layout, "core");
    }
  }
  if (plan.tornSeams) {
    const seenSegments = new Set<string>();
    for (const placement of placements) {
      drawTornSeam(
        context,
        placement,
        resources.artwork,
        layout,
        timeline.seamOpacity,
        seenSegments,
      );
    }
  }
}
