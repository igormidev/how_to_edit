#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const help = 'node scripts/emphasis.mjs "word or short text" OUTPUT.png [--size 128]';
let browser;
try {
  const args = process.argv.slice(2), positional = [];
  let fontSize = 128;
  if (args.includes('--help')) { console.log(help); process.exit(0); }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--size') {
      if (!args[i + 1]) throw new Error('Missing value for --size');
      fontSize = Number(args[++i]);
    } else if (args[i].startsWith('--')) throw new Error(`Unknown option ${args[i]}`);
    else positional.push(args[i]);
  }
  if (positional.length !== 2) throw new Error(help);
  const [text, destination] = positional;
  if (!/\S/u.test(text)) throw new Error('Text must contain a visible character');
  if (!Number.isFinite(fontSize) || fontSize < 24 || fontSize > 512)
    throw new Error('--size must be 24..512 pixels');
  const output = resolve(destination);
  if (extname(output).toLowerCase() !== '.png') throw new Error('Output must be .png');
  const font = (await readFile(join(root, 'assets/fonts/Inter-Variable.ttf'))).toString('base64');
  const source = await readFile(join(root, 'assets/text/emphasis.js'), 'utf8');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.evaluate(async data => {
    const face = new FontFace('Bulletin Emphasis', `url(data:font/ttf;base64,${data})`, {
      weight: '900', style: 'normal', variationSettings: '"wght" 900, "opsz" 32',
    });
    document.fonts.add(await face.load());
    await document.fonts.ready;
  }, font);
  await page.addScriptTag({ content: source });
  const result = await page.evaluate(async options => {
    const canvas = await window.BulletinText.createWord(options.text, {
      fontSize: options.fontSize, seed: 1873,
    });
    return { png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  }, { text, fontSize });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(result.png.split(',')[1], 'base64'), { flag: 'wx' });
  console.log(`${output} (${result.width}×${result.height} pixels; display at half size)`);
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'Output already exists; choose a new filename' : error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
