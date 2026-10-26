import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROWS = 3, COLS = 15;
const NEUTRAL = '#343837', YELLOW = '#f4cb27', OUTLINE = '#101410';
const caption = 'Potential security entrepreneurs';
const people = Array.from({length:ROWS*COLS}, (_,i) => {
  const row=Math.floor(i/COLS), col=i%COLS;
  return {i,row,col,x:274+col*98,y:340+row*200,selected:col>=5&&col<=9};
});
const selected = people.filter(p=>p.selected);
const subset = selected.map((p,j)=>({...p,j,targetX:760+(j%5)*100,targetY:555+Math.floor(j/5)*150}));
const person = `<circle cx="0" cy="-73" r="18"/><path d="M-17-44C-25-44-31-39-34-29L-44 12C-46 20-42 25-36 26C-30 27-27 23-25 17L-20-4V27L-19 81C-19 89-15 94-9 94C-2 94 1 89 1 81V38H5V81C5 89 9 94 15 94C22 94 25 89 25 81L24 27V-4L29 17C31 24 35 27 41 25C47 23 49 19 47 12L37-29C34-39 28-44 20-44Z"/>`;
const crowd = people.map(p=>`<div id="crowd-person-${p.i}" class="person crowd-person" data-person-index="${p.i}" data-row="${p.row}" data-selected="${p.selected}"><svg viewBox="-50 -105 100 210" aria-hidden="true"><g id="crowd-ink-${p.i}" class="person-ink" fill="${NEUTRAL}">${person}</g></svg></div>`).join('\n');
const extracted = subset.map(p=>`<div id="subset-person-${p.j}" class="person subset-person" data-original-index="${p.i}" data-row="${p.row}"><svg viewBox="-50 -105 100 210" aria-hidden="true"><g class="person-ink" fill="${YELLOW}">${person}</g></svg></div>`).join('\n');
const captionLetters=Array.from(caption,c=>`<span class="caption-letter">${c===' '?'&nbsp;':c}</span>`).join('');

const scene = `<template>
<style>
@font-face{font-family:'Special Elite';src:url('assets/fonts/SpecialElite-Regular.ttf') format('truetype');font-weight:400;font-style:normal;font-display:block}
#root{position:absolute;inset:0;overflow:hidden;background:transparent}
#people-art{position:absolute;inset:0;width:100%;height:100%}
#full-group{position:absolute;left:224px;top:235px;width:1472px;height:610px}
#selected-group{position:absolute;inset:0}
.person{position:absolute;left:0;top:0;width:100px;height:210px}
.person svg{display:block;width:100%;height:100%;overflow:visible}
.person-ink{stroke:${OUTLINE};stroke-width:8;stroke-linecap:round;stroke-linejoin:round;paint-order:stroke fill}
#selection-outline{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#selection-frame{fill:none;stroke:${OUTLINE};stroke-width:6;stroke-linejoin:miter}
#selection-caption{position:absolute;left:0;top:973px;width:100%;height:56px;display:flex;justify-content:center;align-items:center;color:${OUTLINE};font:400 38px/1.3 'Special Elite';white-space:nowrap}
</style>
<div id="root" data-composition-id="people" data-width="1920" data-height="1080" data-duration="9">
<div id="people-art" role="img" aria-label="Forty-five people in three rows, with fifteen highlighted and extracted below while the complete group moves upward">
  <div id="full-group">${crowd}</div>
  <div id="selected-group">${extracted}</div>
</div>
<svg id="selection-outline" viewBox="0 0 1920 1080" aria-hidden="true"><rect id="selection-frame" x="660" y="465" width="600" height="485"/></svg>
<div id="selection-caption" aria-label="${caption}">${captionLetters}</div>
</div>
<script>
const tl=gsap.timeline({paused:true});
const crowdData=${JSON.stringify(people)};
const selectedData=${JSON.stringify(subset)};
crowdData.forEach(p=>{
  tl.fromTo('#crowd-person-'+p.i,
    {x:p.col*98,y:p.row*200+20,opacity:0},
    {x:p.col*98,y:p.row*200,opacity:1,duration:.48,ease:'power3.out'},p.col*.022+p.row*.09);
});
selectedData.forEach((p,j)=>{
  tl.to('#crowd-ink-'+p.i,{fill:'${YELLOW}',duration:.48,ease:'power2.inOut'},1.8+j*.025);
});
tl.fromTo('#full-group',
  {x:0,y:0,scale:1,transformOrigin:'50% 50%'},
  {x:0,y:-280,scale:.53,transformOrigin:'50% 50%',duration:1.65,ease:'power3.inOut'},3.2);
selectedData.forEach((p,j)=>{
  const selector='#subset-person-'+p.j;
  tl.fromTo(selector,{opacity:0},{opacity:1,duration:.01,ease:'none'},3.2+j*.012);
  tl.fromTo(selector,
    {x:p.x-50,y:p.y-105,scale:1,transformOrigin:'50% 50%'},
    {x:p.targetX-50,y:p.targetY-105,scale:.64,transformOrigin:'50% 50%',duration:1.65,ease:'power3.inOut'},3.2+j*.012);
});
const frameLength=2170;
tl.fromTo('#selection-frame',{strokeDasharray:frameLength+' '+frameLength,strokeDashoffset:frameLength,opacity:0},
  {strokeDashoffset:0,opacity:1,duration:.55,ease:'power2.inOut'},5.12);
tl.fromTo('.caption-letter',{opacity:0},{opacity:1,duration:.01,stagger:.02,ease:'none'},5.55);
window.__timelines['people']=tl;
</script>
</template>`;
const main = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=1920,height=1080"><title>People — Highlight and Extract a Subset</title><script src="assets/vendor/gsap.min.js"></script><style>html,body{margin:0;width:100%;height:100%;background:transparent}#root{position:relative;width:100%;height:100%;overflow:hidden}#people{position:absolute;inset:0}</style></head><body>
<div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-start="0" data-duration="9">
<div id="people" class="clip" data-composition-id="people" data-composition-src="compositions/people.html" data-width="1920" data-height="1080" data-start="0" data-duration="9" data-track-index="1" data-track-kind="graphics"></div>
</div><script>window.__timelines['main']=gsap.timeline({paused:true});</script></body></html>\n`;
await fs.writeFile(path.join(project,'compositions/people.html'),scene+'\n');
await fs.writeFile(path.join(project,'index.html'),main);
await fs.writeFile(path.join(project,'animation-spec.json'),JSON.stringify({
  width:1920,height:1080,fps:24,duration:9,background:'transparent',rows:ROWS,columns:COLS,
  population:people.length,selectedIndices:selected.map(p=>p.i),neutral:NEUTRAL,highlight:YELLOW,
  outline:{color:OUTLINE,width:8},initial:people,subset,
  highlightTiming:[1.8,2.63],splitTiming:[3.2,5.018],fullGroupFinal:{centerY:260,scale:.53},
  subsetScale:.64,fullGroupPreserved:true,
  frame:{x:660,y:465,width:600,height:485,strokeWidth:6,start:5.12,end:5.67},
  caption:{text:caption,start:5.55,end:6.2}
},null,2)+'\n');
console.log('Built 45 people in three rows, 15 selected people, strong dark borders, frame and caption.');
