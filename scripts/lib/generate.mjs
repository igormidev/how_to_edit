import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm, access } from 'node:fs/promises';
import { dirname, resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium } from 'playwright';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const FPS = 24, WIDTH = 1920, HEIGHT = 1080;
const enums = {
  stock: ['classic', 'cream', 'gray', 'tabloid'],
  flow: ['center', 'topToBottom', 'bottomToTop', 'leftToRight', 'rightToLeft'],
  motion: ['direct', 'pageRiffle'],
  origin: ['bottomLeft', 'bottomRight', 'topLeft', 'topRight', 'center'],
};
const help = {
  paper: 'node scripts/paper.mjs INPUT OUTPUT.png [--roughness 0.8] [--stock classic] [--remove-background]',
  transition: 'node scripts/transition.mjs torn|unfold|sticker INPUT OUTPUT_DIR [--duration SECONDS] [--box x,y,width,height] [--flow center] [--motion direct] [--origin center] [--hold 4] [--no-loop]',
};

export function command(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${binary}: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}
function parse(mode, argv) {
  const positional = [], options = {};
  const allowed = mode === 'paper' ? ['roughness', 'stock', 'remove-background']
    : ['duration', 'box', 'flow', 'motion', 'origin', 'hold', 'no-loop'];
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) { positional.push(argv[i]); continue; }
    const key = argv[i].slice(2);
    if (!allowed.includes(key)) throw new Error(`Unknown option --${key}. ${help[mode]}`);
    if (key === 'remove-background' || key === 'no-loop') options[key] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for --${key}`);
      options[key] = argv[++i];
    }
  }
  if (positional.length !== (mode === 'paper' ? 2 : 3)) throw new Error(help[mode]);
  for (const [key, values] of Object.entries(enums)) {
    if (options[key] !== undefined && !values.includes(options[key])) throw new Error(`--${key}: use ${values.join(', ')}`);
  }
  const kind = mode === 'paper' ? mode : positional.shift();
  if (!['paper', 'torn', 'unfold', 'sticker'].includes(kind)) throw new Error(help[mode]);
  const number = (key, fallback, min, max) => {
    const n = Number(options[key] ?? fallback);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`--${key}: expected ${min}..${max}`);
    return n;
  };
  const boxValues = (options.box ?? '422.4,237.6,1075.2,604.8').split(',').map(Number);
  if (boxValues.length !== 4 || boxValues.some(n => !Number.isFinite(n))) throw new Error('--box requires x,y,width,height');
  const [x, y, width, height] = boxValues;
  if (x < 0 || y < 0 || width < 32 || height < 32 || x + width > WIDTH || y + height > HEIGHT)
    throw new Error('--box must fit inside 1920x1080 and be at least 32x32');
  if (kind !== 'torn' && (options.flow || options.motion)) throw new Error('--flow and --motion apply only to torn');
  if (kind !== 'unfold' && options.origin) throw new Error('--origin applies only to unfold');
  const duration = number('duration', kind === 'unfold' ? 3.2 : 2.8, 0.5, 30);
  return { kind, input: resolve(positional[0]), output: resolve(positional[1]),
    roughness: number('roughness', .8, 0, 1), stock: options.stock ?? 'classic',
    removeBackground: !!options['remove-background'], duration,
    flow: options.flow ?? 'center', motion: options.motion ?? 'direct',
    origin: options.origin ?? 'center', box: { x, y, width, height },
    hold: number('hold', 4, 1 / FPS, 3600), loop: !options['no-loop'] };
}
export async function openRenderer() {
  const bundle = await build({ entryPoints: [join(ROOT, 'scripts/lib/browser.ts')],
    bundle: true, write: false, format: 'iife', target: 'chrome120',
    loader: { '.webp': 'dataurl', '.png': 'dataurl' } });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  page.on('pageerror', error => { throw error; });
  await page.setContent('<!doctype html><html><body style="margin:0;background:transparent"></body></html>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return { browser, page };
}
export const dataPNG = value => Buffer.from(value.split(',')[1], 'base64');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const px = rect => `left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px`;
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

export function composition(manifest, templated = false) {
  const { kind, animationDuration: end, sceneDuration, rect, contentRect, sound, media } = manifest;
  const id = `bulletin-${kind}`;
  if (!templated) return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ancap Bulletin ${kind}</title><script src="gsap.min.js"></script>
<style>html,body{margin:0;background:transparent}#preview-${id}{position:relative;width:100%;height:100%;overflow:hidden}</style></head><body>
<div id="preview-${id}" data-composition-id="preview-${id}" data-start="0" data-width="1920" data-height="1080" data-duration="${sceneDuration}">
<div id="${id}-host" data-composition-id="${id}" data-composition-src="compositions/transition.html" data-start="0" data-duration="${sceneDuration}" data-track-index="0" data-width="1920" data-height="1080" style="position:absolute;inset:0"></div></div>
<script>(()=>{const clock={t:0};const tl=gsap.timeline({paused:true});tl.to(clock,{t:${sceneDuration},duration:${sceneDuration},ease:"none"});window.__timelines["preview-${id}"]=tl;})();</script></body></html>\n`;
  const hold = sceneDuration - end;
  const soundDuration = Math.min(sound.duration, sceneDuration - sound.offset);
  const body = `<div id="${id}" data-composition-id="${id}" data-start="0" data-width="1920" data-height="1080" data-duration="${sceneDuration}">
  <video id="${id}-intro" class="clip" src="animation.webm" muted playsinline data-start="0" data-duration="${end}" data-track-index="0" style="inset:0;width:100%;height:100%"></video>
  ${media ? `<video id="${id}-media" class="clip" src="${esc(media.file)}" muted playsinline ${media.loop ? 'loop' : ''} data-hf-media-start-basis="local" data-start="${end}" data-media-start="0" data-duration="${hold}" data-track-index="1" style="${px(contentRect)};object-fit:fill"></video>
  <img id="${id}-frame" class="clip" src="frame.png" data-start="${end}" data-duration="${hold}" data-track-index="2" style="${px(rect)}" alt="Classic paper frame">`
    : `<img id="${id}-final" class="clip" src="final.png" data-start="${end}" data-duration="${hold}" data-track-index="1" style="inset:0;width:100%;height:100%" alt="Assembled artwork">`}
  <audio id="${id}-sound" class="clip" src="sound.wav" data-hf-media-start-basis="local" data-start="${sound.offset}" data-duration="${soundDuration}" data-track-index="3" data-volume="${sound.gain}"></audio>
</div>
<style>#${id}{position:relative;width:100%;height:100%;overflow:hidden;background:transparent}#${id} .clip{position:absolute}</style>
<script src="gsap.min.js"></script>
<script>(()=>{const clock={t:0};const tl=gsap.timeline({paused:true});tl.to(clock,{t:${sceneDuration},duration:${sceneDuration},ease:"none"});window.__timelines["${id}"]=tl;})();</script>`;
  return `<template>\n${body.replaceAll('src="', 'src="../')}\n</template>\n`;
}

export async function run(mode, argv) {
  if (argv.includes('--help')) { console.log(help[mode]); return; }
  let browser, temp;
  try {
    const config = parse(mode, argv);
    await access(config.input);
    if (config.kind === 'paper' && extname(config.output).toLowerCase() !== '.png') throw new Error('Paper output must be .png');
    if (config.input === config.output) throw new Error('Input and output must differ');
    const media = /\.(mp4|mov|webm|mkv|m4v|avi|gif)$/i.test(config.input);
    if (media && (config.kind === 'paper' || config.kind === 'torn')) throw new Error('Paper and torn take a still image; video/GIF uses unfold or sticker');
    temp = await mkdtemp(join(tmpdir(), 'bulletin-'));
    let imageInput = config.input, sourceMedia = config.input, mediaInfo;
    if (media) {
      mediaInfo = JSON.parse(command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', config.input]));
      if (/\.gif$/i.test(config.input)) {
        sourceMedia = join(temp, 'source.webm');
        command('ffmpeg', ['-v', 'error', '-y', '-i', config.input, '-an', '-c:v', 'libvpx-vp9',
          '-lossless', '1', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', sourceMedia]);
      }
      imageInput = join(temp, 'first.png');
      const alphaVP9 = /\.gif$/i.test(config.input) || mediaInfo.streams.some(s => s.codec_name === 'vp9' && String(s.tags?.alpha_mode ?? s.tags?.ALPHA_MODE) === '1');
      command('ffmpeg', ['-v', 'error', '-y', ...(alphaVP9 ? ['-c:v', 'libvpx-vp9'] : []), '-i', sourceMedia, '-frames:v', '1', imageInput]);
    }
    const imageBytes = await readFile(imageInput);
    const mime = /\.jpe?g$/i.test(imageInput) ? 'image/jpeg' : /\.webp$/i.test(imageInput) ? 'image/webp' : 'image/png';
    const opened = await openRenderer(); browser = opened.browser;
    const { page } = opened;
    const result = await page.evaluate(c => window.initialize(c), { ...config, media, source: `data:${mime};base64,${imageBytes.toString('base64')}` });
    if (config.kind === 'paper') {
      await mkdir(dirname(config.output), { recursive: true });
      await writeFile(config.output, dataPNG(await page.evaluate(() => window.png())));
      await writeFile(`${config.output}.json`, JSON.stringify({ ...result, inputSha256: hash(await readFile(config.input)),
        style: { border: 12, roughness: config.roughness, stock: config.stock, tightCrop: true,
          crumpleDepth: .2, foldSize: 72, colorAging: 0, shadow: false, removeBackground: config.removeBackground },
        chromium: browser.version() }, null, 2) + '\n');
      console.log(config.output); return;
    }
    // Reuse requires a deliberate fresh directory; never overwrite a user's render.
    try { await access(config.output); throw new Error('Output directory already exists; choose a new directory'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await mkdir(config.output, { recursive: true });
    const frames = Math.ceil(config.duration * FPS - 1e-7), animationDuration = frames / FPS;
    for (let frame = 0; frame < frames; frame++) {
      const png = await page.evaluate(p => window.sample(p), frame / (frames - 1));
      await writeFile(join(temp, `${String(frame).padStart(4, '0')}.png`), dataPNG(png));
    }
    await copyFile(join(temp, `${String(frames - 1).padStart(4, '0')}.png`), join(config.output, 'final.png'));
    await writeFile(join(config.output, 'texture.png'), dataPNG(result.texture));
    command('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(temp, '%04d.png'),
      '-an', '-c:v', 'libvpx-vp9', '-lossless', '1', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0',
      '-threads', '4', '-row-mt', '0', '-metadata:s:v:0', 'alpha_mode=1', join(config.output, 'animation.webm')]);
    const catalog = JSON.parse(await readFile(join(ROOT, 'assets/transitions/audio/manifest.json'), 'utf8'));
    const sound = catalog.assets.find(asset => asset.transition === ({ torn: 'torn-assembly', unfold: 'unfolding', sticker: 'sticker' }[config.kind]));
    if (!sound) throw new Error(`Missing fixed sound for ${config.kind}`);
    await copyFile(join(ROOT, 'assets/transitions/audio', sound.file), join(config.output, 'sound.wav'));
    await copyFile(join(ROOT, 'node_modules/gsap/dist/gsap.min.js'), join(config.output, 'gsap.min.js'));
    let mediaRecord = null;
    if (media) {
      const gif = /\.gif$/i.test(config.input);
      const file = gif ? 'source.webm' : `source${extname(config.input).toLowerCase()}`;
      await copyFile(sourceMedia, join(config.output, file));
      await writeFile(join(config.output, 'frame.png'), dataPNG(result.frame));
      mediaRecord = { file, loop: config.loop, originalDuration: Number(mediaInfo.format.duration), audioMuted: true };
    }
    // The mirrored-to-curled arrival finishes at 34%; top-left is anchored then.
    const soundOffset = (config.kind === 'sticker' ? .34 : 0) * animationDuration;
    const manifest = { kind: config.kind, width: WIDTH, height: HEIGHT, fps: FPS, frames,
      requestedDuration: config.duration, animationDuration, requestedHold: config.hold,
      sceneDuration: Math.max(animationDuration + config.hold, soundOffset + sound.duration_seconds),
      rect: result.rect, contentRect: result.contentRect, flow: config.flow, motion: config.motion, origin: config.origin,
      inputSha256: hash(await readFile(config.input)), chromium: browser.version(),
      media: mediaRecord, sound: { ...sound, duration: sound.duration_seconds,
        gain: sound.playback_gain, offset: soundOffset } };
    await writeFile(join(config.output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(join(config.output, 'index.html'), composition(manifest));
    await mkdir(join(config.output, 'compositions'));
    await writeFile(join(config.output, 'compositions/transition.html'), composition(manifest, true));
    console.log(`${config.output} (${frames} frames, ${animationDuration.toFixed(6)} s at 24 fps)`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await browser?.close(); if (temp) await rm(temp, { recursive: true, force: true }); }
}
