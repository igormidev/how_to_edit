/** Repeatable paper lettering. Paper tilts independently; printed letters stay upright. */
(() => {
  const hash = (x, y, seed) => {
    let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const material = document.createElement('canvas');
  material.width = material.height = 256;
  const m = material.getContext('2d'), pixels = m.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const noise = hash(x, y, 1873), cloud = hash(x >> 4, y >> 4, 727);
    const grain = (noise - .5) * 21 + (cloud - .5) * 4 - (noise < .012 ? 28 : 0);
    const index = (y * 256 + x) * 4;
    pixels.data[index] = 236 + grain;
    pixels.data[index + 1] = 232 + grain;
    pixels.data[index + 2] = 214 + grain;
    pixels.data[index + 3] = 255;
  }
  m.putImageData(pixels, 0, 0);

  function scrap(context, width, height, seed) {
    const points = [], rough = Math.min(width, height) * .028;
    const corners = [[0, 0], [width, 0], [width, height], [0, height]];
    for (let side = 0; side < 4; side++) {
      const [x0, y0] = corners[side], [x1, y1] = corners[(side + 1) % 4];
      const length = Math.hypot(x1 - x0, y1 - y0), count = Math.max(8, Math.ceil(length / 2.2));
      for (let i = 0; i < count; i++) {
        const t = i / count, offset = (hash(i, side, seed) - .35) * rough;
        points.push([x0 + (x1 - x0) * t - (y1 - y0) / length * offset,
          y0 + (y1 - y0) * t + (x1 - x0) / length * offset]);
      }
    }
    context.beginPath();
    points.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y));
    context.closePath(); context.clip();
    context.fillStyle = context.createPattern(material, 'repeat');
    context.fillRect(-rough, -rough, width + rough * 2, height + rough * 2);
    // Fine fibers belong to the stock, never to the ink or the canvas exterior.
    context.lineWidth = .34; context.strokeStyle = 'rgba(62,55,36,.12)';
    for (let i = 0; i < width * height / 38; i++) {
      const x = hash(i, 1, seed) * width, y = hash(i, 2, seed) * height;
      context.beginPath(); context.moveTo(x, y);
      context.lineTo(x + (hash(i, 3, seed) - .5) * 3, y + hash(i, 4, seed) * 2.1); context.stroke();
    }
  }

  async function createWord(text, { fontSize = 128, seed = 1873 } = {}) {
    if (typeof text !== 'string' || !text.trim() || /[\r\n]/.test(text)) throw new Error('Use a nonempty single line of text.');
    if (!Number.isFinite(fontSize) || fontSize < 12 || fontSize > 600) throw new Error('Font size must be 12–600 logical pixels.');
    const loaded = await document.fonts.load(`900 ${fontSize}px "Bulletin Emphasis"`, text);
    if (!loaded.length) throw new Error('Load the bundled Inter emphasis font before building paper lettering.');
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `900 ${fontSize}px "Bulletin Emphasis"`;
    const metrics = probe.measureText(text), pad = fontSize * .34;
    const ascent = Math.max(metrics.actualBoundingBoxAscent, fontSize * .74);
    const descent = Math.max(metrics.actualBoundingBoxDescent, fontSize * .05);
    const paperHeight = ascent + descent + fontSize * .29;
    const width = Math.ceil(metrics.width + pad * 2), height = Math.ceil(paperHeight + pad * 2);
    const canvas = document.createElement('canvas'), ratio = 2;
    if (width * ratio > 16384 || height * ratio > 16384) throw new Error('Text is too large for a word asset; render separate words.');
    canvas.width = width * ratio; canvas.height = height * ratio;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    canvas.style.display = 'block'; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', text);
    const context = canvas.getContext('2d'); context.scale(ratio, ratio);
    context.font = probe.font;
    const baseline = pad + fontSize * .14 + ascent;
    const letters = Array.from(new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(text), part => part.segment);
    let prefix = '';
    for (let i = 0; i < letters.length; i++) {
      const character = letters[i], advance = probe.measureText(character).width;
      const x = probe.measureText(prefix + character).width - advance; prefix += character;
      if (/\s/.test(character)) continue;
      const pieceSeed = (seed ^ Math.imul(i + 1, 1597334677)) >>> 0;
      let paperWidth = advance + fontSize * (.20 + hash(i, 9, seed) * .08);
      let h = paperHeight * (.86 + hash(i, 10, seed) * .26);
      const shiftX = (hash(i, 5, seed) - .5) * fontSize * .075;
      const shiftY = (hash(i, 6, seed) - .5) * fontSize * .30;
      const angle = (hash(i, 7, seed) - .5) * .26;
      const cx = pad + x + advance / 2 + shiftX, cy = pad + paperHeight / 2 + shiftY;
      const glyph = probe.measureText(character), cosine = Math.cos(angle), sine = Math.sin(angle);
      // Keep accents and descenders on their paper even after its independent tilt.
      for (const gx of [pad + x - glyph.actualBoundingBoxLeft, pad + x + glyph.actualBoundingBoxRight]) {
        for (const gy of [baseline - glyph.actualBoundingBoxAscent, baseline + glyph.actualBoundingBoxDescent]) {
          const dx = gx - cx, dy = gy - cy;
          paperWidth = Math.max(paperWidth, 2 * Math.abs(dx * cosine + dy * sine) + fontSize * .08);
          h = Math.max(h, 2 * Math.abs(-dx * sine + dy * cosine) + fontSize * .08);
        }
      }
      context.save();
      context.translate(cx, cy);
      context.rotate(angle); context.translate(-paperWidth / 2, -h / 2);
      scrap(context, paperWidth, h, pieceSeed); context.restore();
    }
    context.fillStyle = '#171305'; context.textBaseline = 'alphabetic';
    context.fillText(text, pad, baseline);
    return canvas;
  }
  window.BulletinText = Object.freeze({ createWord });
})();
