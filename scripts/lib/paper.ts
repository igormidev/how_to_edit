/** Small public adapter around the paper and Torn algorithms. */
import {
  renderNewspaper,
  fitDimensionsToPixelBudget,
  getSourceDimensions,
  type RenderResult,
  type PixelBounds,
} from "../vendor/paper/newspaperRenderer";
import {
  drawTornAnimation,
  layoutSprite,
  type PreparedAnimationSprite,
} from "../vendor/paper/tornRenderer";
import type { TornAssemblyFlow, TornPieceMotion } from "../vendor/paper/types";

export const PAPER_STOCKS = Object.freeze({
  classic: "#F6E0C0",
  cream: "#F3E6C5",
  gray: "#D8D5C8",
  tabloid: "#D7BA81",
});
export const PAPER_SEED = 1873;
export interface PaperOptions {
  roughness?: number;
  stock?: keyof typeof PAPER_STOCKS;
  removeBackground?: boolean;
}
export interface Rect { x: number; y: number; width: number; height: number }

/** Fixed channel treatment. Options expose only the three user-approved controls. */
export async function preparePaperImage(
  source: CanvasImageSource,
  { roughness = 0.8, stock = "classic", removeBackground = false }: PaperOptions = {},
): Promise<RenderResult> {
  if (!Number.isFinite(roughness) || roughness < 0 || roughness > 1) {
    throw new RangeError("Cut roughness must be between 0 and 1.");
  }
  if (!Object.hasOwn(PAPER_STOCKS, stock)) throw new Error(`Unknown paper stock: ${stock}`);
  if (typeof removeBackground !== "boolean") throw new TypeError("removeBackground must be boolean.");
  const filter = {
    enabled: true,
    treatment: "crumpled" as const,
    strength: 1,
    crumpleStrength: 0.2,
    crumpleScale: 72,
    colorAging: 0,
    contrast: 1.24,
    halftone: 0.72,
    dotSize: 3,
    inkColor: "#19140F",
  };
  return renderNewspaper(source, {
    borderWidth: 12,
    roughness,
    tightTrim: true,
    seed: PAPER_SEED,
    imagePaperColor: PAPER_STOCKS[stock],
    borderPaperColor: PAPER_STOCKS[stock],
    alphaThreshold: 24,
    texture: { strength: 0.62, fibers: 0.5 },
    oldFilter: filter,
    borderFilter: filter,
    shadow: false,
    backgroundRemoval: removeBackground,
  });
}

export interface PreparedVideoFrame extends RenderResult {
  /** The same classical stock border, with an empty live-media window. */
  frameOnly: HTMLCanvasElement;
}

/** Rectangular classic stock around video; source pixels receive no print/crumple treatment. */
export async function prepareVideoFrame(source: CanvasImageSource): Promise<PreparedVideoFrame> {
  const dimensions = getSourceDimensions(source);
  const size = fitDimensionsToPixelBudget(dimensions.width, dimensions.height);
  const opaque = document.createElement("canvas");
  opaque.width = size.width;
  opaque.height = size.height;
  const opaqueContext = opaque.getContext("2d")!;
  opaqueContext.fillStyle = PAPER_STOCKS.classic;
  opaqueContext.fillRect(0, 0, size.width, size.height);
  // Opaque backing guarantees a rectangular frame even for an alpha video/GIF.
  const result = await renderNewspaper(opaque, {
    borderWidth: 12,
    roughness: 0.8,
    tightTrim: true,
    seed: PAPER_SEED,
    paperColor: PAPER_STOCKS.classic,
    texture: { strength: 0.62, fibers: 0.5 },
    oldFilter: false,
    borderFilter: false,
    shadow: false,
    backgroundRemoval: false,
  });
  const frameOnly = document.createElement("canvas");
  frameOnly.width = result.width;
  frameOnly.height = result.height;
  const borderContext = frameOnly.getContext("2d")!;
  borderContext.drawImage(result.canvas, 0, 0);
  const bounds = result.contentBounds;
  borderContext.clearRect(bounds.x, bounds.y, bounds.width, bounds.height);
  const context = result.canvas.getContext("2d")!;
  context.clearRect(0, 0, result.width, result.height);
  context.drawImage(frameOnly, 0, 0);
  context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height);
  return { ...result, frameOnly };
}

const FLOWS = Object.freeze({
  center: "center",
  topToBottom: "top-down",
  bottomToTop: "bottom-up",
  leftToRight: "left-right",
  rightToLeft: "right-left",
} as const satisfies Readonly<Record<string, TornAssemblyFlow>>);
export interface TornConfig {
  rect: Rect;
  flow?: keyof typeof FLOWS;
  motion?: "direct" | "pageRiffle";
  duration?: number;
}

/** Alpha-safe Torn assembly on a fixed full-HD canvas. */
export function createTornRenderer(canvas: HTMLCanvasElement, config: TornConfig) {
  const { rect, flow = "center", motion = "direct", duration = 2.8 } = config;
  if (!Object.hasOwn(FLOWS, flow)) throw new Error(`Unknown assembly flow: ${flow}`);
  if (motion !== "direct" && motion !== "pageRiffle") throw new Error(`Unknown piece motion: ${motion}`);
  if (!Number.isFinite(duration) || duration <= 0) throw new RangeError("Duration must be positive.");
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
      rect.width <= 0 || rect.height <= 0 || rect.x < 0 || rect.y < 0 ||
      rect.x + rect.width > 1920 || rect.y + rect.height > 1080) {
    throw new RangeError("Final paper rectangle must fit inside the 1920 × 1080 canvas.");
  }
  const visibleBounds: PixelBounds = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const sprite: PreparedAnimationSprite = { canvas, visibleBounds };
  const layout = layoutSprite(sprite, rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height);
  const settings = { tornFlow: FLOWS[flow], tornMotion: (motion === "pageRiffle" ? "riffle" : "direct") as TornPieceMotion };
  const fitted = {
    x: layout.visibleLeft, y: layout.visibleTop,
    width: layout.visibleWidth, height: layout.visibleHeight,
  };
  return {
    rect: fitted,
    duration,
    draw(context: CanvasRenderingContext2D, progress: number) {
      const time = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
      drawTornAnimation(context, 1920, 1080, { artwork: sprite, seed: PAPER_SEED }, settings, time, layout);
    },
  };
}
