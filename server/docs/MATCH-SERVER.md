# The dedicated match server (`server/match/`)

A third party that hosts a match between two players, so that when one of them lags,
neither side's machine is the one deciding what happened. Two files and a Dockerfile:

| File | What it is |
| --- | --- |
| `matchServer.mjs` | The server. Runs `index.html` in a headless browser, one per match, and talks to the players over Web PubSub |
| `relay.mjs` | A stand-in for Web PubSub for your own machine and for `tests/netmatch.mjs`. Not for the internet |
| `Dockerfile` | The image Azure runs. Built by the deploy workflow, pushed to GitHub's container registry |

## How a match works

1. Player A types a room code (four letters) in **Match → Game → Online** and presses
   *Play online*. The game asks the API for a room token (`/api/room-token`), opens a
   WebSocket to Web PubSub, joins the room's group, and `POST`s to the match server:
   *I am in room ABCD, my name is Kai, these are my match settings.* The server gives A
   seat 0 and waits.
2. Player B does the same with the same code and gets seat 1. The room is full, so the
   server starts a browser, loads `index.html` with two virtual controllers plugged in,
   applies A's settings (mode, pitch, length, difficulty, ball, party set, team colours
   and flags — the same list a resumed match is started from) and calls the game's own
   `startMatch`. The two seats go to the two controllers; any other bodies are bots.
3. The server sends both players a `start` document: the seed, the settings, the full
   roster with every body's look, and which body is whose. Each player's game starts the
   same match from the same seed and dresses it with that roster.
4. From then on, twenty times a second, the server reads the world out of its browser
   and sends a `snap` — the ball, every body's position, kick and facing, the score, the
   clock and the state — to the room. Each player's game **stops simulating** and instead
   draws the two most recent snapshots blended together, a snapshot and a half behind
   the newest, which is what makes the motion smooth. Their own stick goes the other way
   as an `in` message whenever it changes (at most 30 a second, at least twice a second
   as a keep-alive), and the server writes it straight into that seat's virtual
   controller.
5. At full time the server sends `over`. Each player's game blows its own whistle, winds
   down and shows the result screen. The room closes a few seconds later.

Nothing is predicted on the client. Your own body moves when the server says it has,
roughly one snapshot interval plus half a round trip after you pushed the stick.
Predicting it locally is what makes a laggy match look fine for one player and
rubber-band for the other, which is the unfairness a neutral host exists to remove.

**The server runs the shipped game.** There is no second copy of the physics or the
rules: `index.html` is loaded as it is, exactly as the test suites load it, and the
page's own frame loop steps the match. When the game changes, the server changes with
it. The price is one headless browser per match, about 150–300 MB of memory, which is why
it is a container and not a Function.

## Messages

Two Web PubSub groups per room, so a player's inputs are never delivered to the other
player (on the hub's Free tier every delivered message counts):

| Group | Direction | Messages |
| --- | --- | --- |
| `ABCD` | server → both players | `lobby` (who is seated), `start`, `snap` ×20/s, `over` |
| `ABCD.in` | each player → server | `in` |

```json
{ "t": "start", "seed": 123456, "hz": 20, "sel": { "mode": "2v2", "field": "classic", "...": "..." },
  "roster": [ { "team": 0, "name": "Kai", "color": "#5a7de0", "cap": "none", "flag": "num1", "eyes": "googly", "r": 15, "net": true } ],
  "seats": [0, 2] }
{ "t": "snap", "k": 812, "st": "play", "sc": [1, 0], "clk": 231.5, "ot": false, "ms": 68.5, "tick": 4110,
  "f": [ 12.5, -30.1,  0.0, 118.2, 0, 0, -1, 0,  "…x, y, kick, faceX, faceY, chargeT per body…" ], "ex": [] }
{ "t": "in", "s": 0, "x": 0.71, "y": -0.71, "k": true }
{ "t": "over", "sc": [3, 1] }
```

## HTTP

| Route | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | `{ ok, rooms, hub, hz }` |
| `/match` | POST | `{ room, name, userId, sel }` → `{ seat, state, seats, ... }`. `userId` is the one the room token gave. A second call from the same `userId` gets the same seat back, with the `start` document if the match is already running |
| `/match/ABCD` | GET | The room's state, tick, score and the two seat bodies' positions. The game calls this every 30 seconds during a match as a heartbeat (see *Scaling to zero*) |

Every response carries `Access-Control-Allow-Origin: *`; what a caller can do is bounded
by its inputs, not by who it is.

## Running it on your machine

Needs Node.js 22 (it uses the built-in `WebSocket`) and a Chromium that Playwright can
find. In one terminal the relay, in another the server, then two browser windows:

```powershell
cd server\match
npm install                       # installs playwright; run `npx playwright install chromium` once
node relay.mjs --port 7071
# second terminal
$env:PORT = 7072
$env:MATCH_WS = "ws://127.0.0.1:7071/client/hubs/match?access_token=dev&user=server"
node matchServer.mjs
```

The game needs an `online.json` beside `index.html` naming the two:

```json
{ "api": "http://127.0.0.1:7071", "match": "http://127.0.0.1:7072" }
```

Serve the folder over HTTP (`npx http-server -p 8080 .` from the repo root — the game
only reads `online.json` from an `http(s)` page) and open it twice. Type the same room
code in both. `tests/netmatch.mjs` does exactly this, headlessly, in about twenty
seconds; run it after changing anything here.

## Scaling to zero, and the heartbeat

On Azure this is a Container App with `minReplicas: 0`: it costs nothing between matches
and the first `POST /match` wakes it (expect a cold start of ten to twenty seconds for the
first player, which the game reports as *waiting for the other player* anyway). The
platform scales on **HTTP traffic**, and the server's own socket to Web PubSub does not
count — so left alone a five-minute match would be cut off. The game therefore calls
`GET /match/ABCD` every 30 seconds while a match runs; that request is the heartbeat that
keeps the replica up. `maxReplicas` is 1, because a room lives in one process's memory.

Capacity: one replica at 1 vCPU / 2 GiB runs about three or four matches at once. More
than that is a bigger container (`resources` in `main.bicep`), not more replicas.

## Configuration

| Variable | Meaning |
| --- | --- |
| `PORT` | HTTP port (8080 in the container, 7072 by default) |
| `GAME_DIR` | Folder holding `index.html` (`/app/game` in the container) |
| `WEBPUBSUB_CONNECTION`, `WEBPUBSUB_HUB` | The hub; the server mints itself a client token with `@azure/web-pubsub` |
| `MATCH_WS` | Instead of the two above: the dev relay's socket URL |
| `SNAP_HZ` | Snapshots a second, 5–60, default 20. Lower it to stretch the hub's Free tier (20,000 messages a day is 16 minutes of two-player play at 20 Hz — see `infrastructure/docs/RESOURCES.md`) |
| `PLAYWRIGHT_MODULE`, `CHROME_PATH`, `PLAYWRIGHT_BROWSERS_PATH` | Where Playwright and a browser are, as in `tests/_browser.mjs` |

## The image

`Dockerfile` starts from Playwright's own image for the pinned Playwright version (the
browser and its system libraries are already in it), copies the game's runtime files and
this folder, and runs `matchServer.mjs`. The workflow builds it on every push to `main`
and pushes it to `ghcr.io/<owner>/magnetball-match` tagged with the commit; the Bicep
receives that tag as `matchImage`.

⚠️ **The package must be public for Azure to pull it**, once: on GitHub, your profile →
*Packages* → `magnetball-match` → *Package settings* → *Change visibility*. Until then the
Container App reports `UNAUTHORIZED` on the image pull and the site's `online.json` still
names it, so *Play online* fails with *could not join*. A private image needs a registry
credential in `main.bicep` (`configuration.registries`) — Azure Container Registry Basic,
about 5 USD a month, is the usual answer if the repository has to stay private.

## What it does not do

- **Reconnect a dropped player.** A player whose socket closes stops receiving; their game
  freezes on the last snapshot and says so. The server plays on (the other player is
  still there), and a second `POST /match` from the same `userId` gets the seat and the
  `start` document back, but the game does not yet re-join by itself.
- **More than two people.** Every other body is a bot. Four seats is a `CFG.seats` change
  plus four virtual controllers; the client side already handles any roster.
- **Spectators, chat, matchmaking.** A room code shared out of band is the whole lobby.
