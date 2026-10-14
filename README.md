# Ancap Bulletin editing

A Codex skill for creating HyperFrames videos with a consistent handcrafted paper/newspaper identity. It includes paper treatment, deterministic assembly/unfolding/sticker intros, silhouette-aware hand drawing, existing hand/ball assets, and narration/audio guidance.

Read [SKILL.md](SKILL.md). For setup and commands, see [generator usage](references/generators.md).

Text uses bundled Special Elite and Inter Black with individual paper scraps. [Text setup and example](references/text.md).

**“Magazine font”** means Magazine Mix with **Shuffle letter styles**. Use it **only on an explicit user request**; interval defaults to **0.52 s** and duration is required. [Magazine lettering](references/magazine.md).

[Hand drawing](references/drawing.md) introduces still images with an alpha-aware zigzag reveal and a matching pen-holding hand: **18% entry / 12% pause / 63% drawing / 7% exit**.

![Torn Assembly, unfolding, and sticker motion samples](assets/previews/transitions.jpg)

Every transition uses its fixed, quiet local sound at **gain 1** (the level is baked into the WAV):

| Transition | Sound | Peak |
| --- | --- | ---: |
| Hand | [hand.wav](assets/transitions/audio/hand.wav) | −24.05 dBTP |
| Hand drawing | [drawing.wav](assets/transitions/audio/drawing.wav) | −26.05 dBTP |
| Crumbled paper ball | [crumpled-ball.wav](assets/transitions/audio/crumpled-ball.wav) | −26.05 dBTP |
| Pieces join / Torn Assembly | [torn-assembly.wav](assets/transitions/audio/torn-assembly.wav) | −24.05 dBTP |
| Unfolding | [unfolding.wav](assets/transitions/audio/unfolding.wav) | −26.05 dBTP |
| Sticker intro | [sticker.wav](assets/transitions/audio/sticker.wav) | −24.05 dBTP |

Finished videos target **−14 ±1 LUFS**, true peak **≤−1 dBTP**. [Audio details and sources](references/audio.md).

[Validation and independent review](references/validation.md).

Epidemic Sound WAVs are licensed account assets: keep them private when publishing the skill; they are not a redistributable sound library.
