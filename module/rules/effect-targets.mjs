export const DBZF_EFFECT_TARGETS = [
  { group: "Attacks", key: "attacks.all.damageDice", label: "All Attack Damage Dice" },
  { group: "Attacks", key: "attacks.fighting.damageDice", label: "Fighting Damage Dice" },
  { group: "Attacks", key: "attacks.power.damageDice", label: "Power Damage Dice" },
  { group: "Attacks", key: "attacks.weapon.damageDice", label: "Weapon Damage Dice" },
  { group: "Attacks", key: "attacks.body.damageDice", label: "Body Damage Dice" },
  { group: "Attacks", key: "attacks.evasion.damageDice", label: "Evasion Damage Dice" },
  { group: "Attacks", key: "attacks.mind.damageDice", label: "Mind Damage Dice" },
  { group: "Attacks", key: "attacks.custom.damageDice", label: "Custom Skill Damage Dice" },

  { group: "Characteristics", key: "characteristics.all.effective", label: "All Characteristics Effective" },
  { group: "Characteristics", key: "characteristics.physical.effective", label: "Physical Effective" },
  { group: "Characteristics", key: "characteristics.mental.effective", label: "Mental Effective" },
  { group: "Characteristics", key: "characteristics.combat.effective", label: "Combat Effective" },
  { group: "Characteristics", key: "characteristics.movement.effective", label: "Movement Effective" },

  { group: "Skills", key: "skills.all.effectiveRank", label: "All Skill Effective Ranks" },
  { group: "Skills", key: "skills.fighting.effectiveRank", label: "Fighting Effective Rank" },
  { group: "Skills", key: "skills.power.effectiveRank", label: "Power Effective Rank" },
  { group: "Skills", key: "skills.weapon.effectiveRank", label: "Weapon Effective Rank" },
  { group: "Skills", key: "skills.evasion.effectiveRank", label: "Evasion Effective Rank" },
  { group: "Skills", key: "skills.mind.effectiveRank", label: "Mind Effective Rank" },
  { group: "Skills", key: "skills.body.effectiveRank", label: "Body Effective Rank" },

  { group: "Custom Skills", key: "customSkills.all.effectiveRank", label: "All Custom Skill Ranks" },
  { group: "Custom Skills", key: "customSkills.0.effectiveRank", label: "Custom Skill 1 Rank" },
  { group: "Custom Skills", key: "customSkills.1.effectiveRank", label: "Custom Skill 2 Rank" },
  { group: "Custom Skills", key: "customSkills.2.effectiveRank", label: "Custom Skill 3 Rank" },

  { group: "Resources", key: "resources.hits.max", label: "HITs Max" },
  { group: "Resources", key: "resources.hits.value", label: "Current HITs (heal on boost activation)" },
  { group: "Resources", key: "resources.tempHits.max", label: "Temporary HITs Max" },
  { group: "Resources", key: "resources.tempHits.value", label: "Current Temp HITs (heal on boost activation)" },
  { group: "Resources", key: "resources.defense.value", label: "Defense" },
  { group: "Resources", key: "resources.battlePower.value", label: "Base Battle Power" },
  { group: "Resources", key: "resources.battlePower.effective", label: "Effective Battle Power / Max Ki" },
  { group: "Resources", key: "resources.battlePower.suggested", label: "Suggested Battle Power" },
  { group: "Resources", key: "resources.powerUp.percent", label: "Power Up % (adds to CaC baseline)" },

  { group: "Progression", key: "experience.total", label: "EXP Total" },
  { group: "Progression", key: "experience.unspent", label: "EXP Unspent" },
  { group: "Progression", key: "finances.zeni", label: "Zeni" }
];

export const DBZF_EFFECT_MODES = [
  { key: "add", label: "Add" },
  { key: "multiply", label: "Multiply" },
  { key: "percent", label: "Percent Bonus" },
  { key: "override", label: "Override" }
];
