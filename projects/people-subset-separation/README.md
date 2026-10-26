# People — highlight and extract a subset

A 9-second transparent Filmora overlay, 1920×1080 at 24 fps. Forty-five people form three horizontal rows of fifteen in the middle. The central five in each row turn yellow. All forty-five move upward while copies of the selected fifteen move into three centered rows of five below.

Every person has a strong 8 px dark outline for contrast over white. After separation, a 6 px rectangular frame draws around the lower group, followed by the exact caption **Potential security entrepreneurs**. The caption holds through the end. The scene has no background or audio.

- `deliverables/people-subset-3-rows-transparent.mov`: Apple ProRes 4444 with alpha, for placing on a Filmora track above your scene.
- `deliverables/people-subset-3-rows-preview.mp4`: a small review copy composited over white.
- The large ProRes MOV is generated locally; its source and validation report are versioned.
- Final delivery copy: `people-subset-3-rows-transparent.mov` in the user's Downloads folder.
- `index.html` and `compositions/people.html`: editable source. `scripts/build.mjs` owns the generated HTML.

```sh
npm run build
npm run check
npm run dev
npm run render
```

The project uses local GSAP 3.15.0, the bundled Special Elite font and HyperFrames 0.8.203. The renderer pin was updated from 0.8.198 to 0.8.203 and the complete browser checks passed on that version. Original vector person pictograms and a single deterministic paused GSAP timeline drive the scene.
