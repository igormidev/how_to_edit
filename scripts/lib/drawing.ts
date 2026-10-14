import type { Rect } from './motion';

interface Point { x: number; y: number }
interface Options {
  rect: Rect;
  /** Clockwise entry direction: 0 = right, 90 = bottom. */
  angle: number;
  /** Exact native-image pen endpoint, before either reflection. */
  tip: Point;
  /** Center of the native arm's cut edge; otherwise inferred from its alpha. */
  armBase?: Point;
}
interface Segment { from: Point; to: Point; paint: boolean; length: number; end: number }

const W = 1920, H = 1080;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
const mix = (a: Point, b: Point, p: number): Point => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const canvas = (width: number, height: number) => {
  const result = document.createElement('canvas'); result.width = width; result.height = height; return result;
};

/** Native-alpha boustrophedon paths and immutable masks make every seek reproducible. */
export function createDrawingRenderer(texture: HTMLCanvasElement, hand: HTMLImageElement, options: Options) {
  const { rect, tip } = options;
  if (!Number.isInteger(options.angle) || options.angle < 0 || options.angle > 360)
    throw new Error('Drawing entry angle must be an integer from 0 through 360.');
  if (!texture.width || !texture.height || ![rect.x, rect.y, rect.width, rect.height, tip.x, tip.y].every(Number.isFinite)
      || rect.width <= 0 || rect.height <= 0 || !hand.naturalWidth || !hand.naturalHeight
      || tip.x < 0 || tip.y < 0 || tip.x >= hand.naturalWidth || tip.y >= hand.naturalHeight)
    throw new Error('Drawing needs a valid texture, rectangle, hand and native pen-tip coordinates.');
  const width = texture.width, height = texture.height;
  const alpha = texture.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
  const visible = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height
    && alpha[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] > 0;
  const normalizedAngle = options.angle % 360;
  const quadrant = normalizedAngle < 90 ? 'bottomRight' : normalizedAngle < 180 ? 'bottomLeft'
    : normalizedAngle < 270 ? 'topLeft' : 'topRight';
  const angle = normalizedAngle * Math.PI / 180;
  const snap = (value: number) => Math.abs(value) < 1e-12 ? 0 : value;
  const direction = { x: snap(Math.cos(angle)), y: snap(Math.sin(angle)) };
  const sourceScale = Math.min(width / rect.width, height / rect.height);
  // A broad nib gives a readable number of zigzags, while the source alpha clips its marks.
  const brushRadius = Math.max(2, Math.min(22, Math.max(9, Math.min(rect.width, rect.height) * .05)) * sourceScale);
  const spacing = Math.max(1, Math.floor(brushRadius * 1.35));
  const world = (point: Point): Point => ({ x: rect.x + point.x * rect.width / width, y: rect.y + point.y * rect.height / height });
  let minX = width, minY = height, maxX = -1, maxY = -1, visiblePixels = 0;
  let first: Point = { x: 0, y: 0 }, projection = -Infinity;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (visible(x, y)) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); visiblePixels++;
    const point = { x: x + .5, y: y + .5 }, value = dot(world(point), direction);
    if (value > projection) { projection = value; first = point; }
  }
  if (!visiblePixels) throw new Error('Drawing input has no visible image pixels.');

  const mask = canvas(width, height), maskContext = mask.getContext('2d', { willReadFrequently: true })!;
  const mark = (context: CanvasRenderingContext2D, from: Point, to: Point, progress = 1) => {
    if (progress <= 0) return;
    const target = mix(from, to, progress);
    context.fillStyle = context.strokeStyle = '#fff'; context.lineWidth = brushRadius * 2;
    context.lineCap = context.lineJoin = 'round'; context.beginPath();
    if (distance(from, to) < .01) { context.arc(from.x, from.y, brushRadius * ease(progress), 0, Math.PI * 2); context.fill(); }
    else { context.moveTo(from.x, from.y); context.lineTo(target.x, target.y); context.stroke(); }
  };
  const strokes: { from: Point; to: Point }[] = [];
  const addStroke = (from: Point, to: Point) => { strokes.push({ from, to }); mark(maskContext, from, to); };
  addStroke(first, first);
  const rows: number[] = [];
  for (let y = minY; y <= maxY; y += spacing) rows.push(y);
  if (rows.at(-1) !== maxY) rows.push(maxY);
  if (direction.y >= 0) rows.reverse();
  rows.forEach((y, row) => {
    const spans: [number, number][] = [];
    for (let x = minX; x <= maxX;) {
      if (!visible(x, y)) { x++; continue; }
      const start = x; while (x <= maxX && visible(x, y)) x++;
      spans.push([start, x - 1]);
    }
    const fromRight = (direction.x >= 0) !== !!(row % 2);
    if (fromRight) spans.reverse();
    for (const [left, right] of spans) addStroke(
      { x: (fromRight ? right : left) + .5, y: y + .5 },
      { x: (fromRight ? left : right) + .5, y: y + .5 });
  });
  // Fine protrusions and tiny islands may lie between rows. Assign uncovered native
  // pixels to small cells; one real-pixel dab covers each cell, without crossing holes.
  const coverage = maskContext.getImageData(0, 0, width, height).data;
  const cellSize = Math.max(1, Math.floor((brushRadius - 1.5) / Math.SQRT2));
  const repairs = new Map<number, Point>();
  const cellsWide = Math.ceil(width / cellSize);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const index = (y * width + x) * 4 + 3;
    if (alpha[index] && coverage[index] < 255) {
      const key = Math.floor(y / cellSize) * cellsWide + Math.floor(x / cellSize);
      if (!repairs.has(key)) repairs.set(key, { x: x + .5, y: y + .5 });
    }
  }
  for (const point of repairs.values()) addStroke(point, point);
  // Order repairs beside their neighboring sweep, rather than revealing islands in a final pop.
  const sweepOrder = (p: Point) => Math.floor((p.y - minY) / spacing);
  const startStroke = strokes.shift()!;
  strokes.sort((a, b) => {
    const rowA = sweepOrder(a.from), rowB = sweepOrder(b.from);
    if (rowA !== rowB) return (direction.y >= 0 ? -1 : 1) * (rowA - rowB);
    const right = (direction.x >= 0) !== !!(rowA % 2);
    return (right ? -1 : 1) * (a.from.x - b.from.x);
  });
  strokes.unshift(startStroke);
  const fullCoverage = maskContext.getImageData(0, 0, width, height).data;
  let uncoveredPixels = 0;
  for (let i = 3; i < alpha.length; i += 4) if (alpha[i] && fullCoverage[i] < 255) uncoveredPixels++;
  if (uncoveredPixels) throw new Error(`Drawing brush plan left ${uncoveredPixels} source pixels uncovered.`);

  const clearLine = (from: Point, to: Point) => {
    const length = distance(from, to), samples = Math.ceil(length * 2);
    for (let i = 0; i <= samples; i++) {
      const point = mix(from, to, samples ? i / samples : 0);
      if (!visible(point.x, point.y)) return false;
    }
    return true;
  };
  const segments: Segment[] = [];
  let previous = first, total = 0, lifts = 0;
  const addSegment = (from: Point, to: Point, paint: boolean) => {
    const length = distance(from, to);
    // A tiny island gets a finite dab; lifted travel is deliberately quicker.
    total += Math.max(length, paint ? brushRadius * .7 : 1) * (paint ? 1 : .6);
    segments.push({ from, to, paint, length, end: total });
  };
  for (const stroke of strokes) {
    if (distance(previous, stroke.from) > .01) {
      const paint = clearLine(previous, stroke.from); if (!paint) lifts++;
      addSegment(previous, stroke.from, paint);
    }
    addSegment(stroke.from, stroke.to, true); previous = stroke.to;
  }

  const handCanvas = canvas(hand.naturalWidth, hand.naturalHeight), handContext = handCanvas.getContext('2d')!;
  handContext.drawImage(hand, 0, 0);
  const handAlpha = handContext.getImageData(0, 0, handCanvas.width, handCanvas.height).data;
  const edgePoints = [
    Array.from({ length: handCanvas.height }, (_, y) => ({ x: 0, y })),
    Array.from({ length: handCanvas.height }, (_, y) => ({ x: handCanvas.width - 1, y })),
    Array.from({ length: handCanvas.width }, (_, x) => ({ x, y: 0 })),
    Array.from({ length: handCanvas.width }, (_, x) => ({ x, y: handCanvas.height - 1 })),
  ].map(edge => edge.filter(p => handAlpha[(p.y * handCanvas.width + p.x) * 4 + 3] > 0));
  const center = (points: Point[]) => ({ x: points.reduce((n, p) => n + p.x, 0) / points.length,
    y: points.reduce((n, p) => n + p.y, 0) / points.length });
  const candidates = edgePoints.filter(edge => edge.length >= 4);
  if (!candidates.length) throw new Error('The pen hand must include a long arm extending to a native image edge.');
  candidates.sort((a, b) => options.armBase
    ? distance(center(a), options.armBase) - distance(center(b), options.armBase)
    : b.length - a.length);
  const cutEdge = candidates[0], armBase = options.armBase ?? center(cutEdge);
  const nativeTail = { x: armBase.x - tip.x, y: armBase.y - tip.y };
  const flipX = quadrant.endsWith('Left') !== (nativeTail.x < 0);
  const flipY = quadrant.startsWith('top') !== (nativeTail.y < 0);
  const signX = flipX ? -1 : 1, signY = flipY ? -1 : 1;
  const turn = angle - Math.atan2(nativeTail.y * signY, nativeTail.x * signX);
  const rotation = Math.atan2(Math.sin(turn), Math.cos(turn));
  const rotate = (point: Point) => ({ x: point.x * Math.cos(rotation) - point.y * Math.sin(rotation),
    y: point.x * Math.sin(rotation) + point.y * Math.cos(rotation) });
  const relative = (point: Point) => rotate({ x: (point.x - tip.x) * signX, y: (point.y - tip.y) * signY });
  const corners = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const frameProjection = Math.max(...corners.map(p => dot(p, direction)));
  const pathProjection = Math.min(...segments.flatMap(segment => [world(segment.from), world(segment.to)]).map(p => dot(p, direction)));
  const cutProjection = Math.min(...cutEdge.map(point => dot(relative(point), direction)));
  if (cutProjection <= 0) throw new Error('The supplied arm base must extend away from the pen tip.');
  // All opaque cut-edge pixels stay beyond the canvas support plane throughout the draw.
  const handScale = Math.max(.33, (frameProjection - pathProjection + 24) / cutProjection);
  const spriteCorners = [{ x: 0, y: 0 }, { x: hand.naturalWidth, y: 0 },
    { x: hand.naturalWidth, y: hand.naturalHeight }, { x: 0, y: hand.naturalHeight }].map(relative);
  const minSpriteProjection = Math.min(...spriteCorners.map(p => dot(p, direction))) * handScale;
  const offscreen = (point: Point) => {
    const travel = Math.max(0, frameProjection - dot(point, direction) - minSpriteProjection + 32);
    return { x: point.x + direction.x * travel, y: point.y + direction.y * travel };
  };
  const start = world(first), last = world(previous), arrival = offscreen(start), departure = offscreen(last);

  // Cache immutable prefix masks within a fixed 48 MiB budget, never previous-frame state.
  const checkpoints = new Map<number, HTMLCanvasElement>();
  const cacheCount = Math.min(8, Math.floor(48 * 1024 * 1024 / (width * height * 4)));
  const checkpointEvery = Math.max(1, Math.ceil(segments.length / Math.max(1, cacheCount)));
  maskContext.clearRect(0, 0, width, height);
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]; if (segment.paint) mark(maskContext, segment.from, segment.to);
    if (cacheCount && (i + 1) % checkpointEvery === 0) {
      const prefix = canvas(width, height); prefix.getContext('2d')!.drawImage(mask, 0, 0); checkpoints.set(i + 1, prefix);
    }
  }
  const artwork = canvas(width, height), artworkContext = artwork.getContext('2d')!;
  const sample = (value: number) => {
    const progress = clamp(value);
    if (progress < .18) return { phase: 'entry', penTarget: mix(arrival, start, ease(progress / .18)),
      segment: -1, segmentProgress: 0, lift: true, progress };
    if (progress < .3) return { phase: 'pause', penTarget: start, segment: -1, segmentProgress: 0, lift: false, progress };
    if (progress >= .93) return { phase: progress === 1 ? 'complete' : 'exit',
      penTarget: mix(last, departure, ease((progress - .93) / .07)), segment: segments.length,
      segmentProgress: 1, lift: true, progress };
    const amount = ease((progress - .3) / .63) * total;
    let lower = 0, upper = segments.length - 1;
    while (lower < upper) { const middle = (lower + upper) >>> 1;
      if (segments[middle].end < amount) lower = middle + 1; else upper = middle; }
    const segment = segments[lower], before = lower ? segments[lower - 1].end : 0;
    const segmentProgress = ease((amount - before) / (segment.end - before));
    return { phase: 'drawing', penTarget: world(mix(segment.from, segment.to, segmentProgress)),
      segment: lower, segmentProgress, lift: !segment.paint, progress };
  };
  const draw = (context: CanvasRenderingContext2D, value: number) => {
    const pose = sample(value);
    if (pose.progress >= .93) context.drawImage(texture, rect.x, rect.y, rect.width, rect.height);
    else if (pose.segment >= 0) {
      maskContext.clearRect(0, 0, width, height);
      const checkpoint = Math.floor(pose.segment / checkpointEvery) * checkpointEvery;
      const prefix = checkpoints.get(checkpoint); if (prefix) maskContext.drawImage(prefix, 0, 0);
      for (let i = prefix ? checkpoint : 0; i < pose.segment; i++) {
        const segment = segments[i]; if (segment.paint) mark(maskContext, segment.from, segment.to);
      }
      const segment = segments[pose.segment];
      if (segment.paint) mark(maskContext, segment.from, segment.to, pose.segmentProgress);
      artworkContext.clearRect(0, 0, width, height); artworkContext.globalCompositeOperation = 'source-over';
      artworkContext.drawImage(texture, 0, 0); artworkContext.globalCompositeOperation = 'destination-in';
      artworkContext.drawImage(mask, 0, 0); artworkContext.globalCompositeOperation = 'source-over';
      context.drawImage(artwork, rect.x, rect.y, rect.width, rect.height);
    }
    if (pose.progress >= 1) return;
    context.save(); context.translate(pose.penTarget.x, pose.penTarget.y); context.rotate(rotation);
    context.scale(handScale * signX, handScale * signY); context.drawImage(hand, -tip.x, -tip.y); context.restore();
  };
  return { draw, sample, path: segments, metadata: { angle: normalizedAngle, quadrant,
    flipX, flipY, rotation, handScale, tip, armBase,
    phases: { entry: .18, pause: .12, drawing: .63, exit: .07 },
    brushRadius: brushRadius / sourceScale, visiblePixels, uncoveredPixels,
    strokes: strokes.length, liftSegments: lifts, pathSegments: segments.length,
    alphaBounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    startPen: start, endPen: last, entryPen: arrival, exitPen: departure } };
}
