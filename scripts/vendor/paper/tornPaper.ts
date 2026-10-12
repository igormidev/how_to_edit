/**
 * Deterministic, Canvas-agnostic geometry for the torn-paper assembly animation.
 *
 * Every point is expressed in normalized artwork coordinates. Adjacent pieces
 * reuse the exact same jagged edge points in reverse order, so the polygons are
 * a true partition of [0, 1] x [0, 1] rather than a collection of independently
 * jittered masks. At the final frame a renderer can therefore replace the
 * clipped pieces with one ordinary artwork draw without changing the geometry.
 */

import type { TornAssemblyFlow, TornPieceMotion } from "./types";

export interface TornPoint {
  readonly x: number;
  readonly y: number;
}

export interface TornRevealWindow {
  /** Position in the assembly timeline at which this piece starts appearing. */
  readonly start: number;
  /** Position in the assembly timeline at which this piece is fully settled. */
  readonly end: number;
  /** Stable draw/reveal order, from zero to pieceCount - 1. */
  readonly order: number;
}

export interface TornEntryTransform {
  /** Translation relative to the artwork's rendered width and height. */
  readonly x: number;
  readonly y: number;
  /** Clockwise rotation in radians. */
  readonly rotation: number;
  readonly scale: number;
}

export interface TornPaperPiece {
  readonly id: string;
  readonly row: number;
  readonly column: number;
  /** Clockwise polygon suitable for Canvas2D moveTo/lineTo/clip. */
  readonly points: readonly TornPoint[];
  readonly center: TornPoint;
  readonly area: number;
  readonly reveal: TornRevealWindow;
  readonly entry: TornEntryTransform;
}

export interface TornPaperOptions {
  readonly seed?: number;
  /** Choreography used to order and introduce the finished paper pieces. */
  readonly flow?: TornAssemblyFlow;
  readonly rows?: number;
  readonly columns?: number;
  /** Lattice-corner displacement as a fraction of one grid cell. */
  readonly vertexJitter?: number;
  /** Jagged-edge displacement as a fraction of the shorter grid cell edge. */
  readonly edgeRoughness?: number;
  /** Number of intermediate teeth generated on every shared edge. */
  readonly edgePoints?: number;
}

export interface TornPaperLayout {
  readonly seed: number;
  readonly flow: TornAssemblyFlow;
  readonly rows: number;
  readonly columns: number;
  readonly vertexJitter: number;
  readonly edgeRoughness: number;
  readonly edgePoints: number;
  readonly pieces: readonly TornPaperPiece[];
}

export interface TornPieceState {
  readonly visible: boolean;
  readonly settled: boolean;
  /** Local progress through this piece's reveal window. */
  readonly progress: number;
  readonly opacity: number;
  /** Translation relative to the rendered artwork width and height. */
  readonly x: number;
  readonly y: number;
  /** Clockwise rotation in radians. */
  readonly rotation: number;
  readonly scale: number;
}

const DEFAULTS = Object.freeze({
  seed: 1,
  flow: "center" as TornAssemblyFlow,
  rows: 3,
  columns: 4,
  vertexJitter: 0.16,
  edgeRoughness: 0.11,
  edgePoints: 3,
});

const TORN_ASSEMBLY_FLOWS = new Set<TornAssemblyFlow>([
  "center",
  "top-down",
  "bottom-up",
  "left-right",
  "right-left",
]);

const LIMITS = Object.freeze({
  rows: Object.freeze({ min: 2, max: 6 }),
  columns: Object.freeze({ min: 2, max: 6 }),
  vertexJitter: Object.freeze({ min: 0, max: 0.24 }),
  edgeRoughness: Object.freeze({ min: 0, max: 0.18 }),
  edgePoints: Object.freeze({ min: 1, max: 5 }),
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return clamp(finiteOr(value, fallback), min, max);
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(boundedNumber(value, fallback, min, max));
}

function normalizeSeed(value: unknown): number {
  return Math.trunc(finiteOr(value, DEFAULTS.seed)) >>> 0;
}

function normalizeFlow(value: unknown): TornAssemblyFlow {
  return typeof value === "string" && TORN_ASSEMBLY_FLOWS.has(value as TornAssemblyFlow)
    ? (value as TornAssemblyFlow)
    : DEFAULTS.flow;
}

/** Mulberry32: small, stable, and deterministic in every supported browser. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function frozenPoint(x: number, y: number): TornPoint {
  return Object.freeze({ x: clamp(x, 0, 1), y: clamp(y, 0, 1) });
}

function samePoint(left: TornPoint, right: TornPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function reverseEdge(edge: readonly TornPoint[]): readonly TornPoint[] {
  return [...edge].reverse();
}

function appendEdge(target: TornPoint[], edge: readonly TornPoint[]): void {
  const start = target.length > 0 && samePoint(target[target.length - 1], edge[0]) ? 1 : 0;
  for (let index = start; index < edge.length; index += 1) target.push(edge[index]);
}

function signedPolygonArea(points: readonly TornPoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return twiceArea / 2;
}

function polygonCenter(points: readonly TornPoint[]): TornPoint {
  let crossSum = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    crossSum += cross;
    weightedX += (current.x + next.x) * cross;
    weightedY += (current.y + next.y) * cross;
  }

  if (Math.abs(crossSum) < 1e-12) {
    const total = points.reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 },
    );
    return frozenPoint(total.x / points.length, total.y / points.length);
  }

  return frozenPoint(weightedX / (3 * crossSum), weightedY / (3 * crossSum));
}

function roughEdge(
  start: TornPoint,
  end: TornPoint,
  intermediateCount: number,
  normalAmplitude: number,
  boundary: boolean,
  random: () => number,
): readonly TornPoint[] {
  const points: TornPoint[] = [start];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const normalX = length > 0 ? -dy / length : 0;
  const normalY = length > 0 ? dx / length : 0;
  const tangentJitter = 0.22 / (intermediateCount + 1);

  for (let index = 1; index <= intermediateCount; index += 1) {
    const base = index / (intermediateCount + 1);
    // The shift is much smaller than the sample spacing, so samples can never
    // change order even at the maximum roughness settings.
    const position = base + (random() * 2 - 1) * tangentJitter;
    const tooth = boundary
      ? 0
      : (random() * 2 - 1) * normalAmplitude * Math.sin(Math.PI * position);
    points.push(
      frozenPoint(
        start.x + dx * position + normalX * tooth,
        start.y + dy * position + normalY * tooth,
      ),
    );
  }
  points.push(end);
  return Object.freeze(points);
}

interface MutablePieceGeometry {
  readonly id: string;
  readonly row: number;
  readonly column: number;
  readonly points: readonly TornPoint[];
  readonly center: TornPoint;
  readonly area: number;
  readonly revealPriority: number;
  readonly revealDuration: number;
  readonly entry: TornEntryTransform;
}

function centerEntryTransform(
  center: TornPoint,
  random: () => number,
): TornEntryTransform {
  let directionX = center.x - 0.5;
  let directionY = center.y - 0.5;
  let length = Math.hypot(directionX, directionY);
  if (length < 0.08) {
    const angle = random() * Math.PI * 2;
    directionX = Math.cos(angle);
    directionY = Math.sin(angle);
    length = 1;
  }
  directionX /= length;
  directionY /= length;

  const distance = 0.34 + random() * 0.18;
  const sideDrift = (random() * 2 - 1) * 0.12;
  const rotationSign = random() < 0.5 ? -1 : 1;
  return Object.freeze({
    x: directionX * distance - directionY * sideDrift,
    y: directionY * distance + directionX * sideDrift,
    rotation: rotationSign * (0.12 + random() * 0.19),
    scale: 0.82 + random() * 0.12,
  });
}

function directionalEntryTransform(
  center: TornPoint,
  flow: Exclude<TornAssemblyFlow, "center">,
  random: () => number,
): TornEntryTransform {
  // Each fragment begins just beyond the source edge for its sweep, then
  // travels toward its exact place. A little cross-axis drift prevents the
  // directional variants from reading as a rigid row/column wipe.
  const edgeMargin = 0.14 + random() * 0.1;
  const lateralDrift = (random() * 2 - 1) * 0.09;
  const rotationSign = random() < 0.5 ? -1 : 1;
  const rotation = rotationSign * (0.07 + random() * 0.13);
  const scale = 0.88 + random() * 0.09;

  switch (flow) {
    case "top-down":
      return Object.freeze({
        x: lateralDrift,
        y: -(center.y + edgeMargin),
        rotation,
        scale,
      });
    case "bottom-up":
      return Object.freeze({
        x: lateralDrift,
        y: 1 - center.y + edgeMargin,
        rotation,
        scale,
      });
    case "left-right":
      return Object.freeze({
        x: -(center.x + edgeMargin),
        y: lateralDrift,
        rotation,
        scale,
      });
    case "right-left":
      return Object.freeze({
        x: 1 - center.x + edgeMargin,
        y: lateralDrift,
        rotation,
        scale,
      });
  }
}

function entryTransform(
  center: TornPoint,
  flow: TornAssemblyFlow,
  random: () => number,
): TornEntryTransform {
  return flow === "center"
    ? centerEntryTransform(center, random)
    : directionalEntryTransform(center, flow, random);
}

function compareCenterFirst(left: number, right: number): number {
  return Math.abs(left - 0.5) - Math.abs(right - 0.5);
}

function compareRevealOrder(
  left: MutablePieceGeometry,
  right: MutablePieceGeometry,
  flow: TornAssemblyFlow,
): number {
  if (flow === "center") {
    return (
      left.revealPriority - right.revealPriority ||
      left.row - right.row ||
      left.column - right.column
    );
  }

  if (flow === "top-down" || flow === "bottom-up") {
    const rowOrder =
      flow === "top-down" ? left.row - right.row : right.row - left.row;
    return (
      rowOrder ||
      compareCenterFirst(left.center.x, right.center.x) ||
      left.revealPriority - right.revealPriority ||
      left.column - right.column
    );
  }

  const columnOrder =
    flow === "left-right"
      ? left.column - right.column
      : right.column - left.column;
  return (
    columnOrder ||
    compareCenterFirst(left.center.y, right.center.y) ||
    left.revealPriority - right.revealPriority ||
    left.row - right.row
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function smoothstep(value: number): number {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
}

function easeOutCubic(value: number): number {
  const progress = clamp01(value);
  return 1 - (1 - progress) ** 3;
}

function smootherstep(value: number): number {
  const progress = clamp01(value);
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
}

function mixUint32(value: number): number {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function riffleNoise(piece: TornPaperPiece, salt: number): number {
  const pieceKey =
    Math.imul(piece.row + 1, 0x9e3779b1) ^
    Math.imul(piece.column + 1, 0x85ebca6b) ^
    Math.imul(salt + 1, 0xc2b2ae35);
  return mixUint32(pieceKey) / 4294967296;
}

interface RifflePose {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scale: number;
}

function rifflePoses(piece: TornPaperPiece): readonly RifflePose[] {
  let directionX = piece.entry.x;
  let directionY = piece.entry.y;
  let directionLength = Math.hypot(directionX, directionY);
  if (directionLength < 1e-6) {
    const angle = riffleNoise(piece, 3) * Math.PI * 2;
    directionX = Math.cos(angle);
    directionY = Math.sin(angle);
    directionLength = 1;
  }
  directionX /= directionLength;
  directionY /= directionLength;

  const sideSign = (piece.row + piece.column) % 2 === 0 ? 1 : -1;
  const normalX = -directionY * sideSign;
  const normalY = directionX * sideSign;
  // Start beyond the ordinary center-gather travel so this option reads as a
  // more widely fanned stack of pages. Directional entries can deliberately
  // begin off-canvas, so cap their requested distance here; the renderer then
  // applies the exact rotated-tile frame clamp for every output size.
  const directDistance = Math.hypot(piece.entry.x, piece.entry.y);
  const distance = clamp(
    directDistance + 0.08 + riffleNoise(piece, 5) * 0.06,
    0.46,
    0.64,
  );
  const detour = 0.07 + riffleNoise(piece, 7) * 0.05;
  const rotation = (Math.PI / 180) * (5 + riffleNoise(piece, 11) * 2) * sideSign;

  const pose = (
    along: number,
    across: number,
    angle: number,
    scale: number,
  ): RifflePose =>
    Object.freeze({
      x: directionX * distance * along + normalX * detour * across,
      y: directionY * distance * along + normalY * detour * across,
      rotation: angle,
      scale,
    });

  return Object.freeze([
    pose(1, 0.35, rotation, 0.94 + riffleNoise(piece, 13) * 0.02),
    pose(0.68, -1, -rotation * 0.68, 0.97),
    pose(0.4, 0.7, rotation * 0.38, 0.985),
    pose(0.16, -0.3, -rotation * 0.14, 0.995),
    Object.freeze({ x: 0, y: 0, rotation: 0, scale: 1 }),
  ]);
}

function resolveRifflePieceState(
  piece: TornPaperPiece,
  localProgress: number,
): TornPieceState {
  const poses = rifflePoses(piece);
  if (localProgress <= 0) {
    return {
      visible: false,
      settled: false,
      progress: 0,
      opacity: 0,
      ...poses[0],
    };
  }
  if (localProgress >= 1) {
    return {
      visible: true,
      settled: true,
      progress: 1,
      opacity: 1,
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
    };
  }

  // Each fragment holds briefly like a page in a fast riffle, then snaps to
  // the next offset pose. The alternating cross-axis offsets make a small,
  // deterministic detour rather than one straight flight into place.
  const scaledProgress = localProgress * (poses.length - 1);
  const poseIndex = Math.min(poses.length - 2, Math.floor(scaledProgress));
  const poseProgress = scaledProgress - poseIndex;
  const hopProgress = smootherstep((poseProgress - 0.52) / 0.32);
  const current = poses[poseIndex];
  const next = poses[poseIndex + 1];
  const interpolate = (start: number, end: number) =>
    start + (end - start) * hopProgress;

  return {
    visible: true,
    settled: false,
    progress: localProgress,
    opacity: smoothstep(localProgress / 0.2),
    x: interpolate(current.x, next.x),
    y: interpolate(current.y, next.y),
    rotation: interpolate(current.rotation, next.rotation),
    scale: interpolate(current.scale, next.scale),
  };
}

/**
 * Builds a stable irregular partition and per-piece choreography. The returned
 * object and all of its nested geometry are frozen to prevent a preview from
 * accidentally diverging from the exported frame sequence.
 */
export function createTornPaperLayout(options: TornPaperOptions = {}): TornPaperLayout {
  const seed = normalizeSeed(options.seed);
  const flow = normalizeFlow(options.flow);
  const rows = boundedInteger(
    options.rows,
    DEFAULTS.rows,
    LIMITS.rows.min,
    LIMITS.rows.max,
  );
  const columns = boundedInteger(
    options.columns,
    DEFAULTS.columns,
    LIMITS.columns.min,
    LIMITS.columns.max,
  );
  const vertexJitter = boundedNumber(
    options.vertexJitter,
    DEFAULTS.vertexJitter,
    LIMITS.vertexJitter.min,
    LIMITS.vertexJitter.max,
  );
  const edgeRoughness = boundedNumber(
    options.edgeRoughness,
    DEFAULTS.edgeRoughness,
    LIMITS.edgeRoughness.min,
    LIMITS.edgeRoughness.max,
  );
  const edgePoints = boundedInteger(
    options.edgePoints,
    DEFAULTS.edgePoints,
    LIMITS.edgePoints.min,
    LIMITS.edgePoints.max,
  );
  const random = createRandom(seed);
  const cellWidth = 1 / columns;
  const cellHeight = 1 / rows;
  const shortestCellEdge = Math.min(cellWidth, cellHeight);

  const vertices: TornPoint[][] = [];
  for (let row = 0; row <= rows; row += 1) {
    const vertexRow: TornPoint[] = [];
    for (let column = 0; column <= columns; column += 1) {
      const baseX = column / columns;
      const baseY = row / rows;
      const x =
        column === 0 || column === columns
          ? baseX
          : baseX + (random() * 2 - 1) * vertexJitter * cellWidth;
      const y =
        row === 0 || row === rows
          ? baseY
          : baseY + (random() * 2 - 1) * vertexJitter * cellHeight;
      vertexRow.push(frozenPoint(x, y));
    }
    vertices.push(vertexRow);
  }

  const horizontalEdges: (readonly TornPoint[])[][] = [];
  for (let row = 0; row <= rows; row += 1) {
    const edgeRow: (readonly TornPoint[])[] = [];
    for (let column = 0; column < columns; column += 1) {
      edgeRow.push(
        roughEdge(
          vertices[row][column],
          vertices[row][column + 1],
          edgePoints,
          edgeRoughness * shortestCellEdge,
          row === 0 || row === rows,
          random,
        ),
      );
    }
    horizontalEdges.push(edgeRow);
  }

  const verticalEdges: (readonly TornPoint[])[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const edgeRow: (readonly TornPoint[])[] = [];
    for (let column = 0; column <= columns; column += 1) {
      edgeRow.push(
        roughEdge(
          vertices[row][column],
          vertices[row + 1][column],
          edgePoints,
          edgeRoughness * shortestCellEdge,
          column === 0 || column === columns,
          random,
        ),
      );
    }
    verticalEdges.push(edgeRow);
  }

  const geometries: MutablePieceGeometry[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const points: TornPoint[] = [];
      appendEdge(points, horizontalEdges[row][column]);
      appendEdge(points, verticalEdges[row][column + 1]);
      appendEdge(points, reverseEdge(horizontalEdges[row + 1][column]));
      appendEdge(points, reverseEdge(verticalEdges[row][column]));
      if (samePoint(points[0], points[points.length - 1])) points.pop();
      const frozenPoints = Object.freeze(points);
      const center = polygonCenter(frozenPoints);
      geometries.push({
        id: `torn-${row}-${column}`,
        row,
        column,
        points: frozenPoints,
        center,
        area: Math.abs(signedPolygonArea(frozenPoints)),
        revealPriority: random(),
        revealDuration: 0.27 + random() * 0.09,
        entry: entryTransform(center, flow, random),
      });
    }
  }

  const byRevealPriority = [...geometries].sort((left, right) =>
    compareRevealOrder(left, right, flow),
  );
  const orderById = new Map(
    byRevealPriority.map((piece, order) => [piece.id, order] as const),
  );
  const maximumStart = 0.64;
  const orderDenominator = Math.max(1, geometries.length - 1);
  const pieces = geometries.map<TornPaperPiece>((geometry) => {
    const order = orderById.get(geometry.id) ?? 0;
    const start = (order / orderDenominator) * maximumStart;
    const end = Math.min(0.98, start + geometry.revealDuration);
    return Object.freeze({
      id: geometry.id,
      row: geometry.row,
      column: geometry.column,
      points: geometry.points,
      center: geometry.center,
      area: geometry.area,
      reveal: Object.freeze({ start, end, order }),
      entry: geometry.entry,
    });
  });

  return Object.freeze({
    seed,
    flow,
    rows,
    columns,
    vertexJitter,
    edgeRoughness,
    edgePoints,
    pieces: Object.freeze(pieces),
  });
}

/** Convenience form for consumers that do not need the resolved options. */
export function createTornPaperPieces(
  options: TornPaperOptions = {},
): readonly TornPaperPiece[] {
  return createTornPaperLayout(options).pieces;
}

/**
 * Redistributes meaningful cells across the original timing span without ever
 * removing a partition cell from the rendered image. Alpha-light cells (for
 * example a soft shadow around the paper) share the reveal window of their
 * nearest meaningful neighbor, so they neither create empty pauses nor pop in
 * when the renderer switches to the complete settled artwork.
 */
export function compactTornPaperSchedule(
  pieces: readonly TornPaperPiece[],
  includedPieceIds: ReadonlySet<string>,
): readonly TornPaperPiece[] {
  const ordered = [...pieces].sort(
    (left, right) =>
      left.reveal.order - right.reveal.order || left.id.localeCompare(right.id),
  );
  if (ordered.length === 0) return Object.freeze([]);

  const included = ordered.filter((piece) => includedPieceIds.has(piece.id));
  // With no strong-alpha anchor, the safest behavior is the original complete
  // schedule: translucent artwork still needs every cell rendered.
  if (included.length === 0) return Object.freeze(ordered);

  const maximumStart = ordered.reduce(
    (maximum, piece) => Math.max(maximum, piece.reveal.start),
    0,
  );
  const denominator = Math.max(1, included.length - 1);
  const includedSchedule = new Map(
    included.map((piece, order) => {
      const start = included.length === 1 ? 0 : (order / denominator) * maximumStart;
      const duration = Math.max(0, piece.reveal.end - piece.reveal.start);
      return [
        piece.id,
        Object.freeze({
          piece,
          start,
          end: Math.min(0.98, start + duration),
        }),
      ] as const;
    }),
  );

  const nearestIncluded = (piece: TornPaperPiece): TornPaperPiece =>
    included.reduce((nearest, candidate) => {
      const squaredDistance = (target: TornPaperPiece) =>
        (target.center.x - piece.center.x) ** 2 +
        (target.center.y - piece.center.y) ** 2;
      const candidateDistance = squaredDistance(candidate);
      const nearestDistance = squaredDistance(nearest);
      if (candidateDistance < nearestDistance - 1e-12) return candidate;
      if (Math.abs(candidateDistance - nearestDistance) > 1e-12) return nearest;
      return candidate.reveal.order < nearest.reveal.order ||
        (candidate.reveal.order === nearest.reveal.order &&
          candidate.id.localeCompare(nearest.id) < 0)
        ? candidate
        : nearest;
    });

  const staged = ordered.map((piece) => {
    const ownSchedule = includedSchedule.get(piece.id);
    const anchor = ownSchedule?.piece ?? nearestIncluded(piece);
    const schedule = ownSchedule ?? includedSchedule.get(anchor.id);
    // `included` is non-empty, so every nearest anchor has a schedule.
    if (!schedule) throw new Error("A torn-paper reveal anchor could not be resolved.");
    return {
      piece,
      start: schedule.start,
      end: schedule.end,
      anchorOrder: anchor.reveal.order,
    };
  });
  staged.sort(
    (left, right) =>
      left.start - right.start ||
      left.anchorOrder - right.anchorOrder ||
      left.piece.reveal.order - right.piece.reveal.order ||
      left.piece.id.localeCompare(right.piece.id),
  );

  const scheduled = staged.map(({ piece, start, end }, order) => {
    return Object.freeze({
      ...piece,
      reveal: Object.freeze({
        start,
        end,
        order,
      }),
    });
  });
  return Object.freeze(scheduled);
}

/**
 * Resolves one piece at an assembly progress in [0, 1]. Inputs outside that
 * interval are safely clamped. Every transform is the exact identity once its
 * reveal window ends, avoiding sub-pixel drift in the final hold.
 */
export function resolveTornPieceState(
  piece: TornPaperPiece,
  assemblyProgress: number,
  motion: TornPieceMotion = "direct",
): TornPieceState {
  const time = clamp01(assemblyProgress);
  const duration = Math.max(1e-6, piece.reveal.end - piece.reveal.start);
  const localProgress = clamp01((time - piece.reveal.start) / duration);
  if (motion === "riffle") return resolveRifflePieceState(piece, localProgress);
  if (localProgress <= 0) {
    return {
      visible: false,
      settled: false,
      progress: 0,
      opacity: 0,
      x: piece.entry.x,
      y: piece.entry.y,
      rotation: piece.entry.rotation,
      scale: piece.entry.scale,
    };
  }
  if (localProgress >= 1) {
    return {
      visible: true,
      settled: true,
      progress: 1,
      opacity: 1,
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
    };
  }

  const movement = easeOutCubic(localProgress);
  return {
    visible: true,
    settled: false,
    progress: localProgress,
    // Paper becomes legible early while its movement continues to settle.
    opacity: smoothstep(localProgress / 0.56),
    x: piece.entry.x * (1 - movement),
    y: piece.entry.y * (1 - movement),
    rotation: piece.entry.rotation * (1 - movement),
    scale: piece.entry.scale + (1 - piece.entry.scale) * movement,
  };
}
