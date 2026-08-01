# Magnetball assets

Image sprites the game can use **in addition to** its built-in vector look.
Everything here is optional — if a file is missing, the game falls back to the
drawn version, so nothing breaks. All packs used here should be **CC0 /
public-domain** (e.g. [Kenney](https://kenney.nl)).

Controls and collisions never change with a skin — sprites are **purely
visual**, drawn over the same physics disc/ball.

## Where to drop files (the contract the game reads)

The game currently looks for these exact paths:

| Skin | File | Used when |
|------|------|-----------|
| Soccer ball | `assets/ball/soccer.png` | Settings → Skins → Ball → **Soccer** |
| Sprite players | `assets/player/player.png` | Settings → Skins → Players → **Sprite** |

So, from a Kenney pack: unzip it, find the one PNG you want, and copy it to the
path above (renaming to `soccer.png` / `player.png`). A square, transparent PNG
works best (it's drawn centered on the disc).

## Packs to import (added by the repo owner; kenney.nl is not reachable from the build sandbox)

- **Flag Pack** — https://kenney.nl/assets/flag-pack → `assets/flags/`
  (for player flag customization; wiring comes once the files are in)
- **Sports Pack** — https://kenney.nl/assets/sports-pack → `assets/sports/`
  (soccer ball for the ball skin; other icons for UI/cosmetics)
- **Animal Pack** — https://kenney.nl/assets/animal-pack → `assets/animals/`
  (animal characters as player sprites)

Once these folders exist, the plan is to turn the single Ball/Players toggles
into **pickers** (choose a specific animal, flag, or ball) wired into the player
builder and the cosmetics/shop system.
