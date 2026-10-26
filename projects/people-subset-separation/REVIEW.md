# Delivery review

Reviewed 2026-10-26. Current final: `deliverables/people-subset-3-rows-transparent.mov`, with an identical copy in the user's Downloads folder.

- Apple ProRes 4444, decoded `yuva444p12le`, 1920×1080, 24 fps, exactly 216 frames / 9 seconds. Silent and transparent.
- HyperFrames was updated from 0.8.198 to 0.8.203. The complete browser check passed on 0.8.203 with zero errors and zero warnings across lint, runtime, layout, motion, contrast and craft.
- Decoded head silhouettes confirm three initial rows of 15 people (45 total), five yellow people in each row after highlighting (15 selected), three upper rows of 15 after separation, and three lower rows of five yellow people.
- Every person has an 8 px dark vector outline. Decoded pixels confirm opaque dark edges on yellow people for contrast against white.
- The 6 px rectangular frame is absent at 5.05 s and present after separation, starting at 5.12 s. The exact caption is "Potential security entrepreneurs"; it appears beneath the frame and holds through the end.
- Background sample points are transparent and all 216 frames have a transparent 16×16 corner. Fade and edge alpha are preserved.
- Inspected the final decoded frame composited over white: borders, full crowd, separated group, frame and complete caption are readable and unclipped.
- The Downloads copy was checked byte-for-byte by SHA-256. The 142 MiB MOV is generated locally and excluded from Git; source, codec/pixel checks, and the white-background review MP4 are versioned.
- Filmora project import was not performed.

`delivery-validation.json` contains the probe, measured counts, outline/frame pixel samples and checksum. The white background exists only in the preview MP4.
