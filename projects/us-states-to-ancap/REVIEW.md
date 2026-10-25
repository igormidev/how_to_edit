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

## Transparent Filmora revision

The current composition has no paper video and no opaque canvas background. Exported `deliverables/united-states-to-anarcho-capitalism-transparent.mov` as Apple ProRes 4444 with alpha, 1920×1080, 24 fps, 12 seconds / 288 frames. FFprobe reports `prores`, profile `4444`, `yuva444p12le`. The large MOV is generated locally and excluded from Git; its checksum and decoded alpha results are tracked in `transparent-delivery-validation.json`.

Decoded pixels at 0.7, 2, 6.5 and 11.9 seconds have fully transparent exterior regions, opaque state interiors after the entrance, and partial alpha on fades/edges. All 288 frames have a fully transparent 16×16 corner. All 50 states are opaque after the entrance and yellow at the end. Inspected the decoded midpoint over a checkerboard. The updated HyperFrames browser check passed; its sole craft warning is the intentional initial reading hold, now visible to that audit because the moving paper background has been removed. Geometry, legend timing, typography and the original MP4 remain unchanged.

Filmora import was not exercised in a user project. [Filmora Mac input specifications](https://filmora.wondershare.com/mac-tech-spec.html) list ProRes MOV; [Wondershare alpha-channel guidance](https://support.wondershare.com/how-tos/filmora/how-do-i-export-a-video-with-alpha-channel.html) identifies ProRes 4444 for transparent video.
