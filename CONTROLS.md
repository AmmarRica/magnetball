# Magnetball — controls

Every input the game reads, and what it does. Written from the code; the file and function
that owns each rule is named so a claim here can be checked against the thing that
implements it.

Three ideas run through all of it:

- **You should be able to walk up and play without configuring anything.** Every button
  kicks, the stick is found rather than assumed, and a controller takes a seat out of the box.
- **A control that is on screen can be reached by the input the machine has.** No gesture
  is the only way to do something.
- **A tap and a hold are different things.** Several buttons carry two meanings, and the
  hold always shows a filling ring so you can see it coming and let go.

---

## Gamepad

The layout below is the **standard mapping**. Nothing important depends on it — the game
finds the stick and takes any button — but the names have to come from somewhere.

| Input | In a match | In warm-up | On the menu / result screen |
|---|---|---|---|
| **Left stick / D-pad** | move | move | move the cursor |
| **Any button** (not D-pad, Start, Select) | KICK — hold to trap and wind up, release to shoot; hold to sprint if Sprint is on | KICK, and presses the lobby key you are standing on | **A** confirms |
| **START (9)** | — | tap: ready · **hold 5s: force the kickoff** | starts a match · on the result screen, goes to warm-up |
| **SELECT (8)** | tap: turn your controls a quarter turn · **hold 3s: take the room to warm-up** | tap: turn your controls a quarter turn | with nothing running: open warm-up (first pad only) |

**Every button kicks** (`padKickHeld`, `KICK_NEVER`). There is nothing to learn and nothing
to bind, and it cannot be wrong on a controller that numbers its buttons oddly. Three
exclusions: the **D-pad** (it is a button as far as the browser is concerned, so counting it
would fire a shot on every step you take), **Start** and **Select**. Binding a kick button
by hand in Controls wins outright.

**The move stick is found, not assumed** (`padStick`, `padStickAxes`). `axes[0]/[1]` is the
left stick only under the standard mapping; a controller reporting a non-standard one
numbers its axes however it likes. Axis pairs are read in twos, never overlapping, and a
**trigger rests at −1** and never centres — so only a pair that both centre can be the
stick. Controls → Move stick sets it by hand and shows the live axis values.

**Both the stick and the direction buttons are read every frame**, combined per axis with
the louder winning — so a D-pad reported as a hat still gives you diagonals.

**The five-second hold takes any button, the tap does not.** Plenty of controllers have no
Start button, so the hold that forces a kickoff accepts anything except the D-pad. The tap
cannot be widened: in warm-up the ball is live and every button is KICK. The one exception
is the `+`/`−` size squares, which repeat while held — standing on those, only a real Start
button counts toward the hold.

---

## Keyboard

| Key | Does |
|---|---|
| **Arrows** or **WASD** | move |
| **Space** | kick |
| **Enter** | warm-up: ready / start |
| **Escape** | pause · leave a replay |
| **P** | pause |
| **F** | full screen |
| **M** | mute |

The keyboard and the **first controller drive one player** (`firstHumanSeat`, `mergePads`),
merged rather than one-or-the-other: the louder wins each axis and KICK is an OR. Only the
first human seat — the keyboard joining every pad seat would drive four players with one
keypress. It stands down in the cocktail layout, where a table people sit around has no
in-front-of-the-keyboard seat.

---

## Touch

| Gesture | Does |
|---|---|
| **Left half of the screen** | thumbstick — eight directions, snapped |
| **Right half** | kick |
| **Swipe down from the top edge** | pause |
| Tap during a goal replay | skip it |

The on-screen stick is **digital by default** (`sel.touchDigital`): eight directions and
nothing between them, which is the shape the keyboard has always produced. A half-push is
full speed. Turn it off in Game Feel for an analogue stick.

There is no "pause here" region because there is no free region — the whole screen is
already a move half and a kick half — so pause is a **gesture** from the top 56px, timed so
a slow drag through the strip is not a pause.

**Sliders are drag-only on touch.** A native range input jumps to wherever you press it,
and on a phone a graze while scrolling would rewrite a value you had tuned. A mouse is
exempt: a click on the track is precise and deliberate.

---

## The warm-up room

Everything in here is a **pad you walk onto**, and **KICK is the press** — nothing fires by
standing on it, so brushing a control on the way past does nothing.

| Control | Where | Does |
|---|---|---|
| **Letters, DEL, SPACE** | behind the goal | spell your name; committed at the whistle |
| **START** | below the letters | start the match |
| **Colour swatches** | beside each half | that side's shirt colour |
| **Flags** | under the swatches | that side's country (and its colour) |
| **`+` / `−`** | corner | team size, 1v1 up to 11v11 — repeats while held |
| **1–7** | above the pitch (beside it when turned) | bot skill, applied to the match you are standing in |

Three other ways out: **hold any button for five seconds**, everybody **stands in a goal**
for a moment, or the **30-second idle clock**. Walking into a half is how you pick a side;
standing on the halfway line is undecided.

---

## Result screen

The options are a stack, so the cursor walks **up and down** — and left/right, which is the
axis that always worked. **A** or **KICK** confirms. **START** goes straight to warm-up
where warm-up is offered, and otherwise confirms the cursor. Any input resets the 30-second
clock that starts the next match on the same settings.

---

## Arcade cabinet

`sel.display === 'arcade'`. The keyboard **is** the wiring: a JAMMA harness runs into a
keyboard encoder and every stick and button on the panel arrives as a keystroke. The map is
**MAME's own defaults**, so a cab wired by anybody who has ever wired one works with no
setup.

| Player | Stick | Buttons | Start | Coin |
|---|---|---|---|---|
| P1 | Arrows | L-Ctrl, L-Alt, Space | 1 | 5 |
| P2 | R, F, D, G | A, S, Q | 2 | 6 |
| P3 | I, K, J, L | R-Shift, Enter, `,` | 3 | 7 |
| P4 | Numpad 8, 2, 4, 6 | Numpad 0, `.`, Enter | 4 | 8 |

**F2** opens the operator screen. Bound to physical key positions (`e.code`), never to
`e.key` — a numpad key's `e.key` is not its own name, and with NumLock off `Numpad6` reports
`ArrowRight`, which is P1's stick.

---

## Joining, leaving and swapping

- **A controller takes a seat out of the box** (`sel.controllers`, default on).
- **Plug one in mid-match** and a body walks out to the touchline. Walk to the half you
  want, press **any button**, and you come on at the next goal. Pressing again cancels.
- **Unplug** and your body keeps your name, shirt and stats; a filler bot takes the place.
  Plug back in and **any button** takes it straight back, mid-play.
- **A pad missing from a single poll is not an unplugged pad** (`PAD_GRACE`). Browsers
  re-enumerate — on a focus change, a Bluetooth blip — and a slot of nulls for a frame used
  to take the whole controller row off the corner of the screen and bench a body. Both
  halves of that are held now: the corner icons ride it out, and so does the roster, which
  had a second copy of the question and believed every blip.
- **An arcade cabinet's four panels are not controllers** as far as the browser is
  concerned, so nothing may ask the browser about them. Anything that wants to know whether
  a seat is live asks `connectedGamepadIndices()`, which answers for the panel too.
- **A returning pad reclaims its own body** by slot first, then by device: a controller does
  not always come back on the index it left.

---

## HUD

Pause is top-left, mute and full screen top-right, the score in the middle. On a desktop the
two corners **fade until the pointer goes there** — the pitch is the picture. They never fade
on touch (there is no hover to bring them back), and the scorebug never fades at all.

The bottom-right row is one icon per connected controller. It **turns with your seat
rotation**, which is the only readout that setting has, and fills with the same ring as the
hold on the pitch.

---

## Settings that change what a control does

| Setting | Effect |
|---|---|
| Controls → **Move stick** | pin the stick axes by hand |
| Controls → **Kick button** | pin one button as KICK; every other button stops kicking |
| Game Feel → **Sprint** | KICK becomes a sprint as well as a kick; the ring round you is the stamina |
| Game Feel → **Hold to kick harder** | whether holding KICK winds a shot up, and for how long |
| Game Feel → **Kick ring** | the drawn ring **is** the reach — moving it moves both |
| Display → **Layout** | Auto / Steam Deck / Cocktail / Arcade |
| Display → **Orientation** | Auto turns the pitch whichever way fills the screen |
| Match → **Warm-up** | Skip / On / Everyone (adds the on-screen START for touch) |

---

## Things that deliberately do not exist

- **No separate kick binding per player.** Every button kicks, so there is nothing to set up.
- **No "pause" button region on touch.** The whole screen is a control; pause is a gesture.
- **No mid-match replay bar.** It appeared at the first goal and then sat over the pitch for
  the rest of the match. Watching and saving live where there is nothing to interrupt.
- **No dead controls.** If something is on screen it does something, and if it cannot work
  it says so rather than being greyed out.
