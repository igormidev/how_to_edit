/** Repeatable paper lettering. Paper tilts independently; printed letters stay upright. */
(() => {
  const hash = (x, y, seed) => {
    let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const softNoise = (x, y, scale, seed) => {
    const px = x / scale, py = y / scale, ix = Math.floor(px), iy = Math.floor(py);
    const fade = t => t * t * (3 - 2 * t);
    const sx = fade(px - ix), sy = fade(py - iy);
    const top = hash(ix, iy, seed) * (1 - sx) + hash(ix + 1, iy, seed) * sx;
    const bottom = hash(ix, iy + 1, seed) * (1 - sx) + hash(ix + 1, iy + 1, seed) * sx;
    return top * (1 - sy) + bottom * sy;
  };
  const material = document.createElement('canvas');
  material.width = material.height = 256;
  const m = material.getContext('2d'), pixels = m.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const mottles = (softNoise(x, y, 6, 1873) - .5) * 20;
    const stock = (softNoise(x, y, 19, 727) - .5) * 10;
    const fibers = (softNoise(x, y, 2.3, 3217) - .5) * 6;
    const grain = mottles + stock + fibers + (hash(x, y, 913) - .5) * 2;
    const index = (y * 256 + x) * 4;
    pixels.data[index] = 216 + grain;
    pixels.data[index + 1] = 203 + grain;
    pixels.data[index + 2] = 186 + grain;
    pixels.data[index + 3] = 255;
  }
  m.putImageData(pixels, 0, 0);
  // Sparse soft gray-brown flecks sit within the stock's diffuse mottling.
  m.strokeStyle = 'rgba(100,86,68,.17)'; m.lineWidth = .8; m.lineCap = 'round';
  m.shadowColor = 'rgba(100,86,68,.1)'; m.shadowBlur = .35;
  for (let i = 0; i < 256 * 256 / 220; i++) {
    const x = hash(i, 1, 5431) * 256, y = hash(i, 2, 5431) * 256;
    m.beginPath(); m.moveTo(x, y);
    m.lineTo(x + (hash(i, 3, 5431) - .5) * 2.4, y + hash(i, 4, 5431) * 1.8); m.stroke();
  }

  function scrap(context, width, height, seed) {
    const points = [], size = Math.min(width, height), rough = size * .035;
    const corners = [[0, 0], [width, 0], [width, height], [0, height]];
    for (let side = 0; side < 4; side++) {
      const [x0, y0] = corners[side], [x1, y1] = corners[(side + 1) % 4];
      const length = Math.hypot(x1 - x0, y1 - y0);
      for (let distance = 0, i = 0; distance < length; i++) {
        const t = distance / length;
        const drift = (softNoise(distance, side * 31, size * .1, seed) - .5) * rough * 1.3;
        const jagged = (hash(i, side, seed) - .5) * rough * .6;
        const bite = hash(i, side + 9, seed) < .1 ? rough * (.5 + hash(i, side + 13, seed) * .4) : 0;
        const offset = Math.max(-rough * .85, Math.min(rough * .9, drift + jagged + bite));
        points.push([x0 + (x1 - x0) * t - (y1 - y0) / length * offset,
          y0 + (y1 - y0) * t + (x1 - x0) / length * offset]);
        distance += size * (.011 + hash(i, side + 5, seed) * .023);
      }
    }
    context.beginPath();
    points.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y));
    context.closePath();
    context.fillStyle = context.createPattern(material, 'repeat');
    // A faint contact shadow stays on existing scraps, leaving the exterior transparent.
    context.save(); context.globalCompositeOperation = 'source-atop';
    context.shadowColor = 'rgba(36,28,18,.1)'; context.shadowBlur = size * .024;
    context.shadowOffsetX = size * .006; context.shadowOffsetY = size * .016;
    context.fill(); context.restore();
    context.fill(); context.clip();
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
      let paperWidth = (advance + fontSize * (.20 + hash(i, 9, seed) * .08)) * .88;
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
