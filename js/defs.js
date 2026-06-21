'use strict';
/* ============================================================
   TRIFOLD — an asymmetric 5-faction RTS
   vanguard  : classic base-building macro faction
   myriad    : creep/territory economy, free auto-spawning swarm
   exodus    : no buildings, one mobile Ark + shielded elites
   choir     : death economy — every kill anywhere pays Essence,
               units decay but lifesteal, lattice-bound building
   syndicate : banking economy — treasury earns compound interest,
               kills pay bounties, mercs arrive instantly,
               buildings air-drop anywhere on the map
   ============================================================ */

// ---------------- constants ----------------
const TILE = 32;
// map size grows with the player count; set per match in buildMatch
let GW = 160, GH = 104, WORLD_W = GW * TILE, WORLD_H = GH * TILE;
function setMapSize(players) {
  GW = 140 + 30 * players;   // 2p:200  3p:230  4p:260 tiles wide
  GH = 92 + 20 * players;    // 2p:132  3p:152  4p:172 tiles tall
  WORLD_W = GW * TILE; WORLD_H = GH * TILE;
}
// small deterministic PRNG (mulberry32) so every peer builds the same random map
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const HUD_BOTTOM = 158; // height of #bottombar that overlaps the canvas bottom
const ZMIN = 0.28, ZMAX = 1.8;  // camera zoom range (out / in)

const FACTIONS = {
  vanguard:  { name: 'IRON VANGUARD',   color: '#4da6ff', dark: '#173153', res: 'Crystal', cap: 54 },
  myriad:    { name: 'MYRIAD SWARM',    color: '#c75cff', dark: '#3a1d52', res: 'Biomass', cap: 90 },
  exodus:    { name: 'SOLARI EXODUS',   color: '#ffc94d', dark: '#4a3a14', res: 'Energy',  cap: 28 },
  choir:     { name: 'ASHEN CHOIR',     color: '#3fe0c8', dark: '#0e3f3a', res: 'Essence', cap: 45 },
  syndicate: { name: 'GILDED SYNDICATE', color: '#ff6b52', dark: '#4a1a12', res: 'Gold',   cap: 40 },
  warden:    { name: 'WARDEN COVENANT',  color: '#c3ccd6', dark: '#232c38', res: 'Stone',  cap: 60, res2: 'Iron', res3: 'Powder' },
  ember:     { name: 'EMBER NOMADS',     color: '#ff8a2a', dark: '#4a2a0e', res: 'Plunder',cap: 66 },
  verdant:   { name: 'VERDANT BLOOM',    color: '#6fcf5c', dark: '#16401a', res: 'Sap',    cap: 84, res2: 'Pollen', res3: 'Loam' },
  stormforge:{ name: 'STORMFORGE DYNASTY', color:'#ff5ea8', dark: '#4a1338', res: 'Power',  cap: 36 },
  pact:      { name: 'OBSIDIAN PACT',    color: '#c0303a', dark: '#3a0e12', res: 'Blood',  cap: 72 },
};

// neutral entities (Obelisks, Hoards) aren't a playable faction; fall back to grey
const NEUTRAL = { color: '#9aa6b8', dark: '#2a3340' };
const facColor = f => (FACTIONS[f] || NEUTRAL).color;
const facDark  = f => (FACTIONS[f] || NEUTRAL).dark;

const HINTS = {
  vanguard: 'Workers harvest crystal automatically. Select a Worker to BUILD (Barracks → Marines/Snipers/Medics, Factory → Tanks, Airfield → Gunships, Turrets to defend). Destroy the enemy core; protect your Headquarters.',
  myriad: 'Your creep IS your economy — every covered tile feeds you biomass. Select the Hive to GROW: Tumors spread creep, Spawn Pits / Spitter Mounds / Hunter Dens breed units FREE, forever; Acid Spines defend. With the Hive selected, right-click to set the swarm rally. The swarm heals on creep.',
  exodus: 'You have no base and never will. Build Collectors from the Ark to mine crystal nodes and haul it back — that is how you scale. Move the Ark onto a node and DEPLOY to siphon energy fast too. Every warrior is priceless — shields regenerate, so strike and fall back. If the Ark dies, all is lost.',
  choir: 'ALL death feeds the Choir — every unit that falls, yours or theirs, pays you Essence. Near your lattice, spirits are sustained; in the field they fade — but heal by dealing damage. Build only within the lattice (near your structures); Soul Conduits extend it and trickle Essence. Guard the Ossuary.',
  syndicate: 'Gold breeds gold: your treasury earns compound interest (up to a cap — Countinghouses raise it and pay rent). Mercenaries arrive INSTANTLY for a price, and every kill pays a bounty. Watchposts can be air-dropped across the map — but not into enemy territory. Hoard or hire — and guard the Haven.',
  warden: 'TWO resources: Stone from your buildings’ total mass (Quarries add a trickle), Iron only from Forges. Your tech tree is DISTRIBUTED — raise advanced structures FROM advanced ones: the War College builds the Bunker/Ballista/Hall, the War Foundry the Redoubt/Arsenal, the Arsenal the Bulwark and the doomsday WORLDBREAKER siege gun (map-spanning Gustav Strike). Slow, armoured, unstoppable. Hold the Keep.',
  ember: 'No mines, no farms — you fund the war by WAGING it. Every point of damage your warband deals to the enemy is paid back as Plunder. Fast, cheap, fragile raiders: keep attacking or starve. Guard the War Pyre.',
  verdant: 'THREE harvests feed the garden: Sap from Blooms, Pollen from Pollen Spires, Loam from Mulch Beds — your grandest plants and beasts demand a MIX of all three. The Heartwood musters the whole army (heavier beasts — Bramblehorn, Spore Caller — need an Arboretum) and raises the three Grafts. Groves breed free Saplings and grow your advanced defences; the Arboretum raises the apex Heart Grove and the colossal, INDESTRUCTIBLE Erdtree, which builds impassable Erdtree Walls to funnel the foe. Patient early, unstoppable late. Protect the Heartwood.',
  stormforge: 'An engine that only accelerates. Power RAMPS the longer your Dynamos stand — each one pays more every minute, so time and held ground compound into a fortune. Few machines, but shielded and devastating: Charge Pylons re-energise their shields mid-fight, so a defended push never stops. Survive the early game and bury them. Defend the Reactor.',
  pact: 'Death is your harvest — but only your own. Every one of your units that falls spills Blood to fund the next, greater summoning. Throw cheap Thralls into the grinder and raise Behemoths from their deaths. Reckless by design. Keep the Altar.',
};

// verb shown on a faction's build buttons ('Build X' by default)
const BUILD_VERB = {
  myriad: 'Grow ', syndicate: 'Drop ', warden: 'Erect ', ember: 'Raise ',
  verdant: 'Plant ', stormforge: 'Assemble ', pact: 'Summon ',
};

// ---------------- unit / building definitions ----------------
// kind: 'unit' | 'building'
// shot: 'melee' | 'bullet' | 'beam' | 'glob' | 'shell'
const DEFS = {
  // ----- IRON VANGUARD -----
  hq:       { fac:'vanguard', kind:'building', name:'Headquarters', hp:1600, size:42, core:true, produces:['worker'], dropoff:true },
  worker:   { fac:'vanguard', kind:'unit', name:'Worker', hp:45, size:8, speed:75, cost:50, time:6, dmg:3, range:12, cd:1, aggro:0, shot:'melee', harvester:true, builder:true },
  barracks: { fac:'vanguard', kind:'building', name:'Barracks', hp:650, size:28, cost:150, time:18, produces:['marine','sniper','medic'] },
  factory:  { fac:'vanguard', kind:'building', name:'Factory', hp:850, size:32, cost:250, time:24, produces:['tank','flametank','goliath'] },
  airfield: { fac:'vanguard', kind:'building', name:'Airfield', hp:700, size:28, cost:300, time:22, produces:['gunship'] },
  turret:   { fac:'vanguard', kind:'building', name:'Turret', hp:420, size:14, cost:100, time:12, dmg:9, range:195, cd:0.65, aggro:215, shot:'bullet' },
  techlab:  { fac:'vanguard', kind:'building', name:'Tech Lab', hp:600, size:24, cost:150, time:14, researchLab:true },
  marine:   { fac:'vanguard', kind:'unit', name:'Marine', hp:75, size:8, speed:82, cost:60, time:5, dmg:8, range:95, cd:0.8, aggro:170, shot:'bullet' },
  sniper:   { fac:'vanguard', kind:'unit', name:'Sniper', hp:50, size:8, speed:65, cost:110, time:8, dmg:30, range:215, cd:2.2, aggro:235, shot:'beam' },
  medic:    { fac:'vanguard', kind:'unit', name:'Medic', hp:60, size:8, speed:80, cost:75, time:6, aggro:0, aura:110, heal:6 },
  tank:     { fac:'vanguard', kind:'unit', name:'Siege Tank', hp:280, size:14, speed:52, cost:200, time:12, dmg:34, range:165, cd:2.4, aggro:195, shot:'shell', splash:42 },
  gunship:  { fac:'vanguard', kind:'unit', name:'Gunship', hp:140, size:10, speed:120, cost:180, time:11, dmg:7, range:120, cd:0.35, aggro:200, shot:'bullet' },
  flametank:{ fac:'vanguard', kind:'unit', name:'Hellhound', hp:210, size:13, speed:74, cost:170, time:11, dmg:14, range:82, cd:0.5, aggro:150, shot:'glob', splash:34 },
  goliath:  { fac:'vanguard', kind:'unit', name:'Goliath', hp:380, size:15, speed:48, cost:270, time:15, dmg:26, range:185, cd:1.4, aggro:200, shot:'bullet' },

  // ----- MYRIAD SWARM -----
  hive:        { fac:'myriad', kind:'building', name:'Hive', hp:2100, size:44, core:true, creepR:11, produces:['broodmother','ravager'], grows:['tumor','spawnpit','spittermound','hunterden','spine','evochamber','broodnexus'], spawns:'drone', spawnEvery:7 },
  tumor:       { fac:'myriad', kind:'building', name:'Creep Tumor', hp:130, size:10, cost:50,  time:8,  creepR:6.5 },
  spawnpit:    { fac:'myriad', kind:'building', name:'Spawn Pit', hp:350, size:21, cost:150, time:14, spawns:'drone',   spawnEvery:5 },
  spittermound:{ fac:'myriad', kind:'building', name:'Spitter Mound', hp:380, size:21, cost:200, time:16, spawns:'spitter', spawnEvery:8.5 },
  hunterden:   { fac:'myriad', kind:'building', name:'Hunter Den', hp:400, size:21, cost:250, time:18, spawns:'hunter', spawnEvery:11 },
  spine:       { fac:'myriad', kind:'building', name:'Acid Spine', hp:360, size:13, cost:120, time:10, dmg:11, range:170, cd:0.9, aggro:190, shot:'glob' },
  drone:       { fac:'myriad', kind:'unit', name:'Drone', hp:48, size:7, speed:98, dmg:6, range:14, cd:0.7, aggro:175, shot:'melee' },
  spitter:     { fac:'myriad', kind:'unit', name:'Spitter', hp:60, size:8, speed:78, dmg:9, range:115, cd:1.1, aggro:180, shot:'glob' },
  hunter:      { fac:'myriad', kind:'unit', name:'Hunter', hp:110, size:9, speed:115, dmg:13, range:16, cd:0.8, aggro:195, shot:'melee' },
  broodmother: { fac:'myriad', kind:'unit', name:'Broodmother', hp:420, size:16, speed:55, cost:300, time:20, dmg:22, range:26, cd:1.4, aggro:185, shot:'melee', splash:38 },
  evochamber:  { fac:'myriad', kind:'building', name:'Evolution Chamber', hp:480, size:22, cost:150, time:14, researchLab:true },
  ravager:     { fac:'myriad', kind:'unit', name:'Ravager', hp:170, size:11, speed:84, cost:200, time:13, dmg:20, range:150, cd:1.2, aggro:195, shot:'glob', splash:24 },

  // ----- SOLARI EXODUS -----
  ark:      { fac:'exodus', kind:'unit', name:'The Ark', hp:2300, shield:900, size:38, speed:34, core:true, stationary:true, dmg:12, range:175, cd:1.0, aggro:195, shot:'beam', dropoff:true, researchLab:true, produces:['collector','seeker','lancer','guardian','phoenix','templar','aegis','sovereign'] },
  collector:{ fac:'exodus', kind:'unit', name:'Collector', hp:70, shield:30, size:8, speed:84, cost:60, time:6, aggro:0, harvester:true },
  seeker:   { fac:'exodus', kind:'unit', name:'Seeker', hp:65, shield:45, size:8, speed:112, cost:120, time:9, dmg:10, range:55, cd:0.6, aggro:205, shot:'melee', blink:true },
  lancer:   { fac:'exodus', kind:'unit', name:'Lancer', hp:70, shield:55, size:9, speed:60, cost:220, time:14, dmg:30, range:235, cd:2.1, aggro:250, shot:'beam' },
  guardian: { fac:'exodus', kind:'unit', name:'Guardian', hp:120, shield:90, size:11, speed:72, cost:180, time:12, aggro:0, aura:150 },
  phoenix:  { fac:'exodus', kind:'unit', name:'Phoenix', hp:70, shield:50, size:9, speed:125, cost:150, time:10, dmg:8, range:110, cd:0.5, aggro:210, shot:'bullet' },
  templar:  { fac:'exodus', kind:'unit', name:'Templar', hp:80, shield:70, size:10, speed:65, cost:260, time:15, dmg:24, range:140, cd:2.4, aggro:200, shot:'shell', splash:55 },
  aegis:    { fac:'exodus', kind:'unit', name:'Aegis', hp:240, shield:180, size:14, speed:50, cost:300, time:16, dmg:26, range:60, cd:0.9, aggro:190, shot:'melee', splash:30 },

  // ----- ASHEN CHOIR -----
  ossuary:   { fac:'choir', kind:'building', name:'Ossuary', hp:1900, size:42, core:true, produces:['wraith','banshee'], grows:['conduit','reliquary','spire','oracle','charnel'] },
  conduit:   { fac:'choir', kind:'building', name:'Soul Conduit', hp:160, size:11, cost:60, time:7 },
  reliquary: { fac:'choir', kind:'building', name:'Reliquary', hp:600, size:26, cost:180, time:16, produces:['revenant'] },
  spire:     { fac:'choir', kind:'building', name:'Mourning Spire', hp:450, size:14, cost:130, time:12, dmg:12, range:185, cd:1.0, aggro:205, shot:'beam' },
  wraith:    { fac:'choir', kind:'unit', name:'Wraith', hp:95, size:8, speed:105, cost:50, time:4, dmg:9, range:16, cd:0.55, aggro:185, shot:'melee' },
  banshee:   { fac:'choir', kind:'unit', name:'Banshee', hp:75, size:8, speed:70, cost:130, time:9, dmg:15, range:150, cd:1.3, aggro:195, shot:'beam' },
  revenant:  { fac:'choir', kind:'unit', name:'Revenant', hp:380, size:14, speed:58, cost:300, time:18, dmg:30, range:30, cd:1.6, aggro:190, shot:'melee', splash:40 },
  oracle:    { fac:'choir', kind:'building', name:'Bone Oracle', hp:480, size:22, cost:150, time:13, researchLab:true },
  lich:      { fac:'choir', kind:'unit', name:'Lich', hp:120, size:10, speed:64, cost:180, time:12, dmg:24, range:175, cd:1.6, aggro:210, shot:'beam' },

  // ----- GILDED SYNDICATE -----
  haven:         { fac:'syndicate', kind:'building', name:'The Haven', hp:1700, size:40, core:true, dmg:10, range:185, cd:0.8, aggro:205, shot:'bullet', produces:['enforcer','arbalest','juggernaut','marauder'], grows:['watchpost','countinghouse','blackmarket','exchange'] },
  watchpost:     { fac:'syndicate', kind:'building', name:'Watchpost', hp:380, size:13, cost:140, time:6, dmg:8, range:175, cd:0.7, aggro:195, shot:'bullet', forward:true },
  countinghouse: { fac:'syndicate', kind:'building', name:'Countinghouse', hp:500, size:24, cost:200, time:8 },
  enforcer:      { fac:'syndicate', kind:'unit', name:'Enforcer', hp:90, size:8, speed:80, cost:90, time:0.5, dmg:9, range:105, cd:0.75, aggro:180, shot:'bullet' },
  arbalest:      { fac:'syndicate', kind:'unit', name:'Arbalest', hp:60, size:8, speed:62, cost:160, time:0.5, dmg:26, range:225, cd:2.0, aggro:240, shot:'beam' },
  juggernaut:    { fac:'syndicate', kind:'unit', name:'Juggernaut', hp:320, size:14, speed:55, cost:320, time:0.5, dmg:30, range:150, cd:2.2, aggro:190, shot:'shell', splash:40 },
  blackmarket:   { fac:'syndicate', kind:'building', name:'Black Market', hp:520, size:24, cost:150, time:6, researchLab:true },
  marauder:      { fac:'syndicate', kind:'unit', name:'Marauder', hp:180, size:11, speed:74, cost:150, time:0.5, dmg:14, range:120, cd:0.9, aggro:185, shot:'glob', splash:20 },

  // ----- WARDEN COVENANT (fortress: Stone from building mass + Iron from Forges) -----
  // The deepest tech tree in the game. Tier 1 runs on Stone alone; the higher tiers
  // also burn Iron, which only Iron Forges produce. Crucially the Covenant tech is
  // DISTRIBUTED: advanced structures are raised from other advanced structures, not
  // all from the Keep — select a War College to place its halls, a War Foundry to
  // place siege works, a Grand Arsenal to raise the doomsday engines. The chain ends
  // at the Bulwark and, beyond even that, the world-ending Worldbreaker siege gun.
  keep:      { fac:'warden', kind:'building', name:'Bastion Keep', hp:2400, size:42, core:true, dmg:11, range:190, cd:0.9, aggro:210, shot:'bullet', produces:['sentinel','warden_g','pikeman'], grows:['rampart','bastion','quarry','forge','powdermill','cauldron','foundry_w','college'] },
  // -- Tier 1: Stone only --
  rampart:   { fac:'warden', kind:'building', name:'Rampart', hp:1100, size:15, cost:70, time:6 },
  bastion:   { fac:'warden', kind:'building', name:'Bastion', hp:640, size:15, cost:150, time:10, dmg:12, range:200, cd:0.7, aggro:210, shot:'bullet' },
  quarry:    { fac:'warden', kind:'building', name:'Stone Quarry', hp:680, size:18, cost:120, time:10, stonePerSec:1.6 },
  cauldron:  { fac:'warden', kind:'building', name:'Oil Cauldron', hp:560, size:14, cost:110, time:9, dmg:22, range:120, cd:1.1, aggro:140, shot:'glob', splash:40 },
  forge:     { fac:'warden', kind:'building', name:'Iron Forge', hp:760, size:18, cost:130, time:11, ironPerSec:1.0 },
  // mints Powder — the Covenant's THIRD resource, burned only by its grand projects.
  // A trickle here; the fast Powder is out on the map (held Obelisks + cracked Bunkers).
  powdermill:{ fac:'warden', kind:'building', name:'Powder Mill', hp:620, size:18, cost:170, cost2:20, time:13, powderPerSec:0.4 },
  sentinel:  { fac:'warden', kind:'unit', name:'Sentinel', hp:170, size:10, speed:54, cost:80, time:7, dmg:11, range:24, cd:0.9, aggro:170, shot:'melee' },
  warden_g:  { fac:'warden', kind:'unit', name:'Warden Guard', hp:120, size:9, speed:50, cost:120, time:9, dmg:16, range:165, cd:1.2, aggro:200, shot:'bullet' },
  pikeman:   { fac:'warden', kind:'unit', name:'Pikeman', hp:210, size:11, speed:52, cost:110, cost2:10, time:9, dmg:24, range:34, cd:1.3, aggro:175, shot:'melee' },
  // -- Tier 2: Stone + Iron (needs the Forge economy) --
  foundry_w: { fac:'warden', kind:'building', name:'War Foundry', hp:900, size:30, cost:230, cost2:30, time:18, produces:['bombard','ironclad'], grows:['redoubt','arsenal'] },
  college:   { fac:'warden', kind:'building', name:'War College', hp:700, size:24, cost:150, time:14, researchLab:true, grows:['bunker','ballista','hall'] },
  bunker:    { fac:'warden', kind:'building', name:'Bunker', hp:1400, size:18, cost:170, time:12, dmg:10, range:185, cd:0.5, aggro:205, shot:'bullet' },
  ballista:  { fac:'warden', kind:'building', name:'Ballista Tower', hp:680, size:16, cost:180, cost2:20, time:14, dmg:54, range:305, cd:2.8, aggro:330, shot:'beam' },
  hall:      { fac:'warden', kind:'building', name:'Hall of Oaths', hp:820, size:26, cost:200, cost2:25, time:16, produces:['halberd','marshal'] },
  redoubt:   { fac:'warden', kind:'building', name:'Redoubt', hp:820, size:18, cost:220, cost2:20, time:16, dmg:30, range:235, cd:2.2, aggro:235, shot:'shell', splash:42 },
  bombard:   { fac:'warden', kind:'unit', name:'Bombard', hp:240, size:14, speed:42, cost:240, cost2:25, time:15, dmg:34, range:200, cd:2.6, aggro:200, shot:'shell', splash:46 },
  ironclad:  { fac:'warden', kind:'unit', name:'Ironclad', hp:560, size:15, speed:46, cost:200, cost2:50, time:18, dmg:30, range:26, cd:1.3, aggro:185, shot:'melee', splash:30 },
  halberd:   { fac:'warden', kind:'unit', name:'Halberdier', hp:330, size:12, speed:50, cost:140, cost2:25, time:12, dmg:42, range:32, cd:1.5, aggro:180, shot:'melee', splash:18 },
  marshal:   { fac:'warden', kind:'unit', name:'Marshal', hp:380, size:12, speed:52, cost:170, cost2:30, time:14, dmg:14, range:150, cd:1.1, aggro:190, shot:'bullet', aura:165, heal:6 },
  // -- Tier 3: heavy Iron investment --
  arsenal:   { fac:'warden', kind:'building', name:'Grand Arsenal', hp:1100, size:30, cost:320, cost2:90, cost3:60, time:24, produces:['castellan','trebuchet'], grows:['citadel','worldbreaker'] },
  castellan: { fac:'warden', kind:'unit', name:'Castellan', hp:940, size:20, speed:38, cost:380, cost2:130, cost3:35, time:26, dmg:46, range:215, cd:2.4, aggro:210, shot:'shell', splash:62 },
  trebuchet: { fac:'warden', kind:'unit', name:'Trebuchet', hp:220, size:15, speed:30, cost:280, cost2:70, cost3:30, time:20, dmg:72, range:325, cd:4.2, aggro:355, shot:'shell', splash:74 },
  citadel:   { fac:'warden', kind:'building', name:'The Bulwark', hp:7200, size:56, cost:2400, cost2:450, cost3:320, time:80,
               dmg:175, range:445, cd:4.6, aggro:475, shot:'shell', splash:96,
               aux:{ dmg:13, range:215, cd:0.4, shot:'bullet', guns:4 } },
  // -- Tier 4: the doomsday siege gun — a colossal long-range artillery emplacement
  // with an active, map-spanning bombardment strike (see `ability`). The single most
  // expensive, most heavily gated thing the Covenant — or anyone — can build.
  worldbreaker: { fac:'warden', kind:'building', name:'The Worldbreaker', hp:9000, size:150, cost:17000, cost2:4250, cost3:900, time:100,
               dmg:230, range:560, cd:5.4, aggro:590, shot:'shell', splash:120,
               aux:{ dmg:15, range:230, cd:0.35, shot:'bullet', guns:6 },
               ability:{ key:'gustav', name:'Gustav Strike', range:3800, cd:55, delay:2.4, dmg:820, splash:165,
                         desc:'Nuke any point in huge range; a telegraphed shell levels a wide blast after a short delay.' } },

  // ----- EMBER NOMADS (war economy: Plunder from damage dealt to enemies) -----
  pyre:      { fac:'ember', kind:'building', name:'War Pyre', hp:1500, size:38, core:true, dmg:9, range:170, cd:0.7, aggro:200, shot:'bullet', produces:['raider','slinger','firebrand','warbeast','firewagon'], grows:['warcamp','totem','warlodge','greatpyre'] },
  warcamp:   { fac:'ember', kind:'building', name:'War Camp', hp:520, size:24, cost:120, time:9, produces:['raider','slinger'] },
  totem:     { fac:'ember', kind:'building', name:'Blaze Totem', hp:340, size:13, cost:110, time:7, dmg:12, range:165, cd:0.8, aggro:190, shot:'glob' },
  raider:    { fac:'ember', kind:'unit', name:'Raider', hp:70, size:8, speed:128, cost:45, time:4, dmg:9, range:16, cd:0.6, aggro:185, shot:'melee' },
  slinger:   { fac:'ember', kind:'unit', name:'Slinger', hp:52, size:8, speed:100, cost:80, time:5, dmg:11, range:135, cd:0.9, aggro:195, shot:'glob' },
  firebrand: { fac:'ember', kind:'unit', name:'Firebrand', hp:95, size:9, speed:92, cost:150, time:8, dmg:18, range:120, cd:1.3, aggro:200, shot:'shell', splash:34 },
  warbeast:  { fac:'ember', kind:'unit', name:'War Beast', hp:300, size:15, speed:96, cost:280, time:13, dmg:24, range:20, cd:0.9, aggro:185, shot:'melee', splash:26 },
  warlodge:  { fac:'ember', kind:'building', name:'War Lodge', hp:520, size:22, cost:140, time:12, researchLab:true },
  firewagon: { fac:'ember', kind:'unit', name:'Fire Wagon', hp:160, size:13, speed:110, cost:160, time:9, dmg:16, range:90, cd:0.7, aggro:175, shot:'glob', splash:36 },

  // ----- VERDANT BLOOM (a 3-harvest garden: Sap from Blooms, Pollen from Pollen
  //   Spires, Loam from Mulch Beds; the grandest plants & beasts demand a MIX) -----
  // The Heartwood musters the whole army and raises the early garden + the three
  // Grafts; advanced defences grow from the Grove, the Erdtree/apex from the
  // Arboretum — so no single build menu overflows (see ui.js command-card cap).
  heart:     { fac:'verdant', kind:'building', name:'Heartwood', hp:2100, size:44, core:true, produces:['thornling','treant','ancient','bramblehorn','sporecaller'], grows:['bloom','petalspire','mulchbed','grove','bramble','thornwall','arboretum','graft_necro','graft_moon','graft_wild'], spawns:'sapling', spawnEvery:8 },
  bloom:     { fac:'verdant', kind:'building', name:'Bloom', hp:300, size:18, cost:90, time:14 },
  petalspire:{ fac:'verdant', kind:'building', name:'Pollen Spire', hp:300, size:16, cost:110, time:12, ironPerSec:0.9 },
  mulchbed:  { fac:'verdant', kind:'building', name:'Mulch Bed', hp:360, size:19, cost:120, time:12, powderPerSec:0.7 },
  grove:     { fac:'verdant', kind:'building', name:'Grove', hp:430, size:22, cost:170, time:16, spawns:'sapling', spawnEvery:6, grows:['sporevent','sporebloss','fertpod','greatroot','heartsap'] },
  bramble:   { fac:'verdant', kind:'building', name:'Bramble', hp:360, size:13, cost:120, time:9, dmg:11, range:172, cd:0.9, aggro:190, shot:'glob' },
  sporevent: { fac:'verdant', kind:'building', name:'Spore Vent', hp:380, size:15, cost:140, cost3:25, time:13, dmg:14, range:150, cd:1.4, aggro:175, shot:'glob', splash:42 },
  fertpod:   { fac:'verdant', kind:'building', name:'Fertiliser Pod', hp:320, size:15, cost:140, cost3:20, time:11, aura:165, buffAura:true, heal:3 },
  sporebloss:{ fac:'verdant', kind:'building', name:'Spore Blossom', hp:380, size:17, cost:170, cost2:30, time:13, slowAura:360 },
  thornwall: { fac:'verdant', kind:'building', name:'Thornwall', hp:1050, size:14, cost:35, cost3:22, time:7, dmg:7, range:52, cd:1.2, aggro:60, shot:'glob' },
  greatroot: { fac:'verdant', kind:'building', name:'Great Root', hp:2800, size:30, cost:120, cost3:60, time:16, dmg:9, range:62, cd:1.3, aggro:66, shot:'glob' },
  // The Erdtree: one colossal, INDESTRUCTIBLE world-tree — a single, enormously
  // expensive living wall that can never be destroyed (invuln) and shells anything
  // that comes near. The ultimate anchor of the garden. Needs an Arboretum.
  erdtree:   { fac:'verdant', kind:'building', name:'Erdtree', hp:30000, size:110, cost:2200, cost2:320, cost3:280, time:75, invuln:true, dmg:34, range:255, cd:1.0, aggro:285, shot:'glob', splash:64, grows:['erdwall'] },
  // Erdtree Wall: a chunky, INDESTRUCTIBLE root-segment the Erdtree raises. Cheap so
  // you can chain a whole rampart; impassable once grown (units must path around it).
  erdwall:   { fac:'verdant', kind:'building', name:'Erdtree Wall', hp:8000, size:18, cost:55, cost3:18, time:5, invuln:true, connectR:300 },
  heartsap:  { fac:'verdant', kind:'building', name:'Heartwood Sapling', hp:1000, size:26, cost:200, cost2:20, time:16, connectR:460, spawns:'sapling', spawnEvery:9 },
  // Heartwood Grafts — raised beside the Heartwood, each weaves a faction-wide mutation
  graft_necro:{ fac:'verdant', kind:'building', name:'Necrotic Graft', hp:760, size:20, cost:240, cost2:40, cost3:40, time:18, graft:'necro' },
  graft_moon: { fac:'verdant', kind:'building', name:'Moonsign Graft', hp:760, size:20, cost:240, cost2:60, cost3:20, time:18, graft:'moon' },
  graft_wild: { fac:'verdant', kind:'building', name:'Wildgrowth Graft', hp:760, size:20, cost:240, cost2:20, cost3:60, time:18, graft:'wild' },
  sapling:   { fac:'verdant', kind:'unit', name:'Sapling', hp:55, size:7, speed:80, dmg:6, range:14, cd:0.7, aggro:170, shot:'melee', freeUnit:true },
  thornling: { fac:'verdant', kind:'unit', name:'Thornling', hp:70, size:8, speed:74, cost:90, time:6, dmg:12, range:130, cd:1.1, aggro:185, shot:'glob' },
  treant:    { fac:'verdant', kind:'unit', name:'Treant', hp:460, size:17, speed:46, cost:270, cost2:25, time:18, dmg:28, range:26, cd:1.5, aggro:185, shot:'melee', splash:38 },
  arboretum: { fac:'verdant', kind:'building', name:'Arboretum', hp:480, size:22, cost:150, time:14, researchLab:true, grows:['erdtree','heartgrove'] },
  ancient:   { fac:'verdant', kind:'unit', name:'Ancient', hp:720, size:20, speed:40, cost:360, cost2:45, cost3:25, time:24, dmg:36, range:30, cd:1.6, aggro:185, shot:'melee', splash:46 },
  // -- heavier beasts of the garden: a charging bruiser and a long-range spore-thrower,
  // both gated behind the Arboretum so they arrive as a real mid/late power spike --
  bramblehorn:{ fac:'verdant', kind:'unit', name:'Bramblehorn', hp:1100, size:19, speed:50, cost:360, cost2:40, cost3:20, time:22, dmg:50, range:30, cd:1.5, aggro:190, shot:'melee', splash:48 },
  sporecaller:{ fac:'verdant', kind:'unit', name:'Spore Caller', hp:320, size:14, speed:42, cost:300, cost2:50, time:18, dmg:38, range:255, cd:2.3, aggro:275, shot:'glob', splash:50 },

  // ----- STORMFORGE DYNASTY (escalating industry: income ramps with game time) -----
  reactor:   { fac:'stormforge', kind:'building', name:'Storm Reactor', hp:2000, size:42, core:true, dmg:13, range:185, cd:1.0, aggro:205, shot:'beam', produces:['arclight','galvan','voltaic','gladius'], grows:['dynamo','pylon','tesla','foundry_s','stormlab','arcfoundry'] },
  dynamo:    { fac:'stormforge', kind:'building', name:'Dynamo', hp:520, size:22, cost:200, time:12 },
  pylon:     { fac:'stormforge', kind:'building', name:'Charge Pylon', hp:460, size:16, cost:170, time:12, aura:140, shieldHeal:16, heal:2 },
  tesla:     { fac:'stormforge', kind:'building', name:'Tesla Coil', hp:420, size:14, cost:160, time:10, dmg:16, range:195, cd:1.1, aggro:205, shot:'beam' },
  foundry_s: { fac:'stormforge', kind:'building', name:'Foundry', hp:820, size:30, cost:260, time:20, produces:['colossus'] },
  arclight:  { fac:'stormforge', kind:'unit', name:'Arclight', hp:90, shield:40, size:9, speed:118, cost:110, time:8, dmg:9, range:115, cd:0.4, aggro:205, shot:'bullet' },
  galvan:    { fac:'stormforge', kind:'unit', name:'Galvan', hp:170, shield:120, size:12, speed:90, cost:180, time:11, dmg:18, range:64, cd:0.7, aggro:180, shot:'beam', splash:22 },
  voltaic:   { fac:'stormforge', kind:'unit', name:'Voltaic', hp:80, shield:60, size:9, speed:62, cost:210, time:13, dmg:30, range:230, cd:2.0, aggro:245, shot:'beam' },
  colossus:  { fac:'stormforge', kind:'unit', name:'Colossus', hp:520, shield:160, size:18, speed:48, cost:420, time:24, dmg:40, range:175, cd:2.4, aggro:200, shot:'shell', splash:55 },
  stormlab:  { fac:'stormforge', kind:'building', name:'Research Bay', hp:520, size:22, cost:150, time:14, researchLab:true },
  gladius:   { fac:'stormforge', kind:'unit', name:'Gladius', hp:200, shield:90, size:13, speed:70, cost:230, time:14, dmg:22, range:130, cd:1.0, aggro:195, shot:'shell', splash:24 },

  // ----- OBSIDIAN PACT (martyrdom: Blood from your OWN units dying) -----
  altar:     { fac:'pact', kind:'building', name:'Blood Altar', hp:1800, size:40, core:true, dmg:9, range:165, cd:0.9, aggro:195, shot:'glob', produces:['thrall','zealot','behemoth','cultist'], grows:['shrine','spike','sanctum','grandaltar'] },
  shrine:    { fac:'pact', kind:'building', name:'Bone Shrine', hp:420, size:22, cost:120, time:9, spawns:'thrall', spawnEvery:5 },
  spike:     { fac:'pact', kind:'building', name:'Blood Spike', hp:340, size:13, cost:110, time:7, dmg:13, range:168, cd:0.85, aggro:190, shot:'glob' },
  thrall:    { fac:'pact', kind:'unit', name:'Thrall', hp:46, size:7, speed:104, cost:30, time:3, dmg:7, range:14, cd:0.6, aggro:185, shot:'melee' },
  zealot:    { fac:'pact', kind:'unit', name:'Zealot', hp:110, size:9, speed:88, cost:110, time:6, dmg:15, range:18, cd:0.8, aggro:185, shot:'melee' },
  behemoth:  { fac:'pact', kind:'unit', name:'Behemoth', hp:560, size:18, speed:50, cost:340, time:18, dmg:34, range:24, cd:1.4, aggro:185, shot:'melee', splash:40 },
  sanctum:   { fac:'pact', kind:'building', name:'Blood Sanctum', hp:520, size:22, cost:130, time:12, researchLab:true },
  cultist:   { fac:'pact', kind:'unit', name:'Cultist', hp:60, size:8, speed:92, cost:70, time:5, dmg:13, range:130, cd:1.0, aggro:190, shot:'glob' },

  // ===== APEX TECH: each faction's late-game super-structure + titan =====
  // Gated behind deep tech (a top-tier production building / research lab) AND the
  // Offense capstone (Siege Ordnance, *_ord), and ruinously expensive — the payoff
  // for teching all game instead of just spamming cheap bodies. `apex:true` gives
  // them a glowing marker; several carry an `aux` machine-gun ring like the Bulwark.
  // (The Warden already has its own apex pair: the Castellan + the Bulwark.)

  // IRON VANGUARD — a walking dreadnought: siege cannon + four autocannon turrets
  dominion:  { fac:'vanguard', kind:'building', name:'Dominion Yard', hp:1100, size:32, cost:600, time:30, apex:true, produces:['leviathan'] },
  leviathan: { fac:'vanguard', kind:'unit', name:'Leviathan', hp:1500, size:22, speed:40, cost:700, time:36, apex:true,
               dmg:60, range:235, cd:3.0, aggro:245, shot:'shell', splash:80,
               aux:{ dmg:11, range:150, cd:0.3, shot:'bullet', guns:4 } },

  // MYRIAD SWARM — a colossal brood-mother that crushes and heals the swarm around it
  broodnexus:{ fac:'myriad', kind:'building', name:'Brood Nexus', hp:1200, size:30, cost:520, time:26, apex:true, creepR:7, produces:['tyrant'] },
  tyrant:    { fac:'myriad', kind:'unit', name:'Brood Tyrant', hp:1750, size:22, speed:46, cost:650, time:34, apex:true,
               dmg:40, range:30, cd:1.4, aggro:200, shot:'melee', splash:60, aura:160, heal:8 },

  // SOLARI EXODUS — a shielded capital ship (no base, so the Ark builds it directly)
  sovereign: { fac:'exodus', kind:'unit', name:'Solar Sovereign', hp:900, shield:800, size:24, speed:58, cost:820, time:40, apex:true,
               dmg:30, range:200, cd:1.8, aggro:225, shot:'beam', splash:50,
               aux:{ dmg:10, range:160, cd:0.3, shot:'bullet', guns:4 } },

  // ASHEN CHOIR — an avatar of death; lifesteals like all spirits, but enormously
  charnel:   { fac:'choir', kind:'building', name:'Charnel Throne', hp:1100, size:28, cost:520, time:26, apex:true, produces:['devourer'] },
  devourer:  { fac:'choir', kind:'unit', name:'Soul Devourer', hp:1400, size:22, speed:56, cost:640, time:34, apex:true,
               dmg:46, range:175, cd:1.6, aggro:215, shot:'beam', splash:55 },

  // GILDED SYNDICATE — the ultimate instant-hire merc: arrives ready, for a fortune
  exchange:  { fac:'syndicate', kind:'building', name:'War Exchange', hp:1000, size:28, cost:500, time:8, apex:true, produces:['warlord'] },
  warlord:   { fac:'syndicate', kind:'unit', name:'Warlord', hp:1300, size:21, speed:56, cost:820, time:0.5, apex:true,
               dmg:50, range:175, cd:2.2, aggro:215, shot:'shell', splash:55,
               aux:{ dmg:12, range:150, cd:0.3, shot:'bullet', guns:4 } },

  // EMBER NOMADS — a fast-moving inferno engine that hoses splashing fire
  greatpyre: { fac:'ember', kind:'building', name:'Great Pyre', hp:950, size:28, cost:560, time:16, apex:true, produces:['titan'] },
  titan:     { fac:'ember', kind:'unit', name:'Ash Titan', hp:1250, size:21, speed:80, cost:600, time:30, apex:true,
               dmg:34, range:120, cd:0.9, aggro:205, shot:'glob', splash:60,
               aux:{ dmg:10, range:130, cd:0.3, shot:'glob', guns:3 } },

  // VERDANT BLOOM — a world-tree: titanic HP, splashing blows, heals the garden
  heartgrove:{ fac:'verdant', kind:'building', name:'Heart Grove', hp:1250, size:28, cost:520, cost2:60, cost3:40, time:18, apex:true, spawns:'sapling', spawnEvery:5, produces:['eldertree'] },
  eldertree: { fac:'verdant', kind:'unit', name:'Eldertree', hp:1900, size:24, speed:36, cost:700, cost2:90, cost3:60, time:38, apex:true,
               dmg:40, range:32, cd:1.6, aggro:190, shot:'melee', splash:62, aura:170, heal:7 },

  // STORMFORGE DYNASTY — a storm titan: heavy shields, long beam + four arc turrets
  arcfoundry:{ fac:'stormforge', kind:'building', name:'Grand Foundry', hp:1000, size:30, cost:580, time:22, apex:true, produces:['tempest'] },
  tempest:   { fac:'stormforge', kind:'unit', name:'Storm Titan', hp:1100, shield:500, size:23, speed:46, cost:780, time:38, apex:true,
               dmg:44, range:230, cd:2.2, aggro:240, shot:'beam', splash:50,
               aux:{ dmg:12, range:160, cd:0.3, shot:'beam', guns:4 } },

  // OBSIDIAN PACT — an avatar of slaughter that births Thralls and heals the horde
  grandaltar:{ fac:'pact', kind:'building', name:'Grand Altar', hp:1000, size:28, cost:500, time:14, apex:true, spawns:'thrall', spawnEvery:4, produces:['bloodavatar'] },
  bloodavatar:{ fac:'pact', kind:'unit', name:'Blood Avatar', hp:1600, size:22, speed:52, cost:600, time:32, apex:true,
               dmg:48, range:26, cd:1.4, aggro:190, shot:'melee', splash:55, aura:150, heal:6 },

  // ----- NEUTRAL (capture / fight) -----
  // Obelisk: indestructible capture point — hold ground nearby to claim its income.
  obelisk:       { fac:'neutral', kind:'building', name:'Obelisk', hp:1, size:22, noTarget:true, captureR:140, captureTime:6 },
  // Hoard: a guarded treasure tower that shoots intruders; destroy it for a bounty.
  hoard:         { fac:'neutral', kind:'building', name:'Ancient Hoard', hp:1500, size:30, dmg:16, range:215, cd:1.0, aggro:240, shot:'shell', splash:34, bounty:550 },
  // Cache: a small, lightly-guarded jungle camp; quick to crack for a little bounty.
  cache:         { fac:'neutral', kind:'building', name:'Supply Cache', hp:520, size:17, dmg:8, range:150, cd:1.1, aggro:160, shot:'bullet', bounty:160 },
  // Bunker: a heavily-guarded strongpoint guarding a chokepoint. Cracking it pays a
  // big bounty to anyone — but it holds a hoard of Powder the Warden alone can use,
  // so it's a prize the Covenant must march out to seize for its grand projects.
  munitions:     { fac:'neutral', kind:'building', name:'Munitions Bunker', hp:2000, size:24, dmg:15, range:205, cd:0.85, aggro:235, shot:'bullet', splash:18, bounty:450, powder:90 },
};

// Per-thing flavour + tech tree. `desc` shows on hover; `req` is a building that
// must be finished before this can be built/produced (the faction's tech gate).
const META = {
  // IRON VANGUARD
  hq:        { desc: 'Your core. Workers drop off crystal here, and it trains more Workers. Lose it and you lose.' },
  worker:    { desc: 'Cheap harvester and builder. Auto-mines crystal; select one to construct buildings.' },
  barracks:  { desc: 'Infantry school — trains Marines, Snipers and Medics.' },
  factory:   { desc: 'Heavy vehicle bay. Builds Siege Tanks.', req: 'barracks' },
  airfield:  { desc: 'Aircraft hangar. Builds Gunships.', req: 'factory' },
  turret:    { desc: 'Static defensive gun. Cheap base protection.' },
  marine:    { desc: 'Cheap, reliable rifle infantry. The backbone of any push.' },
  sniper:    { desc: 'Fragile long-range specialist with heavy single-target damage.' },
  medic:     { desc: 'Non-combat support; continuously heals nearby friendly units.' },
  tank:      { desc: 'Slow siege vehicle with a splashing cannon. Anti-armour and anti-clump.' },
  gunship:   { desc: 'Fast flyer with rapid fire. Excellent for raids and mop-up.' },
  // MYRIAD SWARM
  hive:      { desc: 'Your core. Spreads creep, spawns free Drones, and grows every structure.' },
  tumor:     { desc: 'Cheap creep spreader; extends your economy and where you can build.' },
  spawnpit:  { desc: 'Breeds Drones endlessly, for free.' },
  spittermound:{ desc: 'Breeds ranged Spitters endlessly, for free.', req: 'spawnpit' },
  hunterden: { desc: 'Breeds fast Hunters endlessly, for free.', req: 'spawnpit' },
  spine:     { desc: 'Static acid turret. Creep defence.' },
  drone:     { desc: 'Free melee swarm unit. Weak alone, lethal in numbers. Heals on creep.' },
  spitter:   { desc: 'Free ranged unit that spits acid.' },
  hunter:    { desc: 'Free fast melee striker that runs units down.' },
  broodmother:{ desc: 'Elite splashing bruiser bred from the Hive.', req: 'hunterden' },
  // SOLARI EXODUS
  ark:       { desc: 'Your mobile core — fortress, factory and treasury in one. Deploy on a crystal node to siphon.' },
  collector: { desc: 'Harvester that mines crystal and hauls it back to the Ark. Build more to scale your economy.' },
  seeker:    { desc: 'Cheap shielded skirmisher that blinks onto its target.' },
  lancer:    { desc: 'Long-range beam unit; fragile but deals heavy damage.' },
  guardian:  { desc: 'Support unit; projects a shield-and-heal aura over nearby allies.' },
  phoenix:   { desc: 'Fast shielded flyer with rapid fire.' },
  templar:   { desc: 'Elite shielded warrior with a splashing siege shell.' },
  // ASHEN CHOIR
  ossuary:   { desc: 'Your core. Raises Wraiths and Banshees and anchors the lattice.' },
  conduit:   { desc: 'Extends your lattice (build range) and trickles Essence.' },
  reliquary: { desc: 'Raises elite Revenants.' },
  spire:     { desc: 'Static beam tower. Lattice defence.', req: 'conduit' },
  wraith:    { desc: 'Cheap fast melee spirit. Fades away from the lattice — heals by dealing damage.' },
  banshee:   { desc: 'Ranged spirit with a piercing beam.' },
  revenant:  { desc: 'Elite splashing melee horror raised in the Reliquary.' },
  // GILDED SYNDICATE
  haven:     { desc: 'Your core and treasury. Earns compound interest and hires mercenaries instantly.' },
  watchpost: { desc: 'Air-dropped static gun. Project control across the map — but not into enemy territory.' },
  countinghouse:{ desc: 'Raises your interest cap and pays rent. Bank more gold, earn faster.' },
  enforcer:  { desc: 'Cheap instant mercenary with a sidearm.' },
  arbalest:  { desc: 'Long-range marksman merc with heavy damage.', req: 'countinghouse' },
  juggernaut:{ desc: 'Heavy splashing mercenary bruiser.', req: 'countinghouse' },
  // WARDEN COVENANT — a deep, DISTRIBUTED tech tree (build advanced structures from
  // other advanced structures). Tier 2+ also costs Iron from Forges.
  keep:      { desc: 'Your core. Trains Tier-1 foot, raises Tier-1/tech buildings. Stone income scales with your buildings’ total HP.' },
  rampart:   { desc: 'Dirt-cheap, super-tough wall. Seals your hold and fattens Stone income.' },
  bastion:   { desc: 'Armoured defensive gun tower.', req: 'rampart' },
  quarry:    { desc: 'Mints a steady flow of Stone each second. Stack them to fund the war.' },
  cauldron:  { desc: 'Short-range tower that dumps burning splash on anything near the wall.', req: 'rampart' },
  forge:     { desc: 'Your only Iron source — mints Iron each second. Build many for the higher tiers.' },
  powdermill:{ desc: 'Mints a trickle of Powder — the third resource your grandest projects burn. The real haul is on the map: held Obelisks and cracked Munitions Bunkers.' },
  sentinel:  { desc: 'Tough, slow melee line-holder.' },
  warden_g:  { desc: 'Armoured ranged trooper.', req: 'bastion' },
  pikeman:   { desc: 'Cheap anti-armour spearman; hits hard in melee.' },
  foundry_w: { desc: 'Tier-2 bay: builds Bombards/Ironclads and raises the Redoubt and Arsenal.', req: 'forge' },
  college:   { desc: 'Research hall + siege yard: raises the Bunker, Ballista and Hall.', req: 'bastion' },
  bunker:    { desc: 'Heavily armoured gun emplacement. Wall backbone.', req: 'college' },
  ballista:  { desc: 'Extreme-range single-bolt tower. No splash, but outranges almost everything.', req: 'college' },
  hall:      { desc: 'Musters Halberdiers and banner-bearing Marshals.', req: 'college' },
  redoubt:   { desc: 'Long-range static artillery with splash.', req: 'foundry_w' },
  bombard:   { desc: 'Slow long-range siege artillery with splash. Costs Iron.' },
  ironclad:  { desc: 'Hulking armoured melee bruiser. Costs Iron.' },
  halberd:   { desc: 'Elite anti-armour infantry that cleaves heavy units.', req: 'hall' },
  marshal:   { desc: 'Banner officer: fights at range; aura heals troops and repairs buildings.', req: 'hall' },
  arsenal:   { desc: 'Tier-3 workshop: builds Castellan/Trebuchet, raises the Bulwark and Worldbreaker.', reqs:['foundry_w','college'] },
  castellan: { desc: 'Tier-3 siege colossus — long-range splash, a wall of HP. Heavy Iron.' },
  trebuchet: { desc: 'Longest-ranged unit in the game. Fragile up close; huge splash from afar. Heavy Iron.' },
  citadel:   { desc: 'Doomsday fortress: map-spanning cannon + four machine-guns. From the Arsenal; needs the full war machine and Weapons II.', reqs:['foundry_w','college','bunker','redoubt','arsenal'], reqResearch:'warden_wpn2' },
  worldbreaker: { desc: 'The ultimate structure — longest passive range in the game, plus the active GUSTAV STRIKE: nuke any point across most of the map (~1-min reload). Needs an Arsenal, a Bulwark, and Siege Ordnance.', reqs:['arsenal','citadel'], reqResearch:'warden_ord' },
  // EMBER NOMADS
  pyre:      { desc: 'Your core. Musters the whole warband. Plunder from combat funds it.' },
  warcamp:   { desc: 'Forward muster point; trains Raiders and Slingers and unlocks heavier warriors.' },
  totem:     { desc: 'Static fire turret. Cheap defence.' },
  raider:    { desc: 'Dirt-cheap, very fast melee raider.' },
  slinger:   { desc: 'Fast ranged skirmisher.' },
  firebrand: { desc: 'Splashing molotov thrower.', req: 'warcamp' },
  warbeast:  { desc: 'Fast heavy charger that bowls through lines.', req: 'warcamp' },
  // VERDANT BLOOM
  heart:     { desc: 'Your core. Spawns free Saplings forever and grows the garden. THREE harvests feed it: Sap, Pollen and Loam.' },
  bloom:     { desc: 'Sap plant. Each mature Bloom pays Sap — your bulk economy.' },
  petalspire:{ desc: 'Mints Pollen — the second harvest, demanded by your finer plants and beasts.', req: 'bloom' },
  mulchbed:  { desc: 'Mints Loam — the third harvest, that feeds your great trees and roots your Thornwalls.', req: 'bloom' },
  grove:     { desc: 'Breeds free Saplings, forever.', req: 'bloom' },
  bramble:   { desc: 'Static thorn turret — long-range single-target poke.', req: 'bloom' },
  sporevent: { desc: 'Static plant that coughs corrosive spore-clouds — splash on anything clumped in front of it. Pairs with Thornwalls to gas a funnelled foe. Costs Sap + Loam.', req: 'grove' },
  fertpod:   { desc: 'Pumps nutrients into a wide field: nearby friendly plants & beasts hit harder, attack faster and slowly heal — and it nurses withered buildings (Necrotic Graft) back to life. Costs Sap + Loam.', req: 'bloom' },
  sporebloss:{ desc: 'Exhales a vast cloud of clinging spores that crawls the enemy to a slow drag across a huge radius. Costs Sap + Pollen.', req: 'grove' },
  thornwall: { desc: 'A rooting wall-plant: dirt-cheap, super-tough, and thorny up close. Chain them into living barricades to seal your hold and funnel the enemy into a kill-zone. Costs Sap + Loam; needs an Arboretum.', req: 'arboretum' },
  greatroot: { desc: 'A colossal rooted barricade — a single titanic wall of living wood that simply will not move. The backbone of a great wall to block and funnel whole armies. Costs Sap + Loam; needs an Arboretum.', req: 'arboretum' },
  erdtree:   { desc: 'The Erdtree — one colossal, INDESTRUCTIBLE world-tree. It can never be destroyed and shells all who near it: the ultimate living wall and anchor of the garden. Enormously expensive (Sap + Pollen + Loam); needs an Arboretum. Raises Erdtree Walls.', req: 'arboretum' },
  erdwall:   { desc: 'An INDESTRUCTIBLE root-wall segment raised by the Erdtree. Cheap — chain them into an impassable rampart that funnels the enemy (they must path around). Needs an Erdtree.', req: 'erdtree' },
  heartsap:  { desc: 'A daughter of the Heartwood: an expansion that lets your garden spread far further (much greater build range) and trickles its own free Saplings. Plant it out toward the map. Costs Sap + Pollen.', req: 'grove' },
  graft_necro:{ desc: 'HEARTWOOD GRAFT — must root beside the Heartwood. Your plants & beasts feed on the enemy dead nearby, growing permanently stronger; and your buildings no longer die — they collapse into withered husks you can nurse back with Fertiliser Pods. Needs an Arboretum.', req: 'arboretum' },
  graft_moon: { desc: 'HEARTWOOD GRAFT — must root beside the Heartwood. The moon-sign lifts the fog of war from the whole map and quickens everything you grow — movement, attacks and growth all hasten. Needs an Arboretum.', req: 'arboretum' },
  graft_wild: { desc: 'HEARTWOOD GRAFT — must root beside the Heartwood. Wild growth unbinds your Saplings: they no longer count against any cap and erupt as bigger, fiercer mutated Saplings. Needs an Arboretum.', req: 'arboretum' },
  sapling:   { desc: 'Free, weak melee swarm creature.' },
  thornling: { desc: 'Ranged thorn-spitter.' },
  treant:    { desc: 'Towering splashing bruiser. Costs Sap + Pollen.', req: 'grove' },
  bramblehorn:{ desc: 'Heavy thorn-wreathed beast — a wall of HP that charges in and cleaves with splashing blows. Needs an Arboretum.', req: 'arboretum' },
  sporecaller:{ desc: 'Long-range walking plant that lobs caustic spore-bombs with wide splash. The garden’s siege artillery. Needs an Arboretum.', req: 'arboretum' },
  // STORMFORGE DYNASTY
  reactor:   { desc: 'Your core. Assembles machines. Power ramps with elapsed time — each standing Dynamo pays more every minute.' },
  dynamo:    { desc: 'Your engine. Each Dynamo’s output RAMPS the longer it stands — build them early and defend them; time turns them into a fortune.' },
  pylon:     { desc: 'Projects a charge field that re-energises the shields (and slowly the hull) of nearby machines — so a defended push never runs out of shield.', req: 'dynamo' },
  tesla:     { desc: 'Static beam tower. Defence.', req: 'dynamo' },
  foundry_s: { desc: 'Assembles the towering Colossus.', req: 'dynamo' },
  arclight:  { desc: 'Fast shielded skirmisher with rapid fire.' },
  galvan:    { desc: 'Fast, heavily-shielded shock-trooper — closes in and arcs a splashing short-range bolt. The Dynasty’s front line.', req: 'dynamo' },
  voltaic:   { desc: 'Long-range shielded beam platform.', req: 'dynamo' },
  colossus:  { desc: 'Huge shielded walker with a splashing siege cannon.' },
  // OBSIDIAN PACT
  altar:     { desc: 'Your core. Summons Thralls, Zealots and Behemoths. Your fallen units pay Blood.' },
  shrine:    { desc: 'Spawns free Thralls and lets the Altar raise greater horrors.' },
  spike:     { desc: 'Static blood turret. Cheap defence.' },
  thrall:    { desc: 'Dirt-cheap, expendable melee body. Its death spills Blood.' },
  zealot:    { desc: 'Tougher melee fanatic.', req: 'shrine' },
  behemoth:  { desc: 'Massive splashing horror raised from spilled Blood.', req: 'shrine' },
  // NEW UNITS & BUILDINGS
  techlab:   { desc: 'Research building. Develops Iron Vanguard weapon & armour upgrades.' },
  flametank: { desc: 'Fast short-range tank that hoses a cone of fire — devastating against clumped infantry.' },
  goliath:   { desc: 'Heavy walker with a long-range autocannon. Durable all-rounder; anchors a push.' },
  evochamber:{ desc: 'Research building grown on creep. Evolves the swarm’s upgrades.' },
  ravager:   { desc: 'Bred ranged elite that lobs corrosive splash. Needs a Hunter Den.', req: 'hunterden' },
  aegis:     { desc: 'Heavily shielded vanguard bruiser. Soaks fire and crushes what it reaches.' },
  oracle:    { desc: 'Lattice research shrine. Unlocks the Choir’s upgrades.' },
  lich:      { desc: 'Ranged caster spirit with a piercing death-beam. Fragile but hits hard.' },
  blackmarket:{ desc: 'Air-dropped research den. Brokers the Syndicate’s upgrades.' },
  marauder:  { desc: 'Instant-hire mercenary bruiser with a short-range grenade launcher.' },
  warlodge:  { desc: 'Research building. Hones the warband’s edge & upgrades.' },
  firewagon: { desc: 'Fast vehicle that flings flaming pitch in a splash. Needs a War Camp.', req: 'warcamp' },
  arboretum: { desc: 'Research building. Cultivates the garden’s upgrades.' },
  ancient:   { desc: 'Towering elder treant — enormous HP and splashing blows. Needs a Grove.', req: 'grove' },
  stormlab:  { desc: 'Research building. Designs the Dynasty’s upgrades.' },
  gladius:   { desc: 'Shielded mid-weight mech with a splashing cannon. Needs a Dynamo.', req: 'dynamo' },
  sanctum:   { desc: 'Research building. Channels the Pact’s rites & upgrades.' },
  cultist:   { desc: 'Cheap ranged zealot — the Pact’s only ranged body. Spits hexes from afar.' },
  // APEX TECH — late-game super-structures + titans (each gated on Siege Ordnance)
  dominion:  { desc: 'Vanguard apex yard. Builds the Leviathan. Needs an Airfield and Tech Lab.', reqs:['airfield','techlab'] },
  leviathan: { desc: 'Walking dreadnought — siege cannon + four autocannons on heavy armour. Needs Siege Ordnance.', reqResearch:'vanguard_ord' },
  broodnexus:{ desc: 'Myriad apex pool. Births the Brood Tyrant. Needs a Hunter Den and Evolution Chamber.', reqs:['hunterden','evochamber'] },
  tyrant:    { desc: 'Colossal brood-mother: splashing blows that heal the swarm. Needs Siege Ordnance.', reqResearch:'myriad_ord' },
  sovereign: { desc: 'Shielded capital ship — splashing beam + four point-defence guns. Built from the Ark. Needs Siege Ordnance.', reqResearch:'exodus_ord' },
  charnel:   { desc: 'Choir apex throne. Raises the Soul Devourer. Needs a Reliquary and Bone Oracle.', reqs:['reliquary','oracle'] },
  devourer:  { desc: 'Avatar of death — a huge death-beam that lifesteals everything it burns. Needs Siege Ordnance.', reqResearch:'choir_ord' },
  exchange:  { desc: 'Syndicate apex. Hires the Warlord instantly, for a fortune. Needs a Countinghouse and Black Market.', reqs:['countinghouse','blackmarket'] },
  warlord:   { desc: 'Ultimate merc — battle-ready siege gun + four autocannons. Needs Siege Ordnance.', reqResearch:'syndicate_ord' },
  greatpyre: { desc: 'Ember apex pyre. Stokes the Ash Titan. Needs a War Lodge and War Camp.', reqs:['warlodge','warcamp'] },
  titan:     { desc: 'Fast inferno engine hosing splashing fire. Needs Siege Ordnance.', reqResearch:'ember_ord' },
  heartgrove:{ desc: 'Verdant apex grove. Grows the Eldertree + extra Saplings. Needs a Grove and Arboretum.', reqs:['grove','arboretum'] },
  eldertree: { desc: 'Titanic world-tree — huge HP, splashing blows, an aura that heals the garden. Needs Siege Ordnance.', reqResearch:'verdant_ord' },
  arcfoundry:{ desc: 'Stormforge apex. Forges the Storm Titan. Needs a Foundry and Research Bay.', reqs:['foundry_s','stormlab'] },
  tempest:   { desc: 'Storm titan — long arc-beam + four arc turrets behind heavy shields. Needs Siege Ordnance.', reqResearch:'stormforge_ord' },
  grandaltar:{ desc: 'Pact apex altar. Summons the Blood Avatar + free Thralls. Needs a Blood Sanctum and Bone Shrine.', reqs:['sanctum','shrine'] },
  bloodavatar:{ desc: 'Avatar of slaughter — splashing strikes, a horde-healing aura, an endless Thrall tide. Needs Siege Ordnance.', reqResearch:'pact_ord' },
  // NEUTRAL
  obelisk:   { desc: 'Neutral capture point. Hold units nearby to claim it for steady income.' },
  hoard:     { desc: 'Guarded neutral treasure tower. Destroy it for a one-time bounty.' },
  cache:     { desc: 'Lightly-guarded neutral supply cache. Crack it open for a small bounty.' },
  munitions: { desc: 'A heavily-guarded neutral strongpoint holding a hoard of munitions. Crack it for a big bounty — and a cache of Powder if you are the Warden.' },
};
const meta = t => META[t] || {};
// has this faction met the tech requirement (a finished prerequisite building) for `type`?
// every gating requirement for a buildable: prerequisite building(s) — a single
// `req` or a `reqs` array — plus an optional researched upgrade `reqResearch`.
// Returns [{name, ok}] so the UI can list each one and its status.
function reqStatus(fac, type) {
  const m = meta(type), p = game.players[fac], out = [];
  const reqs = m.reqs || (m.req ? [m.req] : []);
  for (const r of reqs)
    out.push({ name: DEFS[r].name,
      ok: game.entities.some(e => !e.dead && e.fac === fac && e.type === r && !e.constructing && !e.growing) });
  if (m.reqResearch)
    out.push({ name: RESEARCH[m.reqResearch].name, ok: !!(p && p.research.has(m.reqResearch)) });
  return out;
}
function techMet(fac, type) { return reqStatus(fac, type).every(r => r.ok); }
function reqMsg(fac, type) {
  const miss = reqStatus(fac, type).filter(r => !r.ok).map(r => r.name);
  return miss.length ? 'Requires ' + miss.join(', ') : 'Requirements met';
}

// extra resources: the Warden spends a second currency (`cost2`, held in p.iron) and
// a third (`cost3`, held in p.powder — for its grandest projects) alongside its
// primary `res`. `cost2`/`cost3` are absent for everyone else.
function affordable(p, d) { return p.res >= (d.cost || 0) && (p.iron || 0) >= (d.cost2 || 0) && (p.powder || 0) >= (d.cost3 || 0); }
function payFor(p, d) { p.res -= (d.cost || 0); p.iron = (p.iron || 0) - (d.cost2 || 0); p.powder = (p.powder || 0) - (d.cost3 || 0); }
function costMsg(fac, d) {
  const F = FACTIONS[fac], p = game.players[fac];
  if ((d.cost3 || 0) > 0 && (p.powder || 0) < d.cost3 && p.res >= (d.cost || 0) && (p.iron || 0) >= (d.cost2 || 0)) return 'Not enough ' + F.res3;
  if ((d.cost2 || 0) > 0 && (p.iron || 0) < d.cost2 && p.res >= (d.cost || 0)) return 'Not enough ' + F.res2;
  return 'Not enough ' + F.res;
}

// Building connection: most factions can no longer drop structures anywhere on the
// map — a new building must sit within CONNECT_R of one they already own, so a base
// grows as a contiguous network and reaching distant nodes / control points means
// physically chaining buildings out toward them. Myriad (creep) and Choir (lattice)
// already have their own network rules; Exodus has no base and is exempt. Buildings
// flagged `forward:true` (the Syndicate's air-dropped Watchpost) bypass the rule.
const CONNECT_R = 270;
const NETWORKED = { vanguard: 1, warden: 1, syndicate: 1, ember: 1, verdant: 1, stormforge: 1, pact: 1 };
// the Verdant Bloom's garden spreads further than most — and a building can override
// the radius with its own `connectR` (the Heartwood Sapling reaches far out to expand).
function connectBase(fac) { return fac === 'verdant' ? 360 : CONNECT_R; }

// ---------------- Verdant Bloom: saplings, grafts, auras ----------------
// Saplings are free swarm and keep their OWN cap, separate from the main unit cap, so
// the garden's bodies never crowd out its real army. The Wildgrowth Graft lifts the cap.
const SAPLING_CAP = 30;
function countFree(fac) {
  return game.entities.reduce((n, e) => n + (!e.dead && e.fac === fac && e.def.kind === 'unit' && e.def.freeUnit ? 1 : 0), 0);
}
function freeCapOf(fac) {
  const p = game.players[fac];
  if (p && p.gWild) return Infinity;          // Wildgrowth Graft: no sapling cap
  return SAPLING_CAP + ((p && p.capBonus) || 0);
}
// is a finished Graft of this kind ('necro'|'moon'|'wild') standing for this faction?
function hasGraft(fac, key) {
  return game.entities.some(e => !e.dead && e.fac === fac && e.def.graft === key
    && !e.constructing && !e.growing && !e.withered);
}
// Verdant tuning. Fertiliser buff (damage ×, faster cooldown), Spore Blossom slow,
// Moonsign haste, Necrotic per-death buff, Wildgrowth sapling mutation.
const VERD = {
  fertDmg: 1.25, fertCd: 0.82, fertWindow: 0.45,
  slowFactor: 0.5, slowWindow: 0.5,
  moonSpeed: 1.4, moonCd: 0.75, moonProd: 1.6,
  necroRange: 360, necroStackDmg: 0.04, necroStackHp: 0.04, necroMaxStacks: 12,
  witherHp: 0.12, witherRepair: 0.85,
  mutHp: 1.8, mutDmg: 2.0, mutSize: 1.35, mutSpeed: 1.15,
};

// ---------------- research / upgrades ----------------
// Every faction shares the same four-branch tech tree (Offense / Defense / Mobility
// / Economy), laid out as a grid: `branch` is the row, `tier` the column. Each node
// permanently buffs the faction via multipliers (dmg/hp/shield/speed/range/cd/splash/
// econ) or a flat unit-cap bonus, and most are gated behind an earlier node (`req`).
// The Siege-Doctrine prerequisite for the Warden's Bulwark maps onto Weapons II.
const TECH_TEMPLATE = [
  // OFFENSE — branch 0
  { key: 'wpn1',  branch: 0, tier: 0, name: 'Weapons I',      cost: 120, time: 24, dmg: 1.20, desc: '+20% attack damage for all your combat units.' },
  { key: 'wpn2',  branch: 0, tier: 1, name: 'Weapons II',     cost: 220, time: 34, dmg: 1.20, req: 'wpn1', desc: '+20% more attack damage.' },
  { key: 'rof',   branch: 0, tier: 2, name: 'Targeting Array', cost: 300, time: 40, cd: 0.85,  req: 'wpn2', desc: '+18% rate of fire (faster cooldowns).' },
  { key: 'ord',   branch: 0, tier: 3, name: 'Siege Ordnance', cost: 380, time: 46, splash: 1.4, dmg: 1.10, req: 'rof', desc: '+40% splash radius and +10% damage.' },
  // DEFENSE — branch 1
  { key: 'arm1',  branch: 1, tier: 0, name: 'Plating I',      cost: 130, time: 26, hp: 1.18, desc: '+18% max HP for all your units.' },
  { key: 'arm2',  branch: 1, tier: 1, name: 'Plating II',     cost: 230, time: 36, hp: 1.20, req: 'arm1', desc: '+20% more max HP.' },
  { key: 'ward',  branch: 1, tier: 2, name: 'Ward Fields',    cost: 300, time: 40, shield: 1.30, hp: 1.05, req: 'arm2', desc: '+30% shields and +5% HP.' },
  { key: 'fort',  branch: 1, tier: 3, name: 'Fortification',  cost: 380, time: 46, hp: 1.22, req: 'ward', desc: '+22% more max HP.' },
  // MOBILITY — branch 2
  { key: 'eng1',  branch: 2, tier: 0, name: 'Engines I',      cost: 120, time: 22, speed: 1.15, desc: '+15% movement speed.' },
  { key: 'eng2',  branch: 2, tier: 1, name: 'Engines II',     cost: 210, time: 32, speed: 1.15, req: 'eng1', desc: '+15% more movement speed.' },
  { key: 'optic', branch: 2, tier: 2, name: 'Long Optics',    cost: 280, time: 38, range: 1.18, req: 'eng1', desc: '+18% weapon range.' },
  { key: 'over',  branch: 2, tier: 3, name: 'Overdrive',      cost: 340, time: 44, speed: 1.12, cd: 0.92, req: 'eng2', desc: '+12% speed and +8% rate of fire.' },
  // ECONOMY — branch 3
  { key: 'log1',  branch: 3, tier: 0, name: 'Logistics I',    cost: 120, time: 22, econ: 1.15, desc: '+15% resource income.' },
  { key: 'log2',  branch: 3, tier: 1, name: 'Logistics II',   cost: 220, time: 32, econ: 1.18, req: 'log1', desc: '+18% more resource income.' },
  { key: 'supply',branch: 3, tier: 2, name: 'Supply Lines',   cost: 260, time: 36, cap: 12, req: 'log1', desc: '+12 unit cap.' },
  { key: 'wecon', branch: 3, tier: 3, name: 'War Economy',    cost: 360, time: 44, econ: 1.20, cap: 8, req: 'log2', desc: '+20% income and +8 unit cap.' },
];
const TECH_BRANCHES = ['Offense', 'Defense', 'Mobility', 'Economy'];
const RESEARCH = {};
const RESEARCH_BY_FAC = {};
(function () {
  for (const fac in FACTIONS) {
    RESEARCH_BY_FAC[fac] = [];
    for (const t of TECH_TEMPLATE) {
      const rid = fac + '_' + t.key;
      RESEARCH[rid] = Object.assign({}, t, { fac, rid, req: t.req ? fac + '_' + t.req : undefined });
      RESEARCH_BY_FAC[fac].push(rid);
    }
  }
})();
// the Warden's Bulwark used to gate on the old 'warden_atk2'; it now maps to Weapons II
const WARDEN_SIEGE_DOCTRINE = 'warden_wpn2';

// which building each faction researches at (the base-less Exodus uses its Ark)
const LAB_OF = {};
for (const k in DEFS) if (DEFS[k].researchLab) LAB_OF[DEFS[k].fac] = k;

// derive a player's stat multipliers from the set of upgrades they've researched
function recalcMul(p) {
  p.dmgMul = 1; p.hpBonusMul = 1; p.shBonusMul = 1;
  p.speedMul = 1; p.rangeMul = 1; p.cdMul = 1; p.splashMul = 1; p.econMul = 1; p.capBonus = 0;
  for (const rid of p.research) {
    const r = RESEARCH[rid]; if (!r) continue;
    if (r.dmg) p.dmgMul *= r.dmg;
    if (r.hp) p.hpBonusMul *= r.hp;
    if (r.shield) p.shBonusMul *= r.shield;
    if (r.speed) p.speedMul *= r.speed;
    if (r.range) p.rangeMul *= r.range;
    if (r.cd) p.cdMul *= r.cd;
    if (r.splash) p.splashMul *= r.splash;
    if (r.econ) p.econMul *= r.econ;
    if (r.cap) p.capBonus += r.cap;
  }
}
// ---- Solari Exodus: the Ark upgrade ladder ----
// Buying an upgrade raises the Ark's tier (stored on the player), which scales
// its size, HP, shields and firepower — and the model is redrawn larger and more
// imposing at each step. Tier 0 mirrors the base `ark` definition.
const ARK_TIERS = [
  { size: 38, hp: 2300, shield: 900,  statMul: 1.0 },
  { size: 48, hp: 3400, shield: 1400, statMul: 1.3 },
  { size: 60, hp: 4900, shield: 2100, statMul: 1.65 },
  { size: 74, hp: 6800, shield: 3000, statMul: 2.05 },
];
const ARK_UPGRADES = [
  { name: 'Reinforced Ark', cost: 600,  desc: 'Forge-plate the hull and over-charge the reactors: far more HP, shields, firepower and reach. The Ark visibly grows.' },
  { name: 'Radiant Ark',    cost: 1500, desc: 'Bind the pilgrimage’s light into the chassis: another leap in durability and power, and the Ark looms larger.' },
  { name: 'Ascendant Ark',  cost: 3200, desc: 'The Ark ascends into a walking cathedral-fortress — colossal, radiant and devastating.' },
];
function arkTierData(fac) { const p = game.players[fac]; return ARK_TIERS[Math.min((p && p.arkTier) || 0, ARK_TIERS.length - 1)]; }
function baseHp(e)      { return e.type === 'ark' ? arkTierData(e.fac).hp : e.def.hp; }
function baseShield(e)  { return e.type === 'ark' ? arkTierData(e.fac).shield : (e.def.shield || 0); }
function baseSize(e)    { return e.type === 'ark' ? arkTierData(e.fac).size : e.def.size; }
function arkStatMul(e)  { return e.type === 'ark' ? arkTierData(e.fac).statMul : 1; }

// effective stats of an entity, with its owner's researched upgrades applied.
// (damage/range/cooldown/splash apply to buildings too; speed/cap only to units.)
function dmgOf(e) {
  const pl = game.players[e.fac];
  let m = arkStatMul(e);
  if (e.def.kind === 'unit' && pl) m *= pl.dmgMul;
  if (e.fertUntil > game.t) m *= VERD.fertDmg;                                  // Fertiliser Pod
  if (e.necroStacks) m *= 1 + Math.min(e.necroStacks, VERD.necroMaxStacks) * VERD.necroStackDmg; // Necrotic Graft
  if (e.mutated) m *= VERD.mutDmg;                                              // Wildgrowth mutation
  return e.def.dmg * m;
}
function spd(e) {
  const p = game.players[e.fac];
  let m = (p && p.speedMul) || 1;
  if (p && p.gMoon) m *= VERD.moonSpeed;          // Moonsign Graft: haste
  if (e.mutated) m *= VERD.mutSpeed;
  if (e.slowUntil > game.t) m *= VERD.slowFactor; // Spore Blossom: enemy slow
  return e.def.speed * m;
}
function rangeOf(e) { const p = game.players[e.fac]; return e.def.range * ((p && p.rangeMul) || 1) * arkStatMul(e); }
function aggroOf(e) { const p = game.players[e.fac]; return e.def.aggro * ((p && p.rangeMul) || 1); }
function cdOf(e) {
  const p = game.players[e.fac];
  let m = (p && p.cdMul) || 1;
  if (e.fertUntil > game.t) m *= VERD.fertCd;     // Fertiliser Pod: faster attacks
  if (p && p.gMoon) m *= VERD.moonCd;             // Moonsign Graft: faster attacks
  return e.def.cd * m;
}
function splashOf(e) { const p = game.players[e.fac]; return (e.def.splash || 0) * ((p && p.splashMul) || 1); }
function capOf(fac) { const p = game.players[fac]; return FACTIONS[fac].cap + ((p && p.capBonus) || 0); }
function researchQueued(fac, rid) {
  return game.entities.some(e => !e.dead && e.fac === fac && e.rqueue && e.rqueue.some(q => q.rid === rid));
}
// apply a finished research: record it, refresh multipliers, and retroactively
// rescale existing units so the buff is immediate (preserving their health %).
function applyResearch(fac, rid) {
  const p = game.players[fac], r = RESEARCH[rid];
  if (!p || !r || p.research.has(rid)) return;
  p.research.add(rid);
  recalcMul(p);
  for (const e of game.entities) {
    if (e.dead || e.fac !== fac || e.def.kind !== 'unit') continue;
    const hpFrac = e.hpMax > 0 ? e.hp / e.hpMax : 1;
    e.hpMax = baseHp(e) * p.hpBonusMul; e.hp = e.hpMax * hpFrac;
    const shMax = baseShield(e) * p.shBonusMul;
    const shFrac = e.shieldMax > 0 ? e.shield / e.shieldMax : 0;
    e.shieldMax = shMax; e.shield = shMax * shFrac;
  }
  localMsg(fac, 'Researched ' + r.name);
}
function enqueueResearch(e, rid) {
  const r = RESEARCH[rid], p = game.players[e.fac];
  if (!r || r.fac !== e.fac || !e.def.researchLab) return false;
  if (p.research.has(rid)) { localMsg(e.fac, 'Already researched'); return false; }
  if (researchQueued(e.fac, rid)) { localMsg(e.fac, 'Already researching ' + r.name); return false; }
  if (r.req && !p.research.has(r.req)) { localMsg(e.fac, 'Requires ' + RESEARCH[r.req].name); return false; }
  if (!e.rqueue) e.rqueue = [];
  if (e.rqueue.length >= 6) { localMsg(e.fac, 'Research queue is full'); return false; }
  if (p.res < r.cost) { localMsg(e.fac, 'Not enough ' + FACTIONS[e.fac].res); return false; }
  p.res -= r.cost;
  // research has its own queue so it never blocks (or is blocked by) unit production
  e.rqueue.push({ research: true, rid, type: 'research', t: r.time, total: r.time });
  return true;
}

// economy tuning
const ECON = {
  workerCarry: 10, workerMine: 2.0,
  myriadBase: 2.0, myriadPerTile: 0.012,
  exodusBase: 1.5, exodusSiphon: 4.5,
  // choir: trickle + a cut of every death on the map; units decay in the field
  // but are sustained near the lattice and lifesteal in combat
  choirBase: 1.8, choirConduit: 0.8, choirDeathFlat: 5, choirDeathPct: 0.06,
  choirDecay: 1.5, choirFloor: 0.35, choirSustain: 3, choirLeech: 0.7, choirLattice: 270,
  // syndicate: compound interest on the banked treasury, bounties on kills
  synBase: 2.5, synInterest: 0.011, synCapBase: 1200, synCapPer: 500,
  synHouseFlat: 0.8, synBountyFlat: 10, synBountyPct: 0.06,
  // no building (turret, wall, anything) may be placed within this radius of an enemy structure
  enemyKeepout: 300,
  // warden: income scales with the total HP of standing (finished) buildings,
  // plus a flat trickle from each Stone Quarry. The per-HP scaling is deliberately
  // small so a clump of walls no longer self-funds the war — map control (Obelisks,
  // Bunkers) is where the real Stone and Powder come from.
  wardenBase: 1.0, wardenPerHp: 0.0009, wardenQuarry: 1.6,
  // warden's third resource: Powder. Minted slowly at Powder Mills and, crucially,
  // trickled by every Obelisk the Covenant holds — so the doomsday tech demands map control.
  wardenObeliskPowder: 0.3,
  // ember: Plunder earned per point of damage dealt to enemies, plus a small trickle
  emberBase: 1.2, emberLootPerDmg: 0.32,
  // verdant: Sap income per mature Bloom (Pollen + Loam come from their own plants,
  // minted generically via ironPerSec / powderPerSec). The garden snowballs on Sap;
  // Pollen and Loam are the scarcer harvests that gate the diverse, late-game plants.
  verdantBase: 1.2, verdantPerBloom: 1.6,
  // stormforge: the engine that accelerates. Each standing Dynamo's output RAMPS with
  // elapsed game time, so early Dynamos compound into a fortune — the longer you hold
  // them (and the map), the more devastating the late game. Held Obelisks add on top.
  stormBase: 1.8, stormPerDynamo: 1.0, stormRamp: 0.0022,
  // pact: Blood gained when your OWN units die (flat + a share of their max HP)
  pactBase: 1.0, pactMartyrFlat: 6, pactMartyrPct: 0.10,
  // neutral capture points pay their holder a steady income. Obelisks now matter a
  // lot more — they're the main reason to march out and fight over the map rather
  // than clump at home and scale forever off a single base.
  obeliskIncome: 2.6,
};

// AI difficulty. `incomeMul` is the dominant lever (the bot's whole economy is
// scaled); `firstWave`/`waveStep` control how soon and how relentlessly it attacks;
// `react` is how often (seconds) the bot re-plans. Easy is a clear handicap; Brutal
// out-economies a human and pushes almost immediately.
const DIFFS = {
  easy:   { name: 'Easy',   incomeMul: 0.6, firstWave: 165, waveStep: 3, react: 1.5 },
  normal: { name: 'Normal', incomeMul: 1.0, firstWave: 90,  waveStep: 2, react: 1.0 },
  hard:   { name: 'Hard',   incomeMul: 1.5, firstWave: 55,  waveStep: 2, react: 0.7 },
  brutal: { name: 'Brutal', incomeMul: 2.1, firstWave: 35,  waveStep: 1, react: 0.5 },
};

