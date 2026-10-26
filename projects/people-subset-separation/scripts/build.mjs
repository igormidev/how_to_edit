import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = 15;
const selected = [5, 6, 7, 8, 9];
const NEUTRAL = '#343837';
const YELLOW = '#f4cb27';
const positions = Array.from({ length:N }, (_,i) => 274 + i*98);
const subsetPositions = selected.map((_,i) => 660+i*150);

// Original vector artwork, built from simple geometric person pictograms.
// No remote images, font icons, filters, textures or render-time dependencies.
const person = `
  <circle cx="0" cy="-73" r="18"/>
  <path d="M-17-44C-25-44-31-39-34-29L-44 12C-46 20-42 25-36 26C-30 27-27 23-25 17L-20-4V27L-19 81C-19 89-15 94-9 94C-2 94 1 89 1 81V38H5V81C5 89 9 94 15 94C22 94 25 89 25 81L24 27V-4L29 17C31 24 35 27 41 25C47 23 49 19 47 12L37-29C34-39 28-44 20-44Z"/>`;
const crowd = positions.map((x,i) => `<div id="crowd-person-${i}" class="person crowd-person" data-person-index="${i}" data-selected="${selected.includes(i)}"><svg viewBox="-50 -105 100 210" aria-hidden="true"><g id="crowd-ink-${i}" class="person-ink" fill="${NEUTRAL}">${person}</g></svg></div>`).join('\n');
const extracted = selected.map((originalIndex,i) => `<div id="subset-person-${i}" class="person subset-person" data-original-index="${originalIndex}"><svg viewBox="-50 -105 100 210" aria-hidden="true"><g class="person-ink" fill="${YELLOW}">${person}</g></svg></div>`).join('\n');

const scene = `<template>
<style>
#root{position:absolute;inset:0;overflow:hidden;background:transparent}
#people-art{position:absolute;inset:0;width:100%;height:100%}
#full-group{position:absolute;left:224px;top:435px;width:1472px;height:210px}
#selected-group{position:absolute;inset:0}
.person{position:absolute;left:0;top:0;width:100px;height:210px}
.person svg{display:block;width:100%;height:100%;overflow:visible}
.person-ink{stroke:#f3eddf;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;paint-order:stroke fill}
</style>
<div id="root" data-composition-id="people" data-width="1920" data-height="1080" data-duration="8">
<div id="people-art" role="img" aria-label="Fifteen people, with the middle five highlighted and extracted below while the complete group moves upward">
  <div id="full-group">${crowd}</div>
  <div id="selected-group">${extracted}</div>
</div>
</div>
<script>
const tl = gsap.timeline({paused:true});
const originalX = ${JSON.stringify(positions)};
const selectedIndices = ${JSON.stringify(selected)};
const targetX = ${JSON.stringify(subsetPositions)};

// A settled single row in the middle: each pictogram keeps its own position.
originalX.forEach((x,i) => {
  tl.fromTo('#crowd-person-'+i,
    {x:i*98,y:20,opacity:0},
    {x:i*98,y:0,opacity:1,duration:.48,ease:'power3.out'}, .035*i);
});

// Color only the central subset, then let the viewer read the selection.
selectedIndices.forEach((i,j) => {
  tl.to('#crowd-ink-'+i,{fill:'${YELLOW}',duration:.48,ease:'power2.inOut'},1.8+j*.07);
});

// The full group stays complete as it shrinks gently into the upper third.
tl.fromTo('#full-group',
  {x:0,y:0,scale:1,transformOrigin:'50% 50%'},
  {x:0,y:-260,scale:.82,transformOrigin:'50% 50%',duration:1.65,ease:'power3.inOut'},3.2);

// Duplicate selected people are initially superimposed on their originals.
// The originals go up with the full group; these extracted copies go down.
selectedIndices.forEach((personIndex,j) => {
  const selector='#subset-person-'+j;
  tl.fromTo(selector,{opacity:0},{opacity:1,duration:.01,ease:'none'},3.2+j*.035);
  tl.fromTo(selector,
    {x:originalX[personIndex]-50,y:435,scale:1,transformOrigin:'50% 50%'},
    {x:targetX[j]-50,y:663,scale:1.22,transformOrigin:'50% 50%',duration:1.65,ease:'power3.inOut'},3.2+j*.035);
});
window.__timelines['people']=tl;
</script>
</template>`;

const main = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=1920,height=1080"><title>People — Highlight and Extract a Subset</title><script src="assets/vendor/gsap.min.js"></script><style>html,body{margin:0;width:100%;height:100%;background:transparent}#root{position:relative;width:100%;height:100%;overflow:hidden}#people{position:absolute;inset:0}</style></head><body>
<div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-start="0" data-duration="8">
<div id="people" class="clip" data-composition-id="people" data-composition-src="compositions/people.html" data-width="1920" data-height="1080" data-start="0" data-duration="8" data-track-index="1" data-track-kind="graphics"></div>
</div><script>window.__timelines['main']=gsap.timeline({paused:true});</script></body></html>\n`;

await fs.writeFile(path.join(project,'compositions/people.html'),scene+'\n');
await fs.writeFile(path.join(project,'index.html'),main);
await fs.writeFile(path.join(project,'animation-spec.json'),JSON.stringify({
  width:1920,height:1080,fps:24,duration:8,background:'transparent',
  population:N,selectedIndices:selected,neutral:NEUTRAL,highlight:YELLOW,
  initial:{x:positions,y:540},
  highlight:{start:1.8,end:2.56},
  split:{start:3.2,end:4.99,fullGroupY:280,fullGroupScale:.82,subsetY:768,subsetScale:1.22,subsetX:subsetPositions},
  fullGroupPreserved:true
},null,2)+'\n');
console.log('Built 15-person population and 5-person highlighted subset.');
