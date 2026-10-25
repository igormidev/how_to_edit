import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoAlbers, geoConicEqualArea, geoPath } from 'd3-geo';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await fs.readFile(path.join(root, 'assets/data/us-states-2024.geojson'), 'utf8'));
const BLUE = '#2467b3';
const RED = '#c6413e';
const YELLOW = '#f4cb27';
const states = data.features.filter(f => f.properties.entity_type === 'state');
if (states.length !== 50 || new Set(states.map(f => f.properties.STUSPS)).size !== 50) throw new Error('Expected exactly 50 unique states.');
const conus = data.features.filter(f => !['AK', 'HI'].includes(f.properties.STUSPS));
const alaska = data.features.find(f => f.properties.STUSPS === 'AK');
const hawaii = data.features.find(f => f.properties.STUSPS === 'HI');
const collection = features => ({ type: 'FeatureCollection', features });

// Separate projections prevent the stock geoAlbersUsa composite from clipping
// the Aleutians and northwestern Hawaiian Islands. No geographic simplification.
const projections = {
  conus: geoAlbers().precision(0.05).fitExtent([[195, 192], [1725, 840]], collection(conus)),
  AK: geoConicEqualArea().parallels([55, 65]).rotate([154, 0]).center([0, 58.5])
    .precision(0.05).fitExtent([[238, 677], [580, 841]], alaska),
  HI: geoConicEqualArea().parallels([8, 18]).rotate([158, 0]).center([0, 20])
    .precision(0.05).fitExtent([[624, 755], [876, 837]], hawaii),
};

const metrics = [];
const paths = data.features.map(feature => {
  const code = feature.properties.STUSPS;
  const projection = projections[code] || projections.conus;
  const renderer = geoPath(projection).digits(5);
  const d = renderer(feature);
  if (!d || /NaN|Infinity/.test(d)) throw new Error(`Invalid path for ${code}`);
  const bounds = renderer.bounds(feature);
  metrics.push({code, entity: feature.properties.entity_type, party: feature.properties.party, bounds, pathLength: d.length});
  const color = feature.properties.party === 'Democratic' ? BLUE : RED;
  const kind = feature.properties.entity_type === 'state' ? 'state' : 'federal-district';
  return `<path id="map-${code}" class="state-fill ${kind}" data-state="${code}" data-party="${feature.properties.party}" d="${d}" fill="${color}"><title>${feature.properties.NAME}</title></path>`;
}).join('\n');

const scene = `<template>
<style>
@font-face{font-family:'Special Elite';src:url('assets/fonts/SpecialElite-Regular.ttf') format('truetype');font-weight:400;font-style:normal;font-display:block}
@font-face{font-family:'Inter';src:url('assets/fonts/Inter-Variable.ttf') format('truetype');font-weight:100 900;font-style:normal;font-display:block}
#root{position:absolute;inset:0;color:#22211d;overflow:hidden}
.map-title{position:absolute;left:192px;right:192px;top:81px;margin:0;text-align:center;font:400 54px/1.25 'Special Elite';letter-spacing:5px}
.map-rule{position:absolute;left:812px;top:164px;width:296px;height:2px;background:#37332b;opacity:.48}
.map-art{position:absolute;inset:0;width:1920px;height:1080px}
.state-fill{stroke:#35332c;stroke-width:1.3;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
.inset-label{position:absolute;font:400 28px/1.4 'Special Elite';letter-spacing:1px;color:#403b31}
#map-ak-label{left:273px;top:838px}
#map-hi-label{left:700px;top:838px}
.inset-divider{stroke:#746c5c;stroke-width:1;stroke-dasharray:4 6;opacity:.48;fill:none}
.legend-item{position:absolute;top:928px;display:flex;align-items:center;gap:17px;height:55px;white-space:nowrap;font:400 34px/1.4 'Special Elite'}
.legend-square{width:38px;height:38px;flex:none;border:1.5px solid #35332c}
#map-left{left:460px}
#map-right{left:1030px}
#map-ancap{left:1195px;font-size:33px}
.map-footnote{position:absolute;left:192px;right:192px;top:1005px;text-align:center;font:400 28px/1.4 'Inter';color:#484237;letter-spacing:.25px;margin:0}
</style>
<div id="root" data-composition-id="us-map" data-width="1920" data-height="1080" data-duration="12">
  <h1 id="map-title" class="map-title">${Array.from('UNITED STATES', c => `<span class="map-title-glyph">${c === ' ' ? '&nbsp;' : c}</span>`).join('')}</h1>
  <div id="map-rule" class="map-rule" aria-hidden="true"></div>
  <svg id="map-art" class="map-art" viewBox="0 0 1920 1080" role="img" aria-label="The 50 United States and District of Columbia, with Alaska and Hawaii in separate insets">
    <g id="map-states">${paths}</g>
    <path id="map-inset-divider" class="inset-divider" d="M210 668V883H889" />
  </svg>
  <div id="map-ak-label" class="inset-label">ALASKA</div>
  <div id="map-hi-label" class="inset-label">HAWAII</div>
  <div id="map-left" class="legend-item"><span class="legend-square" style="background:${BLUE}"></span><span>Left-wing</span></div>
  <div id="map-right" class="legend-item"><span class="legend-square" style="background:${RED}"></span><span>Right-wing</span></div>
  <div id="map-ancap" class="legend-item"><span class="legend-square" style="background:${YELLOW}"></span><span>Anarcho-capitalism</span></div>
  <p id="map-footnote" class="map-footnote">Initial colors: 2024 presidential vote by state</p>
</div>
<script>
const mapTimeline = gsap.timeline({ paused:true });
const mapPaths = Array.from(document.querySelectorAll('#map-states .state-fill'));
mapTimeline.fromTo('.map-title-glyph', {opacity:0}, {opacity:1,duration:.01,stagger:.035,ease:'none'}, 0);
mapTimeline.fromTo('#map-rule', {opacity:0}, {opacity:1,duration:.5,ease:'power2.out'}, 0);
mapPaths.forEach((el, i) => {
  const length = el.getTotalLength();
  mapTimeline.fromTo(el, {strokeDasharray:length+' '+length,strokeDashoffset:length,fillOpacity:0},
    {strokeDashoffset:0,fillOpacity:1,duration:1.25,ease:'power2.inOut'}, .12+(i%7)*.035);
});
mapTimeline.fromTo('#map-left, #map-right, #map-ak-label, #map-hi-label, #map-inset-divider, #map-footnote',
  {opacity:0},{opacity:1,duration:.55,ease:'power2.out'}, .35);
mapTimeline.to('#map-left',{x:-207,duration:.8,ease:'power2.inOut'},4.5);
mapTimeline.to('#map-right',{x:-310,duration:.8,ease:'power2.inOut'},4.5);
mapTimeline.fromTo('#map-ancap',{opacity:0,y:12},{opacity:1,y:0,duration:.8,ease:'power2.out'},4.5);
// Tween only the vector fills; every coordinate and border remains fixed.
mapTimeline.to('#map-states .state-fill',{fill:'${YELLOW}',duration:4,ease:'power2.inOut'},4.5);
window.__timelines['us-map'] = mapTimeline;
</script>
</template>`;

const index = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=1920,height=1080"><title>United States — Anarcho-capitalism</title><script src="assets/vendor/gsap.min.js"></script><style>html,body{margin:0;width:100%;height:100%;background:transparent}#root{position:relative;width:100%;height:100%;overflow:hidden}#us-map{position:absolute;inset:0}</style></head>
<body><div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-duration="12" data-start="0">
<div id="us-map" class="clip" data-composition-id="us-map" data-composition-src="compositions/us-map.html" data-width="1920" data-height="1080" data-start="0" data-duration="12" data-track-index="1" data-track-kind="graphics"></div>
</div><script>window.__timelines['main']=gsap.timeline({paused:true});</script></body></html>`;
await fs.writeFile(path.join(root,'compositions/us-map.html'),scene);
await fs.writeFile(path.join(root,'index.html'),index);
await fs.writeFile(path.join(root,'assets/data/render-geometry.json'),JSON.stringify({projection:'Separate Albers / conic equal-area projections, no clip extent',geographicSimplification:false,screenPathDecimalPlaces:5,features:metrics},null,2)+'\n');
console.log(`Built ${states.length} states + DC; ${paths.length.toLocaleString()} SVG characters.`);
