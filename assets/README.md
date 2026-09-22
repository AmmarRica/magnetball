# Magnetball assets

Image sprites the game can use **in addition to** its built-in vector look.
Everything here is optional — if a file is missing, the game falls back to the
drawn version, so nothing breaks. All packs used here should be **CC0 /
public-domain** (e.g. [Kenney](https://kenney.nl)).

Controls and collisions never change with an asset — art is **purely visual**,
drawn over the same physics disc/ball.

## What the game reads today

| Art | Path | Used for |
|-----|------|----------|
| Country flags | `assets/flags/4x3/<iso>.svg` | Countryball faceplates |
| Animal faces | `assets/Kenney/kenney_animal-pack/PNG/Round/*.png` | Animal faceplates |
| Controller flair | `assets/Kenney/kenney_input-prompts_1.5/Flairs/Vector/` | The connected-pad icons |
| Scribble tiles + characters | `assets/Kenney/kenney_scribble-dungeons/Vector/` | The **Sketchbook** theme: the floor tiles and the player counters |

### The one exception, and why it is one

**Sketchbook** is the only theme whose players and pitch surface are sprites: it was asked
for with those two sheets, and the art is the point of it. Everything else about the rule
still holds — `spriteImg` returns null while a file loads and for ever if it is missing, so
the skin falls back to a drawn counter and the field to plain paper. A copy of the game
saved on its own, without this folder beside it, still fields two readable sides.

Credit: the pack is Kenney's **Scribble Dungeons** (CC0 — free to use, credit welcome but
not required). The THEME's name is ours; naming our content after somebody else's title is
the one thing the project's standing rule asks us not to do.

### The pack that could not be one, and why it is worth writing down

**Sunday League** was asked for from Kenney's own top-down sports sample, with *"I already
have the Kenney pack"* — and it is **drawn**, not sprited. That is a measurement rather
than a preference, taken on the files in `Kenney/kenney_sports-pack`: its top-down art is
**19 × 13 pixel** PNGs, four per kit colour, and every one of them is **head and shoulders
only**. There is not a single arm, leg or boot anywhere in the pack, in the PNGs or in
`Vector/charactersEquipment.svg` — the limbs in the sample picture belong to that
picture's own composition. So both halves of the ask were out of reach of the files: there
were no limbs to draw, and the four frames per colour are four hair-and-skin variations
rather than walk frames, so a sprite body could not have been animated at all. A drawn one
also carries the **team colour**, which a fixed blue PNG cannot.

Credit: the pack is Kenney's **Sports Pack** (CC0). The theme's name is ours.

**Otherwise the ball and the players are not sprites and are not meant to be.** Both are
drawn on the canvas — see `BALL_LOOKS` and `paintFace()` in `index.html`. A disc is
9–15 px across in play; a bitmap at that size is mush, while a path stays crisp at
any zoom and can roll with the real spin. The old `assets/ball/soccer.png` /
`assets/player/player.png` contract was removed along with the Skins card: it was a
pair of switches that silently did nothing because the art was never added.

## Packs to import (added by the repo owner; kenney.nl is not reachable from the build sandbox)

- **Flag Pack** — https://kenney.nl/assets/flag-pack → `assets/flags/`
  (for player flag customization; wiring comes once the files are in)
- **Sports Pack** — https://kenney.nl/assets/sports-pack → `assets/sports/`
  (icons for UI/cosmetics — the ball itself is drawn, not a sprite)
- **Animal Pack** — https://kenney.nl/assets/animal-pack → `assets/animals/`
  (animal characters as player sprites)

Flags and animals are already wired up as pickers. Anything new should follow the
same rule: optional, with a drawn fallback, so a missing file is never a broken
feature.
