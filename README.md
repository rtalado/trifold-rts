# TRIFOLD — an asymmetric RTS

One war, **ten completely different ways to wage it.** A self-contained desktop RTS
(plain HTML5 canvas + vanilla JS wrapped in Electron, no build step, no framework)
where every faction plays by its own rules — different economy, different
production, different verbs. Every match is a free-for-all: destroy the enemy
**cores** and the last one standing wins. When a core falls, that faction's entire
army falls with it.

## How to play

Install and run the desktop app — it runs in its own window (no browser, so browser
shortcuts can never collide with the in-game controls) and **updates itself**: on
launch it quietly checks GitHub Releases, downloads any new version in the
background, and installs it on next start. No more re-downloading.

- **Windows:** run the `Trifold RTS Setup X.Y.Z.exe` installer from the latest
  [GitHub Release](https://github.com/rtalado/trifold-rts/releases), then launch
  **Trifold RTS** from the desktop / Start-menu shortcut.
- **Linux:** download the `.AppImage` (or `.deb`) from the same Release and run it.

The game itself has no dependencies — PeerJS is vendored in `libs/`. Multiplayer is
peer-to-peer over WebRTC, so there's no server to run.

### Running / building it yourself

```
npm install        # one-time: pulls in Electron + the build tools
npm start          # run the desktop app from source (dev)

npm run dist:win   # build a Windows installer  -> dist/Trifold RTS Setup X.Y.Z.exe
npm run dist:linux # build Linux AppImage + .deb -> dist/
```

`npm run dist:win` must be run on Windows and `npm run dist:linux` on Linux —
each OS builds its own installer. You normally don't run these by hand: see below.

## The menu

The main menu has two screens:

- **Single Player** — pick your faction, choose **1–3 AI opponents** (each a
  distinct random faction, so up to a four-way free-for-all), pick a **difficulty**,
  and start.
- **Multiplayer** — host or join a game by 5-letter code (see below).

### AI difficulty

Four levels, selectable in single player (and in the multiplayer lobby for the
host's filler bots):

| Level | Bot economy | First attack | Re-plans |
|---|---|---|---|
| Easy | 0.6× | very late | slow |
| Normal | 1.0× | ~90 s | 1 s |
| Hard | 1.5× | ~55 s | 0.7 s |
| Brutal | 2.1× | ~35 s | 0.5 s |

Difficulty scales the bot's whole economy (passive **and** combat income), how soon
and how relentlessly it attacks, and how often it re-plans. Brutal out-economies a
careless human and pushes almost immediately. Your own economy is never handicapped.

## The map

A large battlefield strewn with crystal nodes, neutral camps and cliff terrain, all
seeded so every peer builds the identical map. Each player gets a small fair
starter economy by their base; the rest of the world is scattered with objectives
in random spots (League-of-Legends style) so the map feels alive instead of a
single lane of stuff aimed at your foe. The more players, the more the map fills
out. A **fog of war** hides the map beyond what your own units and buildings can
see — dark where you've never been, dimmed where you've been but aren't looking now —
so scouting matters. Objectives worth fighting over:

- **Crystal nodes** — the mineable resource (Vanguard Workers, Exodus Collectors
  and the deployed Ark feed on them). Dozens are scattered across the map.
- **Obelisks** — capture points, and now the main reason to fight over the map. Hold
  the ground around one (with no enemies in range) for ~6 s to claim it; each obelisk
  pays its owner **+2.6 resources/s** in whatever your faction's currency is (and a
  trickle of **Powder** to the Warden — see below). They can be recaptured, and there
  are more of them than before.
- **Supply Caches** — small, lightly-guarded jungle camps dotted everywhere.
  Crack one open for a quick **+160 bounty**.
- **Munitions Bunkers** — heavily-guarded strongpoints, several of them, often sat
  behind a chokepoint. Crack one for a big **+450 bounty** — and if you're the **Warden**
  it also yields a cache of **Powder** for your grand projects.
- **Wild camps** — neutral guards around **Ancient Hoards**. Destroy a hoard and
  whoever lands the kill pockets a **+550 bounty**. The biggest camp sits dead
  centre, wrapped around the middle obelisk, hoard and bunker.

**Chokepoints** — the map is broken up by impassable rocky cliffs. A ring of them
rings the central prize, leaving a lane toward each base corner, so the middle
objectives sit behind real chokepoints; more clusters scatter the open field. You
can't build on rough terrain.

**No faction may build in enemy territory** — you cannot drop turrets, walls, or any
structure within an enemy core/building's keep-out radius. No base-rushing with
buildings.

**Build a connected base** — most factions can no longer plant structures anywhere on
the map: a new building must sit within range of one you already own, so your base
grows as a connected web and reaching distant nodes or objectives means chaining
buildings out toward them. (The Myriad's creep and the Choir's lattice already worked
this way; the base-less Exodus is exempt, and the Syndicate can still air-drop its
Watchposts anywhere.)

## Research — the tech tree

Press **T** (or select your **research building** and hit *Tech Tree*) to open the
full visual tech tree. Every faction shares a four-branch tree — **Offense, Defense,
Mobility, Economy** — of 16 nodes laid out as a dependency graph you click through:

- **Offense:** Weapons I/II (+damage), Targeting Array (rate of fire), Siege Ordnance (splash).
- **Defense:** Plating I/II and Fortification (+HP), Ward Fields (+shields).
- **Mobility:** Engines I/II (+speed), Long Optics (+range), Overdrive (speed + fire rate).
- **Economy:** Logistics I/II (+income), Supply Lines & War Economy (+unit cap).

Nodes are timed, cost resources, gate behind their prerequisites, and apply
**retroactively** to your whole army. Research happens at a dedicated, faction-flavoured
**research building** (the base-less Exodus researches at its Ark):

| Faction | Research building |
|---|---|
| Iron Vanguard | Tech Lab |
| Myriad Swarm | Evolution Chamber |
| Solari Exodus | the Ark itself |
| Ashen Choir | Bone Oracle |
| Gilded Syndicate | Black Market |
| Warden Covenant | War College |
| Ember Nomads | War Lodge |
| Verdant Bloom | Arboretum |
| Stormforge Dynasty | Research Bay |
| Obsidian Pact | Blood Sanctum |

## Multiplayer (2–4 players, peer-to-peer, no server to run)

Free-for-all with up to 4 people (plus AI bots to fill seats) over direct WebRTC
connections. **It works across different networks with no port forwarding, VPN, or
setup** — WebRTC handles NAT traversal and matchmaking goes through the free public
PeerJS broker.

1. One player clicks **HOST GAME** and shares the generated **5-letter room code**.
2. Friends click **JOIN GAME**, type the code, and press **JOIN**.
3. In the lobby everyone picks a different faction; the host sets the number of AI
   bots and their difficulty.
4. The host presses **START MATCH**.

The host's browser is authoritative: it runs the simulation, streams compact
snapshots to every guest (~10×/s), and runs the lobby/room logic in-browser; guests
send their commands back. If the host disconnects the match ends; if a guest leaves,
the others play on. After a match everyone returns to the lobby for a rematch.

The only outside contact is the PeerJS broker (matchmaking) and a public STUN lookup
(so each browser learns its own address); all game traffic flows directly between
browsers. The one limitation: if both players sit behind very strict NATs a direct
link can fail — have one switch networks (a phone hotspot usually works).

## The ten factions

Each has a unique economy, a single **core** that ends the game if it dies, and its
own roster (units below are highlights, not the full list).

### IRON VANGUARD — the Architects · *Crystal* · core: **Headquarters**
Classic macro. Workers mine crystal back to the HQ. Build Barracks (Marines, Snipers,
Medics), a Factory (Siege Tanks, the fast flame **Hellhound**, the heavy **Goliath**
walker), an Airfield (Gunships), and Turrets. Economy → production → army → push.

### MYRIAD SWARM — the Flood · *Biomass* · core: **Hive**
No workers, no mining — every tile of **creep** pays biomass, so your map presence
*is* your income. Growths must sit on your own creep; Spawn Pits / Spitter Mounds /
Hunter Dens **breed units for free, forever**. Steer the swarm with a rally point.
The swarm heals on creep and is just meat off it. Elites: Broodmother, **Ravager**.

### SOLARI EXODUS — the Pilgrims · *Energy* · core: **The Ark**
No base, ever. The Ark is fortress, factory and treasury in one — it walks and
shoots. **Deploy** it on a crystal node to siphon fast (anchored = vulnerable).
**Collectors** mine to scale your economy. A handful of priceless, **shielded**
elites — Seekers, Lancers, Guardians, Phoenixes, Templars, and the heavy **Aegis** —
whose shields regenerate out of combat. Lose nothing, or lose everything.

### ASHEN CHOIR — the Revenants · *Essence* · core: **Ossuary**
All death anywhere pays you Essence — carnage enriches you, stalemates starve you.
Near the lattice your spirits are sustained; in the field they fade but heal by
dealing damage. Build only within the lattice (Soul Conduits extend it). Units:
Wraiths, Banshees, Revenants, and the ranged caster **Lich**.

### GILDED SYNDICATE — the Magnates · *Gold* · core: **The Haven**
Gold breeds gold: your treasury earns **compound interest**. Mercenaries arrive
**instantly**; every kill pays a bounty. Air-drop Watchposts across the map (never
into enemy territory) and Countinghouses to raise your interest cap. Units:
Enforcers, Arbalests, Juggernauts, **Marauders**.

### WARDEN COVENANT — the Bulwark · *Stone* + *Iron* + *Powder* · core: **Bastion Keep**
The most intricate faction in the game, on **three resources**: Stone scales with the
total HP of your standing buildings (and a flat trickle from **Stone Quarries**);
Iron is minted only by **Iron Forges** and pays for everything heavier than Tier 1;
and **Powder** — burned only by your grandest projects (the Grand Arsenal, Castellan,
Trebuchet, Bulwark and Worldbreaker) — comes from a trickle at **Powder Mills** but
mostly from the *map*: every **Obelisk** you hold pays Powder, and cracking a
**Munitions Bunker** drops a cache of it. So the doomsday tech demands you march out
and seize ground, not just turtle. Crucially the tech tree is **distributed** —
advanced structures are raised from *other* advanced structures, not all from the Keep:

- **Keep** → Ramparts, Bastions, Quarries, Forges, **Powder Mills**, **Oil Cauldrons**, War Foundry, War College.
- **War College** (your research hall) → **Bunkers, Ballista Towers, Hall of Oaths**.
- **War Foundry** → **Redoubts** and the **Grand Arsenal**.
- **Grand Arsenal** → **The Bulwark** and **The Worldbreaker**.

Wall in and bristle with layered defences for a truly impenetrable base. Slow,
armoured units (Sentinels, Warden Guards, Pikemen, Ironclads, Bombards) grind
forward and never break; the **Hall of Oaths** musters anti-armour **Halberdiers**
and banner-bearing **Marshals** whose aura heals troops *and repairs buildings*; the
Arsenal builds the **Castellan** colossus and the longest-ranged unit in the game,
the **Trebuchet**. Tech the whole way and erect **The Bulwark** (a doomsday
artillery fortress ringed with four machine-guns) — then, beyond even that, the
**WORLDBREAKER**: a Schwerer-Gustav-scale siege gun with the longest passive range
on the map *and* an active **Gustav Strike** — designate any point in colossal
range and, after a telegraphed flight delay, a single annihilating shell levels
everything in a wide blast (~1-minute reload). Demands a Grand Arsenal, a standing
Bulwark, and the Siege Ordnance doctrine.

### EMBER NOMADS — the Warband · *Plunder* · core: **War Pyre**
No mines — you fund the war by waging it: every point of damage you deal pays
Plunder. Dirt-cheap, blazing-fast raiders; idleness is death. Units: Raiders,
Slingers, Firebrands, War Beasts, and the splashing **Fire Wagon**.

### VERDANT BLOOM — the Grove · *Sap* · core: **Heartwood**
A slow, unstoppable garden. Each mature Bloom pays Sap (the more you grow, the harder
you snowball); Groves breed free Saplings forever. Patient and weak early,
overwhelming late. Units: Saplings, Thornlings, Treants, and the colossal **Ancient**.

### STORMFORGE DYNASTY — the Engine · *Power* · core: **Storm Reactor**
An engine that only accelerates — income ramps the longer the game runs, supercharged
by Dynamos. Few but devastating, **shielded** machines: Arclights, Voltaics, the
mid-weight **Gladius**, and the towering Colossus.

### OBSIDIAN PACT — the Martyrs · *Blood* · core: **Blood Altar**
Death is your harvest — your *own*. Every unit you lose spills Blood for the next,
greater summoning. Throw cheap Thralls into the grinder; raise Behemoths from their
deaths. Units: Thralls, Zealots, Behemoths, and the ranged **Cultist**.

## Controls

| Input | Action |
|---|---|
| Left-drag / left-click | Select units / a building |
| Right-click | Move (attack-move for combat units), attack target, harvest/siphon node, set rally |
| Mouse wheel | Zoom in / out (toward the cursor) |
| 1–0 | Command-card hotkeys (build / produce / sell / deploy) |
| T | Open / close the tech tree |
| F | Select your whole army |
| Space | Jump camera to your core |
| WASD / arrows / screen edges / minimap | Pan the camera |
| Esc | Cancel placement / clear selection / close tech tree |

Selecting any unit or building shows its **weapon range** as a ring, and selected
units draw a line to wherever they've been ordered. Select one of your buildings to
**Sell** it (recovers half its cost) — handy for fixing a bad placement.

## Code layout

- `index.html` — page shell, the menu screens and HUD markup.
- `css/style.css` — all styling.
- `js/` — the engine, split into ordered classic scripts that share one global
  scope (so load order, set in `index.html`, matters):
  - `defs.js` — entity definitions (`DEFS`), flavour & tech gates (`META`),
    research lines (`RESEARCH`), economy tuning (`ECON`), AI difficulties (`DIFFS`),
    and the requirement/secondary-resource helpers.
  - `core.js` — global state, the canvas handles, and small helpers.
  - `sim.js` — game setup, map generation, spawning, combat & movement, placement,
    creep, and `tickEconomy`.
  - `ai.js` — the per-faction bot brains (`aiTick`).
  - `update.js` — the main simulation step and win/lose handling.
  - `input.js` — mouse/keyboard, selection, orders and the camera.
  - `ui.js` — the command card, tooltips and HUD.
  - `render.js` — the canvas renderer (`draw`, `drawEnt`, fog of war, minimap).
  - `loop.js` — the `requestAnimationFrame` loop and background ticking.
  - `net.js` — snapshot serialization and peer-to-peer multiplayer + lobby.
  - `menu.js` — menu wiring (single-player / multiplayer setup).
- `libs/peerjs.min.js` — vendored PeerJS (WebRTC) for multiplayer.
- `electron/main.js` — the desktop wrapper: opens `index.html` in its own window
  and runs the GitHub-Releases auto-updater.
- `package.json` — Electron app metadata + `electron-builder` config (Windows &
  Linux installers, update feed).
- `.github/workflows/release.yml` — builds Windows + Linux and publishes a Release
  on every version tag.

Balance levers are concentrated in `js/defs.js`: `DEFS` (unit/building stats and
costs), `ECON` (income rates), `RESEARCH` (upgrade effects) and `DIFFS` (AI difficulty).
