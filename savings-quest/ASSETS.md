# Savings Quest — Stage 4 Asset Manifest

Every sprite and sound in the Stage 4 world is generated at runtime in
code — nothing is loaded from an image or audio file. There is nothing
third-party here, so there is nothing to license.

## Sprites (procedural textures, `world.js` → `buildTextures()`)

Each texture is drawn once per scene with Phaser's `Graphics` API, then
baked to a reusable texture via `generateTexture(key, size, size)`.
Flat-vector style, matching the rest of the game (see `RARITY_COLORS`
in `ui.js`). To swap in real art later, replace what each texture key
points to — every call site (`this.add.image(x, y, key)`) already
treats the key as an opaque sprite, so no other code needs to change.

| Texture key             | What it draws                              | Used for                         |
| ------------------------ | ------------------------------------------ | --------------------------------- |
| `hero`                   | Blue circle with a white direction triangle | The kid's hero, in-world          |
| `blob`                    | Green rounded creature with two dot eyes    | Roaming creatures                 |
| `chest-closed`            | Brown chest, closed lid                     | An unopened chest                 |
| `chest-open`              | Brown chest, open lid + a coin peeking out  | A chest the kid has already opened |
| `npc`                     | Purple circle with a tan "face" circle      | The region's NPC                  |
| `puzzle-pedestal`         | Grey pedestal with a blue orb               | The region's puzzle trigger       |
| `boss`                    | Pink creature with two horns, before calming | Impulse Imp (unsettled)          |
| `boss-calm`               | Same creature, calm closed-eye expression   | Impulse Imp (after being defeated/calmed) |
| `landmark`                | Gold building with a white door, full-built | The savings-goal landmark at 100% |
| `landmark-silhouette`     | Same shape, flat grey                        | The landmark before 100% is reached |
| `stepping-stone`          | Small tan circle, lit                       | A crossed milestone on the goal path |
| `stepping-stone-dim`      | Small pale-grey circle, unlit               | A milestone not yet reached       |

## Sounds (synthesized, `world.js` → `playBeep()`)

No audio files — each "sound" is a single sine-wave tone generated on
the spot with the Web Audio API (`OscillatorNode` + `GainNode`, with an
exponential fade-out so nothing clicks or lingers). Muted entirely when
the family's mute toggle (top of the World screen HUD) is on; `playBeep`
no-ops immediately when muted, so there's no hidden audio cost either way.

| Trigger           | Frequency | Duration |
| ------------------ | --------- | -------- |
| Chest opened        | 880 Hz    | 180 ms   |
| Puzzle solved        | 1046 Hz   | 220 ms   |
| Boss calmed/defeated | 660 Hz    | 300 ms   |

## Third-party assets

None. No image files, no audio files, no fonts beyond the existing
Google-Fonts "Poppins" already used by the rest of Money Muscle. The
only external resource Stage 4 adds is the Phaser 3 game engine itself,
loaded from a CDN (`cdn.jsdelivr.net/npm/phaser@3.80.1`) under its own
MIT license — the engine, not game content, so it doesn't require any
in-game attribution.
