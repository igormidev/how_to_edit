# Delivery review

Reviewed 2026-10-25. Final export: `deliverables/united-states-to-anarcho-capitalism.mp4`.

- HyperFrames 0.8.198 strict check passed with no errors or warnings in lint, browser runtime, layout, motion, contrast or craft audits. The browser ran; motion assertions sampled 241 times.
- Independently compared derived geometry against the frozen Census shapefile: no coordinate/geometry mismatches. All 1,407 rings are retained as closed SVG subpaths; no Alaska/Hawaii island loss.
- Verified 50 unique states plus DC, with 19 blue and 31 red states according to the FEC statewide presidential popular-vote results. DC is a federal district.
- Inspected full-resolution decoded MP4 frames at 2, 6.5 and 11.9 seconds. Initial blue/red palette, intermediate color blend and final yellow are visible. The map's outlines remain stationary; the yellow legend joins during the change and stays through the final hold.
- `ffprobe` confirmed H.264, YUV 4:2:0, 1920×1080, exactly 288 frames at 24 fps and 12 seconds. The output intentionally has no audio track.
- Preview was served and verified with HTTP 200 at port 3027. The source remains editable in HyperFrames.

The map faithfully retains the official 1:500,000 cartographic source. It is not cadastral or legal survey geometry. The inset projections and scales are documented in the README and source attribution.

Machine-readable results and delivery checksum are in `delivery-validation.json`.
