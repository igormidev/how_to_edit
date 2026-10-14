# Magazine lettering assets

The three transparent atlases retain the supplied colored paper, wear, and folded shading. The adjacent JSON maps give each tile's exact pixel bounds. Use these assets through [the magazine helper](../text/magazine.js), separately from the standard emphasis lettering.

| Atlas | Supplied artwork | Characters |
| --- | --- | --- |
| `distressed.webp` | `5495311.ai` / `5495313.jpg` | A–Z, mixed-case artwork |
| `folded.webp` | `5496591.ai` / `5496597.jpg` | A–Z, mixed-case artwork |
| `textured.webp` | `5460055.ai` / `5460054.jpg` | A–W, Y, Z, 8 |

The third sheet has an 8 instead of an X; X uses the first sheet. Unsupported digits, punctuation, and accents use the bundled font fallback. The original user-supplied artwork did not include license or redistribution terms; these atlases are not represented as openly licensed.

The additional unmodified fallback fonts in `fonts/` are Libre Baskerville, Barlow Condensed Bold, Anton, Abril Fatface, and Courgette, all from the [official Google Fonts repository](https://github.com/google/fonts), under SIL OFL 1.1. Keep the adjacent per-family license notices. The helper also reuses the existing [Inter and Special Elite files](../fonts/README.md) and their licenses.
