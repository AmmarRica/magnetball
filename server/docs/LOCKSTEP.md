# Direct online play — deterministic lockstep through a dumb relay

This is **one of two** ways to play somebody who is not in the room. The other is
`MATCH-SERVER.md`: a match **hosted by a third party**, where a server runs the whole sim
and both players are thin clients. Pick by what you are optimising for.

| | **Hosted** (`server/match/`) | **Direct** (this) |
|---|---|---|
| Who simulates | one neutral server | both players' devices |
| What crosses the wire | snapshots down, sticks up (20Hz) | inputs only, ~3 bytes a frame |
| Whose connection decides | nobody's | the **worse** of the two |
| What you must run | a container, ~150–300MB a room | `server/lockstep/relay.mjs`, one file |
| Cost | real money | a spare box, or nothing |
| Cross-browser | fine — one sim, one machine | can drift; the session ends honestly |

Direct play is the answer when nobody wants to pay for a server. Hosted is the answer to
*"there is lag and I am not sure whose fault it is"*, because with a neutral host it is
nobody's.

In the game both live in one **Online** row under Match → Game. The hosted room-code box
appears only when a deploy's `online.json` names a match server; the direct controls are
always there, because they need nothing but an address you type.

## How it works

The determinism audit's same-engine guarantee (see `docs/DETERMINISM-AUDIT.md`) is the
whole foundation: seed the same match, feed the same inputs at the same frames, get the
same match, bit for bit. So only **inputs** cross the wire and both machines run the full
sim. The only server is `server/lockstep/relay.mjs` — one plain-Node file with zero npm
dependencies that introduces two browsers by room code and passes their messages along
verbatim. It never simulates, never stores anything, and never learns the game's protocol.

- **Handshake.** The host opens a room and gets a five-letter code. The joiner types it in,
  sends its name, and the host replies with a `start` message carrying the match seed and
  the sim-relevant slice of the host's settings (`LOCK_SEL_KEYS`): the field, the length,
  the ball, the Game Feel sliders — everything `step()` reads. The joiner's own settings are
  stashed and restored at session end, never saved.
- **Lockstep.** Both seats are `ctrl:'lock'`, *including your own*: your input is sampled,
  quantised to int8, delayed `LOCK.delay` (3) frames and applied **from the buffer** — the
  exact path the opponent's copy of you runs. `loop()` steps a frame only once both seats'
  inputs for it are buffered; frames `0..delay-1` are prefilled neutral so there is no
  starting deadlock. Everything device-local (keyboard/pad merge, one-hand kick, touch
  snapping) resolves on the sampling side before quantisation, so none of it needs to match
  across machines.
- **Desync detection.** Every 60 frames each machine hashes the exact float bits of the
  world (positions, velocities, inputs, timers, score, state) and exchanges it. Same
  engine, they agree forever — `tests/netlock.mjs` proves a real goal crosses the wire with
  every hash intact. Cross-engine (Chrome vs Safari) floats can drift; a mismatch ends the
  session honestly ("SYNC LOST") instead of letting two players watch two different
  matches. That is why the hint recommends both players use the same browser.
- **What stands down while playing**: auto-replay (wall-clock, invisible to the peer),
  drop-in and substitutions (local hardware rewriting the roster), the warm-up lobby,
  `startMatch`'s grow-to-fit-the-pads rule, and the resume snapshot (half the match is
  somebody else's). A vanished opponent becomes a bot in place and you get local control
  back, so the match stays playable.
- **Never both at once.** A hosted session and a direct one cannot be live together —
  `loop()` would be asked to replay the server's snapshots *and* gate on peer inputs for
  one world. Each door closes the other: `netPlay` stops the direct session, `lockConnect`
  leaves the hosted match.

## Running the relay

```bash
node server/lockstep/relay.mjs          # port 9977
node server/lockstep/relay.mjs 0        # ephemeral port (printed)
PORT=8080 node server/lockstep/relay.mjs
```

`GET /` answers a health line. Node 18+ and nothing else.

**TLS is the front door's job.** The game is served over https (GitHub Pages), and a secure
page may only open `wss://` — plain `ws://` is blocked as mixed content everywhere **except
localhost**. The relay speaks plain ws on purpose; put TLS in front of it.

### Same machine / LAN (free)

`ws://localhost:9977` works from the https page as-is. On a LAN, either open the game from
a saved offline copy / plain-http host (then `ws://192.168.x.x:9977` is allowed), or use one
of the tunnels below.

### Your own computer, reachable from the internet (free)

The relay only matters during a match, so "my PC is the server" is a fine deployment. You
need an https/wss tunnel because of the mixed-content rule:

- **Cloudflare quick tunnel** — no account: `cloudflared tunnel --url http://localhost:9977`
  prints an `https://….trycloudflare.com` URL; give the game `wss://….trycloudflare.com`.
  The URL changes each run.
- **Tailscale Funnel** — stable URL, no port forwarding: `tailscale funnel 9977`.
- Raw port-forward plus your own cert works too; it is just more fiddling.

### Azure (free tier)

The cheapest sound Azure shape is an **App Service (Linux, F1 Free)** running the relay: it
terminates TLS for you, so the game gets `wss://<yourapp>.azurewebsites.net` with no cert
work, and F1 costs nothing. Enable **Web sockets** in Configuration → General settings,
deploy the one file, and set the startup command to `node server/lockstep/relay.mjs` (App
Service hands the port over in `PORT`, which the relay reads when no argument is given).
F1 allows only a handful of concurrent WebSockets — plenty for a 1v1 room, not a public
service. A B1s VM (~$8/mo) behind Caddy is the step up. Set a $1 budget alert either way;
the classic way this stops being free is an accidentally-selected paid tier, not this
workload.

Note this is a *different* Azure shape from the hosted path's, which is a Container App —
see `infrastructure/docs/`. Nothing here needs that infrastructure, which is the point.

## Scope, and what is deliberately not here

This is the **1v1, same-engine** shape. Known edges, all by design:

- Two peers only; the host's settings are the match; rematch = host or join again.
- Pausing stalls the opponent (they get a WAITING banner) — lockstep has no other answer.
- Different browsers may desync; the hash check catches it and a bot takes over.
- Latency: fixed 3-frame input delay (50ms). Fine at sane pings; a rollback layer is the
  upgrade path if it ever is not.

**The "more than two players" answer already exists and is not this.** An earlier write-up
here described an authoritative server running the same sim headless as future work — that
is `server/match/`, and it shipped. If a match needs more seats, spectators or a neutral
host, that is the path to take; this one stays the no-server option.
