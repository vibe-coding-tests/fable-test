// ============================================================
// All global tunables. The sim reads Dota-baseline numbers from
// data and scales them through here. Rebalance centrally.
// ============================================================
export const TUNING = {
  // --- simulation ---
  tickRate: 30,
  dt: 1 / 30,
  maxSimTicksPerFrame: 5,
  scaleCeilings: {
    overworldUnits: 100,
    raidUnits: 120,
    summons: 24,
    illusions: 16
  },

  // --- global scales (Dota numbers are the baseline) ---
  rangeScale: 1.0,
  speedScale: 1.0,
  damageScale: 1.0,
  cooldownScale: 0.8,        // action-RPG pacing: slightly faster cds than Dota
  manaCostScale: 0.9,

  // --- attributes (Dota-flavored) ---
  hpPerStr: 22,
  hpRegenPerStr: 0.1,
  manaPerInt: 12,
  manaRegenPerInt: 0.05,
  armorPerAgi: 1 / 6,
  attackSpeedPerAgi: 1,
  damagePerPrimary: 1,
  universalDamagePerStat: 0.45,
  baseHp: 120,
  baseMana: 75,
  baseMagicResist: 25,

  // --- combat ---
  armorFactor: 0.06,
  attackFacingDeg: 24,        // must roughly face target to attack
  turnRateToRadPerSec: 15,    // dota turnRate 0.6 -> 9 rad/s
  meleeRangeBuffer: 32,
  projectileHitRadius: 48,
  attackDamageVariance: 0.08, // +-8%
  attackMoveAcquireRadius: 850,
  attackMovePathWidth: 260,
  aiAutoAcquireRadius: 650,
  creepThinkTicks: 5,
  gambitThinkTicks: 5,
  bossThinkTicks: 4,
  applyBossArmorTier: true,
  cleaveIgnoresArmor: false,

  // --- AI brain (AI_OVERHAUL): utility scorer + team-mind + threat ---
  ai: {
    rangedThreshold: 350,       // attackRange >= this counts as ranged (kiting, backline)
    castScoreFloor: 0.55,       // a scored cast must clear this to beat attacking
    saveAllyHpPct: 0.55,        // an ally below this is a save/heal candidate
    dangerNorm: 420,            // dangerousScore that maps to ~1.0 priority
    teamFocusReassessTicks: 10, // recompute the shared team focus this often
    focusStickiness: 1.18,      // a challenger must beat the held focus score by this to flip it
    engageRangeMult: 1.25,      // initiator engages once the shared focus is this * castRange away
    bossAiDepth: 0.5,           // default boss-brain opportunism (A6 dials this per tier)
    manaFloorPct: 0.18,
    manaConservationWeight: 0.5,
    holdClusterMin: 2,
    itemIntentFallback: true,
    // --- GAMEPLAY 2.0 §5.4: scorer/heuristic constants pulled out of the AI files
    // so a balance pass is a data edit, not a code edit. Values match the prior inline numbers.
    casterBias: 120,            // a ready-to-cast enemy reads this much more dangerous
    heroBias: 150,              // heroes outweigh creeps in danger/focus scoring
    lowHpPenalty: 80,           // a near-dead enemy is discounted as a threat
    clusterRadius: 360,         // AoE cluster sampling radius (scorer + boss brain + gambit)
    zoneEscapeMargin: 180,      // step this far past a hostile zone edge when dodging
    kiteCloseFrac: 0.7,         // kite when the focus is within this fraction of kiteDistance
    kiteStepBonus: 120,         // extra step past the kite distance when repositioning
    kiteActionMin: 320,         // gambit `kite` action default min distance
    kiteActionMax: 900,         // gambit `kite` action default max distance
    kiteActionRangeFrac: 0.85,  // gambit `kite` default distance = attackRange × this
    kiteActionStepBonus: 160,   // gambit `kite` extra step past the desired distance
    retreatArriveDist: 100,     // gambit `retreat` counts as arrived within this of home
    peelDiveRadius: 520,        // gambit `peel` action: an ally is "dived" if an enemy is this close
    comboWindowSec: 4,          // default combo follow-up window
    comboWeight: 1.25,          // default combo score multiplier
    ultHoldDiscount: 0.45,      // AoE-ult discount slope below holdClusterMin (scaled by depth)
    ultHoldFloor: 0.4,          // ult-hold never discounts an ult below this multiplier
    depthRefAiDepth: 0.45,      // baseline (normal-tier) depth for depth-scaled behaviors
    // §5.7: how strongly extra ai-depth past the baseline sharpens mana discipline and combos.
    depthDisciplineGain: 0.6,
    // Boss-posture score multipliers applied in finalAbilityScore (was inline).
    bossScore: { cluster: 1.28, kill: 1.22, healer: 1.18, enrage: 1.12, desperation: 1.12 },
    // Hand-tuned item-active score weights + the intent-fallback biases.
    itemScore: {
      bkb: 1.5, bossBkb: 3.2,
      force: 1.4, bossForce: 1.7,
      glimmer: 0.6, glimmerUnderFire: 0.5, bossGlimmer: 2.3,
      mekBase: 0.5, mekPer: 0.5,
      eulsBase: 0.6, bossEuls: 1.8,
      interruptBonus: 0.8,
      intentEscape: 1.15, bossIntentBias: 1.2
    },
    // Item-active leash/heal radii and HP gates (was inline cast-range constants).
    itemRange: {
      glimmerAlly: 800, mekWounded: 750, mekWoundedPct: 0.7, mekMinWounded: 2, euls: 575,
      bkbFight: 360, forceFight: 360, bossGlimmerHpPct: 0.45, bossForceHpPct: 0.35
    },
    // Raid-aware behaviors, with per-depth scaling (AI_OVERHAUL §6 / 2.0 §5.7).
    raid: {
      peelSearch: 800, peelSearchPerDepth: 260,
      peelMenace: 450, peelMenacePerDepth: 160,
      scatterMargin: 260, scatterMarginPerDepth: 160, scatterMinRadius: 420,
      stackHpPct: 0.72, stackHpPctPerDepth: 0.08,
      stackRange: 1700, stackRangePerDepth: 360, stackMinDist: 650
    },
    // Boss phase-FSM constants (was inline in boss-brain).
    boss: {
      prefHealerChance: 0.45, prefClusterChance: 0.5, prefKillChance: 0.5,
      healerHpNeed: 2.2, healerLowThreat: 0.9, healerReach: 0.45, healerThreatNorm: 600, healerReachDist: 900,
      mechanicBase: { enrage: 100, signature: 70, addWave: 55, zone: 45 }
    }
  },

  // --- threat (AI_OVERHAUL §4, WoW-grounded): generalized past boss-only ---
  threat: {
    attackMult: 1.0,            // auto-attack damage -> threat
    spellMult: 1.0,             // spell damage -> threat
    healMult: 0.5,              // effective healing -> threat, credited to the healer (SPEC §4)
    tankMult: 1.55,             // durable role generates extra threat so it holds aggro
    initiatorMult: 1.2,         // initiators want to be looked at too
    supportMult: 0.9,           // squishy supports shed a little threat
    meleePull: 1.1,             // a melee challenger must reach 110% of the held target's threat to pull
    rangedPull: 1.3,            // a ranged challenger must reach 130% (the WoW aggro ceiling)
    healLeash: 2600,            // healing threat only reaches enemies within this range of the healer
  },

  // --- xp / gold (trainer-level wallet) ---
  startingGold: 2600,
  xpCurve: [0, 230, 600, 1080, 1660, 2260, 2980, 3730, 4620, 5550, 6520, 7530, 8580, 9805, 11055, 12330, 13630, 14955, 16455, 18045, 19645, 21495, 23595, 25945, 28545, 31395, 34495, 37845, 41445, 45295],
  levelCap: 30,
  postCapXpToGold: 0.12,      // gold per excess xp; loot now carries more of the post-cap reward
  xpActivePct: 1.0,
  xpParticipantPct: 0.75,
  xpBenchPct: 0.5,
  lastHitBonusPct: 0.15,      // gold AND xp bonus for player-controlled last hit
  participantWindowSec: 10,
  deathGoldLossPct: 0.10,
  regionRewardMult: {
    'tranquil-vale': 1.0,
    'nightsilver-woods': 1.12,
    icewrack: 1.25,
    'devarshi-desert': 1.42,
    shadeshore: 1.6,
    'vile-reaches': 1.82,
    quoidge: 2.05,
    'hidden-wood': 2.15,
    'mount-joerlak': 2.35,
    'mad-moon-crater': 2.55
  },
  creepCombatScale: {
    hpByRegion: {
      'tranquil-vale': 1.0,
      'nightsilver-woods': 1.19,
      icewrack: 1.41,
      'devarshi-desert': 1.72,
      shadeshore: 2.07,
      'vile-reaches': 2.53,
      quoidge: 3.04,
      'hidden-wood': 3.25,
      'mount-joerlak': 3.77,
      'mad-moon-crater': 4.2
    },
    damageByRegion: {
      'tranquil-vale': 1.0,
      'nightsilver-woods': 1.11,
      icewrack: 1.22,
      'devarshi-desert': 1.37,
      shadeshore: 1.53,
      'vile-reaches': 1.7,
      quoidge: 1.9,
      'hidden-wood': 1.99,
      'mount-joerlak': 2.17,
      'mad-moon-crater': 2.32
    },
    tier: { normal: 1.0, nightmare: 1.5, hell: 2.1 }
  },
  tierRewardMult: { normal: 1.0, nightmare: 1.65, hell: 2.45 },
  creepTierRewardMult: { small: 1.0, medium: 1.35, large: 1.85, ancient: 2.6 },
  creepStarBountyMult: [1.0, 1.75, 2.8],
  neutralDropPctByTier: { small: 0.16, medium: 0.20, large: 0.28, ancient: 0.38 },
  tinkersBench: { rerollCost: 225, reclaimCost: 150, enchantCost: 600 },
  loot: {
    gradeRollVariance: 0.20,
    egCadenceMinByBand: { early: 6, mid: 4, late: 2 },
    egRaritySplit: {
      early: { legendary: 0.95, immortal: 0.05, arcana: 0.0 },
      mid: { legendary: 0.9, immortal: 0.095, arcana: 0.005 },
      late: { legendary: 0.84, immortal: 0.15, arcana: 0.01 }
    },
    qualityDropChance: { normal: 0.08, nightmare: 0.18, hell: 0.3 },
    bandMarkQuota: { early: 24, mid: 18, late: 12 },
    affixTiersByDifficulty: { normal: 2, nightmare: 3, hell: 4 },
    lootFilterDefaults: { minGrade: 'broken', minRarity: 'common' },
    // Slow-motion micro-pause on a Pristine/signature drop (ITEM_REHAUL §13.2):
    // simulate at this fraction of real speed for this many real seconds.
    signatureSlowmoScale: 0.35,
    signatureSlowmoSec: 0.45
  },
  overworldEgSlotPct: {
    largeCreep: { normal: 0.15, nightmare: 0.25, hell: 0.35 },
    ancientCreep: { normal: 0.20, nightmare: 0.32, hell: 0.46 },
    echo: { normal: 0.03, nightmare: 0.045, hell: 0.06 }
  },
  eliteSpawnChance: { large: 0.04, ancient: 0.03 },
  merchantGradeMultiplier: { worn: 1.0, standard: 1.25, sharp: 1.6, refined: 2.2 },
  merchantRefreshPerVisits: 2,
  gambleVendor: {
    pity: 8,
    tierPrice: { t1: 900, t2: 1800, t3: 3200, t4: 5200 }
  },
  blackMarket: {
    recipeWheelCost: 650,
    relicWheelBaseCost: 2400,
    relicWheelStepCost: 450,
    salvageEssence: { common: 1, uncommon: 2, rare: 4, mythical: 7, legendary: 12, immortal: 20, arcana: 30 },
    relicRarityCeiling: 'legendary' as const,
    // Small chance a gambled relic copy comes upgraded; Unusual stays reserved to
    // raids/special battles, so the wheel tops out at the collectible grades.
    relicQualityOdds: { inscribed: 0.06, frozen: 0.05, genuine: 0.04 },
    assemblyEssence: 10,
    // Essence + gold to raise a bound copy one quality grade (LOOT L5). Keyed by target grade.
    qualityUpgrade: {
      essence: { genuine: 2, frozen: 3, inscribed: 5, corrupted: 8, unusual: 14, standard: 0 },
      gold: { genuine: 600, frozen: 900, inscribed: 1300, corrupted: 2000, unusual: 3400, standard: 0 }
    }
  },
  buybackBaseCost: 350,
  tomeXp: 420,
  tomeCost: 275,
  respecCost: 500,
  healServiceCost: 120,

  // --- recruitment ceiling + trials (Phase 6 §3.1, §3.4) ---
  recruitLevelCap: [18, 25, 30],  // index = badge count, clamped at last entry
  relocationShardFloor: 1,        // failed trial drops Find shards to this floor, never locks out
  findShardsNeeded: 2,            // default echo kills to reveal a trial marker
  echoHpTaxPct: 0.4,              // overworld/trial echoes lose this fraction of max HP (×0.6, §3.2)
  echoLeashRadius: 1600,          // gambit echo tether so it does not roam the region
  trialDefaultSec: 45,            // default trial time limit for timed/endure templates

  // --- reputation / karma (Phase 6 §3.2) ---
  reputationGoodGate: 3,          // a good-karma recruit opens at/above this
  reputationSoulsPactDrop: 4,     // Souls Pact greed path lowers karma by this
  reputationHonorGain: 2,         // honorable trial resolutions raise karma
  rosterLegendNeeded: 50,         // Io roster-legend trial: recruited heroes required

  // --- audio (Phase 6 §3.12, §3.16) ---
  audioVoiceCap: 6,               // pooled voice concurrency cap (perf budget)

  // --- hero swap (SPEC §6) ---
  swapFloorSec: 1.5,
  swapCooldownSec: 1.5,
  swapCdFloorPct: 0.5,        // swapped-in hero cooldowns floored at 50% of remaining
  resonanceSwapFloorSec: 1.0,
  resonanceSwapCooldownSec: 1.0,
  resonanceElementGaugeSec: 4,
  tagChainWindowSec: 2.5,
  tagChainAmpPerStepPct: 15,
  tagChainMaxSteps: 3,
  resonanceOffFieldPersistenceSec: 5,
  swapCancelGraceSec: 0.6,    // §8.3: a swap pressed mid cast-point queues until the cast fires (no lost cast)

  // --- Genshin-overworld locomotion / traversal (GAMEPLAY_OVERHAUL G1/G3) ---
  locomotion: {
    walkSpeedMult: 0.55,
    sprintSpeedMult: 1.5,
    dashSpeed: 1150,
    dashDurationSec: 0.22,
    dashCost: 55,
    dashCooldownSec: 0.9
  },
  traversal: {
    staminaMax: 240,
    sprintDrainPerSec: 18,
    climbDrainPerSec: 24,
    swimDrainPerSec: 14,
    staminaRegenPerSec: 25,
    regenDelaySec: 0.6,
    // verticality (§3.3, G3): scripted ascent/descent between elevation tiers
    climbDurationSec: 1.6,      // time to climb one tier (drains climbDrainPerSec the whole way)
    glideDescentSec: 2.0,       // time to glide down one tier (free, but committing)
    glideSpeedMult: 0.9,        // forward drift while gliding
    swimSpeedMult: 0.55,        // move-speed multiplier while in a water zone
    connectorRadius: 200,       // how close to a climb/glide point you must be to use it
    washbackStaminaRefund: 60   // stamina handed back after a deep-water washback
  },
  exploration: {
    pickupRadius: 180,
    waypointRadius: 260,
    chestInteractRadius: 260,
    puzzleNodeRadius: 230,
    cookRadius: 520,            // cooking (§3.7) is available within this range of a shrine

    shrineShardQuota: 3,
    shardRewardGold: 225,
    explorationThresholdRewardGold: 175
  },
  resin: {
    enabled: false,
    max: 180,
    regenPerSec: 180 / (8 * 60 * 60),
    bossCost: 20,
    raidCost: 30,
    dungeonGuardianCost: 35,
    dryLootGoldPct: 0.25
  },

  // --- capture (deterministic, SPEC §5) ---
  capture: {
    small:   { hpPct: 0.30, channelSec: 2.5 },
    medium:  { hpPct: 0.25, channelSec: 3.0 },
    large:   { hpPct: 0.20, channelSec: 3.5 },
    ancient: { hpPct: 0.15, channelSec: 4.5 }
  },
  captureRange: 250,

  // --- creeps / entourage ---
  starStatMult: [1, 1.85, 3.2],     // 1/2/3 star
  starDamageMult: [1, 1.7, 2.8],
  entourageMax: 3,
  entourageAncientMax: 1,
  entourageFaintSec: 90,
  creepAggroRadius: 650,
  entourageGuardRadius: 900,
  entourageChaseRadius: 650,
  entourageFollowStart: 280,
  entourageFollowStop: 135,
  creepLeashRadius: 1800,
  creepWanderRadius: 220,

  // --- raids/bosses (schema-level now, used from Phase 3) ---
  raidAssembledDropPct: { normal: 0.10, nightmare: 0.20, hell: 0.35 },
  raidBadLuckPity: 8,
  raidBossHpScale: 5,
  regionalBossHpScale: 1.25,
  raidBossDamageScale: 1.25,
  raidBossRadiusScale: 1.7,
  // OVERWORLD_PLANNING §3/§5.1: render-only height lift for a boss-controlled unit
  // that carries no explicit per-unit `visualScale` (the raid arena builds its boss
  // from a hero setup, not a BossDef). ~huge-band floor (3.5 m) over the 1.8 m hero
  // so a generic boss reads "huge" on screen; the sim keeps the hero's collision.
  bossVisualScale: 1.95,
  // Roshan (§3.9): respawn timer in playtime-seconds, and the clear at which repeat
  // kills start dropping a Refresher Shard + Cheese alongside the Aegis.
  roshanRespawnSec: 480,
  roshanRepeatDropFromClear: 2,
  bossTierScale: {
    normal: { hp: 1.0, damage: 1.0, armor: 1.0 },
    nightmare: { hp: 1.65, damage: 1.28, armor: 1.18 },
    hell: { hp: 2.45, damage: 1.65, armor: 1.35 }
  },
  bossBkbByTier: {
    normal: { duration: 4, cooldown: 90 },
    nightmare: { duration: 5, cooldown: 75 },
    hell: { duration: 6, cooldown: 60 }
  },
  // AI-depth difficulty lever (AI_OVERHAUL §6): higher tiers dial boss opportunism
  // and raid-party reaction timing, beside bossTierScale rather than instead of it.
  bossTierAiDepth: { normal: 0.45, nightmare: 0.7, hell: 1.0 },
  bossAssembledDropPct: { normal: 0.08, nightmare: 0.16, hell: 0.30 },

  // --- macro arena ---
  arenaWidth: 4200,
  arenaHeight: 3000,
  macroTeamXInset: 950,
  macroFormationDepth: 240,
  macroMaxSec: 300,
  captainCallsPerFight: 3,
  captainCallSec: 5,

  // --- items ---
  activeItemSlots: 4,         // Z/X/C/V; slots 5-6 passive-only
  itemSlots: 6,
  sellRatio: 0.5,

  // --- day/night ---
  dayLengthSec: 480,
  nightVisionMult: 0.7,

  // --- movement ---
  unitRadiusHero: 24,
  unitRadiusCreep: { small: 18, medium: 24, large: 32, ancient: 44 },
  separationStrength: 0.9,

  // --- world / region ---
  townSafeRadius: 900,
  campResetDist: 2400,
  shrineHealPctPerSec: 0.04,
  autosaveSec: 60,
  combatLockSec: 3.0          // no saving within N sec of taking/dealing damage
};
export type Tuning = typeof TUNING;
