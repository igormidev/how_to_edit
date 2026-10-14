#!/usr/bin/env node
import { readFile, writeFile, mkdir, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { dirname, resolve, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { ROOT, WIDTH, HEIGHT, FPS, command, dataPNG } from './lib/generate.mjs';
import { MAGAZINE_RESOURCES } from '../assets/text/magazine.js';

const help = 'node scripts/magazine.mjs "TEXT" OUTPUT_DIR --duration SECONDS [--interval 0.52] [--size 112] [--seed 47]';
let browser, temp;
try {
  const args = process.argv.slice(2), positional = [], options = {};
  if (args.includes('--help')) { console.log(help); process.exit(0); }
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { positional.push(args[i]); continue; }
    const key = args[i].slice(2);
    if (!['duration', 'interval', 'size', 'seed'].includes(key)) throw new Error(`Unknown option --${key}`);
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = Number(args[++i]);
  }
  if (positional.length !== 2) throw new Error(help);
  if (options.duration === undefined) throw new Error('--duration is required; there is no default duration.');
  const number = (key, fallback, min, max) => {
    const value = options[key] ?? fallback;
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`--${key}: expected ${min}..${max}`);
    return value;
  };
  const input = { text: positional[0], duration: number('duration', undefined, 1 / FPS, 300),
    shuffleInterval: number('interval', .52, .08, 2), fontSize: number('size', 112, 16, 240),
    seed: number('seed', 47, 0, 2147483647) };
  const output = resolve(positional[1]);
  const source = (await readFile(join(ROOT, 'assets/text/magazine.js'))).toString('base64'), urls = {}, assets = [];
  for (const file of MAGAZINE_RESOURCES) {
    const bytes = await readFile(resolve(ROOT, 'assets/magazine', file));
    const mime = ({ '.json': 'application/json', '.webp': 'image/webp', '.ttf': 'font/ttf' })[extname(file)];
    urls[file] = `data:${mime};base64,${bytes.toString('base64')}`;
    assets.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><html><body style="margin:0;background:transparent"></body></html>');
  const result = await page.evaluate(async ({ source, input, urls }) => {
    const { prepareMagazine } = await import(`data:application/javascript;base64,${source}`);
    const scene = window.magazineScene = await prepareMagazine(input, { urls });
    document.body.append(scene.canvas);
    return { overflow: scene.overflow, fontSize: scene.fontSize, seed: scene.seed, shuffleInterval: scene.shuffleInterval };
  }, { source, input, urls });
  if (result.overflow) throw new Error('Text overflows its layout box; reduce --size or split the text.');
  // A new directory protects existing renders. Frames are sampled from timestamps, never playback state.
  await mkdir(dirname(output), { recursive: true }); await mkdir(output);
  temp = await mkdtemp(join(tmpdir(), 'bulletin-magazine-'));
  const frames = Math.ceil(input.duration * FPS - 1e-7), duration = frames / FPS;
  for (let index = 0; index < frames; index++) {
    const png = await page.evaluate(time => window.magazineScene.render(time).toDataURL('image/png'), index / FPS);
    await writeFile(join(temp, `${String(index).padStart(5, '0')}.png`), dataPNG(png));
  }
  await copyFile(join(temp, '00000.png'), join(output, 'first.png'));
  await copyFile(join(temp, `${String(frames - 1).padStart(5, '0')}.png`), join(output, 'final.png'));
  command('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', join(temp, '%05d.png'),
    '-an', '-c:v', 'libvpx-vp9', '-lossless', '1', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0',
    '-threads', '4', '-row-mt', '0', '-metadata:s:v:0', 'alpha_mode=1', join(output, 'animation.webm')]);
  await copyFile(join(ROOT, 'node_modules/gsap/dist/gsap.min.js'), join(output, 'gsap.min.js'));
  const manifest = { kind: 'magazine-font', style: 'magazine-mixed', text: input.text,
    width: WIDTH, height: HEIGHT, fps: FPS, ...result, requestedDuration: input.duration, frames, duration,
    chromium: browser.version(), assets };
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await mkdir(join(output, 'compositions'));
  await writeFile(join(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Magazine lettering</title><script src="gsap.min.js"></script><style>html,body{margin:0;background:transparent}#magazine-preview{position:relative;width:100%;height:100%;overflow:hidden}</style></head><body>
<div id="magazine-preview" data-composition-id="magazine-preview" data-start="0" data-width="1920" data-height="1080" data-duration="${duration}"><div id="bulletin-magazine" data-composition-id="bulletin-magazine" data-composition-src="compositions/magazine.html" data-start="0" data-duration="${duration}" data-track-index="0" data-width="1920" data-height="1080" style="position:absolute;inset:0"></div></div>
<script>(()=>{const clock={t:0},tl=gsap.timeline({paused:true});tl.to(clock,{t:${duration},duration:${duration},ease:"none"});window.__timelines["magazine-preview"]=tl;})();</script></body></html>\n`);
  await writeFile(join(output, 'compositions/magazine.html'), `<template>
<div id="bulletin-magazine" data-composition-id="bulletin-magazine" data-start="0" data-width="1920" data-height="1080" data-duration="${duration}"><video id="bulletin-magazine-video" class="clip" src="../animation.webm" muted playsinline data-start="0" data-duration="${duration}" data-track-index="0" style="position:absolute;inset:0;width:100%;height:100%"></video></div>
<style>#bulletin-magazine{position:relative;width:100%;height:100%;overflow:hidden;background:transparent}</style><script src="../gsap.min.js"></script>
<script>(()=>{const clock={t:0},tl=gsap.timeline({paused:true});tl.to(clock,{t:${duration},duration:${duration},ease:"none"});window.__timelines["bulletin-magazine"]=tl;})();</script>
</template>\n`);
  console.log(`${output} (${frames} frames, ${duration.toFixed(6)} s at 24 fps; shuffle every ${result.shuffleInterval} s)`);
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'Output directory already exists; choose a new directory' : error.message);
  process.exitCode = 1;
} finally {
  await browser?.close(); if (temp) await rm(temp, { recursive: true, force: true });
}
