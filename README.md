# TRIFOLD — an asymmetric RTS

One war, five completely different ways to wage it. A self-contained browser RTS
(plain HTML5 canvas + vanilla JS, no dependencies) where each faction plays by its
own rules — different economy, different production, different verbs.

## How to run

- **Single player:** double-click `index.html` — it runs straight from disk, no server needed.
- **To play with friends:** double-click `start.bat` (Windows) or run `./start.sh`
  (Linux/macOS). It starts a tiny local web server and opens the game in your browser.
  (You can also just open the GitHub Pages link instead — multiplayer works there too.)

Pick a faction and the number of AI opponents (1–3, each a different random
faction). Every match is a free-for-all: destroy the enemy cores (Headquarters /
Hive / Ark / Ossuary / Haven) — the last core standing wins. When a core falls,
that faction's entire army falls with it.

## The map

A large point-symmetric battlefield with neutral objectives worth fighting over:

- **Crystal nodes** — the mineable resource (Vanguard workers, the Exodus Ark
  and Pilgrims all feed on them).
- **Obelisks** — capture points. Hold the ground around one (with no enemies
  present) for 8 seconds to claim it; each obelisk pays its owner **+1.5
  resources/s**, whatever your faction's economy. They can be recaptured.
- **Wild camps** — packs of neutral Ravagers guarding **Ancient Hoards**.
  Destroy a hoard and whoever lands the kill pockets a **+350 bounty**. The
  biggest camp sits dead center, wrapped around the center obelisk.

## Multiplayer (2–4 players, peer-to-peer, no server to run)

Play free-for-all with up to 4 people (plus AI bots to fill seats) over direct
WebRTC connections. **It works across different networks with no port forwarding,
VPN, or setup** — WebRTC handles NAT traversal, and matchmaking goes through the
free public PeerJS broker. Both players just run `start.bat` / `start.sh` (or open
the GitHub Pages link):

1. One player clicks **HOST GAME** and shares the generated **5-letter room code**
   with a friend (Discord, WhatsApp, anything).
2. The friend clicks **JOIN GAME**, types the code, and presses **JOIN**.
3. For a 3rd or 4th player, repeat — they each JOIN with the same code.
4. **AI opponents** sets how many bots fill the remaining seats (host only).
5. Everyone clicks a faction card (all different); the host presses **START MATCH**.

The host's browser is authoritative: it runs the simulation and streams compact
snapshots to every guest (~10×/s); guests send their commands back, and the host
also runs the lobby/room logic in-browser. If the host disconnects the match ends;
if a guest leaves, the others play on. After a match everyone lands back in the
lobby for a rematch.

The only outside contact is the PeerJS broker (for matchmaking) and a public STUN
lookup so each browser learns its own internet address; all game traffic flows
directly between browsers. The one limitation: if both players sit behind very
strict NATs a direct link can fail — have one switch networks (a phone hotspot
usually works).

## The five factions

### IRON VANGUARD — the Architects (classic macro)
- Workers harvest crystal from nodes and return it to the Headquarters.
- Select a Worker to **build**: Barracks (Marines, Snipers, Medics), Factory
  (Siege Tanks), Airfield (Gunships), Turrets.
- **Medics** project a healing aura; **Gunships** are fast, fragile damage-dealers.
- The familiar RTS loop: economy → production → army → push.
- Core: the **Headquarters** (also your only drop-off point — guard it).

### MYRIAD SWARM — the Flood (territory economy, free units)
- **No workers, no mining.** Every tile of creep feeds you biomass per second —
  your map presence *is* your income.
- Growths must be planted **on your own creep**: Creep Tumors spread territory,
  Spawn Pits, Spitter Mounds and **Hunter Dens breed units for free, forever**;
  **Acid Spines** spit at anything that steps on your turf.
- You don't micromanage soldiers — you steer a tide. With the Hive selected,
  right-click anywhere to set the **swarm rally**; everything born flows there.
- The swarm **heals on creep**. Off creep it's just meat.
- Core: the **Hive** (also spawns free Drones and can birth Broodmothers).

### SOLARI EXODUS — the Pilgrims (no base, ever)
- **You cannot build anything.** One sacred **Ark** is your fortress, factory and
  treasury — and your core. It walks. It shoots. If it dies, you lose.
- Energy trickles in slowly; **Deploy** the Ark on a crystal node to siphon fast
  (deployed = anchored = vulnerable: the classic Exodus dilemma).
- **Pilgrims** scale the economy: cheap shielded mystics who **attune** to a
  crystal node (right-click it) and siphon remotely — your portable workers.
  Spread them across the map; each one anchored is income, and a target.
- A handful of priceless, shielded elites: **Seekers** blink into melee,
  **Lancers** snipe with beams, **Guardians** project a regenerating aegis aura,
  **Phoenixes** dart and harass, **Templars** rain splash damage.
- Shields recharge out of combat — hit, fall back, recover, hit again.
  Lose nothing, or lose everything.

### ASHEN CHOIR — the Revenants (death economy)
- **All death feeds the Choir.** Every unit that falls anywhere on the map —
  friend or foe — pays you Essence. Stalemates starve you; carnage enriches you.
- Near the lattice your spirits are sustained; in the field they **fade** (down
  to a remnant) but **heal by dealing damage** — march, feed, or wither.
- Building is **lattice-bound**: structures must be placed near existing ones.
  Cheap **Soul Conduits** extend the lattice and trickle Essence; **Mourning
  Spires** defend it; the **Reliquary** raises heavyweight Revenants.
- Units: **Wraiths** (cheap, fast melee), **Banshees** (ranged wails),
  **Revenants** (splashing juggernauts of grief).
- Core: the **Ossuary**.

### GILDED SYNDICATE — the Magnates (banking economy)
- **Gold breeds gold:** your treasury earns **compound interest** (up to a cap).
  Every coin spent is future income sacrificed — hoard or hire, timing is all.
- Mercenaries arrive **instantly** — no production time, money on the table.
- Every enemy you kill pays a **bounty**.
- Buildings are **air-dropped onto any unclaimed ground** — anywhere not close
  to enemy structures — and take a moment to land (landing pods are fragile):
  **Watchposts** are droppable turrets, **Countinghouses** pay rent and raise
  your interest cap.
- Units: **Enforcers** (line infantry), **Arbalests** (long-range bolts),
  **Juggernauts** (siege bruisers).
- Core: the **Haven** — an armed vault. Bankrupt is dead.

## Controls

| Input | Action |
|---|---|
| Left-drag / left-click | Select units / a building |
| Right-click | Move (attack-move for combat units), attack target, harvest/attune node, set rally |
| Mouse wheel | Zoom in / out (zooms toward the cursor) |
| 1 2 3 4 5 6 7 | Command-card hotkeys (build / produce / deploy) |
| F | Select your whole army |
| Space | Jump camera to your core |
| WASD / arrows / screen edges / minimap | Pan the camera |
| Esc | Cancel placement / clear selection |

## Code layout

Everything lives in two files:
- `index.html` — page shell, menu, HUD, styling.
- `game.js` — engine: entity definitions (`DEFS`), economy (`tickEconomy`), creep
  system (`recomputeCreep`), combat & movement, per-faction AI (`aiTick`),
  input/command card, canvas renderer.

Balance levers are concentrated in `DEFS` (stats/costs) and `ECON` (income rates)
at the top of `game.js` if you want to tune.
