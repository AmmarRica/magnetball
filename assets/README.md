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

**The ball and the players are not sprites and are not meant to be.** Both are
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
