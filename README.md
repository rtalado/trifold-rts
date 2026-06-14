# TRIFOLD — an asymmetric RTS

One war, **ten completely different ways to wage it.** A self-contained browser RTS
(plain HTML5 canvas + vanilla JS, no build step, no framework) where every faction
plays by its own rules — different economy, different production, different verbs.
Every match is a free-for-all: destroy the enemy **cores** and the last one standing
wins. When a core falls, that faction's entire army falls with it.

## How to run

- **Single player:** double-click `index.html` — it runs straight from disk, no
  server needed. Or open the GitHub Pages link.
- **To play with friends:** double-click `start.bat` (Windows) or run `./start.sh`
  (Linux/macOS). It launches a tiny local web server and opens the game. The
  GitHub Pages link works for multiplayer too.

Node.js is only needed for `start.bat` / `start.sh` (the local file server). The
game itself has no dependencies — PeerJS is vendored in `libs/`.

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

A large point-symmetric battlefield with neutral objectives worth fighting over:

- **Crystal nodes** — the mineable resource (Vanguard Workers, Exodus Collectors
  and the deployed Ark feed on them).
- **Obelisks** — capture points. Hold the ground around one (with no enemies in
  range) for ~6 s to claim it; each obelisk pays its owner **+1.4 resources/s** in
  whatever your faction's currency is. They can be recaptured.
- **Wild camps** — neutral guards around **Ancient Hoards**. Destroy a hoard and
  whoever lands the kill pockets a **+550 bounty**. The biggest camp sits dead
  centre, wrapped around the middle obelisk.

**No faction may build in enemy territory** — you cannot drop turrets, walls, or any
structure within an enemy core/building's keep-out radius. No base-rushing with
buildings.

## Research

Every faction has its own three-step upgrade line, researched at a dedicated,
faction-flavoured **research building** (the base-less Exodus researches at its Ark).
Two attack tiers and one defence tier; upgrades are timed, cost resources, and apply
**retroactively** to your existing army.

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

### WARDEN COVENANT — the Bulwark · *Stone* · core: **Bastion Keep**
Your fortress *is* your economy — income scales with the total HP of your standing
buildings. Wall in with dirt-cheap Ramparts, then bristle with **Bastions, Bunkers
and long-range Redoubts** for a truly impenetrable base. Slow, armoured units
(Sentinels, Warden Guards, Bombards) that grind forward and never break.

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
| 1–0 | Command-card hotkeys (build / produce / research / deploy) |
| F | Select your whole army |
| Space | Jump camera to your core |
| WASD / arrows / screen edges / minimap | Pan the camera |
| Esc | Cancel placement / clear selection |

## Code layout

- `index.html` — page shell, the menu screens, HUD, and all styling.
- `game.js` — the whole engine: entity definitions (`DEFS`), per-thing flavour and
  tech gates (`META`), research lines (`RESEARCH`), AI difficulties (`DIFFS`),
  economy (`tickEconomy`), creep system, combat & movement, per-faction AI
  (`aiTick`), the command card, multiplayer transport, and the canvas renderer.
- `server.js` — a tiny dependency-free static file server (just serves the files;
  multiplayer is peer-to-peer, not relayed).
- `libs/peerjs.min.js` — vendored PeerJS (WebRTC) for multiplayer.
- `start.bat` / `start.sh` — launch `server.js` and open the browser.

Balance levers are concentrated near the top of `game.js`: `DEFS` (unit/building
stats and costs), `ECON` (income rates), `RESEARCH` (upgrade effects) and `DIFFS`
(AI difficulty).
