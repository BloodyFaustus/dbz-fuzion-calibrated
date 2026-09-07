export const DBZF_SKILL_LABELS = {
  fighting: "Fighting",
  power: "Power",
  weapon: "Weapon",
  evasion: "Evasion",
  mind: "Mind",
  body: "Body"
};

export async function rollSkill(actor, skillKey, options = {}) {
  const skill = actor.system.skills?.[skillKey];
  if (!skill) {
    ui.notifications.warn(`Unknown skill: ${skillKey}`);
    return null;
  }

  const label = options.label ?? `${DBZF_SKILL_LABELS[skillKey] ?? skillKey} Check`;
  return rollCheck(actor, label, skill.total, {
    formulaLabel: `3d6 + ${skill.total}`,
    breakdown: [
      `Rank: ${skill.effectiveRank}`,
      `Characteristic: ${skill.value}`,
      `Total: ${skill.total}`
    ]
  });
}

export async function rollCustomSkill(actor, index, options = {}) {
  const skill = actor.system.customSkills?.[index];
  if (!skill) {
    ui.notifications.warn(`Unknown custom skill row: ${index + 1}`);
    return null;
  }

  const label = options.label ?? `${skill.name || `Custom Skill ${index + 1}`} Check`;
  return rollCheck(actor, label, skill.total, {
    formulaLabel: `3d6 + ${skill.total}`,
    breakdown: [
      `Rank: ${skill.rank}`,
      `Value: ${skill.value}`,
      `Total: ${skill.total}`
    ]
  });
}

export async function rollCheck(actor, label, total, details = {}) {
  const formula = `3d6 + ${Number(total) || 0}`;
  const roll = await new Roll(formula).evaluate();
  const content = await createChatCard({
    actor,
    label,
    roll,
    formula,
    details
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content
  });

  return roll;
}

export async function createChatCard(data) {
  return foundry.applications.handlebars.renderTemplate("systems/dbz-fuzion-calibrated/templates/chat/skill-roll-card.hbs", {
    actorName: data.actor.name,
    label: data.label,
    total: data.roll.total,
    rollResult: data.roll.result ?? data.roll.formula,
    formula: data.formula,
    formulaLabel: data.details?.formulaLabel ?? data.formula,
    breakdown: data.details?.breakdown ?? []
  });
}
