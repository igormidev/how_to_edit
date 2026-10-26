# People — highlight and extract a subset

An 8-second transparent Filmora overlay, 1920×1080, 24 fps. Fifteen people form a horizontal line in the middle. The central five turn yellow. All fifteen move to the upper third while extracted copies of the selected five move into a larger row below. The upper group retains all fifteen so the complete population remains visible.

The scene contains original vector person pictograms, no text, no audio and no background. It uses local GSAP 3.15.0 and HyperFrames 0.8.198.

- `deliverables/people-subset-transparent.mov`: Apple ProRes 4444 with alpha, for Filmora. Import above the scene's video track.
- `deliverables/people-subset-preview.mp4`: small checkerboard review copy; the checkerboard is only in this preview.
- `index.html` and `compositions/people.html`: editable source. `scripts/build.mjs` owns the generated HTML.

```sh
npm run build
npm run check
npm run dev
npm run render
```

Registry search for people/group selection found avatar hover and text highlight effects but no matching population/subset extraction primitive. This scene uses simple geometric SVG pictograms and one deterministic, paused GSAP timeline.
