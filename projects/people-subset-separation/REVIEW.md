# Delivery review

Reviewed 2026-10-26. Final: `deliverables/people-subset-transparent.mov`.

- Apple ProRes 4444, decoded `yuva444p12le`, 1920×1080, 24 fps, exactly 192 frames / 8 seconds. Silent, with no paper or canvas background.
- HyperFrames browser check passed lint, runtime, layout, motion and contrast with zero errors. The sole craft warning is an intentional transparent frame 0 before the entrance begins; this is an overlay insert.
- Verified decoded pixels at 0.4, 1.3, 2.8, 4.1 and 7.5 seconds. Background points have zero alpha; fades and antialiased edges retain partial alpha.
- Verified the transparent 16×16 corner over all 192 frames.
- Counted opaque head silhouettes in the decoded video: 15 neutral people initially, 15 with exactly 5 yellow after selection, then 15 across the upper row (5 yellow) and 5 yellow across the lower row. The lower row is centered at x=959.5 pixels after rasterization.
- Inspected decoded selection and final frames over the checkerboard preview. The full group remains in frame above and the selected row is centered below.
- Local editor preview was opened on port 3031 and verified with HTTP 200. Filmora project import was not performed.

`delivery-validation.json` contains the codec probe, decoded color/alpha samples and SHA-256 checksum. The checkerboard exists only in the review MP4, not the transparent MOV.
