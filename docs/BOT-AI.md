# The bot AI

Everything the AI does lives in `index.html` between the markers `BOT AI` and
`LAYER 0 — STEERING`. This document is the map. `BOT-AI-AUDIT.md` is the other half of the
story — it records the bugs this design was built to make impossible, and is worth reading
before changing any of it.

---

## The one rule everything else hangs off

**A bot may write only `inX`, `inY`, `faceX`, `faceY`, `kick`, and its own `ai*` scratch
fields.** Nothing else. No positions, no velocities, no forces, no direct impulses.

That is not a style preference, it is what makes the AI honest: a bot can do exactly what a
thumb can do and no more. Two consequences fall straight out of it and are worth stating
because they are counter-intuitive the first time:

- **A bot aims by where it stands, not by where it faces.** The kick impulse runs along
  player → ball, so "line up a shot" means "walk to the spot behind the ball from which a
  straight run sends it at the target". That spot is the *strike waypoint*, and most of
  Layer 1 exists to compute it and commit to it.
- **A bot cannot cheat its way out of a bad position.** If it is on the wrong side of the
  ball it has to walk around it, which takes time, which is why the approach geometry is
  the part with the most care in it.

`tests/botai.mjs` enforces the rule by diffing the whole player object across a `runBot`
call. A new field written by the AI fails the suite.

## The second rule: determinism

**Nothing inside `step()` may call `Math.random`.** All AI randomness goes through
`w.rng` (a `mulberry32` seeded from `w.seed`, which is picked *outside* the sim in
`startMatch`). `brand(w)` is the accessor; a world with no stream — a drill, a replay stub —
falls back to *no noise*, never to `Math.random`, because a silent fallback to
non-determinism is worse than none at all.

The bar is **same-engine reproducibility**: a pinned seed replays a match bit-exactly in one
browser build. Cross-engine equality is explicitly not a goal. `setMatchSeed(n)` pins a
match for tests.

---

## The four layers

The AI is a stack. Each layer answers one question and hands its answer down.

| Layer | Function | Question |
|---|---|---|
| 3 | `botPhase(w, team)` | Is this team attacking, defending, or in transition? |
| 3 | `botDrawPlans(w)` | What shape is each side playing? |
| 2 | `botAssignRoles(w, team)` | Who is the chaser, support, defender, goalie? |
| 1 | `runBot(w, p)` | What is this player trying to do right now? |
| 0 | `botArrive`, `botSeparate`, `botArcPoint`, `botWallAvoid` | Which way does the stick go? |

### Layer 3 — phase and plan

`botPhase` is three-valued and deliberately hysteretic (a 12-unit margin on the distance
comparison and a ±0.15 band on ball position) so a team does not flip between attacking and
defending every time the ball wobbles.

### Layer 2 — roles

Re-matched every `BOT.roleTicks` (20), never per frame, and a challenger must beat the
incumbent by `BOT.roleMargin` (10%) to take a role off them. Without that margin two bots
standing the same distance from the ball trade the chaser role on alternate ticks and both
end up doing neither job.

Roles are: **chaser** (nearest to the ball, goes for it), **support** (finds a useful spot
via the grid below), **defender** (holds a line), **goalie** (stays on the mouth). Same-role
players are spread across the width by rank, so a 4v4 never gives two defenders one target.

### Layer 1 — the decision

A small state machine per bot — `approach`, `strike`, `carry`, `recover` — with **two
thresholds on every transition, never one** (`strikeEnter` 0.85 / `strikeExit` 0.60), a
`dwell` of 12 ticks before any state may change at all, and a `commitTicks` of 50 after
which a stalled strike gives up. Single-threshold state machines oscillate; that is the
single most common way a bot AI ends up vibrating in place.

Aim is `botPickAim`, which is worth understanding because it is where the interesting
behaviour is. **Passing is not a separate mechanic**: it is the same kick aimed at a mate.
Every candidate — a shot at the clear part of the goalmouth, a pass to each teammate led
ahead of their run, a bank off each wall toward the goal or a mate, and a corner extraction —
goes through one scorer, `botScoreAim`:

```
lane × wLane + progress × wProgress + openness × wOpen − distance × wDist − penalty
```

Everything is 0..1 so the weights mean what they say. A bank competes with a direct shot
rather than being a special case; it just carries `wallPenalty` so it wins only when the
direct lanes are genuinely shut.

### Layer 0 — steering

Everything here returns a stick vector and nothing else. `botArrive` eases off approaching a
target (it needs `botMaxSpeed(w)` — the terminal speed under this world's accel and damping —
to know what full stick is worth). `botSeparate` is teammate repulsion and is the single
thing that stops ball-swarming. `botWallAvoid` peels off-ball players away from the boards.
`botArcPoint` walks *around* the ball rather than through it. The weights are summed and then
clamped to a unit stick.

---

## Difficulty: a ladder

**Every AI-side difficulty axis derives from one 0..1 scalar** (`botSkill`), computed from
`diff.react`. That is deliberate and load-bearing: derived from one number, the ladder can
only ever be monotonic — a tier cannot accidentally be better at one thing and worse at
another.

Error is the primary knob but cannot be the only one. Measured against a fixed Normal
opponent, every tier from Hard up won ~0.4–0.5 of its matches: below about 15, `err` is too
small to change a shot. So the tiers also differ in:

- **how long they take to react** (`lag`, in ticks, on a *new* role or state)
- **whether they predict the ball at all** (`iters` — the weakest bots chase where the ball
  *is*, not where it will be)
- **which kicks they can even see** (a rookie only knows "boot it at the goal"; passes and
  banks unlock further up)

⚠️ **Decision rate is the same for every tier.** Giving the top tiers a faster recompute made
them score *less* — 8.30 goals/min at Hard down to 5.85 at Insane — because re-picking the
aim more often keeps moving the strike waypoint, so the bot re-approaches instead of
committing to the shot it already lined up. Skill belongs in the axes that actually help.

---

## Player types and team strategies: a shape, not a ladder

Difficulty says *how good*. A type says *what kind*. Keeping those on separate axes is the
whole design.

A **type** (`BOT_TYPES`) is a set of **multipliers on `BOT` values** — never replacements, so
the tuning stays in one block and a type can only lean on it. `botTypeM(p, key)` is the one
reader, and it returns 1 (or 0 for the additive aim biases) for anything missing, because an
`undefined` times a `BOT` value poisons a formation slot silently instead of failing anywhere
anyone would look.

| Type | What it does |
|---|---|
| All-rounder | No lean either way — carries no numbers at all |
| Poacher | Lives high, keeps width, shoots early |
| Playmaker | Finds room, looks for the pass |
| Anchor | Sits deep, happy in traffic, clears its lines |
| Sweeper | Tracks the ball hard, covers the space behind |
| Terrier | Hounds the carrier, commits from much further out |

The axes a type may bend are `depth`, `influence`, `space`, `chase`, `press`, and additive
`shot`/`pass` aim biases.

⚠️ **There is no accuracy, reaction or speed multiplier in the table, on purpose.** That
would be a second difficulty dial hidden inside a personality, and a "Poacher" that is simply
a worse player is a bug wearing a name. A type changes *where a body stands, how much space
it keeps, how far it will chase, and what it looks for when it kicks* — nothing about how
well it does any of it.

⚠️ **The aim bias is added to a score, never used to remove a candidate.** A playmaker that
cannot shoot when the goal is open is broken, not characterful. The biases are small (±0.16)
because they compete with lane, progress and openness — a big one makes a bot shoot from its
own half because it is "a poacher".

A **plan** (`BOT_PLANS`) is the team-level shape: a `line` height, a `press` multiplier, and
which type fills each **role**.

⚠️ Keyed by role, not by seat index — roles are re-matched every few ticks by who is nearest
what, so a plan written against seat 2 would describe a different player every few seconds.
The type is therefore re-read at the end of `botAssignRoles`: a body that drops from support
into defence has to start defending like one.

⚠️ `line` and the type's own `depth` **multiply** rather than one winning, which is what makes
"park the bus with a poacher up top" expressible — and that is most of what a plan is for.

⚠️ `press` applies **only while defending**, which is what makes it a press rather than a
second line-height dial. A high-press side collapses onto the carrier when the other team has
it; a bus sits off and keeps its shape; attacking, both look like themselves again.

⚠️ **Mixed draws both sides from one call**, with the second taken from what is left. Two
independent draws off the same seed handed both teams the same plan often enough to look
broken, and two sides playing the identical shape is the one outcome "Mixed" exists to rule
out.

The picker's tiles are built from `BOT_PLANS` itself — names and blurbs are read, never
copied — so a plan cannot be renamed in one place and keep its old name in the menu.

---

## Where the numbers live

**Every tuning value is in the `BOT` block, and nothing below it reads a magic number.** If
you are about to type a constant into a decision function, it belongs up there instead. The
block is grouped by what the numbers do — decision rate, approach geometry, alignment
hysteresis, steering weights, interception, formation, aim scoring, the support grid, and
feel — and each group carries the measurement that produced its values.

## Traps that have already caught someone here

- **The strike waypoint is never discarded.** An earlier version placed it 27 units out and
  threw it away inside 43, which was the entire oscillation bug.
- **`BOT.carryAlign` is checked on the ball as well as the face.** Aligned on the face alone,
  a bot released a carried ball while it was still swinging round and shot somewhere it had
  not aimed — which cost the stronger tiers most, because they trap most: rookie beat insane
  83% of the time.
- **Bots finish berry runs, they do not courier them.** Ungated, they drove Killer Lobsters
  berries the length of the pitch and 7 of 8 bot matches ended on a full hive inside 90
  seconds with the ball barely involved.
- **A synchronous test harness must switch auto-replay off.** `playReplay()` returns a
  promise, and a `for` loop of `step(w)` with no `await` can never resolve one, so the goal
  state keeps ticking. `tests/botai.mjs` was losing 910 of 3,600 steps a duel to this.
- **Timing is the wrong axis for a balance guard.** Measure proportions over several seeded
  matches, not "did X happen inside N seconds" — same-engine determinism means a seeded run
  reproduces on one browser build and not across two.
