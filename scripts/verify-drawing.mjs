#!/usr/bin/env node
// Observable silhouette, sprite-anchor and seek invariants; no video encodes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openRenderer, ROOT } from './lib/generate.mjs';

const sprite = JSON.parse(await readFile(join(ROOT, 'assets/transitions/drawing/hand-pen.json'), 'utf8'));
const handSource = `data:image/png;base64,${(await readFile(join(ROOT, 'assets/transitions/drawing/hand-pen.png'))).toString('base64')}`;
const { browser, page } = await openRenderer();
try {
  const source = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 420; c.height = 660;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#b73929';
    ctx.beginPath(); ctx.arc(210, 85, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(145, 130, 130, 300); ctx.fillRect(80, 200, 210, 50); ctx.fillRect(10, 210, 110, 3);
    ctx.beginPath(); ctx.moveTo(145, 430); ctx.lineTo(190, 430); ctx.lineTo(185, 645);
    ctx.lineTo(130, 645); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(230, 430); ctx.lineTo(275, 430); ctx.lineTo(310, 645);
    ctx.lineTo(255, 645); ctx.closePath(); ctx.fill();
    ctx.clearRect(180, 260, 50, 65);
    ctx.fillStyle = '#274b70'; ctx.fillRect(330, 70, 40, 90); ctx.clearRect(341, 83, 17, 58);
    ctx.fillRect(330, 540, 3, 3); // Tiny disconnected island between the normal sweep rows.
    window.drawingFixture = c; return c.toDataURL('image/png');
  });
  const expectedQuadrants = ['bottomRight', 'bottomLeft', 'topLeft', 'topRight',
    'bottomRight', 'bottomLeft', 'topLeft', 'topRight', 'bottomRight'];
  for (const [index, angle] of [45, 135, 225, 315, 0, 90, 180, 270, 360].entries()) {
    const initialized = await page.evaluate(config => window.initialize(config), {
      kind: 'drawing', source, handSource, tip: sprite.tip, armBase: sprite.armBase, angle,
      box: { x: 650, y: 180, width: 420, height: 660 },
    });
    const observed = await page.evaluate(({ rect, sprite }) => {
      const renderer = window.drawing, output = document.querySelector('canvas'), ctx = output.getContext('2d');
      const fixture = window.drawingFixture, pixels = fixture.getContext('2d').getImageData(0, 0, 420, 660).data;
      const supported = p => p.x >= 0 && p.y >= 0 && p.x < 420 && p.y < 660
        && pixels[(Math.floor(p.y) * 420 + Math.floor(p.x)) * 4 + 3] > 0;
      let unsupported = 0;
      for (const stroke of renderer.path.filter(s => s.paint)) {
        const count = Math.max(1, Math.ceil(Math.hypot(stroke.to.x - stroke.from.x, stroke.to.y - stroke.from.y) * 2));
        for (let i = 0; i <= count; i++) {
          const t = i / count;
          if (!supported({ x: stroke.from.x + (stroke.to.x - stroke.from.x) * t,
            y: stroke.from.y + (stroke.to.y - stroke.from.y) * t })) unsupported++;
        }
      }
      const render = (p, hideHand = false) => {
        let anchorError = 0, cutPixelsInside = 0;
        const original = ctx.drawImage;
        ctx.drawImage = function (image, ...args) {
          if (image instanceof HTMLImageElement && image.naturalWidth === sprite.width && image.naturalHeight === sprite.height) {
            const transform = this.getTransform();
            const tip = transform.transformPoint(new DOMPoint(sprite.tip.x + args[0], sprite.tip.y + args[1]));
            const target = renderer.sample(p).penTarget;
            anchorError = Math.hypot(tip.x - target.x, tip.y - target.y);
            const native = document.createElement('canvas'); native.width = sprite.width; native.height = sprite.height;
            native.getContext('2d').drawImage(image, 0, 0);
            const edge = native.getContext('2d').getImageData(0, 0, 1, sprite.height).data;
            for (let y = 0; y < sprite.height; y++) if (edge[y * 4 + 3]) {
              const point = transform.transformPoint(new DOMPoint(args[0], y + args[1]));
              if (point.x >= 0 && point.y >= 0 && point.x < 1920 && point.y < 1080) cutPixelsInside++;
            }
            if (hideHand) return;
          }
          return original.call(this, image, ...args);
        };
        let png;
        try { png = window.sample(p); } finally { ctx.drawImage = original; }
        const rgba = ctx.getImageData(0, 0, 1920, 1080).data;
        let visible = 0; for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) visible++;
        return { png, visible, anchorError, cutPixelsInside };
      };
      const initial = render(0), pauseA = render(.19), pauseB = render(.29), pauseArtwork = render(.29, true);
      const direct = render(.6); render(.8); const backward = render(.6);
      let badLiveTips = 0, worstAnchor = 0, cutPixelsInside = 0;
      for (const p of [.35, .6, .87]) {
        const pose = renderer.sample(p), actual = render(p);
        worstAnchor = Math.max(worstAnchor, actual.anchorError); cutPixelsInside += actual.cutPixelsInside;
        if (!pose.lift && !supported({ x: (pose.penTarget.x - rect.x) * 420 / rect.width,
          y: (pose.penTarget.y - rect.y) * 660 / rect.height })) badLiveTips++;
      }
      const completeBrush = render(.93 - 1e-9, true), final = render(1);
      const expected = document.createElement('canvas'); expected.width = 1920; expected.height = 1080;
      expected.getContext('2d').drawImage(fixture, rect.x, rect.y, rect.width, rect.height);
      return { initialVisible: initial.visible, pauseIdentical: pauseA.png === pauseB.png,
        pauseArtworkVisible: pauseArtwork.visible, seekIdentical: direct.png === backward.png,
        finalExact: final.png === expected.toDataURL(), brushFullyCoversSource: completeBrush.png === expected.toDataURL(),
        unsupported, badLiveTips, worstAnchor, cutPixelsInside };
    }, { rect: initialized.rect, sprite });
    const label = `angle ${angle}`;
    assert.equal(initialized.drawing.quadrant, expectedQuadrants[index], `${label}: quadrant boundary`);
    assert.equal(initialized.drawing.angle, angle % 360, `${label}: angle normalization`);
    assert.deepEqual(initialized.drawing.phases, { entry: .18, pause: .12, drawing: .63, exit: .07 });
    assert.equal(observed.initialVisible, 0, `${label}: initial frame must be entirely transparent`);
    assert.ok(observed.pauseIdentical, `${label}: hand must remain stationary during the pause`);
    assert.equal(observed.pauseArtworkVisible, 0, `${label}: artwork must stay hidden during the pause`);
    assert.ok(observed.seekIdentical, `${label}: backward seeking must repeat actual pixels`);
    assert.ok(observed.finalExact, `${label}: final artwork must exactly match source placement`);
    assert.ok(observed.brushFullyCoversSource, `${label}: the brush must finish coverage before the final handoff`);
    assert.equal(observed.unsupported, 0, `${label}: every painted centerline must follow source alpha`);
    assert.equal(observed.badLiveTips, 0, `${label}: sampled drawing tips must remain over visible artwork`);
    assert.ok(observed.worstAnchor < .001, `${label}: actual sprite draw must preserve the pen-tip anchor within .001 px`);
    assert.equal(observed.cutPixelsInside, 0, `${label}: native arm cutoff must remain outside the frame`);
  }
  console.log('PASS: nine entry angles; transparent start; stationary pause; silhouette strokes and holes; exact pen anchor; hidden arm cutoff; seek-safe masks; full brush coverage; exact final artwork');
} finally { await browser.close(); }
