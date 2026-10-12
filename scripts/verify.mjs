#!/usr/bin/env node
// Observable renderer invariants, plus optional checks of a generated WebM folder.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { openRenderer, ROOT, command } from './lib/generate.mjs';

const { browser, page } = await openRenderer();
try {
  const source = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 300;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2485c1'; ctx.fillRect(12, 12, 456, 276);
    ctx.fillStyle = '#ee6848'; ctx.fillRect(12, 12, 130, 80);
    ctx.fillStyle = '#f7cf47'; ctx.fillRect(320, 190, 148, 98);
    return c.toDataURL('image/png');
  });
  const config = { kind: 'paper', source, stock: 'classic', roughness: .8, removeBackground: false };
  const paperMeta = await page.evaluate(c => window.initialize(c), config);
  const treated = await page.evaluate(() => window.png());
  await page.evaluate(c => window.initialize(c), config);
  assert.equal(await page.evaluate(() => window.png()), treated, 'Paper treatment must repeat identically');

  const box = { x: 480, y: 270, width: paperMeta.width * 2, height: paperMeta.height * 2 };
  const init = async (kind, extra = {}) => page.evaluate(c => window.initialize(c),
    { kind, source: treated, box, origin: 'center', flow: 'center', motion: 'direct', ...extra });
  const sample = async p => page.evaluate(progress => window.sample(progress), p);
  const bounds = async () => page.evaluate(() => {
    const c = document.querySelector('canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let left = c.width, top = c.height, right = -1, bottom = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return { left, top, right, bottom };
  });
  for (const kind of ['torn', 'unfold', 'sticker']) {
    const metadata = await init(kind);
    const final = await sample(1);
    await sample(.37);
    assert.equal(await sample(1), final, `${kind} must be identical after backward seeking`);
    const expected = await page.evaluate(async data => {
      const image = new Image(); image.src = data.texture; await image.decode();
      const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
      const r = data.rect; c.getContext('2d').drawImage(image, r.x, r.y, r.width, r.height);
      return c.toDataURL('image/png');
    }, metadata);
    assert.ok(final === expected, `${kind} final must exactly match the flat texture/rect`);
  }
  for (const origin of ['bottomLeft', 'bottomRight', 'topLeft', 'topRight', 'center']) {
    const metadata = await init('unfold', { origin });
    await sample(.16);
    const b = await bounds(), r = metadata.rect;
    assert.ok(b.right - b.left < r.width * .28 && b.bottom - b.top < r.height * .54, 'Folded packet must occupy one panel');
    if (origin === 'center') {
      assert.ok(Math.abs((b.left + b.right) / 2 - (r.x + r.width / 2)) < 2, 'Center fold x anchor');
      assert.ok(Math.abs((b.top + b.bottom) / 2 - (r.y + r.height / 2)) < 2, 'Center fold y anchor');
    } else {
      const right = origin.endsWith('Right'), bottom = origin.startsWith('bottom');
      assert.ok(right ? b.right > r.x + r.width - 3 : b.left < r.x + 3, 'Fold begins at selected x edge');
      assert.ok(bottom ? b.bottom > r.y + r.height - 3 : b.top < r.y + 3, 'Fold begins at selected y edge');
    }
    assert.notEqual(await sample(.8), await sample(1), 'Open sheet must retain creases before final fade');
  }
  const framed = await init('sticker', { media: true });
  assert.ok(framed.contentRect.width < framed.rect.width && framed.contentRect.height < framed.rect.height, 'Video needs paper frame');
  const hole = await page.evaluate(async data => {
    const image = new Image(); image.src = data.frame; await image.decode();
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
    const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
    return ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data[3];
  }, framed);
  assert.equal(hole, 0, 'Frame overlay must have a transparent live-video window');
  const catalog = JSON.parse(await readFile(join(ROOT, 'assets/transitions/audio/manifest.json'), 'utf8'));
  assert.equal(catalog.assets.length, 5);
  for (const asset of catalog.assets) {
    const bytes = await readFile(join(ROOT, 'assets/transitions/audio', asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `${asset.file} hash`);
    assert.equal(asset.playback_gain, 1);
  }
  if (process.argv[2]) {
    const output = resolve(process.argv[2]);
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
    const probe = JSON.parse(command('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', join(output, 'animation.webm')]));
    const video = probe.streams.find(s => s.codec_type === 'video');
    assert.equal(video.width, 1920); assert.equal(video.height, 1080);
    assert.equal(video.r_frame_rate, '24/1');
    const decoded = spawnSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-i', join(output, 'animation.webm'),
      '-vf', `select=eq(n\\,${manifest.frames - 1}),alphaextract`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'],
      { maxBuffer: 8 * 1024 * 1024 });
    assert.equal(decoded.status, 0, decoded.stderr.toString());
    assert.equal(decoded.stdout.length, 1920 * 1080);
    assert.ok(decoded.stdout.includes(0) && decoded.stdout.includes(255), 'Decoded alpha must have transparent exterior AND opaque artwork');
  }
  console.log('PASS: repeatable paper; seek-safe motion; exact final frames; five origins and creases; framed media; five sound hashes' + (process.argv[2] ? '; 1080p/24fps decoded WebM alpha' : ''));
} finally { await browser.close(); }
