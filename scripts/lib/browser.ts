import { preparePaperImage, prepareVideoFrame, createTornRenderer } from './paper';
import { createUnfoldingRenderer, createStickerRenderer } from './motion';

const W = 1920, H = 1080;
const canvas = document.createElement('canvas');
document.body.append(canvas);
let draw: (ctx: CanvasRenderingContext2D, progress: number) => void;

function fit(width: number, height: number, box: any) {
  const scale = Math.min(box.width / width, box.height / height);
  const w = width * scale, h = height * scale;
  return { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h };
}

(window as any).initialize = async (config: any) => {
  const source = new Image();
  source.src = config.source;
  await source.decode();
  if (config.kind === 'paper') {
    const result = await preparePaperImage(source, config);
    canvas.width = result.canvas.width; canvas.height = result.canvas.height;
    canvas.getContext('2d')!.drawImage(result.canvas, 0, 0);
    return { width: canvas.width, height: canvas.height, paperBounds: result.paperBounds,
      contentBounds: result.contentBounds, sourceBounds: result.sourceBounds };
  }
  let texture: HTMLCanvasElement, frame: HTMLCanvasElement | undefined, content: any;
  if (config.media) {
    const result = await prepareVideoFrame(source);
    texture = result.canvas; frame = result.frameOnly; content = result.contentBounds;
  } else {
    texture = document.createElement('canvas');
    texture.width = source.width; texture.height = source.height;
    texture.getContext('2d')!.drawImage(source, 0, 0);
  }
  canvas.width = W; canvas.height = H;
  const rect = fit(texture.width, texture.height, config.box);
  const options = { ...config, rect };
  const renderer = config.kind === 'torn' ? createTornRenderer(texture, options)
    : config.kind === 'unfold' ? createUnfoldingRenderer(texture, options)
    : createStickerRenderer(texture, options);
  draw = renderer.draw;
  // These dimensions are also used by the live HyperFrames <video> and frame overlay.
  const contentRect = content ? {
    x: rect.x + content.x * rect.width / texture.width,
    y: rect.y + content.y * rect.height / texture.height,
    width: content.width * rect.width / texture.width,
    height: content.height * rect.height / texture.height,
  } : null;
  return { rect, contentRect, texture: texture.toDataURL('image/png'),
    frame: frame?.toDataURL('image/png') ?? null };
};
(window as any).sample = (progress: number) => {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  draw(ctx, progress);
  return canvas.toDataURL('image/png');
};
(window as any).png = () => canvas.toDataURL('image/png');
