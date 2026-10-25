# United States → Anarcho-capitalism

12-second, 1920×1080, 24 fps animation for Ancap Bulletin. All visible text is English. The map reveals blue/red, holds, smoothly turns yellow from 4.5–8.5 seconds, and holds yellow until the end. The third legend appears exactly when the color transition begins.

## Deliverable

`deliverables/united-states-to-anarcho-capitalism.mp4` is the H.264 delivery file. `index.html` plus `compositions/us-map.html` form the editable HyperFrames project. The video is a silent insert intended for the channel's narration/timeline.

## Sources and interpretation

- [Census 2024 cartographic boundaries](https://www.census.gov/geographies/mapping-files/2024/geo/carto-boundary-file.html), 1:500,000; all 50 states and DC, with every source coordinate and polygon retained. The 5 U.S. territories are outside the requested state map.
- [FEC official 2024 presidential results](https://www.fec.gov/documents/5644/2024presgeresults.pdf). Initial colors use statewide popular-vote winners: Harris/Democratic = blue (19 states), Trump/Republican = red (31 states). Maine is blue and Nebraska red; congressional-district electoral splits are not the classification criterion.
- "Left-wing" and "Right-wing" are the requested legend labels and are represented here by those election results, not a claim about every resident's ideology. Yellow represents the requested anarcho-capitalist concept, not an observed election result.
- DC is included for geographic continuity and colored separately as a federal district; it is not counted as a state.
- Alaska and Hawaii use separate equal-area conic projections fitted to their complete geometry, including the Aleutians and northwestern Hawaiian Islands. Their inset scales differ from the contiguous states. No geographic morph, smoothing, distortion filter, or additional simplification is applied.
- The Census source is itself a small-scale cartographic generalization. It is not cadastral or legal boundary evidence. Coordinates are preserved exactly in GeoJSON; SVG output is rounded only at 0.00001 screen pixels.

Raw source files, checksums, derived data, preparation script, and projected bounds are in `assets/data/`. The generated SVG contains 1,407 closed polygon rings from 278,217 source coordinates, verified against the downloaded shapefile.

## Rebuild and edit

```sh
npm ci
npm run build
npm run check
npm run dev
npm run render
```

HyperFrames is pinned to 0.8.198 for this project. Local GSAP is 3.15.0 and D3 Geo is 3.1.1. Rendering does not fetch map data or fonts. The paper background and typefaces are copied from the existing channel assets. `scripts/build.mjs` owns the generated scene HTML: change layout, timing and palette there before rebuilding.

To reconstruct the geographic and election data, install `pyshp==3.1.6` and `pypdf==6.21.2` in a temporary Python environment and run `assets/data/prepare_data.py`; consult its header for the exact invocation and source filenames.
