# TRIFOLD — an asymmetric RTS

One war, five completely different ways to wage it. A self-contained browser RTS
(plain HTML5 canvas + vanilla JS, no dependencies) where each faction plays by its
own rules — different economy, different production, different verbs.

## How to run

- **Easiest:** double-click `index.html` — it runs straight from disk, no server needed.
- Or serve it locally (handy for dev):
  - Windows: `powershell -ExecutionPolicy Bypass -File serve.ps1`
  - Linux/macOS: `python3 -m http.server 8123`
  then open <http://localhost:8123/>.

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

## Multiplayer (2–4 players, peer-to-peer, no server)

Play free-for-all with up to 4 people (plus AI bots to fill seats) over direct
WebRTC connections — no game server, no account, no matchmaking. Signaling is
done by hand:

1. Everyone opens the game (the GitHub Pages link or their own copy of this folder).
2. The host clicks **HOST GAME** and sends the generated **invite code** to a friend
   (Discord, WhatsApp, email — anything).
3. That friend clicks **JOIN GAME**, pastes the invite code, presses **CONNECT**, and
   sends the generated **reply code** back.
4. The host pastes the reply code and presses **CONNECT**. You're linked.
5. For a 3rd or 4th player the host presses **INVITE PLAYER** in the lobby and
   repeats the code exchange with the next friend.
6. **BOTS** cycles the number of AI players filling the remaining seats.
7. Everyone clicks a faction card (all different); the host presses **START MATCH**.

The host's browser runs the simulation and streams compact snapshots to every
guest (~1 KB, 10×/s); guests send commands back. If a guest disconnects mid-match,
an AI takes over their faction; if the host disconnects, the match ends. After a
match everyone lands back in the lobby for a rematch.

There are no third-party services involved: no relay, no account, no signaling
server. The only outside contact is a public STUN lookup so each browser learns
its own internet address; all game traffic flows directly between browsers. The
one limitation of going relay-free: if both homes sit behind very strict NATs a
direct link is impossible — have one player switch networks (a phone hotspot
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
