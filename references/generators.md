# Deterministic generators

`scripts/` is a standard optional skill resource directory. These thin CLI wrappers share one browser renderer; the larger vendor files preserve the existing rendering algorithms rather than replacing them. Resolve `SKILL_ROOT` to the directory containing this skill's `SKILL.md`; input and output arguments are relative to your working directory.

## Setup once

Use Node.js 22+, pnpm, FFmpeg and FFprobe (including `libvpx-vp9` and `libx264`). From the skill root:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm verify
```

The lockfile pins dependencies and the Chromium revision. Seed is fixed at 1873. The same source pixels, parameters, pinned renderer/browser and FFmpeg build produce repeatable geometry and frames. Record FFmpeg version for an exact encoding reproduction; file hashes across different encoders/platforms are not promised. Everything runs locally after setup; no network media or separate server is required.

## Prepare a still image

```sh
node "$SKILL_ROOT/scripts/paper.mjs" input.png paper.png
node "$SKILL_ROOT/scripts/paper.mjs" input.jpg paper.png --stock cream --roughness 0.6 --remove-background
```

The second command is only for requested overrides/removal. `--stock` is `classic | cream | gray | tabloid`; `--roughness` is 0–1; the removal switch defaults false. All other style values are fixed. Output is transparent PNG plus `.png.json` treatment/bounds/source-hash metadata. Paper sizes are native source pixels after pixel-budget fitting and tight crop; 12 px is measured in those pixels. Do not apply it twice. The backdrop key removes perimeter-connected flat backgrounds, not arbitrary photographic scenes.

## Render a transition

```sh
node "$SKILL_ROOT/scripts/transition.mjs" torn paper.png scene-torn --flow leftToRight
node "$SKILL_ROOT/scripts/transition.mjs" unfold paper.png scene-unfold --origin bottomLeft
node "$SKILL_ROOT/scripts/transition.mjs" sticker video.mp4 scene-sticker --box 950,250,850,650 --hold 8
node "$SKILL_ROOT/scripts/transition.mjs" drawing paper.png scene-drawing --angle 225 --duration 4
```

Use a **new output directory**. Inputs remain untouched. All transitions use **1920×1080 at 24 fps**, always. The default final fitting box is a 56% centered layout; `--box x,y,width,height` specifies a fitting area, preserving the source aspect ratio. The requested box must fit inside the canvas. Torn pieces are contained even during rotation/travel.

| Option | Scope / default |
| --- | --- |
| `--duration` | Intro seconds; Torn/sticker 2.8, unfolding 3.2, drawing 4; 0.5–30 permitted |
| `--flow` | Torn; `center`, `topToBottom`, `bottomToTop`, `leftToRight`, `rightToLeft` |
| `--motion` | Torn; `direct` by default; `pageRiffle` only on an explicit request |
| `--origin` | Unfold; `center` by default; `bottomLeft`, `bottomRight`, `topLeft`, `topRight` |
| `--angle` | Drawing only; integer 0–360, default 225; clockwise from the right, avoid cardinals |
| `--box` | Final fitting area in full-HD logical pixels |
| `--hold` | Visible still/media time after intro; 4 s by default, set to scene timing |
| `--no-loop` | Video/GIF; play once and freeze its final frame instead of repeating |

Torn and drawing take treated stills; drawing rejects video/GIF. Its eased phases are 18% entry, 12% stationary pause, 63% alpha-aware drawing, 7% exit. [Drawing geometry](drawing.md). Unfold/sticker detect video/GIF extensions, extract the first decoded frame, and make a classic paper frame without crumpling the media. Source audio is muted by default because channel narration owns the mix; enable `data-has-audio="true"` and remove `muted` only when scene instructions call for original sound. GIFs are converted once to a browser-compatible video. `--no-loop` uses ordinary HyperFrames end-of-source freeze behavior. Do not change playback via JS.

At 24 fps, exact 2.8 or 3.2 seconds cannot contain an integral number of frames. The generator rounds up to **68 frames / 2.833333 s** and **77 frames / 3.208333 s** respectively, and samples the complete motion including the exact flat final frame. Use `manifest.json.animationDuration` for the handoff; do not manually round it back down. The unfolding's final 20% is crease fade. Fixed SFX play once at unity gain regardless of visual duration; no per-use time stretch.

## Use in HyperFrames

Each output directory contains `animation.webm` (VP9 alpha), `final.png` (full-HD exact hold), `texture.png`, `sound.wav`, `manifest.json`, local GSAP, `index.html` and `compositions/transition.html`. Video/GIF also includes `source.*` and `frame.png`; `manifest.json.contentRect` locates the playing image inside `rect`. The intro's last frame, playing media's first frame and classic frame share those dimensions.

Copy the **whole output folder** into the HyperFrames project. The standalone `index.html` is for preview/check. Mount the template with the **matching composition ID** and its full scene duration (intro + hold):

```html
<div id="bulletin-sticker-host" data-composition-id="bulletin-sticker"
  data-composition-src="assets/scene-sticker/compositions/transition.html"
  data-start="4" data-duration="6.833333333333334"
  data-track-index="2" data-width="1920" data-height="1080"></div>
```

Use `bulletin-torn`, `bulletin-unfold` or `bulletin-drawing` for those modes. For multiple instances, replace the root ID, timeline key, every element ID and selector in each copied template with a unique prefix. Change a hold by regenerating with the requested `--hold`, rather than extending only the host while leaving internal clips short. Very short scenes are extended to keep the fixed sound's natural tail; use the resulting `sceneDuration`. For a portrait master, retain the full-HD logical layer and scale/position the whole layer proportionally inside the portrait canvas; use the matching vertical background in the master. Never stretch the texture/video/frame independently.

Every generated composition already places its required sound. Hand and ball remain their existing visual workflows; add their fixed WAV on an identified `<audio>` track using `data-volume="1"`, hand at release and ball at reveal start. Keep sound tails within the scene or extend the scene/audio slot. Transition media and playing source are separate, adjacent timed clips. HyperFrames owns seeking and playback; do not call `video.play()`.

For the explicitly requested magazine font, use [scripts/magazine.mjs](../scripts/magazine.mjs) with mandatory `--duration` and optional `--interval 0.52`. [Magazine usage](magazine.md).

Run the pinned HyperFrames CLI's `check` on the assembled project and inspect entrance, final intro frame, first playing frame, and a later loop. Render with `--video-frame-format png` for precise first-frame colors. Alpha-capable sources should automatically decode to PNG in this pinned version; verify instead of trusting a metadata tag. [HyperFrames rendering guidance](https://github.com/heygen-com/hyperframes/blob/main/docs/guides/rendering.mdx).

```sh
ffprobe -v error -show_streams animation.webm
ffmpeg -c:v libvpx-vp9 -i animation.webm -vf alphaextract -frames:v 1 alpha.png
```

The first alpha frame may be blank by design. Decode a later frame too: it must contain both transparent exterior and opaque artwork. FFmpeg's default VP9 decoder can report `yuv420p` even when the file contains alpha; use **libvpx-vp9**. Inspect an actual HyperFrames render over a colored or paper background for black rectangles. Do not use H.264/MP4 for the transparent intro asset.
