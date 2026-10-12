/** Deterministic, seekable folded-paper geometry. No render-time state or clocks. */
export interface Rect { x: number; y: number; width: number; height: number }
export type FoldOrigin = 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight' | 'center';
interface Config { rect: Rect; duration?: number }
interface Point { x: number; y: number; z?: number }
interface Face { source: Point[]; points: Point[]; depth: number; light: number; back: boolean }
export interface PaperRenderer { draw(context: CanvasRenderingContext2D, progress: number): void }

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const phase = (value: number, start: number, end: number) => ease((value - start) / (end - start));

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

function validate(texture: HTMLCanvasElement, rect: Rect) {
  if (!texture.width || !texture.height || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
      || rect.width <= 0 || rect.height <= 0) throw new Error('Paper motion needs a valid texture and rectangle.');
}

/** Back stock uses the supplied artwork alpha, including irregular cutout edges. */
function backStock(texture: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = makeCanvas(texture.width, texture.height);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#f2ead8'; context.fillRect(0, 0, canvas.width, canvas.height);
  // A fixed integer hash provides fibers without runtime randomness.
  for (let i = 0; i < Math.min(12000, canvas.width * canvas.height / 90); i++) {
    const hash = (Math.imul(i + 1, 1597334677) ^ Math.imul(i + 7, 3812015801)) >>> 0;
    const x = hash % canvas.width, y = (hash >>> 12) % canvas.height;
    context.fillStyle = i % 3 ? 'rgba(76,58,31,0.055)' : 'rgba(255,255,247,0.16)';
    context.fillRect(x, y, 0.5 + (hash & 3) / 4, 0.6 + (hash & 7) / 5);
  }
  context.globalCompositeOperation = 'destination-in'; context.drawImage(texture, 0, 0);
  return canvas;
}

/** Map one source triangle to its projected triangle; alpha is kept intact. */
function triangle(context: CanvasRenderingContext2D, texture: HTMLCanvasElement, source: Point[], target: Point[], light: number) {
  const [s0, s1, s2] = source, [p0, p1, p2] = target;
  const ux = s1.x - s0.x, uy = s1.y - s0.y, vx = s2.x - s0.x, vy = s2.y - s0.y;
  const det = ux * vy - uy * vx;
  const area = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
  if (Math.abs(det) < 0.00001 || Math.abs(area) < 0.002) return;
  const a = ((p1.x - p0.x) * vy - (p2.x - p0.x) * uy) / det;
  const c = ((p2.x - p0.x) * ux - (p1.x - p0.x) * vx) / det;
  const b = ((p1.y - p0.y) * vy - (p2.y - p0.y) * uy) / det;
  const d = ((p2.y - p0.y) * ux - (p1.y - p0.y) * vx) / det;
  const center = { x: (p0.x + p1.x + p2.x) / 3, y: (p0.y + p1.y + p2.y) / 3 };
  context.save();
  context.beginPath();
  // Subpixel overlap closes anti-aliased mesh seams. The exact final frame bypasses the mesh.
  for (let i = 0; i < 3; i++) {
    const point = target[i], dx = point.x - center.x, dy = point.y - center.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const x = point.x + dx / length * 1.2, y = point.y + dy / length * 1.2;
    if (!i) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath(); context.clip();
  context.transform(a, b, c, d, p0.x - a * s0.x - c * s0.y, p0.y - b * s0.x - d * s0.y);
  context.filter = `brightness(${Math.max(0.48, Math.min(1.08, light))})`;
  context.drawImage(texture, 0, 0); context.restore();
}

function drawFaces(context: CanvasRenderingContext2D, front: HTMLCanvasElement, back: HTMLCanvasElement, faces: Face[]) {
  // Raised paper is closest to the viewer and therefore painted last.
  faces.sort((a, b) => a.depth - b.depth);
  for (const face of faces) {
    const image = face.back ? back : front;
    triangle(context, image, [face.source[0], face.source[1], face.source[2]], [face.points[0], face.points[1], face.points[2]], face.light);
    if (face.points.length === 4) triangle(context, image, [face.source[0], face.source[2], face.source[3]], [face.points[0], face.points[2], face.points[3]], face.light);
  }
}

/** The reference's four columns × two rows, with alternating crease light/shadow. */
function creaseOverlay(texture: HTMLCanvasElement): HTMLCanvasElement {
  const overlay = makeCanvas(texture.width, texture.height), context = overlay.getContext('2d')!;
  const width = texture.width, height = texture.height;
  for (let col = 0; col < 4; col++) {
    const gradient = context.createLinearGradient(col * width / 4, 0, (col + 1) * width / 4, height * 0.17);
    gradient.addColorStop(0, col % 2 ? 'rgba(28,25,20,0.07)' : 'rgba(255,255,255,0.12)');
    gradient.addColorStop(0.62, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, col % 2 ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,20,0.06)');
    context.fillStyle = gradient; context.fillRect(col * width / 4, 0, width / 4, height);
  }
  for (let col = 1; col < 4; col++) {
    const x = width * col / 4, radius = Math.max(3, width * 0.009);
    const gradient = context.createLinearGradient(x - radius, 0, x + radius, 0);
    gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(0.44, 'rgba(40,33,20,0.13)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.25)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient; context.fillRect(x - radius, 0, radius * 2, height);
  }
  const y = height / 2, radius = Math.max(3, height * 0.016);
  const gradient = context.createLinearGradient(0, y - radius, 0, y + radius);
  gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(0.43, 'rgba(30,25,17,0.17)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.23)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient; context.fillRect(0, y - radius, width, radius * 2);
  context.globalCompositeOperation = 'destination-in'; context.drawImage(texture, 0, 0);
  return overlay;
}

export function createUnfoldingRenderer(texture: HTMLCanvasElement, config: Config & { origin: FoldOrigin }): PaperRenderer {
  const { rect, origin } = config;
  validate(texture, rect);
  if (!['bottomLeft', 'bottomRight', 'topLeft', 'topRight', 'center'].includes(origin)) throw new Error('Unknown unfolding origin.');
  const back = backStock(texture), creases = creaseOverlay(texture);
  const creasedFront = makeCanvas(texture.width, texture.height), creasedContext = creasedFront.getContext('2d')!;
  creasedContext.drawImage(texture, 0, 0); creasedContext.drawImage(creases, 0, 0);
  const right = origin.endsWith('Right'), bottom = origin.startsWith('bottom');
  const signX = right ? -1 : 1, signY = bottom ? -1 : 1;
  const panelWidth = rect.width / 4, panelHeight = rect.height / 2;
  const anchor = origin === 'center'
    ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    : { x: rect.x + (right ? rect.width : 0), y: rect.y + (bottom ? rect.height : 0) };
  const camera = Math.max(rect.width, rect.height) * 4;
  return { draw(context, value) {
    const progress = clamp(value);
    if (progress >= 0.8) {
      context.drawImage(texture, rect.x, rect.y, rect.width, rect.height);
      context.save(); context.globalAlpha *= 1 - phase(progress, 0.8, 1);
      context.drawImage(creases, rect.x, rect.y, rect.width, rect.height); context.restore();
      return;
    }
    const arrival = phase(progress, 0, 0.16);
    const entranceX = -(rect.x + rect.width + 260) * (1 - arrival);
    const entranceY = -120 * (1 - arrival);
    const hinges = [0, ...[0, 1, 2].map(i => (i % 2 ? -1 : 1) * Math.PI * (1 - phase(progress, 0.16 + i * 0.13, 0.43 + i * 0.13)))];
    const rowAngle = Math.PI * (1 - phase(progress, 0.56, 0.8));
    const origins: Point[] = [{ x: 0, y: 0, z: 0 }], angles = [0];
    for (let col = 1; col < 4; col++) {
      const previous = origins[col - 1], angle = angles[col - 1];
      origins.push({ x: previous.x + panelWidth * Math.cos(angle), y: 0, z: previous.z! + panelWidth * Math.sin(angle) });
      angles.push(angle + hinges[col]);
    }
    const faces: Face[] = [];
    for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
      const angle = angles[col], beta = row ? rowAngle : 0;
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const source = corners.map(([u, v]) => ({
        x: (right ? 1 - (col + u) / 4 : (col + u) / 4) * texture.width,
        y: (bottom ? 1 - (row + v) / 2 : (row + v) / 2) * texture.height,
      }));
      const points = corners.map(([u, v]) => {
        const z = origins[col].z! + u * panelWidth * Math.sin(angle) + (row ? v * panelHeight * Math.sin(beta) : 0)
          + (col + row * 4) * 0.32 * (1 - phase(progress, 0.6, 0.8));
        const scale = camera / (camera - z);
        return { x: signX * (origins[col].x + u * panelWidth * Math.cos(angle)) * scale,
          y: signY * ((row ? panelHeight : 0) + v * panelHeight * Math.cos(beta)) * scale, z };
      });
      const nz = Math.cos(angle) * Math.cos(beta), nx = -Math.sin(angle) * Math.cos(beta), ny = -Math.cos(angle) * Math.sin(beta);
      const front = nz >= 0;
      const light = 0.64 + Math.abs(nz * 0.36 - nx * 0.16 - ny * 0.18);
      faces.push({ source, points, depth: points.reduce((sum, point) => sum + point.z!, 0) / 4,
        light: Math.min(1.04, light), back: !front || progress < 0.17 });
    }
    const points = faces.flatMap(face => face.points);
    const centerX = origin === 'center' ? (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2 : 0;
    const centerY = origin === 'center' ? (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2 : 0;
    for (const point of points) { point.x += anchor.x - centerX + entranceX; point.y += anchor.y - centerY + entranceY; }
    drawFaces(context, creasedFront, back, faces);
  } };
}

export function createStickerRenderer(texture: HTMLCanvasElement, config: Config): PaperRenderer {
  const { rect } = config;
  validate(texture, rect);
  // The reference shows the print on the turned-over free sheet too. A restrained
  // paper veil distinguishes that reverse face; geometry supplies its mirrored view.
  const back = makeCanvas(texture.width, texture.height), backContext = back.getContext('2d')!;
  backContext.drawImage(texture, 0, 0); backContext.globalCompositeOperation = 'source-atop';
  backContext.globalAlpha = 0.16; backContext.drawImage(backStock(texture), 0, 0);
  const width = rect.width, height = rect.height;
  const radius = Math.min(width, height) * 0.115;
  const diagonal = Math.SQRT1_2, extent = (width + height) * diagonal;
  const camera = Math.max(width, height) * 4;
  const columns = 36, rows = Math.max(16, Math.round(columns * height / width));
  return { draw(context, value) {
    const progress = clamp(value);
    if (progress >= 0.985) { context.drawImage(texture, rect.x, rect.y, width, height); return; }
    const arrival = phase(progress, 0, 0.27);
    const sticking = phase(progress, 0.27, 0.985);
    const bending = phase(progress, 0.18, 0.34);
    const foldLine = extent * sticking;
    const entranceX = -(rect.x + width + 320) * (1 - arrival), entranceY = -200 * (1 - arrival);
    const angle = -0.19 * (1 - arrival);
    const vertices: Point[][] = [];
    for (let row = 0; row <= rows; row++) {
      const line: Point[] = [];
      for (let col = 0; col <= columns; col++) {
        const x = width * col / columns, y = height * row / rows;
        const normal = (x + y) * diagonal, tangent = (x - y) * diagonal, distance = normal - foldLine;
        const theta = Math.min(Math.PI, Math.max(0, distance / radius));
        const curvedNormal = distance <= 0 ? normal : distance <= Math.PI * radius
          ? foldLine + radius * Math.sin(theta) : foldLine - (distance - Math.PI * radius);
        const z = radius * (1 - Math.cos(theta)) * bending;
        // The arriving print is horizontally mirrored; its free sheet bends into the diagonal curl.
        const foldedX = (curvedNormal + tangent) * diagonal, foldedY = (curvedNormal - tangent) * diagonal;
        const localX = (width - x) * (1 - bending) + foldedX * bending;
        const localY = y * (1 - bending) + foldedY * bending;
        const rotateX = (localX - width / 2) * Math.cos(angle) - (localY - height / 2) * Math.sin(angle) + width / 2;
        const rotateY = (localX - width / 2) * Math.sin(angle) + (localY - height / 2) * Math.cos(angle) + height / 2;
        const scale = camera / (camera - z);
        line.push({ x: rect.x + rotateX * scale + entranceX, y: rect.y + rotateY * scale + entranceY, z });
      }
      vertices.push(line);
    }
    const faces: Face[] = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const source = [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]]
        .map(([x, y]) => ({ x: x / columns * texture.width, y: y / rows * texture.height }));
      const points = [vertices[row][col], vertices[row][col + 1], vertices[row + 1][col + 1], vertices[row + 1][col]];
      const distance = ((col + 0.5) / columns * width + (row + 0.5) / rows * height) * diagonal - foldLine;
      const theta = Math.min(Math.PI, Math.max(0, distance / radius));
      const light = distance <= 0 ? 1 : 0.66 + Math.abs(Math.cos(theta) * 0.34 - Math.sin(theta) * 0.15);
      faces.push({ source, points, depth: points.reduce((sum, point) => sum + point.z!, 0) / 4,
        light: 1 + (light - 1) * bending, back: bending > 0.65 && theta > Math.PI / 2 });
    }
    drawFaces(context, texture, back, faces);
  } };
}
