const speciesEntry = (name, key, traits, system = {}) => ({
  name,
  type: "species",
  system: {
    speciesKey: key,
    active: false,
    rulesMode: "primary",
    traits,
    rulesText: traits,
    description: traits,
    effects: [],
    embeddedQualities: [],
    ...system
  }
});

export const DBZF_STARTER_SPECIES = [
  speciesEntry("Earthling", "earthling", "EXP Differential: +25% EXP. High Tension unlock: Physical x2, Fighting x2, HITs restore +50%, Ki x0.5, 1d6-1 rounds; does not recalc HITs/Defense from boosted Physical.", { xpMultiplier: 1.25, unlockedTransformations: ["highTension"] }),
  speciesEntry("Saiyan", "saiyan", "Zenkai: +25% fight EXP, +50% if losing. Unlocks Saiyan Rage and Oozaru. Oozaru tail/training rules are tracked as species notes/flags.", { xpFightMultiplier: 1.25, xpLossMultiplier: 1.5, unlockedTransformations: ["saiyanRage", "oozaru"] }),
  speciesEntry("Half-Saiyan", "halfSaiyan", "Hybrid Saiyan lineage; supports Saiyan unlock flags and GM-custom species effects.", { unlockedTransformations: ["saiyanRage"] }),
  speciesEntry("Namekian", "namekian", "Variants: Warrior, Dragon, Demon. Regenerates per phase. Dragon Clan may base regen on Mental. Unlocks Giant Namekian; regeneration disabled while giant.", { variant: "warrior", regenerationMode: "namekian", unlockedTransformations: ["giantNamekian"] }),
  speciesEntry("Frost Demon", "frostDemon", "Vacuum compatibility and Reduction Form unlocks. Reduction Forms increase HITs/Defense dynamically unlike most forms.", { unlockedTransformations: ["reductionForm1", "reductionForm2", "reductionForm3", "reductionForm4", "reductionForm5"] }),
  speciesEntry("Android", "android", "Artificial body. Limited Energy cannot charge normally; Infinite Energy charges 20% max Ki and may be undetectable by Ki Sense/Scouters.", { variant: "infinite", kiChargeMode: "androidInfinite", kiDecayMode: "daily", senseDetectionMode: "scouterOnly" }),
  speciesEntry("Bio-Android", "bioAndroid", "Engineered genetic composite with customizable source traits and gestation tracker support.", { senseDetectionMode: "normal" }),
  speciesEntry("Glind", "corePerson", "Core/Kai/Makai variants with divinity, purpose, anti-evil, or damage-energy absorption flags for GM use.", { variant: "core" }),
  speciesEntry("Djinn", "djinn", "Mystic Nature, sealed abilities, and Prisoner of Fate: sealing/immobilization saves are 25% worse and weaken by phase.", { regenerationMode: "none" }),
  speciesEntry("Boojin", "majin", "Demon Realm creature traits, Prisoner of Fate, and Boo lineage regeneration every Phase at 2x Physical + 1x Mental.", { regenerationMode: "majinBoo" }),
  speciesEntry("Alien / Custom Species", "alien", "Extensible blank species item for custom species, traits, qualities, and effects.", { rulesMode: "custom" })
];

const qualityEntry = (key, name, commonModifier, rulesText) => ({ name, type: "quality", system: { key, type: commonModifier ? "Common" : "Special", commonModifier, rating: 1, cost: commonModifier ? 10 : 0, mechanics: rulesText, rulesText } });

export const DBZF_STARTER_QUALITIES = [
  qualityEntry("area", "Area", true, "Affects all characters in radius rating. Secondary targets take half raw damage before Defense."),
  qualityEntry("bending", "Bending", true, "Ki attack can turn up to 90 degrees per rating; chat/metadata automation."),
  qualityEntry("burn", "Burn", true, "If damage gets through, applies Burn for rating ticks. Tick damage is half original raw damage."),
  qualityEntry("deadly", "Deadly", true, "Reduces target Defense by 10 per rating for that attack."),
  qualityEntry("homing", "Homing", true, "+3d6 per rating to Power/Ki attack rolls vs Evasion only."),
  qualityEntry("immobilization", "Immobilization", true, "On damaging hit, Body save DC 10 x rating or immobilized."),
  qualityEntry("pull", "Pull", true, "Forced movement toward a point; Body save DC 10 x rating."),
  qualityEntry("push", "Push", true, "Forced movement away; Body save DC 10 x rating."),
  qualityEntry("rapid", "Rapid", true, "Attack distinct targets up to rating; no repeat target by default."),
  qualityEntry("sealing", "Sealing", true, "On damaging hit, Mind save DC 10 x rating or sealed; break threshold 100 x rating."),
  qualityEntry("selective", "Selective", true, "Exclude one Area/effect target per rating."),
  qualityEntry("slow", "Slow", true, "On damaging hit, reduces Movement by rating to min 1 and degrades by 1 per tick."),
  qualityEntry("super", "Attack, Super", false, "Special modifier: Reaction, +25% skill total damage/capacity, costs 10% max Ki."),
  qualityEntry("fullPower", "Attack, Full Power", false, "Special modifier: Action, +50% skill total damage/capacity, costs 25% max Ki."),
  qualityEntry("true", "Attack, True", false, "Special modifier: two actions, +100% skill total damage/capacity, costs 50% max Ki."),
  qualityEntry("duration", "Duration", false, "Lingering Area/Pull/effect phases; costs 5% max Ki per rating."),
  qualityEntry("multi", "Multi", false, "Extra strikes formula 1d(rating+1)-1; each iterative strike halves damage."),
  qualityEntry("penetrate", "Penetrate", false, "Reduces Ki Barrier by 1d6 per rating; may bypass Temp HITs if barrier is fully bypassed."),
  qualityEntry("kiDeflection", "Ki Deflection", false, "Armor or equipment quality. When energy damage is applied, roll rating d6 and reduce incoming raw damage by the result before Defense.")
];

export const DBZF_STARTER_TRANSFORMATIONS = [
  { name: "Kaioken x2", type: "transformation", system: { multipliers: "See rules data: kaiokenx2", cost: "Variable", duration: "Short burst", rulesText: "Seed item linked conceptually to system transformation data." } },
  { name: "Super Saiyan 1 / Mastered", type: "transformation", system: { multipliers: "See rules data: superSaiyan1Mastered", cost: "Variable", duration: "Scene", rulesText: "Seed item linked conceptually to system transformation data." } },
  { name: "Oozaru", type: "transformation", system: { multipliers: "See rules data: oozaru", cost: "Special", duration: "Special", rulesText: "Seed item linked conceptually to system transformation data." } },
  { name: "Giant Namekian", type: "transformation", system: { multipliers: "See rules data: giantNamekian", cost: "Special", duration: "Scene", rulesText: "Seed item linked conceptually to system transformation data." } },
  { name: "Reduction Form 1", type: "transformation", system: { multipliers: "See rules data: reductionForm1", cost: "Special", duration: "Form", rulesText: "Seed item linked conceptually to system transformation data." } }
];

export const DBZF_STARTER_ITEMS = [
  {
    name: "Ki Blast",
    type: "technique",
    system: {
      attackType: "power",
      tags: "ki,ranged",
      qualities: "Basic",
      kiCostRaw: "10",
      extraDice: 1,
      activation: "Attack",
      description: "A basic ranged Ki attack.",
      boosts: "Use effect rows to customize damage, cost, or resource changes.",
      effects: [{ enabled: true, label: "Ki Blast Extra Damage", target: "attacks.power.damageDice", mode: "add", value: 1, kiCostRaw: "10", rulesText: "Adds 1d6 when active." }]
    }
  },
  {
    name: "Power Strike",
    type: "technique",
    system: {
      attackType: "fighting",
      tags: "melee,ki",
      qualities: "Impact",
      kiCostRaw: "25%+10",
      extraDice: 3,
      activation: "Attack",
      description: "A Ki-enhanced melee attack.",
      boosts: "Template for melee attack techniques.",
      effects: [{ enabled: true, label: "Power Strike Damage", target: "attacks.fighting.damageDice", mode: "add", value: 3, kiCostRaw: "25%+10", rulesText: "Adds 3d6 when active." }]
    }
  },
  { name: "Training Staff", type: "weapon", system: { damageDice: 3, qualities: "Blunt", description: "Simple melee weapon." } },
  { name: "Weighted Armor", type: "armor", system: { defenseBonus: 2, bonusHits: 20, currentHits: 20, destroyed: false, qualities: "Heavy", description: "Training armor template.", effects: [] } },
  { name: "Scouter", type: "equipment", system: { category: "Sensor", quantity: 1, description: "Battle power sensor template." } },
  { name: "Senzu-style Recovery Bean", type: "consumable", system: { quantity: 1, activation: "Action", effect: "Recovery item template.", description: "Simple recovery consumable template." } }
];

export const DBZF_STARTER_ACTORS = [
  {
    name: "DBZ Fuzion Sample Fighter",
    type: "character",
    img: "icons/svg/mystery-man.svg",
    system: {
      identity: {
        species: "human",
        age: "",
        birthYear: "",
        sex: "",
        hair: "",
        eyes: "",
        build: "",
        gimmick: "Baseline QA-ready sample",
        personality: ""
      },
      characteristics: {
        physical: { base: 10 },
        mental: { base: 10 },
        combat: { base: 10 },
        movement: { base: 10 }
      },
      resources: {
        hits: { value: 300 },
        tempHits: { value: 0 },
        battlePower: { value: 200 }
      },
      experience: { total: 0, unspent: 0 },
      finances: { zeni: 0 }
    }
  }
];

export const DBZF_STARTER_CONTENT = {
  species: DBZF_STARTER_SPECIES,
  qualities: DBZF_STARTER_QUALITIES,
  transformations: DBZF_STARTER_TRANSFORMATIONS,
  sampleItems: DBZF_STARTER_ITEMS,
  sampleActors: DBZF_STARTER_ACTORS
};
