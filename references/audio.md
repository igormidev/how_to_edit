# Channel audio

Use **−14 LUFS integrated, within ±1 LU**, for every finished Ancap Bulletin video, with **maximum true peak ≤−1 dBTP**. Measure the entire exported mix, including intros and outros. LUFS measures perceived loudness; dBTP measures inter-sample peaks; neither is the editor's volume percentage. This is the channel's delivery target, not a compulsory YouTube upload specification.

YouTube's published upload settings specify **48 kHz** audio. Its playback features can alter levels, so do not depend on the player to fix a quiet or uneven master. [YouTube encoding guidance](https://support.google.com/youtube/answer/1722171?hl=en), [YouTube Stable Volume](https://support.google.com/youtube/answer/14106294?hl=en).

## Mix starting points

These are house mixing targets; adjust by listening to the combined mix, then master to the channel target above.

| Element | Starting level and behavior |
| --- | --- |
| ElevenLabs narration | Assemble and match all narration first; start around **−16 LUFS integrated** on the narration bus, measured in the final channel layout, with peaks ≤−3 dBTP before mastering. Keep neighboring phrases within about 2 LU; retain deliberate emphasis and pauses. |
| Music under speech | Start **18–24 LU quieter than narration** over the same active 3-second window: approximately **−34 to −40 LUFS short-term** when speech is −16. Duck during words; a speech-free intro can rise toward −22 to −18 LUFS short-term if it fits the scene. |
| Other SFX under speech | Start with peaks **−24 to −18 dBTP**, keeping sustained effects at least 12–18 LU below speech over the same window. Prefer the quieter end; duck or move any effect that masks a word. Brief transients are better judged by peaks and listening than by integrated LUFS. |
| Fixed transition SFX | Use the exact files and **unity gain (1 / 0 dB)** below. Their quiet level is already baked into the WAVs. Do not independently normalize, randomly vary, or replace them. |

Prefer ElevenLabs WAV/PCM when the account offers it; preserve the original and resample once to 48 kHz for the mix. An MP3 converted to WAV does not recover lost detail. ElevenLabs output format or Studio volume normalization does not certify the final video's LUFS or true peak. [ElevenLabs formats](https://elevenlabs.io/docs/help-center/troubleshooting/what-audio-formats-do-you-support), [Studio](https://elevenlabs.io/docs/eleven-creative/products/studio).

Render and listen to dialogue plus music plus SFX, checking a phone speaker and headphones. Normalize the **whole mix together** using a measured two-pass loudness process; use gentle compression/limiting only when necessary. Re-measure the final encoded export: `ffmpeg -i final.mp4 -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null -`. Read **input_i / input_tp**, which describe that file; output values describe the analysis filter's hypothetical processed signal.

## Mandatory transition sounds

Play once per transition, on a HyperFrames audio track. Preserve natural tails, add no loop or per-use pitch/rate variation, and keep the same gain even if the visual duration changes. The files are 48 kHz stereo PCM WAV. Start the placement sound at hand release and the sticker sound at initial surface contact; start the drawing sound after the hand's arrival and pause, at **30% of its visual transition duration**; start the other sounds with the corresponding reveal. Sound must accompany every use of these transitions unless the user explicitly requests silence.

| Transition | Local file, relative to the skill root | Duration | Baked true peak | Gain |
| --- | --- | ---: | ---: | ---: |
| Hand | [hand.wav](../assets/transitions/audio/hand.wav) | 0.472 s | −24.05 dBTP | 1 |
| Crumbled paper ball | [crumpled-ball.wav](../assets/transitions/audio/crumpled-ball.wav) | 2.000 s | −26.05 dBTP | 1 |
| Pieces of paper join / Torn assembly | [torn-assembly.wav](../assets/transitions/audio/torn-assembly.wav) | 2.811 s | −24.05 dBTP | 1 |
| Unfolding | [unfolding.wav](../assets/transitions/audio/unfolding.wav) | 2.528 s | −26.05 dBTP | 1 |
| Sticker intro | [sticker.wav](../assets/transitions/audio/sticker.wav) | 0.550 s | −24.05 dBTP | 1 |
| Hand drawing (images only) | [drawing.wav](../assets/transitions/audio/drawing.wav) | 2.364 s | −26.05 dBTP | 1 |

The [manifest](../assets/transitions/audio/manifest.json) records Epidemic Sound UUIDs, titles, verified catalog URLs, source ranges, processing, measured levels, and SHA-256 hashes. The ball was prepared once at a faster tempo to fit two seconds; the sticker uses one press from a longer recording. The drawing sound is the full 2.364-second pen recording: keep its natural tail even for shorter transitions by extending the final hold. Reuse these prepared files directly; future edits do not require catalog searches.

Epidemic Sound downloads remain subject to the account's license; keep standalone licensed audio private rather than redistributing it as a public sound library. [Licensing](https://www.epidemicsound.com/how-it-works/music-licensing/), [published license terms](https://www.epidemicsound.com/staticfiles/legacy/20/documents/SingleTrackLicensesV8.pdf).

## Why these numbers

[iZotope's platform comparison](https://www.izotope.com/community/blog/mastering-for-streaming-platforms) lists YouTube's normalization reference as −14 LUFS and recommends at least 1 dB true-peak headroom for lossy encoding. [MeterPlugs' own measurements](https://www.meterplugs.com/blog/2019/09/18/youtube-changes-loudness-reference-to-14-lufs.html) document that reference change. YouTube's official pages above do not prescribe a creator LUFS target. The narration, music, and SFX figures here are deliberate channel choices, not platform stem standards. Sources checked 2026-10-12.
