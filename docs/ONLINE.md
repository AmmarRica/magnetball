# Online play — deterministic lockstep through a dumb relay

Magnetball's online 1v1 keeps the game's shape: the **page stays dependency-free** and the
sim runs entirely on the players' devices. The only server is `server/relay.mjs` — one
plain-Node file with zero npm dependencies that introduces two browsers by room code and
passes their messages along verbatim. It never simulates, never stores anything, and never
learns the game's protocol.

## How it works

The determinism audit's same-engine guarantee (see `docs/DETERMINISM-AUDIT.md`) is the
whole foundation: seed the same match, feed the same inputs at the same frames, get the
same match, bit for bit. So only **inputs** cross the wire — ~3 bytes a frame — and both
machines run the full sim.

- **Handshake.** The host opens a room and gets a five-letter code. The joiner types it
  in, sends its name, and the host replies with a `start` message carrying the match
  seed and the sim-relevant slice of the host's settings (`NET_SEL_KEYS`): the field,
  the length, the ball, the Game Feel sliders — everything `step()` reads. The joiner's
  own settings are stashed and restored at session end, never saved.
- **Lockstep.** Both seats are `ctrl:'net'`, *including your own*: your input is
  sampled, quantised to int8, delayed `NET.delay` (3) frames and applied **from the
  buffer** — the exact path the opponent's copy of you runs. `loop()` steps a frame only
  once both seats' inputs for it are buffered; frames `0..delay-1` are prefilled neutral
  so there is no starting deadlock. Everything device-local (keyboard/pad merge,
  one-hand kick, touch snapping) resolves on the sampling side before quantisation, so
  none of it needs to match across machines.
- **Desync detection.** Every 60 frames each machine hashes the exact float bits of the
  world (positions, velocities, inputs, timers, score, state) and exchanges it. Same
  engine, they agree forever — `tests/netlock.mjs` proves a real goal crosses the wire
  with every hash intact. Cross-engine (Chrome vs Safari) floats can drift; a mismatch
  ends the session honestly ("SYNC LOST") instead of letting two players watch two
  different matches. That is why the card recommends both players use the same browser.
- **What stands down while playing**: auto-replay (wall-clock, invisible to the peer),
  drop-in and substitutions (local hardware rewriting the roster), the warm-up lobby,
  and `startMatch`'s grow-to-fit-the-pads rule. A vanished opponent becomes a bot in
  place and you get local control back, so the match stays playable.

## Running the relay

```bash
node server/relay.mjs          # port 9977
node server/relay.mjs 0        # ephemeral port (printed)
PORT=8080 node server/relay.mjs
```

`GET /` answers a health line. Node 18+ and nothing else.

**TLS is the front door's job.** The game is served over https (GitHub Pages), and a
secure page may only open `wss://` — plain `ws://` is blocked as mixed content everywhere
**except localhost**. The relay speaks plain ws on purpose; put TLS in front of it.

### Same machine / LAN (free)

`ws://localhost:9977` works from the https page as-is. On a LAN, either open the game
from a saved offline copy / plain-http host (then `ws://192.168.x.x:9977` is allowed), or
use one of the tunnels below.

### Your own computer, reachable from the internet (free)

The relay only matters during a match, so "my PC is the server" is a fine deployment.
You need an https/wss tunnel because of the mixed-content rule:

- **Cloudflare quick tunnel** — no account: `cloudflared tunnel --url http://localhost:9977`
  prints an `https://….trycloudflare.com` URL; give the game `wss://….trycloudflare.com`.
  The URL changes each run.
- **Tailscale Funnel** — stable URL, no port forwarding: `tailscale funnel 9977`.
- Raw port-forward + your own cert works too; it is just more fiddling.

### Azure (free tier)

The cheapest sound Azure shape is an **App Service (Linux, F1 Free)** running the relay:
it terminates TLS for you, so the game gets `wss://<yourapp>.azurewebsites.net` with no
cert work, and F1 costs nothing. Enable **Web sockets** in Configuration → General
settings, deploy the one file, and set the startup command to `node server/relay.mjs`
(App Service hands the port over in `PORT`, which the relay reads when no argument is
given). Note F1 allows only a
handful of concurrent WebSockets — plenty for a 1v1 room, not a public service. A B1s VM
(~$8/mo) behind Caddy is the step up. Set a $1 budget alert either way; the classic way
this stops being free is an accidentally-selected paid tier, not this workload.

## Scope (phase 1) and what comes next

This is deliberately the **1v1, same-engine** phase. Known edges, all by design:

- Two peers only; the host's settings are the match; rematch = host/join again.
- Pausing stalls the opponent (they get a WAITING banner) — lockstep has no other answer.
- Different browsers may desync; the hash check catches it and a bot takes over.
- Latency: fixed 3-frame input delay (50ms). Fine at sane pings; a rollback layer is the
  upgrade path if it ever isn't.

The 11-a-side plan is a different architecture on the same foundation: an authoritative
server running this same sim (Node headless), snapshots down, prediction on the client —
the relay and the wire-format work here carry straight over. See the session notes in the
repo history for the full write-up.
