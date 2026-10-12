# Presscut source provenance

The portable renderer reuses the original algorithms from `presscut-studio` at commit `40c291e3584dfb6927c087c053de261c503017d4`. No runtime path points to that checkout. The small public adapter is `scripts/lib/presscut.ts`; original processing code lives in `scripts/vendor/presscut/` and its original WebP material in `scripts/vendor/assets/`.

| Original source | SHA-256 |
| --- | --- |
| `src/lib/newspaperRenderer.ts` | `de79c7592299b74a69950f6ec191be8b1cb35ad33dee99c212b0fd46889a9ca5` |
| `src/lib/backgroundRemoval.ts` | `e51f322e1170d19321787d32940ec75b5fa3ad1d5523de060ed5b19a9d534201` |
| `src/lib/tornPaper.ts` | `49c7d8dbcfa20ef49516036b5e47c6d7f19897134dc094cb3ed772b4f9f42dbb` |
| `src/lib/animationTimeline.ts` | `3a92d8e6e9f76b3e85258d0ab56a41e9d97b788cc634741bcd808077b2009038` |
| `src/lib/animationRenderer.ts` | `1236f50e8a2626a0bd26c2d47950caf2f972971a9397d4a0c6b956285529baed` |
| `src/assets/crumpled-paper-material.webp` | `353c94582fe160d4948a3be7fd650091b46c2e879b90e0b80a8c29562b97fe22` |

`newspaperRenderer.ts`, `backgroundRemoval.ts`, and the WebP are copied byte for byte. `tornPaper.ts` changes only its erased type-import path. `tornTimeline.ts` extracts the original Torn timeline and its four math helpers verbatim. `tornRenderer.ts` extracts the original Torn-only interfaces, caches, layout, appearance, placement, fiber, seam and drawing functions; unrelated hand/crumpled-unfold renderers are omitted. Type imports point to a tiny local type module. The draw function receives the adapter's explicit fitted layout instead of the website's UI settings.

The Torn mesh remains 3 rows × 4 columns, vertex jitter 0.18, edge roughness 0.16, four intermediate edge points, seed 1873. It retains shared jagged boundaries, alpha-aware reveal compaction, direct easing, page-riffle poses, exposed stock below all printed faces, 2px seams, and original phase boundaries: blank through 5%, assembly through 72%, seam fade through 86%, then exact artwork hold. Public camel-case flows map directly to the original internal enum; `pageRiffle` maps to `riffle`.

One required rendering adaptation: the original website clamps rotated fragment travel only for riffle motion. This skill uses the same helper for direct motion as well. The helper has an opt-in strict fallback because the website's identity allowance can leave a rotated edge tile outside the frame. That fallback constrains only remaining overflow to the physical frame bounds, with zero inset so the exact final artwork never moves away from its target. Mesh, reveal order, rotation, scaling, easing and timing remain unchanged; only otherwise-clipped translation is constrained.

The image adapter selects the requested channel constants using the original app's `createRenderOptions`: border 12 source pixels, roughness 0.8, tight crop, texture strength 0.62/fibers 0.5, crumpled depth 0.2/fold scale 72/color aging 0, shared image/border treatment, no shadow. Stocks are the exact website palette: Classic `#F6E0C0`, Cream `#F3E6C5`, Gray `#D8D5C8`, Tabloid `#D7BA81`. Large images retain the original 4-million-pixel source budget.

Video/GIF frames use the same classic stock and cut-edge renderer with printing/crumple disabled. The adapter builds a rectangular mount and exposes a transparent `frameOnly` canvas plus `contentBounds`, so the first-frame intro and live video share one exact window. Background removal preserves the original perimeter-connected flat-backdrop algorithm; inspect the result for complex photographic backgrounds and use a dedicated remover when needed.

## Port validation

Browser comparison against the original checkout produced zero changed RGBA bytes and matching bounds for all four paper stocks. Default centered direct Torn frames matched the original at 11 sampled phase points. The frame-only live-media window contained zero alpha. A geometry audit checked 40,800 visible fragment placements across all five flows, both motion modes, wide/tall/disconnected transparent subjects, full-frame and edge-positioned targets, with no corner outside 1920×1080 after containment was applied.
