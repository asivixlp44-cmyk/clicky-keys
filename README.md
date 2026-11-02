# Clicky Keys

A multiplayer clicker for the browser, built with **Three.js** and **Colyseus** for Bloxity. **Every key you press gives you Keyboards.** Run across giant keyboards (or tap to click), spend your Keyboards building rainbow bridges out to sea with their keys popping in one by one, clear 20 stages in each of five worlds, touch the Win Pad at the end of each stage for **Wins**, hatch Keypals, upgrade and rebirth.

The genre, the core loop and the pacing follow the Roblox game *[+1 Keyboard Per Click](https://www.roblox.com/games/75358619038387/1-Keyboard-Per-Click)* (see the video in `reference/`). Everything players see and hear is our own: the name, the islands, the keyboards and their switch sounds, the bridges, the Keypals, the capsule machines, the HUD art, the text and the music.

**There are no in-app purchases.** Everything costs Wins (from Win Pads) or Gems (from quests, daily tasks, gifts, the wheel, the daily reward and codes).

It shares its engine with the other Legion games (the server, Bloxity login and avatars, the top games' character animation, the camera and lighting rig, the quality system, profiles, saves, play stats; forked from +1 Jump Higher ASMR).

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js client: `main.js` (boot and warm-up, your character on the shared physics, pressing keys with prediction, bridges, Win Pads, the guide chevrons, the camera, keyboard / mouse / touch / controller, other players smoothed on the server's clock, the network, the QA autopilot), `world.js` (a hub on screen: the island, seven keyboards, the bridges, the stage gates and little islands, the sea, the beams, the floating keycaps and the sky arcs, the Workshop, the capsule machines, the portal, leaderboards), `keys.js` (every keycap: legends, press and pop-in all in the vertex shader), `crowd.js` (Keypals, the stacks on everyone's back, flying keyboards: three draws for a crowd), `signs.js` (every floating sign in one draw), `asmr.js` (every switch sound synthesised sample by sample at load), `chars.js` (a character), `smooth.js` (the server's clock and the snapshot buffer), `icons.js` (the HUD's drawn icons and every Keypal's picture), `ui.js` + `index.html` (HUD and panels), `audio.js`, `fx.js`, `engine.js`, `geo.js`, `blobs.js`, `avatar.js`, `animator.js` |
| `server/` | Colyseus 0.18 server: the `keys` room (`KeyRoom.js`: presses and their token bucket, the speed budget, bridges, Win Pads, keyboards, the Workshop, capsules, rebirths, worlds, the wheel, tasks, quests, rewards, codes, the bots), profiles (MongoDB on Legion), leaderboards, play stats |
| `shared/` | `config.js` (keyboards, worlds, bridge prices, Win Pads, what a press gives, upgrades, Keypals, capsules, tasks, quests, rewards, codes), `world.js` (where everything stands on a hub, every key, the walkable ground), `physics.js` (moving and jumping: your screen runs it for you, the server for the bots) |
| `tests/` | The test scripts (see Testing) and the setup-page generator |
| `covers/` | The two store covers (1920x1080, 800x800), rendered from the game |

## Run it locally

Needs Node 20 or newer. Double-click `start-local.bat`, or:

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:2863
```

For development run `npm run dev:server` and `npm run dev:client`, then open http://localhost:5425 (the client talks to the server on port 2863; `VITE_SERVER_URL` overrides that). Dev builds (or a build with `VITE_QA=1`) expose `window.__qa` (the autopilot, perf readings, teleports). Restart the server after changing `shared/`. For testing only, `QA=1` lets the client give itself Keyboards, Wins, Gems, levels, rebirths and bridges (`__qa.give`); it is refused on Legion.

## Gameplay

- **The press.** Walk onto a key and it goes down with its own switch sound: Keyboards, more as you grow. Tap anywhere (or CLICK on a phone) to press the key under you; a jump stomps a handful of keys round your landing. Every press gives XP; every level adds +12% **Click Power**. A little keyboard stack grows on your back, full when you have enough for the next bridge.
- **Seven keyboards** on each island: **Office** x1, **Bubblegum** x2 (40 Wins), **Mechanical** x4 (1 rebirth), **Typewriter** x10 (900 Wins), **Gamer RGB** x25 (3 rebirths, its legends cycle through the rainbow), **Grand Piano** x60 (9,000 Wins, its keys play a scale), **Solid Gold** x200 (7 rebirths). Each has its own switch: a soft membrane, bubbly pops, a deep thock, a typewriter clack, a clicky blue, real piano notes, a golden chime.
- **The stages.** Twenty to each world: a bridge, a gate with the stage's number, a little island. Each bridge is a keyboard with nothing on it yet, and costs x2.2 the one before. Stand on the green strip in front of the next one: your Keyboards fly in, the keys pop up row by row in the world's colours, a counter over it (`110 / 240`). What's gone in stays. Clearing one sets off fireworks; the bar at the top of the screen shows how far along the world you are. **TO BRIDGE** and **TO KEYS** take you straight there.
- **Win Pads** on the little island after each bridge: Wins, x3 the first time each run, again every 100 seconds. A beam of light stands over each. Out of Keyboards for the next bridge? You're sent back to your best keyboard.
- **Keypals**: little key creatures with faces, out of eleven capsule machines (the first by the first bridge, others out along the bridges). 44 of them, Common to Mythic, x1.15 to x800,000; three on your team at first, up to six. They hop after you and multiply every press. Open 1 or 3 at a time; a collection finished pays Gems; the **Index** shows what's left.
- **The Workshop**: Click Power, Quick Feet, Auto Clicker, Fast Hands, Lucky Keys (a press may pay x10), Fast Learner, Keypal Slots, all for Wins, all kept when you rebirth.
- **Rebirth** (700 Wins, then x1.45 each time): Level 1, Keyboards 0, every bridge down; every press x1.5 more for good (x2, x2.5...). Rebirths open keyboards and **five worlds**: **Clicky Cove** (a tropical noon), **Neon Arcade** (4 rebirths: a violet night, a neon grid for a sea, Keyboards x30, Wins x5), **Cosmic Desk** (12 rebirths: open space, planets, Keyboards x900, Wins x25), **Sugar Switch** (18 rebirths: a milkshake sea with sprinkles, lollipops, Keyboards x27,000, Wins x110), **Molten Core** (25 rebirths: a sea of lava, black volcanoes, Keyboards x810,000, Wins x500).
- **The rest of a session**: a chain of 28 **quests** at the top of the screen; 3 **daily tasks**; the **Lucky Wheel** (a free spin every 7 minutes of play, up to 3 saved); a 7-day **daily reward**; **FREE gifts** at 2 / 5 / 9 / 14 / 20 / 30 / 45 minutes; **x2 Keyboards** and **x2 Wins** for Gems; codes (`CLICK`, `KEYBOARD`, `QWERTY`, `BLOXITY`, `LEGION`, `CLACK`); leaderboards for most Wins and most Keyboards; your keyboards keep typing while you're away (up to 2 hours' worth). Chevrons on the ground flow from you to what to do next.
- **Pacing** (`tests/economy.mjs`, a simulated typical first session; numbers move a little between runs): the first bridge at 15 s, the first Win Pad and capsule at 17 s, Bubblegum at about 1 min, the 6th bridge at about 2:30, the first rebirth at 13-15 min, the Typewriter at 16-18 min, the fourth rebirth and Neon Arcade at about 29 min, Cosmic Desk at about 57 min, Sugar Switch at about 2 hours, and Molten Core past 4 hours. It's a simulation, not a person's session. "Hard" here means prices: the stages have no traps or enemies, as the reference has none.
- **Multiplayer**: up to 16 players share a server and its islands, and see each other pressing keys. Each player's bridges are their own: someone further along than you rides across on a keyboard on your screen. When it's quiet a few bots press keys about the island; each real player sends one home.
- **The server decides**: every press (a key you own, near where you are, a token bucket of 14 a second), every move (a speed budget: distance earned by time, spent by moving; never past the last bridge you built; never higher than a jump goes), every bridge, pad, capsule (you have to be at the machine) and purchase. Your own movement runs on your device; your counter shows your presses at once and each answer takes off the ones it covers, so it never jumps back over a long round trip.
- **Far from the servers** (300-400 ms round trip from Sri Lanka): the server's clock corrected for the round trip, others drawn a little in the past on it between snapshots stamped with server time, the delay following how late snapshots really arrive.
- **Portrait phones**: the HUD sizes itself by the screen's width; the quest sits right of the Bloxity corner; the stick, CLICK and JUMP above the Level bar; the camera widens and pulls back.

## Controls

| Action | Keyboard / mouse | Controller | Touch |
|---|---|---|---|
| Move | WASD / arrows | Left stick | The stick |
| Press the key under you | Click anywhere, Enter (walking onto one presses it too) | X | CLICK (hold: keep clicking), or tap the world |
| Jump (stomps keys) | Space | A | JUMP |
| Use (a machine, the Workshop, the portal) | E | X | Tap the bubble |
| Camera | Drag, wheel | Right stick | Drag, pinch |
| To the bridge / to your keys | B / R | | The buttons |
| Keypals / Workshop / Wheel / Quests / Shop | P / U / F / Q / G | LB / Y / RB | The buttons |

## Sound

- **The switches** are synthesised sample by sample while the game loads (filtered noise, resonances, pitch sweeps; a few variations of each). A sound in play is one buffer source and a gain (and a panner for someone else's), never more than 22 at once. Every press in a row climbs a little bell up a scale; the bridge's keys snap in higher as it fills.
- **Music**, all generated: "Home Row" on the islands (104 BPM bossa) and "Caps Lock" out on the bridges (136 BPM). Each is rendered once into loops by an OfflineAudioContext behind the loading screen and plays from memory. On Low quality the music is never played note by note: a song whose loops aren't ready yet waits.

## Graphics and performance

- **The top games' lighting** (hemisphere 1.1, ambient 0.45, sun 1.5, PCF shadows, no tone mapping). **Only matte (Lambert) and unlit materials**: no reflections, no environment map, no bloom or post-processing. Clicky Cove has green grass, a bright noon sky and a turquoise sea with foam round the island; Neon Arcade's sea is a neon grid under a violet night; Cosmic Desk floats in space among planets; Sugar Switch's sea is a swirled milkshake with sprinkles; Molten Core's is lava with cracks of light moving through it.
- **The keys are the game**: sculpted caps with a chamfer and a dished top, legends from one mask texture. Everything a key does happens in its vertex shader from a few uniforms and one number per key: it sinks under anyone standing on it, clacks back with a spring after a tap or stomp, pops into a bridge with an overshoot; a press costs no geometry upload. The Gamer RGB keyboard's legends and rims run through the rainbow in the same shader.
- **Our own art, all drawn or built here**: glossy SVG HUD icons, a picture of every Keypal made from its colour and legend, chunky outlined lettering on every sign, giant fallen keycaps and cables about the islands, palm trees, arcade cabinets, crystals, lollipops, rock spires, capsule machines.
- **Colour everywhere**, each world in its own seven colours: every bridge key its own colour, a gate of stacked keycaps at the end of each stage, two great arcs across the sky that you run under, giant keycaps turning and bobbing over the sea, a beam of gold light over every Win Pad, keyboards with lit rims. The arcs, the floating keycaps and the beams are one draw each, moved in their shaders.
- **Juice**: a key's own sound on every press, a bell climbing with every press in a row, numbers with a little keyboard, keyboards flying off your back into the bridge as its keys snap in (higher and higher), fireworks over each stage cleared, Wins bursting out of the middle of the screen as little crowns and streaming into the counter, the capsule shaking and bursting, confetti, a camera that widens on takeoff.
- **Draw calls**: all seven keyboards' keys are one instanced draw; bridges are four to a draw. Static things are merged per stretch into one **BatchedMesh** per material (each stretch culled on its own by the camera and the sun's shadow view, its draw list changed only when one comes into view or goes out); palms and clouds are instanced per square of the map, with boxes for rounded blocks in the distance. Every floating sign is one draw; Keypals, stacks and flying keyboards are three for the whole crowd, with the far characters left out. A typical view: 25-39 calls, 55-79k triangles on Low and 90-147k on Medium.
- **Weak devices**: phones and weak PCs start on **Low** (4 cores or fewer, 4 GB or less, older Intel HD/UHD 6xx, small Radeons, software renderers): no shadow code, no multisampling (decided before the WebGL context exists), keys of 10 triangles instead of 34, no stud normal map, a simpler sea, fewer floating numbers. Below 54 FPS the resolution steps down first, then the quality below 45. On a 120 Hz+ screen, when frames are uneven, the game draws every other refresh; if the refreshes themselves are slow it draws them all.
- **Loading**: every shader (keys, signs, the sea, the crowd, effects, the avatar) is compiled and drawn once behind the loading screen; every HUD screen and panel is painted once; every emoji is drawn once in the page and once in a canvas; the GPU's name is read once; avatars are made behind the loading screen. Music renders once into loops in the background.
- **The HUD** writes to the page only when a value changes and moves its bars with transforms; nothing in the frame loop reads layout; animations restart without forcing a layout. An open panel's timers are written on their own, so a panel is never rebuilt under a finger and no tap gets lost.
- **What the measuring changed**: at first the simulated weak laptop drew about 58 FPS on the island, while with no CPU throttle Low held a full 144, so the limit was the CPU, not the graphics chip (`tests/gpulab.mjs`). Two causes: the HUD's rainbow buttons animated `background-position`, repainting on the main thread every frame (now a transform the compositor does), and a draw call for each keyboard and bridge (now one, and four to a draw). Also: even-frame pacing that could halve an already low rate (now it lets go).
- **The CPU profile** (`tests/perf.mjs profile`, unminified dev build, weak laptop, 12 s from just after loading): 44% of the samples are native work outside JavaScript (the browser and the graphics driver). The largest JavaScript items are three.js's draw setup at 1-2% each. The frame's own work is about 4-6 ms at 4x throttle. In the last full breakdown, taken before the stages and worlds were added: layout and style reads 0.00% of the samples, audio-node calls 4.7%, nearly all the music's loops rendering in the background in those first seconds.
- **Measured**, on this PC: Intel UHD Graphics on ANGLE D3D11 (forced with `LOW_GPU=1`), Chrome for Testing, headless, a 144 Hz display, the automatic resolution step-down switched off. The CPU read 10% just after this run ended; other apps were open, so numbers move between runs. Frames drawn per second, then the 95th percentile frame interval. *paced* means the game was drawing every other refresh.

  | Device | On the keys | Out on the bridges | At the spawn | Load + join |
  |---|---|---|---|---|
  | Desktop, 1600x900, Medium | 90 FPS, paced (14 ms) | 88 FPS, paced (14 ms) | 72 FPS, paced (7 ms) | 8 s |
  | **Weak laptop**: CPU throttled 4x, 1366x768, Low | 68 FPS (28 ms) | 68 FPS (21 ms) | 82 FPS (21 ms) | 13 s |
  | **Phone**: 844x390 @2x, touch, Low, CPU 4x | 79 FPS (21 ms) | 76 FPS, paced (21 ms) | 64 FPS, paced (14 ms) | 11 s |
  | **Phone**: 390x844 @2x, touch, Low, CPU 4x | 78 FPS (21 ms) | 77 FPS, paced (21 ms) | 57 FPS, paced (14 ms) | 11 s |

  A second weak-laptop run with the PC at about 54% CPU read 70, 65 and 60 FPS. With other apps heavier on the CPU, an earlier build fell to 33-55 FPS on the throttled devices, below the 54 FPS where the game steps its resolution down in real play. In these runs up to 4 frames in 5-6 seconds went over 50 ms on the throttled devices, the worst 104 ms. An earlier build once took 111 s to load and that was never explained; it has not happened again. The phones here are simulated: the game has not yet been measured on a real phone or on the Legion servers.
- **Over a 350 ms round trip** (`tests/latency.mjs`): round trip measured 355-360 ms, others drawn 280-370 ms in the past, a bot moving 0.31 studs a frame at the 99th percentile and 0.92 at most (with a 42 ms frame; no pops), the Keyboards counter never went backwards while pressing, no snaps.

## Testing

Test tools install on their own: `npm --prefix tests install`. Browser runs need Chrome (`CHROME=<path>` chooses which).

- **`tests/server.test.mjs`, a headless server test** (69 checks): a new player's start, ping and the clock, the bots; presses (out of reach, a locked keyboard, a burst of 60, levels raising what a press is worth, the answer saying which press it covers); the move guard (too far, too high, a speed hack, a bridge not built); bridges (only at their head, what's gone in stays), Win Pads (the wrong spot, past your bridges, x3 the first time, not again at once, sent home when out of Keyboards), the Workshop, keyboards, capsules (only at the machine, cost, team), the wheel, codes once, the daily reward once a day, gifts on time, every quest reading the right number, tasks once, warps, rebirth (refused without the Wins, what it resets, what it keeps, what it opens), worlds; a second player seeing the first; the save on rejoining.
- **`tests/economy.mjs`, a simulated first session**, for the pacing above.
- **`tests/autopilot.mjs`, browser runs with the autopilot**: one press of SPACE gives one jump (and holding it keeps jumping until let go), keys, bridges and Win Pads on all five worlds, no snaps, no console errors.
- **`tests/latency.mjs`, a 350 ms round trip** through a relay, two real browser players: the round trip measured, the counter never jumping back, a bot smooth from far away, each seeing the other, no snaps.
- **`tests/prod.mjs`, the production build with real input only** (no QA hooks; keyboard, mouse, touch; the game's words on screen as the only way to know what happened): walk onto the keys, click, the quest counting, level up, TO BRIDGE, the stage clears, W across to the Win Pad, the daily reward, every menu button, the wheel, a typed code; `loadingEnd()` called once, after joining a server (with a stand-in for the SDK); then the stick, CLICK and a menu button by touch on a portrait phone.
- **`tests/screens.mjs`, screenshots of every screen** (the HUD, every panel, a capsule opening) at 390x844, 360x800, 375x667, 844x390 and 1280x720, with the HUD's boxes and touch controls measured for overlaps, anything cut off and the Bloxity corner: none.
- **`tests/perf.mjs`, frame rates** (`LOW_GPU=1` for the integrated chip; `profile` for a CPU profile of the dev build), **`tests/gpulab.mjs`** (what each thing costs the graphics chip).

## Hosting

See `bloxity-setup.html` (every field of Bloxity's Create New Game form, with copy buttons, and the two covers; `node tests/setup-page.mjs` writes it) and `.github/workflows/deploy.yml` (deploys to Legion on a push to `main`; prod at https://clicky-keys.play.bloxity.io once hosted). Play stats: `GET /api/stats?key=<stats key>&days=7` (the key is in `server/STATS_KEY.local.txt`, not in the repo): session length, time to the first Win Pad, presses, bridges, capsules, levels and rebirths gained, frame rate by device, errors.
