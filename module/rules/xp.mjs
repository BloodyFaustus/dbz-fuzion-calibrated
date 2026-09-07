function bpFor(actorLike) {
  const actor = actorLike.actor ?? actorLike;
  const effective = Number(actorLike.bp ?? actor?.system?.resources?.battlePower?.effective ?? 0);
  const base = Number(actor?.system?.resources?.battlePower?.value ?? 0);
  const bp = effective > 0 ? effective : base;
  return Math.max(1, bp || 1);
}

function activeSpecies(actor) {
  return Array.from(actor?.items ?? []).find(item => item.type === "species" && item.system?.active);
}

function normalizeParticipant(entry, side) {
  const actor = entry.actor ?? entry;
  const species = entry.activeSpecies ?? activeSpecies(actor);
  return {
    actor,
    actorUuid: entry.actorUuid ?? actor?.uuid ?? "",
    name: entry.name ?? actor?.name ?? "Unknown",
    img: entry.img ?? actor?.img ?? "icons/svg/mystery-man.svg",
    side,
    bp: bpFor(entry),
    result: entry.result ?? "win",
    manualMultiplier: Number(entry.manualMultiplier ?? 1),
    manualFlat: Number(entry.manualFlat ?? 0),
    activeSpecies: species ? {
      name: species.name,
      xpMultiplier: Number(species.system?.xpMultiplier || 1),
      xpFightMultiplier: Number(species.system?.xpFightMultiplier || 1),
      xpLossMultiplier: Number(species.system?.xpLossMultiplier || 1)
    } : { name: "", xpMultiplier: 1, xpFightMultiplier: 1, xpLossMultiplier: 1 }
  };
}

export function calculateFightXp({ sideA = [], sideB = [], options = {} } = {}) {
  const a = sideA.map(entry => normalizeParticipant(entry, "A"));
  const b = sideB.map(entry => normalizeParticipant(entry, "B"));
  const participants = [
    ...a.map(participant => calculateParticipant(participant, b, options)),
    ...b.map(participant => calculateParticipant(participant, a, options))
  ];
  return {
    sides: { a, b },
    participants,
    totals: {
      sideA: participants.filter(p => p.side === "A").reduce((sum, p) => sum + p.modifiedXp, 0),
      sideB: participants.filter(p => p.side === "B").reduce((sum, p) => sum + p.modifiedXp, 0),
      all: participants.reduce((sum, p) => sum + p.modifiedXp, 0)
    }
  };
}

function calculateParticipant(participant, opponents) {
  const warnings = [];
  if (participant.bp <= 1) warnings.push("Battle Power was missing or zero; used 1.");
  const pairs = opponents.map(opponent => {
    const xpRaw = (opponent.bp / participant.bp) * 10;
    return { opponentUuid: opponent.actorUuid, opponentName: opponent.name, participantBp: participant.bp, opponentBp: opponent.bp, xpRaw };
  });
  const baseXp = pairs.reduce((sum, pair) => sum + pair.xpRaw, 0);
  const species = participant.activeSpecies;
  const fightMultiplier = participant.result === "loss"
    ? Math.max(Number(species.xpLossMultiplier || 1), Number(species.xpFightMultiplier || 1))
    : Number(species.xpFightMultiplier || 1);
  const modifiedXp = (baseXp * Number(species.xpMultiplier || 1) * fightMultiplier * participant.manualMultiplier) + participant.manualFlat;
  const spendableXp = modifiedXp / 2;
  const bpGrowthPercent = modifiedXp / 2;
  const currentBaseBp = Number(participant.actor?.system?.resources?.battlePower?.value ?? participant.bp);
  const newBattlePowerPreview = Math.round(currentBaseBp * (1 + (bpGrowthPercent / 100)));
  return {
    ...participant,
    baseXp,
    modifiedXp,
    spendableXp,
    bpGrowthPercent,
    newBattlePowerPreview,
    speciesName: species.name,
    speciesMultipliers: species,
    warnings,
    pairs
  };
}

export async function applyFightXp(actor, result, { applyBattlePower = true } = {}) {
  const totalCombatXp = Number(result.modifiedXp ?? result.totalCombatXp ?? 0);
  const spendableXp = Number(result.spendableXp ?? totalCombatXp / 2);
  const bpGrowthPercent = Number(result.bpGrowthPercent ?? totalCombatXp / 2);
  const currentTotal = Number(actor.system.experience?.total || 0);
  const currentUnspent = Number(actor.system.experience?.unspent || 0);
  const currentBp = Number(actor.system.resources?.battlePower?.value || 1);
  const updates = {
    "system.experience.total": Math.round(currentTotal + totalCombatXp),
    "system.experience.unspent": Math.round(currentUnspent + spendableXp)
  };
  if (applyBattlePower) updates["system.resources.battlePower.value"] = Math.round(currentBp * (1 + (bpGrowthPercent / 100)));
  await actor.update(updates);
  return updates;
}

// Sides come from the canvas: controlled tokens are Side A, targeted tokens are Side B. If nothing
// is selected the GM picks explicitly. It must NEVER fall back to "the first character in the
// world" — that silently reported a bystander as the participant and credited them the XP.
export async function openXpEncounterTool() {
  const controlled = Array.from(canvas?.tokens?.controlled ?? []).map(token => token.actor).filter(Boolean);
  const targeted = Array.from(game.user?.targets ?? []).map(token => token.actor).filter(Boolean);
  const picked = (controlled.length || targeted.length)
    ? { sideA: controlled, sideB: targeted }
    : await promptEncounterSides();
  if (!picked) return null;

  const sideA = dedupeActors(picked.sideA);
  const sideB = dedupeActors(picked.sideB).filter(actor => !sideA.some(other => other.id === actor.id));
  if (!sideA.length && !sideB.length) {
    ui.notifications.warn("Select at least one participant for the Fight XP report.");
    return null;
  }
  if (!sideA.length || !sideB.length) {
    ui.notifications.warn("Fight XP needs participants on BOTH sides; a side with no opponents earns 0 XP.");
  }

  const report = calculateFightXp({ sideA, sideB });
  await ChatMessage.create({ content: xpReportHtml(report) });
  return report;
}

function dedupeActors(actors = []) {
  const seen = new Set();
  return actors.filter(actor => {
    if (!actor?.id || seen.has(actor.id)) return false;
    seen.add(actor.id);
    return true;
  });
}

// Explicit two-column picker used when no tokens are controlled or targeted.
async function promptEncounterSides() {
  const characters = game.actors.filter(actor => actor.type === "character");
  if (!characters.length) {
    ui.notifications.warn("No characters exist to build a Fight XP report from.");
    return null;
  }
  const rows = characters.map(actor => `
    <tr>
      <td class="dbzf-xp-pick-name">${escapeHtml(actor.name)}</td>
      <td><input type="checkbox" name="sideA" value="${actor.id}" /></td>
      <td><input type="checkbox" name="sideB" value="${actor.id}" /></td>
      <td class="dbzf-xp-pick-bp">${Number(actor.system?.resources?.battlePower?.effective || actor.system?.resources?.battlePower?.value || 0)}</td>
    </tr>`).join("");
  const content = `
    <div class="dbzf-attack-dialog dbzf-dialog-form dbzf-xp-picker">
      <p class="dbzf-dialog-hint">No tokens were selected. Tick each fighter's side. Side A is normally your players; Side B their opponents.</p>
      <table class="dbzf-xp-pick-table">
        <thead><tr><th>Character</th><th>Side A</th><th>Side B</th><th>BP</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  const read = root => {
    const scope = root?.querySelector?.(".dbzf-xp-picker") ?? root;
    const ids = name => Array.from(scope.querySelectorAll(`input[name="${name}"]:checked`)).map(input => input.value);
    return {
      sideA: ids("sideA").map(id => game.actors.get(id)).filter(Boolean),
      sideB: ids("sideB").map(id => game.actors.get(id)).filter(Boolean)
    };
  };

  if (foundry.applications?.api?.DialogV2) {
    return foundry.applications.api.DialogV2.confirm({
      window: { title: "Fight XP - Choose Participants" },
      content,
      yes: { label: "Build Report", callback: (event, button, dialog) => read(dialog.element) },
      no: { label: "Cancel" }
    });
  }
  return new Promise(resolve => new Dialog({
    title: "Fight XP - Choose Participants",
    content,
    buttons: {
      go: { label: "Build Report", callback: html => resolve(read(html[0] ?? html)) },
      cancel: { label: "Cancel", callback: () => resolve(null) }
    },
    default: "go"
  }).render(true));
}

function xpReportHtml(report) {
  const rows = report.participants.map(p => participantCard(p)).join("");
  return `
    <article class="dbzf-chat-card dbzf-xp-report" data-kind="recovery">
      <header><h3>Fight XP Report</h3><p>Combat XP by Battle Power disparity</p></header>
      <div class="dbzf-xp-cards">${rows}</div>
      <dl class="dbzf-chat-grid">
        <dt>Side A Total</dt><dd>${report.totals.sideA.toFixed(1)}</dd>
        <dt>Side B Total</dt><dd>${report.totals.sideB.toFixed(1)}</dd>
        <dt>All XP</dt><dd>${report.totals.all.toFixed(1)}</dd>
      </dl>
      <details><summary>Formula</summary><p>XP per opponent = opponent BP / participant BP * 10. Spendable XP and BP growth each receive half.</p></details>
    </article>
  `;
}

function participantCard(p) {
  const pairs = p.pairs.map(pair => `
    <li>${escapeHtml(pair.opponentName)}: ${pair.opponentBp} / ${pair.participantBp} * 10 = ${pair.xpRaw.toFixed(2)} XP</li>
  `).join("");
  return `
    <section class="dbzf-xp-card">
      <header>
        <img src="${p.img}" alt="" />
        <div><strong>${escapeHtml(p.name)}</strong><small>Side ${p.side} - BP ${p.bp} - ${escapeHtml(p.speciesName || "No Species")}</small></div>
      </header>
      <dl class="dbzf-chat-grid">
        <dt>Total XP</dt><dd>${p.modifiedXp.toFixed(1)}</dd>
        <dt>Spendable XP</dt><dd>${p.spendableXp.toFixed(1)}</dd>
        <dt>BP Growth</dt><dd>${p.bpGrowthPercent.toFixed(1)}%</dd>
        <dt>New BP Preview</dt><dd>${p.newBattlePowerPreview}</dd>
      </dl>
      <details><summary>Why</summary><ul>${pairs || "<li>No opponents selected for this side.</li>"}</ul></details>
    </section>
  `;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}
