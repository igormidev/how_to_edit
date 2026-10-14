/** Optional magazine lettering: fixed glyph positions and timestamp-seeded style swaps. */
const atlases = ['distressed', 'folded', 'textured'];
const fonts = [
  { id: 'inter', family: 'Bulletin Magazine Inter', weight: '700', file: '../fonts/Inter-Variable.ttf', variable: true },
  { id: 'editorial', family: 'Bulletin Magazine Editorial', weight: '700', file: 'fonts/LibreBaskerville-Variable.ttf', variable: true },
  { id: 'headline', family: 'Bulletin Magazine Headline', weight: '700', file: 'fonts/BarlowCondensed-Bold.ttf' },
  { id: 'typewriter', family: 'Bulletin Magazine Typewriter', weight: '400', file: '../fonts/SpecialElite-Regular.ttf' },
  { id: 'anton', family: 'Bulletin Magazine Anton', weight: '400', file: 'fonts/Anton-Regular.ttf' },
  { id: 'abril', family: 'Bulletin Magazine Abril', weight: '400', file: 'fonts/AbrilFatface-Regular.ttf' },
  { id: 'script', family: 'Bulletin Magazine Script', weight: '400', file: 'fonts/Courgette-Regular.ttf' },
];
export const MAGAZINE_RESOURCES = Object.freeze([
  ...atlases.flatMap(name => [`${name}.webp`, `${name}.json`]), ...fonts.map(font => font.file),
]);
let defaultAssets;
export async function loadMagazineAssets({ urls, assetBase } = {}) {
  const load = async () => {
    const resource = file => urls?.[file] ?? new URL(file, assetBase ?? new URL('../magazine/', import.meta.url)).href;
    const images = atlases.map(async name => {
      const image = new Image(); image.src = resource(`${name}.webp`); await image.decode();
      const response = await fetch(resource(`${name}.json`));
      if (!response.ok) throw new Error(`Cannot load magazine map ${name}`);
      return { image, glyphs: await response.json() };
    });
    const fontLoads = fonts.map(async font => {
      const face = new FontFace(font.family, `url("${resource(font.file)}")`, { weight: font.variable ? '100 900' : font.weight });
      document.fonts.add(await face.load());
    });
    const [loadedAtlases] = await Promise.all([Promise.all(images), Promise.all(fontLoads)]);
    return loadedAtlases;
  };
  if (urls || assetBase) return load();
  return defaultAssets ??= load().catch(error => { defaultAssets = undefined; throw error; });
}

export function textFrameSeed(seed, index, tick) {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(tick + 1, 0x85ebca6b)) >>> 0;
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}
export function textVariantIndex(seed, index, tick, variantCount) {
  if (variantCount < 2 || tick <= 0) return 0;
  const stride = 1 + textFrameSeed(seed, index, 0) % (variantCount - 1);
  return Math.floor(tick) * stride % variantCount;
}
const graphemes = text => typeof Intl.Segmenter === 'function'
  ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), part => part.segment)
  : Array.from(text);
const fontString = (font, size) => `${font.weight} ${size}px "${font.family}", sans-serif`;
const bounded = (value, fallback, min, max, step = .01) => {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Number((Math.min(max, Math.max(min, Math.round(number / step) * step))).toFixed(4));
};
function normalize(input) {
  if (!input || !Number.isFinite(input.duration) || input.duration <= 0 || input.duration > 300)
    throw new Error('Magazine lettering requires an explicit duration greater than 0 and at most 300 seconds.');
  if (typeof input.text !== 'string' || !/\S/u.test(input.text) || input.text.length > 2000)
    throw new Error('Supply visible text of at most 2000 characters.');
  return {
    text: input.text.replace(/\r\n?/g, '\n'), duration: input.duration, width: 1920, height: 1080, fps: 24,
    fontSize: bounded(input.fontSize, 112, 16, 240, 1), seed: bounded(input.seed, 47, 0, 2147483647, 1),
    shuffleInterval: bounded(input.shuffleInterval, .52, .08, 2, .02),
    boxWidth: bounded(input.boxWidth, 86, 10, 100, 1), boxHeight: bounded(input.boxHeight, 80, 10, 100, 1),
    boxX: bounded(input.boxX, 50, 0, 100, 1), boxY: bounded(input.boxY, 50, 0, 100, 1),
    alignment: input.alignment === 'left' || input.alignment === 'right' ? input.alignment : 'center',
    lineHeight: bounded(input.lineHeight, 1.35, 1, 2.5, .05), letterSpacing: bounded(input.letterSpacing, 3, -5, 30, 1),
  };
}
function getBox(settings) {
  const width = settings.width * settings.boxWidth / 100, height = settings.height * settings.boxHeight / 100;
  return { width, height, x: (settings.width - width) * settings.boxX / 100, y: (settings.height - height) * settings.boxY / 100 };
}
function layoutText(settings, measure) {
  const box = getBox(settings), words = [...settings.text.matchAll(/\S+/gu)].map((match, index) => ({
    text: match[0], start: match.index, end: match.index + match[0].length, index,
  }));
  const lines = [{ glyphs: [], width: 0 }]; let line = lines[0], glyphIndex = 0, previousEnd = 0;
  const nextLine = () => { line = { glyphs: [], width: 0 }; lines.push(line); };
  for (const word of words) {
    const measured = graphemes(word.text).map((character, characterIndex) => ({
      character, characterIndex, index: glyphIndex++, width: Math.max(1, measure(character, glyphIndex - 1)),
    }));
    const whitespace = settings.text.slice(previousEnd, word.start); previousEnd = word.end;
    const breaks = whitespace.match(/\n/g)?.length ?? 0;
    for (let n = 0; n < breaks; n++) nextLine();
    const trailingSpace = breaks > 0 ? whitespace.slice(whitespace.lastIndexOf('\n') + 1) : whitespace;
    const gap = trailingSpace.replace(/\t/g, '    ').length * settings.fontSize * .32;
    const wordWidth = measured.reduce((sum, glyph) => sum + glyph.width, 0) + Math.max(0, measured.length - 1) * settings.letterSpacing;
    if (line.glyphs.length > 0 && line.width + gap + wordWidth > box.width) nextLine();
    else if (line.glyphs.length > 0 || breaks > 0) line.width += gap;
    for (const glyph of measured) {
      const letterGap = line.glyphs.length > 0 && glyph.characterIndex > 0 ? settings.letterSpacing : 0;
      if (line.glyphs.length && line.width + letterGap + glyph.width > box.width) nextLine();
      else line.width += letterGap;
      line.glyphs.push({ ...glyph, wordIndex: word.index, x: line.width, y: 0 }); line.width += glyph.width;
    }
  }
  for (let n = 0; n < (settings.text.slice(previousEnd).match(/\n/g)?.length ?? 0); n++) nextLine();
  const rotationPadding = settings.fontSize * .04;
  const contentHeight = settings.fontSize + rotationPadding * 2 + (lines.length - 1) * settings.fontSize * settings.lineHeight;
  const top = box.y + Math.max(0, (box.height - contentHeight) / 2);
  const glyphs = lines.flatMap((item, row) => {
    const offset = settings.alignment === 'left' ? 0 : settings.alignment === 'right' ? box.width - item.width : (box.width - item.width) / 2;
    return item.glyphs.map(glyph => ({ ...glyph, x: box.x + offset + glyph.x, y: top + rotationPadding + row * settings.fontSize * settings.lineHeight }));
  });
  const contentWidth = Math.max(0, ...lines.map(item => item.width));
  return { glyphs, lines: lines.length, contentWidth, contentHeight, overflow: contentHeight > box.height + .01 || contentWidth > box.width + .01 };
}
function drawFallbackPaper(context, width, height, seed, color) {
  context.fillStyle = color; context.beginPath();
  context.moveTo(-width / 2 + 2, -height / 2 + seed % 4);
  context.lineTo(width / 2 - 1, -height / 2 + (seed >>> 3) % 3);
  context.lineTo(width / 2, height / 2 - 2); context.lineTo(-width / 2, height / 2);
  context.closePath(); context.fill();
}

export async function prepareMagazine(input, resources) {
  const settings = normalize(input), assets = await loadMagazineAssets(resources);
  const measurement = document.createElement('canvas').getContext('2d'), lookCache = new Map();
  const paperColors = ['#eee4cf', '#d9cbad', '#ece9df', '#ca4a33', '#252b2d', '#cbbd6c'];
  const looksFor = (character, index) => {
    const key = `${index}:${character}`; if (lookCache.has(key)) return lookCache.get(key);
    const looks = Array.from({ length: 3 }, (_, variant) => {
      const seed = textFrameSeed(settings.seed, index, variant), font = fonts[seed % fonts.length];
      const baseMagazine = textFrameSeed(settings.seed, index, 0) % 3, atlas = assets[(baseMagazine + variant) % 3];
      const key = character.toUpperCase(), bounds = atlas.glyphs[key] ?? assets[0].glyphs[key];
      const tile = bounds ? { image: atlas.glyphs[key] ? atlas.image : assets[0].image, ...bounds } : undefined;
      measurement.font = fontString(font, settings.fontSize * (tile ? 1 : .76));
      const width = tile ? settings.fontSize * tile.sw / tile.sh : measurement.measureText(character).width + settings.fontSize * .17;
      const paper = paperColors[seed % paperColors.length];
      return { tile, font, width, rotation: ((seed >>> 9) % 601 - 300) * Math.PI / 18000,
        paper, ink: paper === '#252b2d' || paper === '#ca4a33' ? '#fff3dc' : '#242220' };
    });
    lookCache.set(key, looks); return looks;
  };
  const layout = layoutText(settings, (character, index) => Math.max(...looksFor(character, index).map(look => look.width)) + settings.fontSize * .07);
  const canvas = document.createElement('canvas'); canvas.width = settings.width; canvas.height = settings.height;
  canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.display = 'block';
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', settings.text);
  function draw(context, time, still) {
    context.save(); context.setTransform(1, 0, 0, 1, 0, 0); context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1; context.shadowColor = 'transparent'; context.shadowBlur = 0; context.filter = 'none';
    context.clearRect(0, 0, settings.width, settings.height);
    const tick = still ? 0 : Math.max(0, Math.floor(time / settings.shuffleInterval + 1e-8));
    for (const glyph of layout.glyphs) {
      const looks = looksFor(glyph.character, glyph.index), look = looks[textVariantIndex(settings.seed, glyph.index, tick, looks.length)];
      context.save(); context.translate(glyph.x + glyph.width / 2, glyph.y + settings.fontSize / 2); context.rotate(look.rotation);
      if (look.tile) {
        const tile = look.tile;
        context.drawImage(tile.image, tile.sx, tile.sy, tile.sw, tile.sh, -look.width / 2, -settings.fontSize / 2, look.width, settings.fontSize);
      } else {
        drawFallbackPaper(context, look.width, settings.fontSize, textFrameSeed(settings.seed, glyph.index, tick), look.paper);
        context.font = fontString(look.font, settings.fontSize * .76); context.fillStyle = look.ink;
        context.textAlign = 'center'; context.textBaseline = 'alphabetic';
        const metrics = context.measureText(glyph.character);
        context.fillText(glyph.character, 0, (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2);
      }
      context.restore();
    }
    context.restore(); return canvas;
  }
  const renderFrame = (context, time) => draw(context, Math.max(0, Number.isFinite(time) ? time : 0), false);
  return { canvas, ...settings, box: getBox(settings), layout, overflow: layout.overflow,
    renderFrame, render: time => renderFrame(canvas.getContext('2d'), time),
    renderStill: (context = canvas.getContext('2d')) => draw(context, 0, true) };
}
