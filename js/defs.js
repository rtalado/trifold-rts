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
// Displayed in the main menu. Keep in sync with "version" in package.json on each release.
const APP_VERSION = '1.0.35';
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
  vanguard:  { name: 'THE VANGUARD',    color: '#4da6ff', dark: '#173153', res: 'Crystal', cap: 54 },
  myriad:    { name: 'MYRIAD SWARM',    color: '#c75cff', dark: '#3a1d52', res: 'Biomass', cap: 90 },
  exodus:    { name: 'SOLARI EXODUS',   color: '#ffc94d', dark: '#4a3a14', res: 'Energy',  cap: 28 },
  choir:     { name: 'ASHEN CHOIR',     color: '#3fe0c8', dark: '#0e3f3a', res: 'Essence', cap: 45 },
  syndicate: { name: 'GILDED SYNDICATE', color: '#ff6b52', dark: '#4a1a12', res: 'Gold',   cap: 40 },
  warden:    { name: 'WARDEN COVENANT',  color: '#c3ccd6', dark: '#232c38', res: 'Stone',  cap: 60, res2: 'Iron', res3: 'Powder' },
  ember:     { name: 'EMBER NOMADS',     color: '#ff8a2a', dark: '#4a2a0e', res: 'Plunder',cap: 66 },
  verdant:   { name: 'VERDANT BLOOM',    color: '#6fcf5c', dark: '#16401a', res: 'Sap',    cap: 84, res2: 'Pollen', res3: 'Loam' },
  stormforge:{ name: 'STORMFORGE DYNASTY', color:'#ff5ea8', dark: '#4a1338', res: 'Power',  cap: 42 },
  pact:      { name: 'OBSIDIAN PACT',    color: '#c0303a', dark: '#3a0e12', res: 'Blood',  cap: 72 },
  strain:    { name: 'THE VIRULENT STRAIN', color: '#c8e639', dark: '#3a4a12', res: 'Genome', cap: 90 },
};

// neutral entities (Obelisks, Hoards) aren't a playable faction; fall back to grey
const NEUTRAL = { color: '#9aa6b8', dark: '#2a3340' };
const facColor = f => (FACTIONS[f] || NEUTRAL).color;
const facDark  = f => (FACTIONS[f] || NEUTRAL).dark;

const HINTS = {
  vanguard: 'A full Earth war machine. Workers harvest crystal automatically — but the nodes are FINITE, so once your starter patch runs dry you MUST push Workers out to claim fresh nodes across the map. SUPPLY DEPOTS are forward drop-offs (and raise your cap) so far nodes are worth mining; a Depot beside a WELLSPRING harnesses it for a flood of extra crystal. Select a Worker to BUILD (Barracks → Marines/Rocketeers/Snipers/Medics, Factory → Outriders/Tanks/Artillery, Airfield → Gunships/Bombers, Turrets & Pillboxes to hold the line). Combined arms beats everything — destroy the enemy core; protect your Headquarters.',
  myriad: 'Your creep IS your economy — every covered tile feeds you biomass, but a home creep-blob MAXES OUT fast. To grow you must creep OUTWARD and blanket WELLSPRINGS — each font you cover pours out far more biomass than any tile. Select the Hive to GROW: Tumors spread creep, Spawn Pits / Spitter Mounds / Hunter Dens breed units FREE, forever; Acid Spines defend. The swarm also CORRUPTS: every attack rots and weakens the foe (deals less damage, slows, decays), and a corrupted enemy that dies bursts free LARVA from its corpse. Breed Larva at an Infestation Pit, hire corrosive elites (Corruptor / Defiler / Mawflyer) from a Corruption Den, anchor Miasma Vents — and cast the Hive’s CORRUPTION BLOOM to infect a whole army at once. Right-click with the Hive selected to set the swarm rally. The swarm heals on creep.',
  exodus: 'You have no base and never will. Build Collectors from the Ark to mine crystal nodes and haul it back — that is how you scale. Move the Ark onto a node and DEPLOY to siphon energy fast too. SCALE BY RANGING THE MAP: park Collectors (or the Ark) beside a WELLSPRING to harness it for a big flow, and seize OBELISKS — the nomads earn extra from every one they hold. Every warrior is priceless — shields regenerate, so strike and fall back. ASCEND the Ark through eight tiers (each pricier than the last) — and pour a fortune into the final tiers to forge it into a roaming SUPERWEAPON that surpasses the Worldbreaker, armed with the map-scorching SOLAR LANCE that grows stronger with every tier. If the Ark dies, all is lost.',
  choir: 'ALL death feeds the Choir — every unit that falls, yours or theirs, pays you Essence, so SCALING means fighting across the map. Your home Soul Conduits only trickle (and soon max out); crawl the lattice OUT to plant a Conduit beside a WELLSPRING for a real surge of Essence. Death also RAISES THE DEAD: a share of every unit that dies anywhere rises again as a free HUSK under your command — breed yet more from a SEPULCHRE. Raise a NECROPOLIS for the elite undead (Lich, Harbinger, Gravewight, Nightgaunt), anchor DREAD SPIRES that drag the living to a crawl, and toll the Ossuary’s DIRGE to wither a whole army and reap its dead. Near your lattice spirits are sustained; in the field they fade — but heal by dealing damage. Build only within the lattice. Guard the Ossuary.',
  syndicate: 'Gold breeds gold: your treasury earns compound interest — but the interest CAP is set by the TERRITORY you hold. A bank in a corner stalls; every Obelisk you capture and Wellspring you harness (park a Watchpost beside one) lifts the cap and lets the fortune compound (Countinghouses & Bullion Vaults raise it a little). Mercenaries arrive INSTANTLY for a price — the Haven hires the core four; a MERCENARY GUILD hires specialists (fast Gun Hands, aerial Dragoons, mending Sawbones, armoured Ironhides, siege Demolishers). Every kill pays a bounty, a fallen merc refunds part of its hire price (SEVERANCE), Watchposts air-drop across the map, and the Haven can DROP a free squad of Enforcers anywhere. Hoard or hire — and guard the Haven.',
  warden: 'Slow, armoured, unstoppable, and SELF-SUFFICIENT: alone among the powers you needn’t march out for the map — your standing buildings ARE your economy, the more you raise the more Stone you mint (Forges add Iron). A walled, secretive brotherhood: wall up, turret up, and grind forward with heavy troops and siege. (You cannot tap Wellsprings — you don’t need to.) Hold the Keep.',
  ember: 'No mines, no farms — you fund the war by WAGING it: every point of damage your warband deals is paid back as Plunder, so keep attacking or starve. Every attack also IGNITES the foe — a burning DoT that keeps cooking them, and that burn damage ALSO pays Plunder, so the inferno funds itself. Fast, cheap raiders up front; breed free EMBERLINGS from a Cinder Pit, anchor BONFIRES that ignite what they splash, and raise an Ember Foundry for a tanky Cinderguard wall, long-range Cinderbows, Cinder Catapult siege, a mending Flame Shaman, the fire-breathing CINDER DRAKE (your air) and the Molten Brute MAGMAUR. Call the War Pyre’s FIRESTORM to raze a whole army. Throw forward War Camps beside WELLSPRINGS to bleed extra Plunder from the map. Guard the War Pyre.',
  verdant: 'THREE harvests feed the garden: Sap from Blooms, Pollen from Pollen Spires, Loam from Mulch Beds — your grandest plants and beasts demand a MIX of all three. But a home garden CAPS OUT, and the scarce Pollen & Loam are choked. The answer is to spread: plant a Bloom on a WELLSPRING to root a thriving new ecosystem — it pours out bonus Sap, Pollen AND Loam, and grows a fertilising buff that makes every nearby plant & beast hit harder. So claim fertile ground all across the map. The Heartwood musters the whole army (Bramblehorn, Spore Caller need an Arboretum); Groves breed free Saplings; the Arboretum cultivates the Grafts, the Heart Grove and the INDESTRUCTIBLE Erdtree. Protect the Heartwood.',
  stormforge: 'An engine that accelerates — but no longer just by waiting. Your home Dynamos pay a FLAT rate and soon max out; the acceleration now lives on the MAP. Raise a Dynamo beside a WELLSPRING (a Storm Font) to harness it — and the longer you HOLD that font, the more Power it ramps out. So seize ground early and never let it go. Few machines, but shielded and devastating: Charge Pylons re-energise their shields mid-fight, so a defended push never stops. Defend the Reactor.',
  pact: 'Death is your harvest — but only your own. Every one of your units that falls spills Blood to fund the next, greater summoning — and whips the horde around it into a BLOOD FRENZY (the survivors strike harder and faster), so your own dying makes the rest deadlier. Throw cheap Thralls and fast Flayers into the grinder and raise Behemoths from their deaths. Raise the FLESH VATS for the elite horrors — a horde-healing BLOOD PRIEST, the heavy ABOMINATION and the winged GARGOYLE — anchor HEMORRHAGE SPIRES, and work the Altar’s CRIMSON RITE to rupture a field of foes and enrage the swarm. Raise Bone Shrines beside WELLSPRINGS to bleed extra Blood from the map. Reckless by design. Keep the Altar.',
  strain: 'Your bodies are weak and dirt-cheap — that is the point. ADAPTATION is earned, not given: send an unarmed GENE SAMPLER to stand near the fighting — as your units endure one kind of damage (bullet, beam, glob, shell, melee) it fills a sample of that type. Walk the locked sample home and deposit it in an ASSIMILATION CHAMBER: every unit that chamber breeds from then on PERMANENTLY resists that damage type (a new deposit swaps the strain; research DUAL GENOME to hold two at once). Getting hit ALSO pays you: every point of damage your units endure earns Genome, so throwing cheap Spawnlings and Biters into the grinder funds the next wave (a Gene Vat mints a small trickle too). Raise a Feeding Nest for ranged Stingers and beam-lashing Lashers, a Mutagen Works for the heavy Brute, siege Bloater, flying Drifter and the healing Mender; a Spawning Well breeds free Whelps forever. Trigger the Progenitor’s ADAPTIVE SURGE to instantly harden your whole army against everything for a few seconds. Raise Genewells beside WELLSPRINGS for extra Genome. Protect the Progenitor.',
};

// verb shown on a faction's build buttons ('Build X' by default)
const BUILD_VERB = {
  myriad: 'Grow ', syndicate: 'Drop ', warden: 'Erect ', ember: 'Raise ',
  verdant: 'Plant ', stormforge: 'Assemble ', pact: 'Summon ', strain: 'Evolve ',
};

// ---------------- unit / building definitions ----------------
// kind: 'unit' | 'building'
// shot: 'melee' | 'bullet' | 'beam' | 'glob' | 'shell'
const DEFS = {
  // ----- THE VANGUARD -----
  // Earth's main standing army: a textbook combined-arms force. Cheap, finite crystal
  // is its weakness, so its Supply Depots mint a steady trickle (and double as drop-offs)
  // to keep the war machine fed once the nodes run dry — its answer to limited scaling.
  hq:       { fac:'vanguard', kind:'building', name:'Headquarters', hp:1600, size:42, core:true, produces:['worker'], dropoff:true },
  worker:   { fac:'vanguard', kind:'unit', name:'Worker', hp:45, size:8, speed:75, cost:50, time:6, dmg:3, range:12, cd:1, aggro:0, shot:'melee', harvester:true, builder:true },
  depot:    { fac:'vanguard', kind:'building', name:'Supply Depot', hp:560, size:22, cost:175, time:14, dropoff:true, capBonus:6 },
  barracks: { fac:'vanguard', kind:'building', name:'Barracks', hp:650, size:28, cost:150, time:18, produces:['marine','rocket','sniper','medic'] },
  factory:  { fac:'vanguard', kind:'building', name:'Factory', hp:850, size:32, cost:250, time:24, produces:['outrider','tank','flametank','goliath','artillery','dreadnought'] },
  airfield: { fac:'vanguard', kind:'building', name:'Airfield', hp:700, size:28, cost:300, time:22, produces:['gunship','bomber'] },
  turret:   { fac:'vanguard', kind:'building', name:'Turret', hp:420, size:14, cost:100, time:12, dmg:9, range:195, cd:0.65, aggro:215, shot:'bullet' },
  pillbox:  { fac:'vanguard', kind:'building', name:'Pillbox', hp:820, size:18, cost:200, time:16, dmg:20, range:215, cd:1.2, aggro:230, shot:'shell', splash:30 },
  techlab:  { fac:'vanguard', kind:'building', name:'Tech Lab', hp:600, size:24, cost:150, time:14, researchLab:true },
  marine:   { fac:'vanguard', kind:'unit', name:'Marine', hp:75, size:8, speed:82, cost:60, time:5, dmg:8, range:95, cd:0.8, aggro:170, shot:'bullet' },
  rocket:   { fac:'vanguard', kind:'unit', name:'Rocketeer', hp:65, size:8, speed:74, cost:85, time:7, dmg:24, range:140, cd:1.7, aggro:205, shot:'shell' },
  sniper:   { fac:'vanguard', kind:'unit', name:'Sniper', hp:50, size:8, speed:65, cost:110, time:8, dmg:30, range:215, cd:2.2, aggro:235, shot:'beam' },
  medic:    { fac:'vanguard', kind:'unit', name:'Medic', hp:60, size:8, speed:80, cost:75, time:6, aggro:0, aura:110, heal:6 },
  outrider: { fac:'vanguard', kind:'unit', name:'Outrider', hp:135, size:11, speed:138, cost:90, time:7, dmg:8, range:115, cd:0.38, aggro:185, shot:'bullet' },
  tank:     { fac:'vanguard', kind:'unit', name:'Siege Tank', hp:280, size:14, speed:52, cost:200, time:12, dmg:34, range:165, cd:2.4, aggro:195, shot:'shell', splash:42 },
  gunship:  { fac:'vanguard', kind:'unit', name:'Gunship', hp:140, size:10, speed:120, cost:180, time:11, dmg:7, range:120, cd:0.35, aggro:200, shot:'bullet' },
  bomber:   { fac:'vanguard', kind:'unit', name:'Vulture Bomber', hp:170, size:12, speed:116, cost:240, time:14, dmg:36, range:120, cd:1.9, aggro:160, shot:'glob', splash:54 },
  flametank:{ fac:'vanguard', kind:'unit', name:'Hellhound', hp:210, size:13, speed:74, cost:170, time:11, dmg:14, range:82, cd:0.5, aggro:150, shot:'glob', splash:34 },
  goliath:  { fac:'vanguard', kind:'unit', name:'Goliath', hp:380, size:15, speed:48, cost:270, time:15, dmg:26, range:185, cd:1.4, aggro:200, shot:'bullet' },
  artillery:{ fac:'vanguard', kind:'unit', name:'Artillery', hp:165, size:13, speed:42, cost:250, time:16, dmg:42, range:252, cd:3.3, aggro:120, shot:'shell', splash:66 },
  // Landship: a broadside landship. Its guns run the length of the hull, so
  // it can't just point-and-shoot — it must wheel side-on to a target (turnRate is
  // slow, so you visibly see it come about) before its heavy shells can fire at all.
  dreadnought:{ fac:'vanguard', kind:'unit', name:'Landship', hp:900, size:30, speed:32, cost:520, time:30, dmg:100, range:225, cd:2.8, aggro:240, shot:'shell', splash:50, broadside:true, turnRate:0.7 },

  // ----- MYRIAD SWARM -----
  hive:        { fac:'myriad', kind:'building', name:'Hive', hp:2100, size:44, core:true, creepR:11,
                 produces:['broodmother','ravager'],
                 grows:['tumor','spawnpit','spittermound','hunterden','spine','infestpit','corruptden','miasma','radar_myr','evochamber','broodnexus'],
                 spawns:'drone', spawnEvery:7,
                 // the swarm's active: erupt a corrupting spore-bloom that heavily corrupts
                 // (and rots) every enemy in a wide radius — corrupted foes that die burst
                 // into free Larva, so a well-placed Bloom snowballs a whole fight.
                 ability:{ key:'corrupt', name:'Corruption Bloom', range:2600, cd:40, radius:210, dmg:60, corruptDur:9,
                           desc:'Erupt a corrupting spore-bloom at a point in great range: every enemy caught is heavily CORRUPTED (deals less damage and slowly rots) and takes a burst of corrosion. Corrupted foes that die burst into free Larva.' } },
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
  // -- corruption wing: breeds free Larva, the corrupting elites, and a corruption tower --
  // `corrupt: N` makes a unit/tower's hits inflict N seconds of corruption (enemies deal
  // less damage and rot); every Myriad attack inflicts a base dose even without it.
  infestpit:   { fac:'myriad', kind:'building', name:'Infestation Pit', hp:360, size:21, cost:160, time:14, spawns:'larva', spawnEvery:4 },
  corruptden:  { fac:'myriad', kind:'building', name:'Corruption Den', hp:430, size:22, cost:220, time:16, produces:['corruptor','defiler','mawflyer'] },
  miasma:      { fac:'myriad', kind:'building', name:'Miasma Vent', hp:360, size:14, cost:140, time:11, dmg:9, range:175, cd:1.0, aggro:190, shot:'glob', corrupt:6 },
  larva:       { fac:'myriad', kind:'unit', name:'Larva', hp:35, size:6, speed:108, dmg:5, range:13, cd:0.6, aggro:170, shot:'melee', freeUnit:true },
  corruptor:   { fac:'myriad', kind:'unit', name:'Corruptor', hp:90, size:9, speed:80, cost:170, time:14, dmg:10, range:160, cd:1.3, aggro:205, shot:'glob', corrupt:8 },
  defiler:     { fac:'myriad', kind:'unit', name:'Defiler', hp:280, size:14, speed:60, cost:260, time:18, dmg:26, range:175, cd:2.2, aggro:205, shot:'glob', splash:46, corrupt:8 },
  mawflyer:    { fac:'myriad', kind:'unit', name:'Mawflyer', hp:120, size:10, speed:118, cost:160, time:11, dmg:12, range:120, cd:0.8, aggro:200, shot:'glob', corrupt:4 },

  // ----- SOLARI EXODUS -----
  // The Ark is a heavy gunship from the very first tier: a splashing main beam PLUS a
  // ring of point-defence guns (`aux`), both of which scale hard with its ascension —
  // by the top tiers it is a devastating walking fortress (see ARK_TIERS / auxGunsOf).
  ark:      { fac:'exodus', kind:'unit', name:'The Ark', hp:2300, shield:900, size:38, speed:34, core:true, stationary:true,
              dmg:16, range:185, cd:1.0, aggro:205, shot:'beam', splash:32, dropoff:true, researchLab:true, radarR:1300,
              aux:{ dmg:6, range:165, cd:0.4, shot:'bullet', guns:4 },
              produces:['collector','seeker','lancer','guardian','phoenix','templar','aegis','solarfrigate','sovereign'],
              // the Ark's signature active: a telegraphed orbital lance whose damage AND
              // blast SCALE with the Ark's ascension tier — modest early, apocalyptic once
              // fully ascended (out-damaging the Worldbreaker's Gustav Strike).
              ability:{ key:'solar', name:'Solar Lance', range:2600, cd:46, delay:1.8, dmg:175, splash:120,
                        desc:'Focus the Ark’s reactors into a lance of solar fire at any point in great range — its power GROWS with the Ark’s ascension. A telegraphed beam scorches a wide blast after a short delay.' } },
  collector:{ fac:'exodus', kind:'unit', name:'Collector', hp:70, shield:30, size:8, speed:84, cost:60, time:6, aggro:0, harvester:true },
  seeker:   { fac:'exodus', kind:'unit', name:'Seeker', hp:65, shield:45, size:8, speed:112, cost:120, time:9, dmg:10, range:55, cd:0.6, aggro:205, shot:'melee', blink:true },
  lancer:   { fac:'exodus', kind:'unit', name:'Lancer', hp:70, shield:55, size:9, speed:60, cost:220, time:14, dmg:30, range:235, cd:2.1, aggro:250, shot:'beam' },
  guardian: { fac:'exodus', kind:'unit', name:'Guardian', hp:120, shield:90, size:11, speed:72, cost:180, time:12, aggro:0, aura:150 },
  phoenix:  { fac:'exodus', kind:'unit', name:'Phoenix', hp:70, shield:50, size:9, speed:125, cost:150, time:10, dmg:8, range:110, cd:0.5, aggro:210, shot:'bullet' },
  templar:  { fac:'exodus', kind:'unit', name:'Templar', hp:80, shield:70, size:10, speed:65, cost:260, time:15, dmg:24, range:140, cd:2.4, aggro:200, shot:'shell', splash:55 },
  aegis:    { fac:'exodus', kind:'unit', name:'Aegis', hp:240, shield:180, size:14, speed:50, cost:300, time:16, dmg:26, range:60, cd:0.9, aggro:190, shot:'melee', splash:30 },
  // Solar Frigate: a second capital ship built straight from the Ark. Its batteries
  // run broadside — it must wheel side-on (slow turnRate) before it can fire.
  solarfrigate:{ fac:'exodus', kind:'unit', name:'Solar Frigate', hp:540, shield:360, size:28, speed:34, cost:480, time:26, dmg:82, range:225, cd:2.3, aggro:235, shot:'beam', splash:38, broadside:true, turnRate:0.75 },

  // ----- ASHEN CHOIR (death economy: Essence from every death; spirits decay off the
  //   lattice but lifesteal. NEW — REANIMATION: a share of every unit that falls anywhere
  //   rises again as a free Husk under the Choir; the Ossuary's DIRGE reaps a whole field) -----
  ossuary:   { fac:'choir', kind:'building', name:'Ossuary', hp:1900, size:42, core:true, produces:['wraith','banshee'],
               grows:['conduit','reliquary','spire','oracle','sepulchre','necropolis','dreadspire','radar_choir','charnel'],
               // the Choir's active: a death-nova at range — withers every enemy caught
               // (the slain then reanimate) and channels grave-cold into nearby spirits, mending them.
               ability:{ key:'dirge', name:'Dirge of the Damned', range:2400, cd:42, radius:215, dmg:70, heal:0.45,
                         desc:'Toll a death-knell at a point in great range: every enemy caught withers under a burst of grave-cold (the slain reanimate), and every Choir spirit in the radius is mended.' } },
  conduit:   { fac:'choir', kind:'building', name:'Soul Conduit', hp:160, size:11, cost:60, time:7 },
  reliquary: { fac:'choir', kind:'building', name:'Reliquary', hp:600, size:26, cost:180, time:16, produces:['revenant'] },
  spire:     { fac:'choir', kind:'building', name:'Mourning Spire', hp:450, size:14, cost:130, time:12, dmg:12, range:185, cd:1.0, aggro:205, shot:'beam' },
  wraith:    { fac:'choir', kind:'unit', name:'Wraith', hp:95, size:8, speed:105, cost:50, time:4, dmg:9, range:16, cd:0.55, aggro:185, shot:'melee' },
  banshee:   { fac:'choir', kind:'unit', name:'Banshee', hp:75, size:8, speed:70, cost:130, time:9, dmg:15, range:150, cd:1.3, aggro:195, shot:'beam' },
  revenant:  { fac:'choir', kind:'unit', name:'Revenant', hp:380, size:14, speed:58, cost:300, time:18, dmg:30, range:30, cd:1.6, aggro:190, shot:'melee', splash:40 },
  oracle:    { fac:'choir', kind:'building', name:'Bone Oracle', hp:480, size:22, cost:150, time:13, researchLab:true },
  lich:      { fac:'choir', kind:'unit', name:'Lich', hp:120, size:10, speed:64, cost:180, time:12, dmg:24, range:175, cd:1.6, aggro:210, shot:'beam' },
  // -- the undead host: free Husks risen from the dead, a Sepulchre that breeds more, a
  // Necropolis raising the elite undead (Lich, Harbinger, Gravewight, Nightgaunt), and a
  // Dread Spire whose grave-dread drags the living to a crawl --
  sepulchre: { fac:'choir', kind:'building', name:'Sepulchre', hp:400, size:21, cost:150, time:13, spawns:'husk', spawnEvery:5 },
  necropolis:{ fac:'choir', kind:'building', name:'Necropolis', hp:560, size:24, cost:230, time:16, produces:['lich','harbinger','gravewight','nightgaunt'] },
  dreadspire:{ fac:'choir', kind:'building', name:'Dread Spire', hp:420, size:15, cost:150, time:12, slowAura:340 },
  husk:      { fac:'choir', kind:'unit', name:'Husk', hp:55, size:7, speed:96, dmg:7, range:14, cd:0.65, aggro:175, shot:'melee', freeUnit:true },
  harbinger: { fac:'choir', kind:'unit', name:'Harbinger', hp:90, size:9, speed:62, cost:170, time:12, dmg:22, range:190, cd:1.5, aggro:215, shot:'beam' },
  gravewight:{ fac:'choir', kind:'unit', name:'Gravewight', hp:440, size:15, speed:60, cost:280, time:17, dmg:30, range:26, cd:1.4, aggro:185, shot:'melee', splash:42 },
  nightgaunt:{ fac:'choir', kind:'unit', name:'Nightgaunt', hp:120, size:10, speed:124, cost:150, time:10, dmg:13, range:130, cd:0.7, aggro:200, shot:'beam' },

  // ----- GILDED SYNDICATE -----
  // A mercantile cartel that wages war with money: instant-hire mercenaries, kill
  // bounties, severance insurance (a fallen merc refunds part of its hire price), and
  // gold that compounds. Production is now DISTRIBUTED — the Haven hires the core
  // mercs and air-drops reinforcements; the Mercenary Guild hires specialists; the
  // Bullion Vault fattens the treasury; the Gun Bastion anchors a hold.
  haven:         { fac:'syndicate', kind:'building', name:'The Haven', hp:1700, size:40, core:true, dmg:10, range:185, cd:0.8, aggro:205, shot:'bullet',
                   produces:['enforcer','arbalest','juggernaut','marauder'],
                   grows:['watchpost','gunbastion','countinghouse','vault','guild','blackmarket','radar_syn','exchange'],
                   ability:{ key:'reinforce', name:'Reinforcement Drop', range:4200, cd:42, delay:0, spawn:'enforcer', count:3,
                             desc:'Air-drop a squad of three Enforcers anywhere on the map (not into enemy territory). ~40s reload.' } },
  watchpost:     { fac:'syndicate', kind:'building', name:'Watchpost', hp:380, size:13, cost:140, time:6, dmg:8, range:175, cd:0.7, aggro:195, shot:'bullet', forward:true },
  // heavy splashing emplacement — the tanky backbone of a hold (the Watchpost is the cheap forward picket)
  gunbastion:    { fac:'syndicate', kind:'building', name:'Gun Bastion', hp:900, size:18, cost:220, time:10, dmg:24, range:225, cd:1.3, aggro:240, shot:'shell', splash:34 },
  countinghouse: { fac:'syndicate', kind:'building', name:'Countinghouse', hp:500, size:24, cost:200, time:8 },
  // Bullion Vault: a heavier treasury — a big interest-cap boost + steady rent
  vault:         { fac:'syndicate', kind:'building', name:'Bullion Vault', hp:620, size:24, cost:300, time:8 },
  // Mercenary Guild: hires the Syndicate's specialist mercs (distributed production)
  guild:         { fac:'syndicate', kind:'building', name:'Mercenary Guild', hp:560, size:24, cost:200, time:7, produces:['gunhand','dragoon','sawbones','ironhide','demolisher'] },
  enforcer:      { fac:'syndicate', kind:'unit', name:'Enforcer', hp:90, size:8, speed:80, cost:90, time:0.5, dmg:9, range:105, cd:0.75, aggro:180, shot:'bullet' },
  arbalest:      { fac:'syndicate', kind:'unit', name:'Arbalest', hp:60, size:8, speed:62, cost:160, time:0.5, dmg:26, range:225, cd:2.0, aggro:240, shot:'beam' },
  juggernaut:    { fac:'syndicate', kind:'unit', name:'Juggernaut', hp:320, size:14, speed:55, cost:320, time:0.5, dmg:30, range:150, cd:2.2, aggro:190, shot:'shell', splash:40 },
  blackmarket:   { fac:'syndicate', kind:'building', name:'Black Market', hp:520, size:24, cost:150, time:6, researchLab:true },
  marauder:      { fac:'syndicate', kind:'unit', name:'Marauder', hp:180, size:11, speed:74, cost:150, time:0.5, dmg:14, range:120, cd:0.9, aggro:185, shot:'glob', splash:20 },
  // -- specialist mercs (hired instantly from the Mercenary Guild) --
  gunhand:       { fac:'syndicate', kind:'unit', name:'Gun Hand', hp:110, size:9, speed:140, cost:80, time:0.5, dmg:9, range:95, cd:0.5, aggro:185, shot:'bullet' },
  dragoon:       { fac:'syndicate', kind:'unit', name:'Dragoon', hp:130, size:10, speed:122, cost:175, time:0.5, dmg:8, range:125, cd:0.4, aggro:200, shot:'bullet' },
  sawbones:      { fac:'syndicate', kind:'unit', name:'Sawbones', hp:80, size:9, speed:84, cost:120, time:0.5, aggro:0, aura:130, heal:7 },
  ironhide:      { fac:'syndicate', kind:'unit', name:'Ironhide', hp:560, size:15, speed:58, cost:240, time:0.5, dmg:24, range:30, cd:1.1, aggro:185, shot:'melee', splash:26 },
  demolisher:    { fac:'syndicate', kind:'unit', name:'Demolisher', hp:200, size:13, speed:48, cost:260, time:0.5, dmg:48, range:245, cd:3.0, aggro:120, shot:'shell', splash:64 },

  // ----- WARDEN COVENANT (fortress: Stone from building mass + Iron from Forges) -----
  // The deepest tech tree in the game. Tier 1 runs on Stone alone; the higher tiers
  // also burn Iron, which only Iron Forges produce. Crucially the Covenant tech is
  // DISTRIBUTED: advanced structures are raised from other advanced structures, not
  // all from the Keep — select a War College to place its halls, a War Foundry to
  // place siege works, a Grand Arsenal to raise the doomsday engines. The chain ends
  // at the Bulwark and, beyond even that, the world-ending Worldbreaker siege gun.
  keep:      { fac:'warden', kind:'building', name:'Bastion Keep', hp:2400, size:42, core:true, dmg:11, range:190, cd:0.9, aggro:210, shot:'bullet', produces:['sentinel','warden_g','pikeman'], grows:['rampart','bastion','quarry','forge','powdermill','cauldron','radar_war','foundry_w','college'] },
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

  // ----- EMBER NOMADS (war economy: Plunder from damage dealt to enemies. NEW —
  //   BURNING: every Ember attack ignites the foe with a fire DoT, and that burn damage
  //   ALSO pays Plunder, so the inferno funds the war. The Pyre's FIRESTORM razes a field) -----
  pyre:      { fac:'ember', kind:'building', name:'War Pyre', hp:1500, size:38, core:true, dmg:10, range:175, cd:0.65, aggro:205, shot:'bullet',
               produces:['raider','slinger','firebrand','warbeast','firewagon'],
               grows:['warcamp','totem','cinderpit','bonfire','radar_ember','warlodge','emberforge','greatpyre'],
               // the nomads' active: a roaring firestorm at range that ignites and burst-burns
               // every enemy caught — and burning foes keep paying Plunder as they cook.
               ability:{ key:'firestorm', name:'Firestorm', range:2400, cd:38, radius:205, dmg:55, burnDur:7,
                         desc:'Call down a roaring firestorm at a point in great range: every enemy caught is set ablaze (a lasting burn) and takes a burst of fire. Burning foes keep bleeding Plunder as they cook.' } },
  warcamp:   { fac:'ember', kind:'building', name:'War Camp', hp:560, size:24, cost:120, time:9, produces:['raider','slinger'] },
  totem:     { fac:'ember', kind:'building', name:'Blaze Totem', hp:380, size:13, cost:110, time:7, dmg:14, range:170, cd:0.75, aggro:195, shot:'glob' },
  raider:    { fac:'ember', kind:'unit', name:'Raider', hp:90, size:8, speed:130, cost:45, time:4, dmg:11, range:16, cd:0.55, aggro:190, shot:'melee' },
  slinger:   { fac:'ember', kind:'unit', name:'Slinger', hp:68, size:8, speed:104, cost:80, time:5, dmg:13, range:145, cd:0.85, aggro:200, shot:'glob' },
  firebrand: { fac:'ember', kind:'unit', name:'Firebrand', hp:125, size:9, speed:94, cost:150, time:8, dmg:22, range:125, cd:1.2, aggro:205, shot:'shell', splash:40 },
  warbeast:  { fac:'ember', kind:'unit', name:'War Beast', hp:360, size:15, speed:100, cost:280, time:13, dmg:30, range:20, cd:0.85, aggro:190, shot:'melee', splash:30 },
  warlodge:  { fac:'ember', kind:'building', name:'War Lodge', hp:520, size:22, cost:140, time:12, researchLab:true },
  firewagon: { fac:'ember', kind:'unit', name:'Fire Wagon', hp:205, size:13, speed:112, cost:160, time:9, dmg:20, range:95, cd:0.65, aggro:180, shot:'glob', splash:44 },
  // the Ember Foundry: a forward war-works that beats out the heavy warband — a
  // tanky frontline, long-range fire archers, siege catapults and a mending shaman
  emberforge:{ fac:'ember', kind:'building', name:'Ember Foundry', hp:680, size:24, cost:190, time:13, produces:['cinderguard','cinderbow','catapult','shaman','cinderdrake','magmaur'] },
  cinderguard:{ fac:'ember', kind:'unit', name:'Cinderguard', hp:480, size:14, speed:88, cost:180, time:11, dmg:22, range:22, cd:1.0, aggro:185, shot:'melee', splash:22 },
  cinderbow: { fac:'ember', kind:'unit', name:'Cinderbow', hp:80, size:8, speed:94, cost:110, time:7, dmg:20, range:180, cd:1.1, aggro:205, shot:'glob' },
  catapult:  { fac:'ember', kind:'unit', name:'Cinder Catapult', hp:220, size:14, speed:66, cost:240, time:15, dmg:64, range:255, cd:3.0, aggro:275, shot:'shell', splash:62 },
  shaman:    { fac:'ember', kind:'unit', name:'Flame Shaman', hp:130, size:9, speed:98, cost:130, time:8, aggro:0, aura:140, heal:7 },
  // -- the burning host: a Cinder Pit breeding free Emberlings, a Bonfire that ignites
  // what it splashes, the fire-breathing Cinder Drake (the nomads' first air) and the
  // Molten Brute Magmaur. `burn: N` makes a unit/tower's hits set an N-second blaze --
  cinderpit: { fac:'ember', kind:'building', name:'Cinder Pit', hp:380, size:21, cost:150, time:13, spawns:'emberling', spawnEvery:5 },
  bonfire:   { fac:'ember', kind:'building', name:'Bonfire', hp:400, size:14, cost:140, time:11, dmg:13, range:170, cd:0.9, aggro:190, shot:'glob', splash:34, burn:5 },
  emberling: { fac:'ember', kind:'unit', name:'Emberling', hp:42, size:6, speed:128, dmg:6, range:13, cd:0.55, aggro:175, shot:'melee', freeUnit:true, burn:3 },
  cinderdrake:{ fac:'ember', kind:'unit', name:'Cinder Drake', hp:150, size:11, speed:120, cost:200, time:12, dmg:16, range:130, cd:0.85, aggro:205, shot:'glob', splash:30, burn:5 },
  magmaur:   { fac:'ember', kind:'unit', name:'Magmaur', hp:520, size:16, speed:72, cost:300, time:16, dmg:32, range:22, cd:1.0, aggro:185, shot:'melee', splash:34, burn:6 },

  // ----- VERDANT BLOOM (a 3-harvest garden: Sap from Blooms, Pollen from Pollen
  //   Spires, Loam from Mulch Beds; the grandest plants & beasts demand a MIX) -----
  // Build menu is split across buildings so no card overflows (see ui.js cap):
  // Heartwood = whole army + core economy; Grove = defences + Heartwood Sapling;
  // Arboretum = the three Grafts, the Erdtree and the apex Heart Grove.
  heart:     { fac:'verdant', kind:'building', name:'Heartwood', hp:2100, size:44, core:true, produces:['thornling','treant','ancient','bramblehorn','sporecaller'], grows:['bloom','petalspire','mulchbed','grove','radar_verd','arboretum'], spawns:'sapling', spawnEvery:8 },
  bloom:     { fac:'verdant', kind:'building', name:'Bloom', hp:300, size:18, cost:90, time:14 },
  petalspire:{ fac:'verdant', kind:'building', name:'Pollen Spire', hp:300, size:16, cost:110, time:12, ironPerSec:0.9 },
  mulchbed:  { fac:'verdant', kind:'building', name:'Mulch Bed', hp:360, size:19, cost:120, time:12, powderPerSec:0.7 },
  grove:     { fac:'verdant', kind:'building', name:'Grove', hp:430, size:22, cost:170, time:16, spawns:'sapling', spawnEvery:6, grows:['bramble','thornwall','sporevent','sporebloss','fertpod','greatroot','heartsap'] },
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
  arboretum: { fac:'verdant', kind:'building', name:'Arboretum', hp:480, size:22, cost:150, time:14, researchLab:true, grows:['graft_necro','graft_moon','graft_wild','erdtree','heartgrove'] },
  ancient:   { fac:'verdant', kind:'unit', name:'Ancient', hp:720, size:20, speed:40, cost:360, cost2:45, cost3:25, time:24, dmg:36, range:30, cd:1.6, aggro:185, shot:'melee', splash:46 },
  // -- heavier beasts of the garden: a charging bruiser and a long-range spore-thrower,
  // both gated behind the Arboretum so they arrive as a real mid/late power spike --
  bramblehorn:{ fac:'verdant', kind:'unit', name:'Bramblehorn', hp:1100, size:19, speed:50, cost:360, cost2:40, cost3:20, time:22, dmg:50, range:30, cd:1.5, aggro:190, shot:'melee', splash:48 },
  sporecaller:{ fac:'verdant', kind:'unit', name:'Spore Caller', hp:320, size:14, speed:42, cost:300, cost2:50, time:18, dmg:38, range:255, cd:2.3, aggro:275, shot:'glob', splash:50 },

  // ----- STORMFORGE DYNASTY (escalating industry: income ramps with game time) -----
  reactor:   { fac:'stormforge', kind:'building', name:'Storm Reactor', hp:2000, size:42, core:true, dmg:13, range:185, cd:1.0, aggro:205, shot:'beam', produces:['arclight','galvan','voltaic','gladius'], grows:['dynamo','pylon','tesla','radar_storm','foundry_s','stormlab','arcfoundry'] },
  dynamo:    { fac:'stormforge', kind:'building', name:'Dynamo', hp:520, size:22, cost:200, time:12 },
  pylon:     { fac:'stormforge', kind:'building', name:'Charge Pylon', hp:460, size:16, cost:170, time:12, aura:155, shieldHeal:24, heal:3 },
  tesla:     { fac:'stormforge', kind:'building', name:'Tesla Coil', hp:420, size:14, cost:160, time:10, dmg:18, range:200, cd:1.1, aggro:210, shot:'beam' },
  foundry_s: { fac:'stormforge', kind:'building', name:'Foundry', hp:820, size:30, cost:260, time:20, produces:['colossus','stormcruiser'] },
  arclight:  { fac:'stormforge', kind:'unit', name:'Arclight', hp:100, shield:50, size:9, speed:118, cost:110, time:8, dmg:11, range:118, cd:0.4, aggro:205, shot:'bullet' },
  galvan:    { fac:'stormforge', kind:'unit', name:'Galvan', hp:190, shield:150, size:12, speed:92, cost:180, time:11, dmg:20, range:66, cd:0.7, aggro:185, shot:'beam', splash:24 },
  voltaic:   { fac:'stormforge', kind:'unit', name:'Voltaic', hp:90, shield:75, size:9, speed:62, cost:210, time:13, dmg:36, range:235, cd:2.0, aggro:250, shot:'beam' },
  colossus:  { fac:'stormforge', kind:'unit', name:'Colossus', hp:560, shield:210, size:18, speed:48, cost:420, time:24, dmg:46, range:180, cd:2.3, aggro:205, shot:'shell', splash:58 },
  stormlab:  { fac:'stormforge', kind:'building', name:'Research Bay', hp:520, size:22, cost:150, time:14, researchLab:true },
  gladius:   { fac:'stormforge', kind:'unit', name:'Gladius', hp:220, shield:110, size:13, speed:72, cost:230, time:14, dmg:25, range:135, cd:1.0, aggro:200, shot:'shell', splash:26 },
  // Storm Cruiser: a shielded broadside battlecruiser — its arc-cannons run along
  // the hull, so it must wheel side-on (slow turnRate) before it can fire at all.
  stormcruiser:{ fac:'stormforge', kind:'unit', name:'Storm Cruiser', hp:600, shield:400, size:29, speed:28, cost:500, time:28, dmg:88, range:220, cd:2.5, aggro:235, shot:'beam', splash:42, broadside:true, turnRate:0.7 },

  // ----- OBSIDIAN PACT (martyrdom: Blood from your OWN units dying. NEW — BLOOD FRENZY:
  //   every Pact unit that falls whips the horde around it into a frenzy (harder, faster
  //   blows), so its own dying makes the rest deadlier. The Altar's CRIMSON RITE bleeds a
  //   field of foes and enrages the swarm) -----
  altar:     { fac:'pact', kind:'building', name:'Blood Altar', hp:1800, size:40, core:true, dmg:9, range:165, cd:0.9, aggro:195, shot:'glob',
               produces:['thrall','flayer','zealot','behemoth','cultist'],
               grows:['shrine','spike','bloodtower','fleshvats','radar_pact','sanctum','grandaltar'],
               // the Pact's active: a blood-rite at range that ruptures every enemy caught
               // (a burst of damage) and sends every nearby Pact unit into a killing frenzy.
               ability:{ key:'rite', name:'Crimson Rite', range:2300, cd:40, radius:200, dmg:60, frenzyDur:6,
                         desc:'Work a blood-rite at a point in great range: every enemy caught ruptures for a burst of damage, and every Pact unit nearby is whipped into a frenzy — striking harder and faster.' } },
  shrine:    { fac:'pact', kind:'building', name:'Bone Shrine', hp:420, size:22, cost:120, time:9, spawns:'thrall', spawnEvery:5 },
  spike:     { fac:'pact', kind:'building', name:'Blood Spike', hp:340, size:13, cost:110, time:7, dmg:13, range:168, cd:0.85, aggro:190, shot:'glob' },
  thrall:    { fac:'pact', kind:'unit', name:'Thrall', hp:46, size:7, speed:104, cost:30, time:3, dmg:7, range:14, cd:0.6, aggro:185, shot:'melee' },
  zealot:    { fac:'pact', kind:'unit', name:'Zealot', hp:110, size:9, speed:88, cost:110, time:6, dmg:15, range:18, cd:0.8, aggro:185, shot:'melee' },
  behemoth:  { fac:'pact', kind:'unit', name:'Behemoth', hp:560, size:18, speed:50, cost:340, time:18, dmg:34, range:24, cd:1.4, aggro:185, shot:'melee', splash:40 },
  sanctum:   { fac:'pact', kind:'building', name:'Blood Sanctum', hp:520, size:22, cost:130, time:12, researchLab:true },
  cultist:   { fac:'pact', kind:'unit', name:'Cultist', hp:60, size:8, speed:92, cost:70, time:5, dmg:13, range:130, cd:1.0, aggro:190, shot:'glob' },
  // -- the blood host: the Flesh Vats raising the elite horrors (frenzied Flayer, horde-
  // healing Blood Priest, heavy Abomination, winged Gargoyle) and a Hemorrhage Spire that
  // throws clotting blood-bolts — a heavier wall-gun than the cheap Blood Spike --
  fleshvats: { fac:'pact', kind:'building', name:'Flesh Vats', hp:560, size:24, cost:200, time:15, produces:['bloodpriest','abomination','gargoyle'] },
  bloodtower:{ fac:'pact', kind:'building', name:'Hemorrhage Spire', hp:520, size:15, cost:160, time:11, dmg:24, range:195, cd:1.2, aggro:205, shot:'glob', splash:30 },
  flayer:    { fac:'pact', kind:'unit', name:'Flayer', hp:95, size:8, speed:128, cost:80, time:5, dmg:14, range:16, cd:0.55, aggro:190, shot:'melee' },
  bloodpriest:{ fac:'pact', kind:'unit', name:'Blood Priest', hp:90, size:9, speed:84, cost:130, time:8, aggro:0, aura:140, heal:7 },
  abomination:{ fac:'pact', kind:'unit', name:'Abomination', hp:600, size:17, speed:58, cost:300, time:16, dmg:30, range:24, cd:1.2, aggro:185, shot:'melee', splash:40 },
  gargoyle:  { fac:'pact', kind:'unit', name:'Gargoyle', hp:130, size:10, speed:122, cost:150, time:10, dmg:13, range:125, cd:0.75, aggro:200, shot:'glob' },

  // ----- THE VIRULENT STRAIN (evolution: mostly weak, dirt-cheap spam. ADAPTATION is
  //   now an active pipeline, not a passive perk: an unarmed GENE SAMPLER must stand
  //   near the fighting to collect a sample of the damage type your units are enduring,
  //   then carry it home and deposit it in an ASSIMILATION CHAMBER — every unit that
  //   chamber breeds afterwards PERMANENTLY resists that damage type (see evoMitigate/
  //   depositSample in sim.js). Depositing a different sample swaps the chamber's
  //   active strain; the Dual Genome tech lets it hold two at once. Every point of
  //   damage a Strain unit ENDURES also pays Genome, so throwing chaff into the
  //   grinder funds the next wave — a masochistic economy that mirrors the Ember's
  //   damage-DEALT Plunder, but inverted.) -----
  progenitor: { fac:'strain', kind:'building', name:'The Progenitor', hp:1750, size:40, core:true,
                dmg:9, range:160, cd:0.85, aggro:190, shot:'glob',
                produces:['spawnling','biter','lurker','sampler'],
                grows:['cyst','vat','genewell','spawnwell','assimchamber','nest','mutaworks','barb','genlab','radar_strain','genmaw'],
                // the Strain's active: instantly harden every nearby unit against ALL
                // damage for a few seconds — a burst of mass adaptation, not attrition.
                ability:{ key:'surge', name:'Adaptive Surge', range:2200, cd:38, radius:220, dur:6,
                          desc:'Trigger a mass adaptation at a point in great range: every Strain unit caught instantly hardens a strong, temporary resistance to ALL damage for a few seconds.' } },
  cyst:      { fac:'strain', kind:'building', name:'Marrow Cyst', hp:130, size:10, cost:50, time:7 },
  vat:       { fac:'strain', kind:'building', name:'Gene Vat', hp:420, size:22, cost:170, time:12 },
  genewell:  { fac:'strain', kind:'building', name:'Genewell', hp:380, size:16, cost:140, time:10 },
  spawnwell: { fac:'strain', kind:'building', name:'Spawning Well', hp:370, size:21, cost:150, time:13, spawns:'whelp', spawnEvery:5 },
  // -- the ADAPTATION pipeline: the Gene Sampler is an unarmed collector that must
  // stand near the fighting (within collectR of a Strain unit being hit) to fill a
  // sample of the enemy's damage type; carried home to an Assimilation Chamber, the
  // deposit sets that chamber's active strain — every unit the chamber breeds from
  // then on PERMANENTLY resists that type. A new deposit swaps the strain out
  // (Dual Genome research lets the chamber hold two at once). --
  sampler:   { fac:'strain', kind:'unit', name:'Gene Sampler', hp:110, size:9, speed:96, cost:90, time:8, aggro:0, collector:true, collectR:210 },
  assimchamber: { fac:'strain', kind:'building', name:'Assimilation Chamber', hp:560, size:23, cost:200, time:15,
                  spawns:'whelp', spawnEvery:6, produces:['spawnling','biter','stinger','lasher'] },
  nest:      { fac:'strain', kind:'building', name:'Feeding Nest', hp:520, size:22, cost:170, time:13, produces:['stinger','lasher'] },
  barb:      { fac:'strain', kind:'building', name:'Barb Node', hp:370, size:13, cost:110, time:8, dmg:12, range:172, cd:0.85, aggro:190, shot:'glob' },
  genlab:    { fac:'strain', kind:'building', name:'Mutagen Vault', hp:500, size:22, cost:150, time:13, researchLab:true },
  mutaworks: { fac:'strain', kind:'building', name:'Mutagen Works', hp:680, size:24, cost:200, time:14, produces:['brute','bloater','drifter','mender'] },
  spawnling: { fac:'strain', kind:'unit', name:'Spawnling', hp:40, size:6, speed:105, cost:26, time:3, dmg:6, range:13, cd:0.55, aggro:170, shot:'melee' },
  biter:     { fac:'strain', kind:'unit', name:'Biter', hp:75, size:8, speed:92, cost:58, time:5, dmg:12, range:15, cd:0.7, aggro:182, shot:'melee' },
  lurker:    { fac:'strain', kind:'unit', name:'Lurker', hp:56, size:8, speed:80, cost:65, time:5, dmg:10, range:135, cd:1.0, aggro:190, shot:'glob' },
  whelp:     { fac:'strain', kind:'unit', name:'Whelp', hp:30, size:6, speed:108, dmg:5, range:12, cd:0.6, aggro:165, shot:'melee', freeUnit:true },
  stinger:   { fac:'strain', kind:'unit', name:'Stinger', hp:72, size:8, speed:112, cost:85, time:6, dmg:9, range:110, cd:0.5, aggro:185, shot:'bullet' },
  lasher:    { fac:'strain', kind:'unit', name:'Lasher', hp:82, size:9, speed:70, cost:120, time:8, dmg:20, range:172, cd:1.4, aggro:200, shot:'beam' },
  brute:     { fac:'strain', kind:'unit', name:'Brute', hp:340, size:15, speed:60, cost:220, time:13, dmg:26, range:24, cd:1.2, aggro:185, shot:'melee', splash:32 },
  bloater:   { fac:'strain', kind:'unit', name:'Bloater', hp:200, size:14, speed:44, cost:260, time:16, dmg:46, range:230, cd:3.0, aggro:250, shot:'shell', splash:56 },
  drifter:   { fac:'strain', kind:'unit', name:'Drifter', hp:90, size:9, speed:118, cost:140, time:9, dmg:14, range:120, cd:0.75, aggro:200, shot:'glob' },
  mender:    { fac:'strain', kind:'unit', name:'Mender', hp:60, size:8, speed:85, cost:90, time:6, aggro:0, aura:130, heal:6 },

  // ===== APEX TECH: each faction's late-game super-structure + titan =====
  // Gated behind deep tech (a top-tier production building / research lab) AND the
  // Offense capstone (Siege Ordnance, *_ord), and ruinously expensive — the payoff
  // for teching all game instead of just spamming cheap bodies. `apex:true` gives
  // them a glowing marker; several carry an `aux` machine-gun ring like the Bulwark.
  // (The Warden already has its own apex pair: the Castellan + the Bulwark.)

  // THE VANGUARD — a walking dreadnought: siege cannon + four autocannon turrets
  dominion:  { fac:'vanguard', kind:'building', name:'Dominion Yard', hp:1100, size:32, cost:600, time:30, apex:true, produces:['leviathan','ratte'] },
  leviathan: { fac:'vanguard', kind:'unit', name:'Leviathan', hp:1500, size:22, speed:40, cost:700, time:36, apex:true,
               dmg:60, range:235, cd:3.0, aggro:245, shot:'shell', splash:80,
               aux:{ dmg:11, range:150, cd:0.3, shot:'bullet', guns:4 } },
  // THE RATTE — a super-heavy landcruiser in the spirit of the Landkreuzer P. 1000: an
  // entire mobile fortress on treads, dwarfing every other unit in the game. A colossal
  // investment even by apex standards, but it hits like a siege battery that walks.
  ratte:     { fac:'vanguard', kind:'unit', name:'The Ratte', hp:5000, size:42, speed:20, cost:2400, time:85, apex:true,
               dmg:180, range:280, cd:4.0, aggro:300, shot:'shell', splash:130,
               aux:{ dmg:22, range:210, cd:0.5, shot:'bullet', guns:8 } },

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
  titan:     { fac:'ember', kind:'unit', name:'Ash Titan', hp:1500, size:21, speed:82, cost:600, time:30, apex:true,
               dmg:42, range:125, cd:0.85, aggro:210, shot:'glob', splash:64,
               aux:{ dmg:12, range:135, cd:0.3, shot:'glob', guns:4 } },

  // VERDANT BLOOM — a world-tree: titanic HP, splashing blows, heals the garden
  heartgrove:{ fac:'verdant', kind:'building', name:'Heart Grove', hp:1250, size:28, cost:520, cost2:60, cost3:40, time:18, apex:true, spawns:'sapling', spawnEvery:5, produces:['eldertree'] },
  eldertree: { fac:'verdant', kind:'unit', name:'Eldertree', hp:1900, size:24, speed:36, cost:700, cost2:90, cost3:60, time:38, apex:true,
               dmg:40, range:32, cd:1.6, aggro:190, shot:'melee', splash:62, aura:170, heal:7 },

  // STORMFORGE DYNASTY — a storm titan: heavy shields, long beam + four arc turrets
  arcfoundry:{ fac:'stormforge', kind:'building', name:'Grand Foundry', hp:1000, size:30, cost:580, time:22, apex:true, produces:['tempest'] },
  tempest:   { fac:'stormforge', kind:'unit', name:'Storm Titan', hp:1200, shield:650, size:23, speed:46, cost:780, time:38, apex:true,
               dmg:48, range:235, cd:2.1, aggro:245, shot:'beam', splash:54,
               aux:{ dmg:13, range:165, cd:0.3, shot:'beam', guns:4 } },

  // OBSIDIAN PACT — an avatar of slaughter that births Thralls and heals the horde
  grandaltar:{ fac:'pact', kind:'building', name:'Grand Altar', hp:1000, size:28, cost:500, time:14, apex:true, spawns:'thrall', spawnEvery:4, produces:['bloodavatar'] },
  bloodavatar:{ fac:'pact', kind:'unit', name:'Blood Avatar', hp:1600, size:22, speed:52, cost:600, time:32, apex:true,
               dmg:48, range:26, cd:1.4, aggro:190, shot:'melee', splash:55, aura:150, heal:6 },

  // THE VIRULENT STRAIN — the perfected organism: already adapted to everything
  genmaw:    { fac:'strain', kind:'building', name:'The Genesis Maw', hp:1000, size:28, cost:520, time:16, apex:true, produces:['genhorror','genabomination'] },
  genhorror: { fac:'strain', kind:'unit', name:'Genesis Horror', hp:1550, size:22, speed:54, cost:620, time:32, apex:true,
               dmg:44, range:28, cd:1.3, aggro:195, shot:'melee', splash:58 },
  // THE GENESIS ABOMINATION — a colossal fusion of over-adapted biomass, the Strain's
  // ultimate endgame answer: everything the Genesis Horror is, grown to a scale that
  // should not be able to move and somehow still does.
  genabomination: { fac:'strain', kind:'unit', name:'The Genesis Abomination', hp:4500, size:40, speed:28, cost:2200, time:80, apex:true,
               dmg:150, range:36, cd:1.7, aggro:210, shot:'melee', splash:130 },

  // ===== RADAR / SENSORS =====
  // Every faction can raise a cheap sensor building that DETECTS enemy movement at long
  // range (`radarR`) — but only as imprecise "contacts" (fuzzy, cell-quantised blips), never
  // the clear line-of-sight your units and buildings give. Early warning, not a clear
  // picture: you learn that something hostile is out there, roughly where, but not what or
  // exactly how many. (The base-less Solari Exodus has no buildings, so its radar is built
  // into the Ark — see the `ark` def.) Stats are identical across factions; only the name
  // and look differ. No weapon: a sensor, not a turret.
  radar_van:   { fac:'vanguard',  kind:'building', name:'Radar Station',  hp:360, size:14, cost:130, time:11, radarR:1100 },
  radar_myr:   { fac:'myriad',    kind:'building', name:'Sensory Pod',    hp:360, size:14, cost:130, time:11, radarR:1100 },
  radar_choir: { fac:'choir',     kind:'building', name:'Augury Spire',   hp:360, size:14, cost:130, time:11, radarR:1100 },
  radar_syn:   { fac:'syndicate', kind:'building', name:'Listening Post', hp:360, size:14, cost:130, time:11, radarR:1100 },
  radar_war:   { fac:'warden',    kind:'building', name:'Signal Tower',   hp:420, size:14, cost:130, time:11, radarR:1100 },
  radar_ember: { fac:'ember',     kind:'building', name:'Watchfire',      hp:360, size:14, cost:130, time:11, radarR:1100 },
  radar_verd:  { fac:'verdant',   kind:'building', name:'Pollen Sensor',  hp:360, size:14, cost:130, time:11, radarR:1100 },
  radar_storm: { fac:'stormforge',kind:'building', name:'Sensor Array',   hp:360, size:14, cost:130, time:11, radarR:1100 },
  radar_pact:  { fac:'pact',      kind:'building', name:'Scrying Pool',   hp:360, size:14, cost:130, time:11, radarR:1100 },
  radar_strain:{ fac:'strain',    kind:'building', name:'Pheromone Node', hp:360, size:14, cost:130, time:11, radarR:1100 },

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
  // Wellspring: an indestructible font of raw potential scattered across the map. It
  // can't be captured by standing on it — each faction must raise its own economy
  // structure beside it (or, for the Myriad, blanket it in creep) to HARNESS it for a
  // surge of its primary resource. The whole point is to pull every faction out of its
  // corner and onto the map (the turtling Warden, fittingly, can't harness them at all).
  wellspring:    { fac:'neutral', kind:'building', name:'Wellspring', hp:1, size:20, noTarget:true, wellspring:true },
};

// Per-thing flavour + tech tree. `desc` shows on hover; `req` is a building that
// must be finished before this can be built/produced (the faction's tech gate).
const META = {
  // THE VANGUARD
  hq:        { desc: 'Your core. Workers drop off crystal here, and it trains more Workers. Lose it and you lose.' },
  worker:    { desc: 'Cheap harvester and builder. Auto-mines crystal; select one to construct buildings.' },
  depot:     { desc: 'Forward logistics hub: a Worker drop-off that raises your unit cap. Build them out toward distant crystal nodes (and beside Wellsprings) so your Workers haul from far afield without the long trek home — your reach across the map, not a way to mint crystal in place.' },
  barracks:  { desc: 'Infantry school — trains Marines, Rocketeers, Snipers and Medics.' },
  factory:   { desc: 'Heavy vehicle bay. Builds Outriders, Siege Tanks, Hellhounds, Goliaths and Artillery.', req: 'barracks' },
  airfield:  { desc: 'Aircraft hangar. Builds Gunships and Vulture Bombers.', req: 'factory' },
  turret:    { desc: 'Static defensive gun. Cheap base protection.' },
  pillbox:   { desc: 'Armoured strongpoint: a tough, longer-range emplacement with a splashing shell. The backbone of a dug-in defensive line.' },
  marine:    { desc: 'Cheap, reliable rifle infantry. The backbone of any push.' },
  rocket:    { desc: 'Rocket infantry: out-ranges Marines and hits far harder per shot. Your answer to armour, buildings and aircraft.' },
  sniper:    { desc: 'Fragile long-range specialist with heavy single-target damage.' },
  medic:     { desc: 'Non-combat support; continuously heals nearby friendly units.' },
  outrider:  { desc: 'Fast, cheap recon buggy. Scouts the map, runs down stragglers and raids enemy workers. Flimsy in a stand-up fight.' },
  tank:      { desc: 'Slow siege vehicle with a splashing cannon. Anti-armour and anti-clump.' },
  gunship:   { desc: 'Fast flyer with rapid fire. Excellent for raids and mop-up.' },
  bomber:    { desc: 'Fast bombing aircraft that drops a heavy splashing payload — devastating against clumped troops and buildings. Slow to reload.' },
  artillery: { desc: 'Long-range mobile gun with a huge splash. Out-ranges almost everything, but fragile and helpless up close — screen it with armour.', req: 'techlab' },
  dreadnought:{ desc: 'A colossal armoured landship: broadside shells run the length of the hull, so it wheels toward a target’s beam before it can fire — but it never has to stop to do it, cruising and firing in the same breath once lined up. Massive HP, huge splash. Screen its flanks; it can’t answer a foe that stays off its beam.' },
  // MYRIAD SWARM
  hive:      { desc: 'Your core. Spreads creep, spawns free Drones, grows every structure — and casts CORRUPTION BLOOM: a wide spore-burst that heavily corrupts enemies (and bursts the corrupted dead into free Larva). Every Myriad attack already inflicts a base dose of corruption.' },
  tumor:     { desc: 'Cheap creep spreader; extends your economy and where you can build.' },
  spawnpit:  { desc: 'Breeds Drones endlessly, for free.' },
  spittermound:{ desc: 'Breeds ranged Spitters endlessly, for free.', req: 'spawnpit' },
  hunterden: { desc: 'Breeds fast Hunters endlessly, for free.', req: 'spawnpit' },
  spine:     { desc: 'Static acid turret. Creep defence.' },
  drone:     { desc: 'Free melee swarm unit. Weak alone, lethal in numbers. Heals on creep.' },
  spitter:   { desc: 'Free ranged unit that spits acid.' },
  hunter:    { desc: 'Free fast melee striker that runs units down.' },
  broodmother:{ desc: 'Elite splashing bruiser bred from the Hive.', req: 'hunterden' },
  // -- corruption wing --
  infestpit: { desc: 'Breeds free Larva endlessly — fast, expendable corrupting chaff (kept on a separate cap from the main swarm).' },
  corruptden:{ desc: 'Breeds the corruption elites: ranged Corruptors, siege Defilers and flying Mawflyers. Gate to the swarm’s corrosive arm.', req: 'evochamber' },
  miasma:    { desc: 'Static corruption tower — its acid bolts heavily CORRUPT what they hit, weakening attackers at your creep edge.' },
  larva:     { desc: 'Free, tiny, very fast melee chaff. Bred by the Infestation Pit and burst from corrupted enemy corpses. Corrupts on hit; heals on creep.' },
  corruptor: { desc: 'Ranged spore-caster whose globs inflict heavy, lasting CORRUPTION — wither the enemy army before it ever reaches your swarm.', req: 'corruptden' },
  defiler:   { desc: 'Heavy bile-beast: long-range corrosive splash that both sieges and deeply CORRUPTS clumped foes. Your turtle-breaker.', req: 'corruptden' },
  mawflyer:  { desc: 'Fast flying acid-spitter — the swarm’s air. Raids, chases flyers and corrupts what it bites.', req: 'corruptden' },
  // SOLARI EXODUS
  ark:       { desc: 'Your mobile core — fortress, factory and treasury in one. A heavy gunship from tier 1: a splashing main beam PLUS a ring of point-defence guns. Deploy on a crystal node to siphon, or park it (or Collectors) beside a Wellspring to harness it. ASCEND it up eight tiers: each costs more but adds huge HP, shields, more guns, bigger splash and reach — at the top tiers a roaming superweapon (surpassing the Worldbreaker) with a devastating Solar Lance. It also carries the pilgrimage’s long-range RADAR, sensing distant enemies as imprecise contacts (the base-less Exodus’ answer to a sensor building). Lose it and all is lost.' },
  collector: { desc: 'Harvester that mines crystal and hauls it back to the Ark. Build more to scale your economy.' },
  seeker:    { desc: 'Cheap shielded skirmisher that blinks onto its target.' },
  lancer:    { desc: 'Long-range beam unit; fragile but deals heavy damage.' },
  guardian:  { desc: 'Support unit; projects a shield-and-heal aura over nearby allies.' },
  phoenix:   { desc: 'Fast shielded flyer with rapid fire.' },
  templar:   { desc: 'Elite shielded warrior with a splashing siege shell.' },
  // ASHEN CHOIR
  ossuary:   { desc: 'Your core. Raises Wraiths and Banshees, anchors the lattice, and tolls the DIRGE — a death-nova that withers a whole army (the slain reanimate) and mends nearby spirits. A share of every unit that dies anywhere already rises as a free Husk for you.' },
  conduit:   { desc: 'Extends your lattice (build range) and trickles Essence.' },
  reliquary: { desc: 'Raises elite Revenants.' },
  spire:     { desc: 'Static beam tower. Lattice defence.', req: 'conduit' },
  wraith:    { desc: 'Cheap fast melee spirit. Fades away from the lattice — heals by dealing damage.' },
  banshee:   { desc: 'Ranged spirit with a piercing beam.' },
  revenant:  { desc: 'Elite splashing melee horror raised in the Reliquary.' },
  sepulchre: { desc: 'Breeds free Husks endlessly — risen chaff that fades off the lattice (kept on its own separate cap, like the dead the Choir already raises across the map).' },
  necropolis:{ desc: 'Raises the elite undead: the caster Lich, the long-range Harbinger, the heavy Gravewight and the flying Nightgaunt. Gate to the Choir’s deathless host.', req: 'oracle' },
  dreadspire:{ desc: 'Static spire that exudes the dread of the grave — every enemy unit in a wide radius is dragged to a crawl. No attack; pure terror to slow a push.', req: 'conduit' },
  husk:      { desc: 'Free risen corpse — weak melee chaff that fades off the lattice but heals by dealing damage. Rises from the dead across the map and from Sepulchres.' },
  harbinger: { desc: 'Long-range death-caster: a withering beam with heavy single-target damage. Fragile — keep it back.', req: 'necropolis' },
  gravewight:{ desc: 'Heavy undead bruiser — a wall of grave-cold HP that cleaves with splashing blows. The Necropolis’ front line.', req: 'necropolis' },
  nightgaunt:{ desc: 'Fast flying wraith — the Choir’s air. Raids, chases stragglers and lashes from afar with a cold beam.', req: 'necropolis' },
  // GILDED SYNDICATE
  haven:     { desc: 'Your core and treasury. Earns compound interest, hires mercenaries instantly, and can air-drop a free squad of Enforcers anywhere on the map (Reinforcement Drop). Fallen mercs refund part of their hire price (severance).' },
  watchpost: { desc: 'Air-dropped static gun. Project control across the map — but not into enemy territory. Harnesses a Wellspring if dropped beside one.' },
  gunbastion:{ desc: 'Heavy splashing gun emplacement — the tanky backbone of a Syndicate hold (the Watchpost is the cheap forward picket). Must connect to your base.' },
  countinghouse:{ desc: 'Raises your interest cap and pays rent. Bank more gold, earn faster.' },
  vault:     { desc: 'A heavier treasury — a big lift to your interest cap plus steady rent. Stack Vaults and Countinghouses so a deep treasury compounds fast (the biggest caps still come from holding Obelisks & Wellsprings).' },
  guild:     { desc: 'Mercenary Guild — hires the Syndicate’s specialist mercs instantly: fast Gun Hands, aerial Dragoons, mending Sawbones, armoured Ironhides and long-range Demolishers.' },
  enforcer:  { desc: 'Cheap instant mercenary with a sidearm.' },
  arbalest:  { desc: 'Long-range marksman merc with heavy damage.', req: 'countinghouse' },
  juggernaut:{ desc: 'Heavy splashing mercenary bruiser.', req: 'countinghouse' },
  gunhand:   { desc: 'Fast, cheap instant-hire raider. Scouts the map, runs down stragglers and harasses enemy economy. Flimsy in a stand-up fight.', req: 'guild' },
  dragoon:   { desc: 'Fast aerial gunner-for-hire with rapid fire. Excellent for raids, chasing flyers and mop-up.', req: 'guild' },
  sawbones:  { desc: 'Field-surgeon merc; continuously heals nearby mercenaries so your hires keep fighting. Non-combat.', req: 'guild' },
  ironhide:  { desc: 'Heavily armoured brawler — a wall of HP that soaks fire so your costlier mercs survive to do the work.', req: 'guild' },
  demolisher:{ desc: 'Slow long-range siege merc with a huge splashing shell. Out-ranges turrets and shreds clumps — your turtle-breaker. Fragile up close; screen it.', req: 'guild' },
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
  citadel:   { desc: 'A doomsday fortress: a huge long-range siege cannon ringed by four machine-guns, on enormous HP. The anchor of an impenetrable base.', reqs:['foundry_w','college','bunker','redoubt','arsenal'], reqResearch:'warden_wpn2' },
  worldbreaker: { desc: 'The ultimate structure — longest passive range in the game, plus the active GUSTAV STRIKE: nuke any point across most of the map (~1-min reload). Needs an Arsenal, a Bulwark, and Siege Ordnance.', reqs:['arsenal','citadel'], reqResearch:'warden_ord' },
  // EMBER NOMADS
  pyre:      { desc: 'Your core. Musters the whole warband and calls the FIRESTORM — a roaring blaze that ignites and burst-burns a whole army. Every Ember attack already sets foes alight, and burn damage pays Plunder. Plunder from combat funds it all.' },
  warcamp:   { desc: 'Forward muster point; trains Raiders and Slingers and unlocks heavier warriors.' },
  cinderpit: { desc: 'Breeds free Emberlings endlessly — fast little fire-imps that ignite what they bite (kept on their own separate cap).' },
  bonfire:   { desc: 'Static fire-tower: lobs blazing pitch that splashes AND sets everything it touches ablaze. Anchors a burning kill-zone.' },
  emberling: { desc: 'Free, tiny, very fast melee fire-imp. Weak alone, but every bite ignites the foe. Bred by the Cinder Pit.' },
  cinderdrake:{ desc: 'Fire-breathing drake — the nomads’ first air. Fast splashing fire-glob that ignites; raids, chases flyers and softens clumps.', req: 'emberforge' },
  magmaur:   { desc: 'Molten brute — a fast, heavy melee bruiser whose blazing blows splash and deeply burn. Bowls through a line and leaves it cooking.', req: 'emberforge' },
  totem:     { desc: 'Static fire turret. Cheap defence.' },
  raider:    { desc: 'Dirt-cheap, very fast melee raider.' },
  slinger:   { desc: 'Fast ranged skirmisher.' },
  firebrand: { desc: 'Splashing molotov thrower.', req: 'warcamp' },
  warbeast:  { desc: 'Fast heavy charger that bowls through lines.', req: 'warcamp' },
  emberforge:{ desc: 'War-works for the heavy warband: the Cinderguard, Cinderbow, Cinder Catapult and Flame Shaman.' },
  cinderguard:{ desc: 'Tough armoured brawler — a tanky front wall that soaks fire so your raiders survive to plunder.', req: 'emberforge' },
  cinderbow: { desc: 'Long-range fire-archer with serious single-target damage. Out-ranges most foes.', req: 'emberforge' },
  catapult:  { desc: 'Slow siege engine flinging blazing rocks — huge range and splash to break turtles and turrets.', req: 'emberforge' },
  shaman:    { desc: 'Support that mends the warband with an embered healing aura. Keeps your fragile raiders fighting.', req: 'emberforge' },
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
  altar:     { desc: 'Your core. Summons Thralls, Zealots and Behemoths and works the CRIMSON RITE — a blood-rite that ruptures a field of foes and sends the nearby horde into a frenzy. Your fallen units pay Blood and whip the survivors into a frenzy as they die.' },
  shrine:    { desc: 'Spawns free Thralls and lets the Altar raise greater horrors.' },
  spike:     { desc: 'Static blood turret. Cheap defence.' },
  thrall:    { desc: 'Dirt-cheap, expendable melee body. Its death spills Blood — and frenzies the horde around it.' },
  zealot:    { desc: 'Tougher melee fanatic.', req: 'shrine' },
  behemoth:  { desc: 'Massive splashing horror raised from spilled Blood.', req: 'shrine' },
  fleshvats: { desc: 'Raises the elite horrors: the horde-healing Blood Priest, the heavy Abomination and the winged Gargoyle. Gate to the Pact’s deadliest summonings.', req: 'sanctum' },
  bloodtower:{ desc: 'Static blood-cannon — clotting bolts that splash. A heavier, longer-range wall-gun than the cheap Blood Spike.', req: 'shrine' },
  flayer:    { desc: 'Dirt-cheap, very fast frenzied striker — flings itself into the grinder. Its death spills Blood and frenzies the horde.' },
  bloodpriest:{ desc: 'The Pact’s only healer — bleeds its own life into an aura that mends the horde around it, so your summonings keep fighting. Non-combat.', req: 'fleshvats' },
  abomination:{ desc: 'Stitched horror — a heavy splashing bruiser, tougher than a Behemoth-in-waiting and cheaper to mass. The Vats’ front line.', req: 'fleshvats' },
  gargoyle:  { desc: 'Winged blood-fiend — the Pact’s air. Fast, lashes from afar, and runs down stragglers and flyers.', req: 'fleshvats' },
  // THE VIRULENT STRAIN
  progenitor:{ desc: 'Your core. Musters the base Spawnling/Biter/Lurker line plus the Gene Sampler, and works ADAPTIVE SURGE — instantly hardening every nearby unit against ALL damage for a few seconds. Every point of damage your units endure already pays Genome.' },
  cyst:      { desc: 'Cheap networked outgrowth. Extends your build range toward distant ground.' },
  vat:       { desc: 'Mints a small, steady trickle of Genome. Stack a few for a base income floor.' },
  genewell:  { desc: 'Harnesses a Wellspring for a heavy flow of Genome. Build it within range of an unclaimed font.' },
  spawnwell: { desc: 'Breeds free Whelps endlessly, for free — cheap chaff that costs nothing but still bleeds Genome when it’s hit.' },
  sampler:   { desc: 'Unarmed collector — the key to ADAPTATION. Stand it near the fighting: as your units endure one damage type it fills a gene sample of it. Carry the locked sample home to an Assimilation Chamber to set that chamber’s strain.' },
  assimchamber: { desc: 'The heart of ADAPTATION. Deposit a Gene Sampler’s locked sample here and every unit this chamber breeds from then on PERMANENTLY resists that damage type. A new deposit swaps the strain; Dual Genome research lets it hold two.', reqs: ['spawnwell'] },
  nest:      { desc: 'Feeding Nest — trains ranged Stingers and the piercing beam-Lasher.' },
  barb:      { desc: 'Static defensive spore-turret. Cheap base protection.' },
  genlab:    { desc: 'Research building. Refines the Strain’s mutations and upgrades.' },
  mutaworks: { desc: 'War-works for the heavier line: the tanky Brute, siege Bloater, flying Drifter and the healing Mender. Gate to the Strain’s heavier mutations.', req: 'genlab' },
  spawnling: { desc: 'The cheapest body in any war — dirt-cheap melee chaff. Spam these; every hit they soak pays Genome and edges them toward adapting.' },
  biter:     { desc: 'Slightly tougher melee striker. Still meant to be thrown away in numbers.' },
  lurker:    { desc: 'Cheap ranged spore-lobber. Softens a line from range while the melee chaff soaks hits.' },
  whelp:     { desc: 'Free, tiny, very fast melee body. Bred by the Spawning Well — never costs Genome, but its wounds still feed the treasury.' },
  stinger:   { desc: 'Fast-firing ranged skirmisher.', req: 'nest' },
  lasher:    { desc: 'Ranged beam-caster with real single-target bite. Out-ranges most early chaff.', req: 'nest' },
  brute:     { desc: 'Heavy splashing melee bruiser — the line that tanks and adapts.', req: 'mutaworks' },
  bloater:   { desc: 'Lumbering siege beast that lobs a heavy, splashing shell from extreme range. Fragile up close — screen it.', req: 'mutaworks' },
  drifter:   { desc: 'Fast flying spore-slinger — the Strain’s air. Raids, chases flyers and softens clumps.', req: 'mutaworks' },
  mender:    { desc: 'Non-combat support; continuously heals nearby Strain units so the adapted survivors keep fighting.', req: 'mutaworks' },
  // NEW UNITS & BUILDINGS
  techlab:   { desc: 'Research building. Develops the Vanguard’s weapon & armour upgrades.' },
  flametank: { desc: 'Fast short-range tank that hoses a cone of fire — devastating against clumped infantry.' },
  goliath:   { desc: 'Heavy walker with a long-range autocannon. Durable all-rounder; anchors a push.' },
  evochamber:{ desc: 'Research building grown on creep. Evolves the swarm’s upgrades.' },
  ravager:   { desc: 'Bred ranged elite that lobs corrosive splash. Needs a Hunter Den.', req: 'hunterden' },
  aegis:     { desc: 'Heavily shielded Solari bruiser. Soaks fire and crushes what it reaches.' },
  solarfrigate:{ desc: 'A towering second capital ship, built straight from the Ark. Its batteries run broadside — it wheels its heading to bring them to bear, firing on the move once lined up rather than stopping dead. Heavily shielded and imposing; escort it against anything that can dash past its flanks.' },
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
  stormcruiser:{ desc: 'A towering shielded battlecruiser whose arc-cannons run broadside — it wheels to bring them to bear and keeps firing on the move once aligned, rather than stopping dead. Slow and massive, but devastating.' },
  sanctum:   { desc: 'Research building. Channels the Pact’s rites & upgrades.' },
  cultist:   { desc: 'Cheap ranged zealot — the Pact’s only ranged body. Spits hexes from afar.' },
  // APEX TECH — late-game super-structures + titans (each gated on Siege Ordnance)
  dominion:  { desc: 'Vanguard apex yard. Builds the Leviathan and The Ratte. Needs an Airfield and Tech Lab.', reqs:['airfield','techlab'] },
  leviathan: { desc: 'Walking dreadnought — siege cannon + four autocannons on heavy armour. Needs Siege Ordnance.', reqResearch:'vanguard_ord' },
  ratte:     { desc: 'A super-heavy landcruiser the size of a fortress — twin main guns plus an eight-barrel autocannon battery. Absurdly expensive, absurdly strong. Needs Siege Ordnance.', reqResearch:'vanguard_ord' },
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
  genmaw:    { desc: 'Strain apex maw. Births the Genesis Horror and The Genesis Abomination. Needs a Mutagen Works and Mutagen Vault.', reqs:['mutaworks','genlab'] },
  genhorror: { desc: 'The perfected organism — a splashing melee horror, already adapting like the rest of the Strain. Needs Siege Ordnance.', reqResearch:'strain_ord' },
  genabomination: { desc: 'A city-block of fused, over-adapted biomass — the Strain\'s ultimate endgame horror. Colossal HP and a splash bite that levels squads. Needs Siege Ordnance.', reqResearch:'strain_ord' },
  // RADAR / SENSORS — long-range early warning, but only imprecise "contacts" (fuzzy
  // blips), never the clear picture line-of-sight gives. Build them forward to watch the
  // approaches; a contact tells you something hostile is out there, roughly where — not what.
  radar_van:   { desc: 'Radar Station — sweeps a wide area far beyond your line of sight and paints approaching enemies as imprecise contacts (fuzzy blips) on the map & minimap. Early warning, not a clear view — only true line of sight shows the real units.' },
  radar_myr:   { desc: 'Sensory Pod — a living organ that feels enemy movement far across the map, surfacing it as imprecise contacts (fuzzy blips). Early warning, not a clear view — only true line of sight shows the real units.' },
  radar_choir: { desc: 'Augury Spire — the dead whisper of the living moving far off, marking them as imprecise contacts (fuzzy blips). Early warning, not a clear view — only true line of sight shows the real units.' },
  radar_syn:   { desc: 'Listening Post — a paid network of eyes and ears that reports enemy movement far afield as imprecise contacts (fuzzy blips). Early warning, not a clear view — only true line of sight shows the real units.' },
  radar_war:   { desc: 'Signal Tower — a far-seeing watchtower that flags enemy movement well beyond the walls as imprecise contacts (fuzzy blips). Early warning, not a clear view — only true line of sight shows the real units. (The one map intel the walled Covenant can muster.)' },
  radar_ember: { desc: 'Watchfire — scouts read the smoke from afar, marking enemy movement as imprecise contacts (fuzzy blips). Early warning, not a clear view — only true line of sight shows the real units.' },
  radar_verd:  { desc: 'Pollen Sensor — a drifting pollen-haze that senses enemies moving far across the map as imprecise contacts (fuzzy blips). Early warning, not a clear view — only true line of sight shows the real units.' },
  radar_storm: { desc: 'Sensor Array — sweeps a wide field and paints distant enemy movement as imprecise contacts (fuzzy blips). Early warning, not a clear view — only true line of sight shows the real units.' },
  radar_pact:  { desc: 'Scrying Pool — blood-divination glimpses enemies moving far off, marking them as imprecise contacts (fuzzy blips). Early warning, not a clear view — only true line of sight shows the real units.' },
  radar_strain:{ desc: 'Pheromone Node — scent-trails read enemy movement far across the map, surfacing it as imprecise contacts (fuzzy blips). Early warning, not a clear view — only true line of sight shows the real units.' },
  // NEUTRAL
  obelisk:   { desc: 'Neutral capture point. Hold units nearby to claim it for steady income.' },
  hoard:     { desc: 'Guarded neutral treasure tower. Destroy it for a one-time bounty.' },
  cache:     { desc: 'Lightly-guarded neutral supply cache. Crack it open for a small bounty.' },
  munitions: { desc: 'A heavily-guarded neutral strongpoint holding a hoard of munitions. Crack it for a big bounty — and a cache of Powder if you are the Warden.' },
  wellspring:{ desc: 'A font of raw potential. You cannot capture it by standing on it — HARNESS it by raising your own economy structure beside it (Vanguard Supply Depot · Choir Soul Conduit · Syndicate Watchpost · Ember War Camp · Verdant Bloom · Stormforge Dynamo · Pact Bone Shrine), by covering it in creep (Myriad), or by parking Collectors / the Ark beside it (Solari Exodus). Each harnessed Wellspring pours out your primary resource — and a Verdant font grows a thriving ecosystem that buffs nearby plants & beasts. March out and hold them; the Warden alone cannot tap them.' },
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
const NETWORKED = { vanguard: 1, warden: 1, syndicate: 1, ember: 1, verdant: 1, stormforge: 1, pact: 1, strain: 1 };
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

// Myriad CORRUPTION. Every Myriad attack inflicts a timed corruption debuff on the
// enemy it hits (`baseDur`); units/towers with a `corrupt` stat inflict their own,
// longer dose. A corrupted enemy deals less damage (`dmgMul`), is slowed (`slowMul`)
// and slowly rots (`dps`). When a corrupted enemy UNIT dies, the swarm bursts free
// Larva from the corpse (`larvaBurst`, bounded by the free-Larva cap) — infestation.
const CORRUPT = {
  baseDur: 3.0, dmgMul: 0.8, slowMul: 0.85, dps: 5, larvaBurst: 2,
};

// Ashen Choir REANIMATION. A share (`chance`) of every non-Choir unit that dies
// ANYWHERE on the map rises again as a free Husk under the Choir's command — bounded
// by the free-Husk cap (the same separate cap Sepulchres breed into). Death literally
// swells the deathless host, on top of paying Essence.
const REANIM = { chance: 0.33 };

// Ember Nomads BURNING. Every Ember attack ignites the foe it strikes for `baseDur`
// seconds; units/towers with a `burn` stat set a longer blaze. A burning enemy takes a
// fire DoT (`dps`) — and because Plunder is paid on damage dealt, that burn keeps paying
// out as the foe cooks (credited in tickBurning). Applies to enemy units & buildings.
const BURN = { baseDur: 3.0, dps: 6 };

// Obsidian Pact BLOOD FRENZY. When a Pact unit dies, every friendly Pact unit within
// `frenzyR` is whipped into a frenzy for `dur` seconds — striking harder (`frenzyDmg`)
// and faster (`frenzyCd`, a cooldown multiplier). Read live in dmgOf / cdOf.
const PACT = { frenzyR: 150, dur: 5, frenzyDmg: 1.30, frenzyCd: 0.78 };

// ---------------- facing / turning ----------------
// Every unit has a `facing` (radians) that turns toward its movement heading (or,
// stationary, toward whatever it's shooting at) at a bounded rate — see
// turnToward/angleDiff in sim.js. `def.turnRate` overrides the default per unit
// (the broadside "landships" turn much slower, so you visibly see them wheel about).
const TURN_RATE = 5.0;          // rad/s — most units snap to a new heading briskly
// Broadside units (`def.broadside:true`) mount their guns along the hull's sides:
// they can only fire when a target lies within BROADSIDE_ARC of directly abeam
// (90°/270° off the nose) — see engage() in sim.js. Forces them to wheel side-on
// before they can shoot, the whole point of a "ship" unit on a battlefield.
const BROADSIDE_ARC = 0.32;     // radians of tolerance either side of exactly abeam

// The Virulent Strain's ADAPTATION — an active pipeline, no longer automatic.
// 1) A GENE SAMPLER must stand near the fighting: whenever a Strain unit within its
//    collectR endures damage, the sampler tallies it by damage TYPE (the attacker's
//    `shot`). Once one type's tally crosses `sampleNeed` the sampler LOCKS a sample
//    of that type and stops collecting.
// 2) Walk the loaded sampler back to an ASSIMILATION CHAMBER: the sample deposits
//    automatically on contact and becomes the chamber's active strain.
// 3) Every unit that chamber breeds (its queue AND its free Whelps) from then on
//    PERMANENTLY carries a `resist` reduction against that type — the unit keeps it
//    for life, even if the chamber's strain is later swapped by a new deposit.
//    The Dual Genome research (strain_dual) lets a chamber hold TWO strains at once;
//    its units then resist both.
// Adaptive Surge (the Progenitor's active) still grants a brief, no-strings
// resistance to everything. Getting hit also pays Genome (`lootPerDmg` of damage
// endured) — the masochistic mirror of the Ember's damage-DEALT Plunder.
const EVO = { sampleNeed: 400, resist: 0.45, lootPerDmg: 0.35, surgeResist: 0.6 };
const SHOT_TYPES = ['melee', 'bullet', 'beam', 'glob', 'shell'];
const EVO_COLOR = { melee: '#e0574d', bullet: '#e0c94d', beam: '#4dc7e0', glob: '#7de04d', shell: '#b06de0' };

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

// Strain-only extra node: lets the Assimilation Chamber hold a SECOND active strain,
// so the units it breeds carry two permanent resistances at once. No stat multiplier —
// its effect is read at deposit time (see depositSample in sim.js). Sits in a fifth
// Defense-row column of the Strain's tech tree (the grid sizes itself to fit).
RESEARCH.strain_dual = {
  fac: 'strain', rid: 'strain_dual', key: 'dual', branch: 1, tier: 4,
  name: 'Dual Genome', cost: 340, time: 44, req: 'strain_arm2',
  desc: 'Assimilation Chambers can hold a SECOND active strain — units they breed permanently resist BOTH deposited damage types.',
};
RESEARCH_BY_FAC.strain.push('strain_dual');

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
// ---- Solari Exodus: the Ark ascension ladder ----
// Buying an upgrade raises the Ark's tier (stored on the player), which scales its
// size, HP, shields and firepower (statMul drives damage, range AND the Solar Lance
// ability) — and the model is redrawn larger and more imposing at each step. Tier 0
// mirrors the base `ark` definition. The final tiers turn the Ark into a roaming
// SUPERWEAPON whose stats and Solar Lance surpass even the Warden's Worldbreaker —
// but the cost climbs viciously (the last leap alone outprices the Worldbreaker),
// so a fully-ascended Ark is a long, hard-won, win-the-game investment.
const ARK_TIERS = [
  { size: 38,  hp: 2300,  shield: 900,   statMul: 1.0 },
  { size: 48,  hp: 3400,  shield: 1400,  statMul: 1.3 },
  { size: 60,  hp: 4900,  shield: 2100,  statMul: 1.65 },
  { size: 74,  hp: 6800,  shield: 3000,  statMul: 2.05 },
  { size: 88,  hp: 9500,  shield: 4200,  statMul: 2.6 },   // Empyrean — eclipses the Worldbreaker's HP
  { size: 104, hp: 13000, shield: 5800,  statMul: 3.3 },   // Sunforged
  { size: 122, hp: 18000, shield: 8000,  statMul: 4.2 },   // Dawnbringer
  { size: 144, hp: 25000, shield: 11000, statMul: 5.2 },   // Solar Apotheosis — a walking sun
];
const ARK_UPGRADES = [
  { name: 'Reinforced Ark', cost: 600,   desc: 'Forge-plate the hull and over-charge the reactors: far more HP, shields, firepower and reach. The Ark visibly grows.' },
  { name: 'Radiant Ark',    cost: 1500,  desc: 'Bind the pilgrimage’s light into the chassis: another leap in durability and power, and the Ark looms larger.' },
  { name: 'Ascendant Ark',  cost: 3200,  desc: 'The Ark ascends into a walking cathedral-fortress — colossal, radiant and devastating.' },
  { name: 'Empyrean Ark',   cost: 5500,  desc: 'Open the empyrean conduits: the hull swells past any fortress in the war and the Solar Lance burns hotter.' },
  { name: 'Sunforged Ark',  cost: 8500,  desc: 'Reforge the chassis in captured starfire — staggering durability and a Lance that levels armies.' },
  { name: 'Dawnbringer Ark',cost: 13000, desc: 'The Ark becomes a herald of the dawn: titanic HP and shields, and reach and firepower few can answer.' },
  { name: 'Solar Apotheosis',cost: 20000, desc: 'APOTHEOSIS — the Ark ascends into a walking sun. Its hull, weapons and Solar Lance surpass every other engine of war, the Worldbreaker included. The single most expensive ascension in the game; the price of godhood.' },
];
function arkTierData(fac) { const p = game.players[fac]; return ARK_TIERS[Math.min((p && p.arkTier) || 0, ARK_TIERS.length - 1)]; }
function baseHp(e)      { return e.type === 'ark' ? arkTierData(e.fac).hp : e.def.hp; }
function baseShield(e)  { return e.type === 'ark' ? arkTierData(e.fac).shield : (e.def.shield || 0); }
function baseSize(e)    { return e.type === 'ark' ? arkTierData(e.fac).size : e.def.size; }
function arkStatMul(e)  { return e.type === 'ark' ? arkTierData(e.fac).statMul : 1; }
// how many aux point-defence guns an entity fields. The Ark grows its ring as it
// ascends (4 → 8), so a maxed Ark bristles with guns; others use their fixed `aux.guns`.
function auxGunsOf(e) {
  if (!e.def.aux) return 0;
  if (e.type === 'ark') return Math.min(8, 4 + Math.ceil((((game.players[e.fac] || {}).arkTier) || 0) / 2));
  return e.def.aux.guns || 1;
}

// effective stats of an entity, with its owner's researched upgrades applied.
// (damage/range/cooldown/splash apply to buildings too; speed/cap only to units.)
function dmgOf(e) {
  const pl = game.players[e.fac];
  let m = arkStatMul(e);
  if (e.def.kind === 'unit' && pl) m *= pl.dmgMul;
  if (e.fertUntil > game.t) m *= VERD.fertDmg;                                  // Fertiliser Pod
  if (e.necroStacks) m *= 1 + Math.min(e.necroStacks, VERD.necroMaxStacks) * VERD.necroStackDmg; // Necrotic Graft
  if (e.mutated) m *= VERD.mutDmg;                                              // Wildgrowth mutation
  if (e.corruptUntil > game.t) m *= CORRUPT.dmgMul;                            // Myriad corruption: weakened
  if (e.frenzyUntil > game.t) m *= PACT.frenzyDmg;                             // Pact blood frenzy: enraged
  return e.def.dmg * m;
}
function spd(e) {
  const p = game.players[e.fac];
  let m = (p && p.speedMul) || 1;
  if (p && p.gMoon) m *= VERD.moonSpeed;          // Moonsign Graft: haste
  if (e.mutated) m *= VERD.mutSpeed;
  if (e.corruptUntil > game.t) m *= CORRUPT.slowMul; // Myriad corruption: sluggish
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
  if (e.frenzyUntil > game.t) m *= PACT.frenzyCd; // Pact blood frenzy: faster attacks
  return e.def.cd * m;
}
function splashOf(e) { const p = game.players[e.fac]; return (e.def.splash || 0) * ((p && p.splashMul) || 1) * arkStatMul(e); }
function capOf(fac) {
  const p = game.players[fac];
  let bonus = (p && p.capBonus) || 0;
  // standing buildings with a capBonus (the Vanguard's Supply Depots) raise the cap
  for (const e of game.entities)
    if (!e.dead && e.fac === fac && e.def.capBonus && !e.constructing) bonus += e.def.capBonus;
  return FACTIONS[fac].cap + bonus;
}
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
// DESIGN: no faction (bar the turtling Warden) may scale forever from a corner. Every
// home economy is hard-CAPPED — it plateaus at a low ceiling that's enough to defend and
// keep a modest army going, but never enough to win. Real scaling comes from holding
// CONTESTED MAP TERRITORY (crystal nodes, captured Obelisks, harnessed Wellsprings), so
// the game is a fight over ground, not a race to turtle then all-in. Each faction reaches
// for territory in its own way (see tickEconomy + WELL).
const ECON = {
  workerCarry: 10, workerMine: 2.0,
  // myriad: biomass per creep tile, but the tile income PLATEAUS at myriadCapTiles — a
  // home creep-blob maxes out fast, so to grow you must creep OUT over Wellsprings/ground.
  myriadBase: 2.0, myriadPerTile: 0.012, myriadCapTiles: 480,
  // exodus: a small base trickle + a strong Ark siphon on a crystal node. The nomads now
  // also HARNESS Wellsprings (park Collectors/the Ark beside a font — see WELL.income.exodus)
  // and earn a bonus on every Obelisk, so the pilgrimage scales by ranging and holding the map.
  exodusBase: 2.0, exodusSiphon: 6.0, exodusObeliskBonus: 1.6,
  // choir: a small lattice trickle that PLATEAUS at choirConduitCap conduits, plus a cut
  // of every death on the map — so the Choir scales by fighting, not by stacking conduits.
  choirBase: 1.8, choirConduit: 0.8, choirConduitCap: 5, choirDeathFlat: 5, choirDeathPct: 0.06,
  choirDecay: 1.5, choirFloor: 0.35, choirSustain: 3, choirLeech: 0.7, choirLattice: 270,
  // syndicate: compound interest on the treasury — but the interest CAP is now driven by
  // TERRITORY (each held Obelisk/Wellspring raises it a lot; Countinghouses only a little),
  // so a bank in a corner stalls at synCapBase. Kills still pay bounties.
  synBase: 2.5, synInterest: 0.011, synCapBase: 700, synCapPer: 150, synCapTerritory: 650,
  synHouseFlat: 0.4, synBountyFlat: 10, synBountyPct: 0.06,
  // Bullion Vault: a heavier home-treasury piece — a big interest-cap boost + flat rent
  synVaultCap: 500, synVaultFlat: 1.0,
  // severance insurance: when a Syndicate merc dies, this fraction of its gold cost is
  // refunded to the treasury — smoothing the instant-hire churn and rewarding trading
  synSeverance: 0.25,
  // no building (turret, wall, anything) may be placed within this radius of an enemy structure
  enemyKeepout: 300,
  // warden: THE exception — self-sufficient by design. Income scales with the total HP of
  // standing buildings plus a trickle per Stone Quarry, so the walled brotherhood needn't
  // march out. (Powder still wants map control for the doomsday tech.)
  wardenBase: 1.0, wardenPerHp: 0.0011, wardenQuarry: 1.8,
  // warden's third resource: Powder. Minted slowly at Powder Mills and, crucially,
  // trickled by every Obelisk the Covenant holds — so the doomsday tech demands map control.
  wardenObeliskPowder: 0.3,
  // ember: Plunder earned per point of damage dealt to enemies, plus a small trickle —
  // a warband that isn't out fighting over the map simply starves.
  emberBase: 1.6, emberLootPerDmg: 0.45,
  // verdant: Sap per mature Bloom, PLATEAUING at verdantBloomCap — a home garden caps out.
  // The scarce Pollen & Loam (and bonus Sap, plus an ecosystem buff) come from harnessed
  // Wellsprings, so the diverse late-game garden DEMANDS holding fertile ground.
  verdantBase: 1.2, verdantPerBloom: 1.6, verdantBloomCap: 6,
  verdantFontPollen: 0.8, verdantFontLoam: 0.6,
  // stormforge: the engine that accelerates — but no longer just by waiting. Home Dynamo
  // output is flat and PLATEAUS at stormDynamoCap; the acceleration now lives on the map:
  // each harnessed Storm Font (Wellspring) ramps its payout the longer you hold it.
  stormBase: 2.4, stormPerDynamo: 1.4, stormDynamoCap: 7, stormFontRamp: 0.0032,
  // pact: Blood gained when your OWN units die (flat + a share of their max HP) — there is
  // no passive home income to speak of, so the Pact must throw itself into the fight.
  pactBase: 1.0, pactMartyrFlat: 6, pactMartyrPct: 0.10,
  // strain: a small flat trickle + a Gene Vat flat rate, PLATEAUING at strainVatCap — the
  // real economy is masochistic (see EVO.lootPerDmg in applyDamage): every point of damage
  // a Strain unit endures pays Genome, so the swarm profits from being attacked.
  strainBase: 1.6, strainPerVat: 1.2, strainVatCap: 6,
  // neutral capture points pay their holder a steady income. With home economies now
  // capped, captured Obelisks (and harnessed Wellsprings) ARE the economy — the dominant,
  // uncapped way to scale, so the whole match is a fight over the map's ground.
  obeliskIncome: 3.4,
};

// ---- Wellsprings: the dominant, uncapped map economy ----
// With home economies hard-capped (see ECON), harnessed Wellsprings are HOW you scale —
// not a little bonus, the main event. Each faction harnesses a font by raising its
// designated econ structure within HARNESS_R of it (the Myriad instead blankets it in
// creep; the nomadic Solari Exodus parks Collectors/the Ark beside it), and is paid a
// hefty flow of its primary resource. The lone exception is the turtling Warden Covenant —
// a secretive, walled brotherhood — which cannot tap Wellsprings at all.
const WELL = {
  harnessR: 215,        // how close your harness structure must be to claim a font
  verdBuffR: 230,       // radius of the Verdant ecosystem buff around a harnessed font
  // the structure each faction raises to harness a Wellspring (myriad = creep coverage)
  harness: {
    vanguard: 'depot', choir: 'conduit', syndicate: 'watchpost',
    ember: 'warcamp', verdant: 'bloom', stormforge: 'dynamo', pact: 'shrine', strain: 'genewell',
  },
  // primary-resource income per harnessed font — large, because this IS your scaling now
  // (the Stormforge's fonts additionally ramp with how long they're held; the Verdant's
  // also pour Pollen + Loam and grow an ecosystem buff — see tickEconomy)
  income: {
    vanguard: 5.5, myriad: 5.2, choir: 5.0, syndicate: 5.5,
    ember: 4.6, verdant: 4.2, stormforge: 5.0, pact: 5.0, exodus: 6.0, strain: 4.8,
  },
  defaultIncome: 5.0,
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

