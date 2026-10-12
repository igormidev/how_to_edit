# Folded-paper motion

`scripts/lib/motion.ts` renders from normalized time alone. The shared runner passes the prepared paper texture; a final frame always draws that texture at the exact output rectangle, preserving alpha and the live-video handoff geometry.

- **Unfolding:** four accordion columns and two rows, with true hinged panel rotations and a fixed perspective projection. The folded packet enters during the first 16%; three alternating hinges open, then the horizontal fold opens by 80%. The remaining 20% fades the four-column/two-row crease relief. Corners open toward the opposite corner; `center` centers the projected footprint throughout opening.
- **Sticker:** the first-frame print enters horizontally mirrored. A diagonal cylinder bend travels from top left to bottom right; its flat region adheres, its curved region lifts, and its folded-back region shows the reverse print through a subtle paper veil, as in the supplied reference. Textured triangles project the curved sheet, rather than masking a flat image. The final surface is the same correctly oriented texture as the video poster.

Paper back faces use a fixed fiber pattern and retain the input alpha silhouette. Every renderer can seek directly forward or backward without depending on previous frames. The full-HD runner owns clearing the transparent canvas, frame sampling, audio, encoding, and metadata.
