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
- **Obelisks** — capture points, and a pillar of the economy. Hold the ground around
  one (with no enemies in range) for ~6 s to claim it; each obelisk pays its owner
  **+3.4 resources/s** in whatever your faction's currency is (and a trickle of
  **Powder** to the Warden — see below). They can be recaptured, and there are lots of
  them.
- **Wellsprings** — **the dominant economy itself**, not a side bonus. Because every
  faction's *home* income is now hard-**capped** (see below), harnessed Wellsprings are
  how you actually scale. Scattered out in contested ground far from every base, you
  can't capture one by standing on it — you **harness** it by raising your own economy
  structure beside it (within ~215px), whereupon it floods you with **+4.2–5.5/s** of
  your primary resource. Each faction taps them its own way: **Vanguard** Supply Depot ·
  **Choir** Soul Conduit · **Syndicate** air-dropped Watchpost · **Ember** War Camp ·
  **Verdant** Bloom (which pours out bonus **Sap + Pollen + Loam** *and* grows a
  *thriving ecosystem* — a fertilising buff over nearby plants & beasts) · **Stormforge**
  Dynamo (a *Storm Font* whose payout **ramps the longer you hold it**) · **Pact** Bone
  Shrine · **Myriad** by simply blanketing the font in **creep** · **Solari Exodus** by
  parking **Collectors or the Ark** beside it. Only the turtling **Warden Covenant** — a
  walled, secretive brotherhood — *cannot* tap Wellsprings at all, by design.
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
| The Vanguard | Tech Lab |
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
send their commands back. After a match everyone returns to the lobby for a rematch.

**Finishing every match — pause & rejoin.** If a guest drops or its connection silently
freezes, the **host pauses the whole match** and holds it on a *MATCH PAUSED* screen
until that player reconnects — nobody's world advances while someone is missing. The
dropped player auto-reconnects (reclaiming their original slot and faction) and the
match resumes the instant they're back. So that a match can never get *stuck*, there's a
fallback on the fallback: a grace countdown after which the host auto-continues without
the missing player (or the host can press **CONTINUE WITHOUT THEM**), and the absent
player can still rejoin the running game later. Detection uses a guest→host heartbeat, so
even a silent channel stall (which fires no disconnect event) trips the pause. (If the
*host* leaves, the match ends — the host is the authority.)

**Security.** The host treats every guest message as untrusted input: commands are
validated against the sender's own faction, coordinates are bounds-checked and clamped,
selection sizes are capped, unknown types are rejected, a per-guest **rate limiter**
throttles command floods, and a reconnecting peer can't hijack a slot whose owner is
still live. The 5-letter room code only admits players while the lobby is open.

The only outside contact is the PeerJS broker (matchmaking) and a public STUN lookup
(so each browser learns its own address); all game traffic flows directly between
browsers. The one limitation: if both players sit behind very strict NATs a direct
link can fail — have one switch networks (a phone hotspot usually works).

## The ten factions

Each has a unique economy, a single **core** that ends the game if it dies, and its
own roster (units below are highlights, not the full list).

> 📖 **In-depth strategy guides** for every faction — economy, build orders, full unit
> rosters, tech priorities and win conditions — live in [`guides/`](guides/README.md).

> **You cannot win from a corner.** Every faction's *home* economy is deliberately
> **capped** — it plateaus at a level that keeps you alive and defending, but never
> enough to overwhelm. Real scaling comes from **holding contested map territory**:
> finite crystal nodes, captured Obelisks, and harnessed Wellsprings. Each faction is
> *driven out* in its own way — the Vanguard's starter crystal runs dry; a Myriad
> creep-blob, a Choir conduit-cluster, a Verdant home-garden and a Stormforge dynamo
> yard all hit a ceiling; the Syndicate's interest cap only grows with the ground it
> holds; the Ember and the Pact only earn by fighting. The lone exception is the
> **Warden Covenant** — a self-sufficient, walled brotherhood whose buildings *are* its
> economy, and which can't tap Wellsprings at all. So the game is a fight **over the
> map**, not a race to turtle then all-in.

### THE VANGUARD — Earth's Army · *Crystal* · core: **Headquarters**
Earth's main standing army and the widest, most flexible roster in the war — textbook
combined arms with an answer to everything. Workers mine crystal back to the HQ. Build
Barracks (Marines, the hard-hitting **Rocketeers**, Snipers, Medics), a Factory (fast
**Outriders**, Siege Tanks, flame **Hellhounds**, heavy **Goliath** walkers and
long-range **Artillery**), an Airfield (Gunships, splashing **Vulture Bombers**),
Turrets and armoured **Pillboxes**. Their one weakness is *limited resource scaling* —
crystal nodes are finite — so **Supply Depots** mint a steady trickle of crystal, double
as drop-offs and raise the unit cap, keeping the war machine fed once the nodes run dry.
Economy → production → army → push.

### MYRIAD SWARM — the Flood · *Biomass* · core: **Hive**
No workers, no mining — every tile of **creep** pays biomass. But a home creep-blob's
income soon **maxes out**, so you must spread OUTWARD and blanket **Wellsprings** in
creep (each font you cover floods you with biomass). Growths must sit on your own creep;
Spawn Pits / Spitter Mounds / Hunter Dens **breed units for free, forever**. The swarm also
**CORRUPTS**: every attack rots and weakens the foe (less damage, slower, decaying), and a
corrupted enemy that dies **bursts free Larva** from its corpse. Breed Larva at an Infestation
Pit, hire corrosive elites (**Corruptor / Defiler / Mawflyer**) from a Corruption Den, anchor
Miasma Vents, and cast the Hive's **Corruption Bloom** to infect a whole army at once. Steer the
swarm with a rally point; it heals on creep and is just meat off it. Elites: Broodmother, **Ravager**.

### SOLARI EXODUS — the Pilgrims · *Energy* · core: **The Ark**
No base, ever. The Ark is fortress, factory and treasury in one — a **heavy gunship from
the start** (a splashing main beam + a ring of point-defence guns). **Deploy** it on a
crystal node to siphon fast; **scale by ranging the map** — park **Collectors or the Ark**
beside **Wellsprings** to harness them and seize **Obelisks** (the nomads earn extra on
each). A handful of priceless, **shielded** elites — Seekers, Lancers, Guardians, Phoenixes,
Templars, the heavy **Aegis**. **Ascend the Ark** through eight tiers — more HP, shields,
guns (4 → 8), splash and reach — into a roaming **superweapon** with a map-scorching **Solar
Lance** that surpasses the Worldbreaker. Shields regenerate. Lose nothing, or lose everything.

### ASHEN CHOIR — the Revenants · *Essence* · core: **Ossuary**
All death anywhere pays you Essence — carnage enriches you, stalemates starve you. Your
home Soul Conduits only **trickle** (and that trickle soon caps), so you scale by
fighting across the map and by crawling the lattice OUT to plant a Conduit on a
**Wellspring**. Death also **RAISES THE DEAD**: a share of every unit that falls anywhere
rises again as a free **Husk** under your command (a separate cap), and you breed yet more
from a **Sepulchre** — so a bloody field rebuilds your front line. Raise a **Necropolis**
for the elite undead (the caster **Lich**, long-range **Harbinger**, heavy **Gravewight**,
flying **Nightgaunt**), anchor **Dread Spires** that drag the living to a crawl, and toll
the Ossuary's **Dirge of the Damned** to wither a whole army and mend your spirits at once.
Near the lattice your spirits are sustained; in the field they fade but heal by dealing
damage. Build only within the lattice. See the [full Choir guide](guides/choir.md).

### GILDED SYNDICATE — the Magnates · *Gold* · core: **The Haven**
Gold breeds gold: your treasury earns **compound interest** — but only up to a cap set
by the **territory you hold**. A bank in a corner stalls; every **Obelisk** you capture
and **Wellspring** you harness (park a Watchpost beside one) lifts the cap and lets the
fortune snowball (**Countinghouses** and the heavier **Bullion Vault** raise it too).
Mercenaries arrive **instantly**; every kill pays a bounty; a fallen merc refunds part of
its hire price (**severance insurance**); Watchposts air-drop across the map; and the Haven
can **air-drop a free squad of Enforcers** anywhere (Reinforcement Drop). The Haven hires
the core four — Enforcers, Arbalests, Juggernauts, **Marauders** — while a **Mercenary
Guild** hires specialists: fast **Gun Hands**, aerial **Dragoons**, mending **Sawbones**,
armoured **Ironhides** and long-range siege **Demolishers**. A heavy **Gun Bastion** anchors
a hold. See the [full Syndicate guide](guides/syndicate.md).

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

Wall in and bristle with layered defences for a truly impenetrable base. Alone among
the ten, the Warden is **self-sufficient** — a secretive, walled brotherhood that needn't
scrabble for the map's **Wellsprings** (and in fact *cannot* harness them); its standing
buildings already are its economy. Slow,
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
Plunder, so idleness is death. Every Ember attack also **IGNITES** the foe — a burning
DoT that keeps cooking them, and **that burn damage keeps paying Plunder**, so the inferno
funds itself. The War Pyre and War Camps churn out dirt-cheap, blazing-fast **Raiders** and
**Slingers**, then **Firebrands**, **War Beasts** and the splashing **Fire Wagon**; breed a
free tide of fire-imp **Emberlings** from a **Cinder Pit** and anchor **Bonfires** that ignite
what they splash. Raise an **Ember Foundry** to round out the warband: the armoured
**Cinderguard**, long-range **Cinderbows**, the siege **Cinder Catapult**, the mending
**Flame Shaman**, the fire-breathing **Cinder Drake** (the nomads' first air) and the molten
brute **Magmaur**. Call the War Pyre's **Firestorm** to ignite and burst-burn a whole army,
and tech to the **Great Pyre** for the fast, fire-hosing **Ash Titan**. See the
[full Ember guide](guides/ember.md).

### VERDANT BLOOM — the Grove · *Sap · Pollen · Loam* · core: **Heartwood**
A slow, unstoppable garden fed by **three harvests**: Sap from Blooms, Pollen from
Pollen Spires, Loam from Mulch Beds — the grandest plants and beasts demand a mix of all
three. But a **home garden caps out**, and Pollen & Loam stay choked. The way to bloom is
to *spread*: plant a Bloom on a **Wellspring** to root a thriving **new ecosystem** that
pours out bonus Sap, Pollen *and* Loam, and grows a fertilising buff over nearby plants &
beasts — so you claim fertile ground all across the map (your *diverse* answer to the
Vanguard's crystal-chasing). Free **Saplings** keep their own separate cap, so
they never crowd out your real army. Cultivate a sprawling estate: **Fertiliser Pods**
buff and heal everything nearby, **Spore Blossoms** drag the enemy to a crawl across a
huge radius, **Spore Vents** gas a kill-zone, and **Thornwalls** + the titanic **Great
Root** wall the foe into it. Spread far with a **Heartwood Sapling** (a daughter-core
with vast build range). Beside the Heartwood, weave a **Heartwood Graft** to mutate the
whole garden — **Necrotic** (feed on the enemy dead; your buildings collapse into
repairable husks instead of dying), **Moonsign** (lifts the fog and hastens everything),
or **Wildgrowth** (uncaps your Saplings and erupts them as fierce mutants). Units:
Saplings, Thornlings, Treants, and the colossal **Ancient**.

### STORMFORGE DYNASTY — the Engine · *Power* · core: **Storm Reactor**
An engine that accelerates — but no longer just by waiting. Home **Dynamos** pay a flat
rate and soon **max out**; the acceleration now lives on the map. Raise a Dynamo on a
**Wellspring** (a *Storm Font*) to harness it, and the longer you **hold** that font the
more Power it ramps out — so seize ground early and never let go. Few but devastating, **shielded** machines,
kept in the fight by **Charge Pylons** that re-energise their shields mid-battle:
Arclights, the shock-trooper **Galvan**, Voltaics, the mid-weight **Gladius**, and the
towering Colossus.

### OBSIDIAN PACT — the Martyrs · *Blood* · core: **Blood Altar**
Death is your harvest — your *own*. Every unit you lose spills Blood for the next,
greater summoning — and **BLOOD FRENZY**: each Pact unit that dies whips every nearby
Pact unit into a rage (harder, faster blows), so because you're always feeding the
grinder the horde fights in a near-permanent rolling frenzy. Throw cheap **Thralls** and
fast **Flayers** in; raise **Behemoths** from their deaths. Raise the **Flesh Vats** for
the elite horrors — the horde-mending **Blood Priest** (your only healer), the heavy
**Abomination** and the winged **Gargoyle** (the Pact's air) — anchor **Hemorrhage
Spires**, and work the Altar's **Crimson Rite** to rupture a field of foes and enrage the
swarm. Bone Shrines on **Wellsprings** bleed extra Blood. See the
[full Pact guide](guides/pact.md).

## Controls

| Input | Action |
|---|---|
| Left-drag / left-click | Select units / a building |
| Right-click | Move, attack target, harvest/siphon node, set rally |
| Shift+right-click | Attack-move to a point (engage foes on the way) |
| Ctrl+right-click | Attack that way — auto-targets the nearest foe in the clicked direction |
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
