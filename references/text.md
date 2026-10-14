# Text assets and timing

Normal text uses [Special Elite Regular](../assets/fonts/SpecialElite-Regular.ttf), weight 400. Emphasis uses [Inter Black](../assets/fonts/Inter-Variable.ttf), weight 900 / optical size 32, with paper drawn behind each letter. Copy `assets/fonts/` and `assets/text/` together; preserve the bundled font licenses. Both render locally. The emphasis treatment is a close recreation of the supplied lettering, not an identification of its original typeface. [Side-by-side comparison](../assets/previews/emphasis-comparison.jpg).

The **magazine font** is a separate optional lettering choice: Magazine Mix with per-letter Shuffle letter styles. **Use only when explicitly requested.** Its interval defaults to 0.52 s and its duration must be supplied. Read [magazine setup](magazine.md); copy its additional atlas/font assets only when needed.

## Render emphasis

```sh
node "$SKILL_ROOT/scripts/emphasis.mjs" "LIBERDADE" word.png --size 160
```

The transparent PNG is rendered at 2× its logical font size for crisp scaling. It already includes the finished paper lettering; do not filter it again. Preserve wording/case unless the chosen emphasis pattern calls for uppercase. Paper uses a warm beige base **RGB 216, 203, 186 (`#D8CBBA`)**, diffuse mottling and sparse soft gray-brown flecks ([material comparison](../assets/previews/emphasis-material-comparison.jpg)). Narrower scraps have uneven torn edges and faint shadows only at overlaps ([detail comparison](../assets/previews/emphasis-details-comparison.jpg)); the width guard keeps ink on paper. The seeded paper height, position, torn edge and rotation vary **per letter**; ink remains upright and sharp. Paper poses stay fixed while the word is visible.

For native HyperFrames canvas lettering, load [fonts.css](../assets/text/fonts.css) and [emphasis.js](../assets/text/emphasis.js), then:

```js
const word = await BulletinText.createWord("government", { fontSize: 150, seed: 1873 });
document.getElementById("phrase-words").append(word);
```

Build words after fonts load, before registering the composition's paused timeline. Load font CSS before calling the helper; it rejects missing fonts instead of silently substituting. Position word canvases within a sized layer. Reserve their padding when wrapping/scaling; avoid cropped paper or splitting a word over lines. Use a stable seed for each word/occurrence (for example `1873 + wordIndex`), never runtime randomness. The [phrase example](../assets/text/phrase-example.html) demonstrates cumulative words and a fading blur on the scene layer; its timestamps are illustrative, not a substitute for transcription.

## Apply Igor's patterns

- **Normal typewriter:** use Special Elite; reveal characters in sequence on the paused timeline. Keep speaker connectors on a separate SVG/path layer so their line can draw toward the speaker without moving the text.
- **Pattern 1:** only the paper background and one large centered word. Use each transcript word's start/end; replace the whole word, including its paper, at the next boundary. Emphasis is word-by-word, not a typewriter.
- **Pattern 2:** keep the existing scene in a separate background wrapper; fade its blur from 0 to roughly 24–36 px at 1080p. Keep emphasis in a sharp foreground layer. Add each **whole word with its paper** at its word start and retain previous words until the phrase/page changes. Lay out the entire page first, top-left toward bottom-right, so new words do not reflow earlier ones. Keep the background blurred across page changes, then slide to the next scene.
- **Pattern 1.5:** keep the scene blurred while replacing centered hook words as in Pattern 1; switch to cumulative phrase layout for the remainder. Reverse the order if the hook concludes the phrase.

For word visibility, use explicit timestamped `tl.set(wordNode, {opacity: 0|1}, time)` on a child canvas/inner wrapper. Animate blur only on the scene wrapper. Do not blur the foreground text, reveal emphasis letter by letter, or change the narration's audio timing to fit typography. Check first/last words and seek backward to verify predictable visibility.
