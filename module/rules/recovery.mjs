import { getChargedKi } from "./ki.mjs";

export async function recoverHits(actor) {
  const system = actor.system;
  const settings = recoverySettings(actor);
  const kiCharged = getChargedKi(actor);
  const tempMax = Number(system.resources.tempHits.max || 0);
  const hits = Number(system.resources.hits.value || 0);
  const hitsMax = Number(system.resources.hits.max || 0);
  const species = activeSpeciesItem(actor);
  const heal = recoveryAmount(actor, species, settings);
  const restoreTempHits = shouldRestoreTempHits(settings, kiCharged);
  const updates = {
    "system.resources.hits.value": Math.min(hitsMax, hits + heal),
    "system.combatState.phasesSinceRecovery": 0
  };
  if (restoreTempHits) updates["system.resources.tempHits.value"] = tempMax;
  await actor.update(updates);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `
      <article class="dbzf-chat-card" data-kind="recovery">
        <header>
          <h3>${escapeHtml(applyRecoveryTokens(settings.chatTitle, actor, settings))}</h3>
          <p>${escapeHtml(applyRecoveryTokens(settings.chatMessage, actor, settings))}</p>
        </header>
        <dl class="dbzf-chat-grid">
          <dt>HITs Healed</dt><dd>${heal}</dd>
          <dt>Temp HITs</dt><dd>${tempHitsSummary(settings, restoreTempHits, tempMax)}</dd>
          <dt>Current HITs</dt><dd>${actor.system.resources.hits.value}</dd>
        </dl>
        <details>
          <summary>Recovery Details</summary>
          <p>${escapeHtml(applyRecoveryTokens(settings.chatDetails, actor, settings))}</p>
        </details>
      </article>
    `
  });
  return { healed: heal, tempRestored: restoreTempHits, hits: actor.system.resources.hits.value };
}

// Species that regenerate on their own cadence rather than the default 4 phases.
// Namekians regenerate every Phase; the Majin Boo lineage regenerates every 2 Phases.
const SPECIES_RECOVERY_PHASES = {
  namekian: 1,
  namekianwarrior: 1,
  namekiandragon: 1,
  namekiandemon: 1,
  majinboo: 1
};

export function activeSpeciesItem(actor) {
  return Array.from(actor?.items ?? []).find(item => item.type === "species" && item.system?.active);
}

export function speciesRecoveryPhases(species) {
  const mode = String(species?.system?.regenerationMode ?? "").toLowerCase();
  return SPECIES_RECOVERY_PHASES[mode] ?? null;
}

export function recoverySettings(actor) {
  const recovery = actor.system.combatState?.recovery ?? {};
  const speciesPhases = recovery.useSpeciesPhases === false ? null : speciesRecoveryPhases(activeSpeciesItem(actor));
  return {
    useSpeciesPhases: recovery.useSpeciesPhases !== false,
    speciesPhases,
    phasesRequired: Math.max(1, Number(speciesPhases ?? recovery.phasesRequired ?? 4)),
    hitMode: recovery.hitMode || "species",
    flatHits: Number(recovery.flatHits || 0),
    tempHitsMode: recovery.tempHitsMode || "chargedKi",
    chatTitle: recovery.chatTitle || "4-Phase Recovery",
    chatMessage: recovery.chatMessage || "{{name}} stabilizes between exchanges.",
    chatDetails: recovery.chatDetails || "Every {{phases}} phases, regular HITs recover by the selected mode. If Temp HIT recovery is enabled and the requirement is met, Temp HITs reset to max."
  };
}

function recoveryAmount(actor, species, settings) {
  const physical = Number(actor.system.characteristics.physical.effective || 0);
  const mental = Number(actor.system.characteristics.mental.effective || 0);
  if (settings.hitMode === "none") return 0;
  if (settings.hitMode === "flat") return settings.flatHits;
  if (settings.hitMode === "mental") return mental;
  if (settings.hitMode === "doubleMental") return mental * 2;
  if (settings.hitMode === "doublePhysical") return physical * 2;
  if (settings.hitMode === "species") {
    // Compared case-insensitively so shipped content ("namekian", "majinBoo") matches, and Dragon
    // Clan Namekians regenerate off Mental whether that is set as the mode or as the variant.
    const mode = String(species?.system?.regenerationMode ?? "").toLowerCase();
    const variant = String(species?.system?.variant ?? "").toLowerCase();
    if (mode === "namekiandragon" || (mode.startsWith("namekian") && variant === "dragon")) return mental;
    if (mode === "majinboo") return (physical * 2) + mental;
  }
  return physical;
}

function shouldRestoreTempHits(settings, kiCharged) {
  if (settings.tempHitsMode === "always") return true;
  if (settings.tempHitsMode === "never") return false;
  return kiCharged > 0;
}

function tempHitsSummary(settings, restored, tempMax) {
  if (restored) return `Reset to ${tempMax}`;
  if (settings.tempHitsMode === "never") return "Disabled; unchanged";
  return "No charged Ki; unchanged";
}

function applyRecoveryTokens(text, actor, settings) {
  return String(text ?? "")
    .replaceAll("{{name}}", actor.name)
    .replaceAll("{{phases}}", String(settings.phasesRequired))
    .replaceAll("{{hitMode}}", settings.hitMode)
    .replaceAll("{{flatHits}}", String(settings.flatHits));
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

export async function rollSurvivalCheck(actor) {
  const hits = Number(actor.system.resources.hits.value || 0);
  const dc = Math.abs(Math.min(0, hits));
  if (hits >= 0) {
    ui.notifications.warn(`${actor.name} is not at negative HITs.`);
    return null;
  }
  const bodyTotal = Number(actor.system.skills.body.total || 0);
  const roll = await new Roll(`3d6 + ${bodyTotal}`).evaluate();
  const success = roll.total >= dc;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content: `
      <article class="dbzf-chat-card" data-kind="recovery">
        <header>
          <h3>Survival Check</h3>
          <p>${actor.name} rolls Body against negative HITs.</p>
        </header>
        <dl class="dbzf-chat-grid">
          <dt>Current HITs</dt><dd>${hits}</dd>
          <dt>DC</dt><dd>${dc}</dd>
          <dt>Roll</dt><dd>${roll.total}</dd>
          <dt>Result</dt><dd>${success ? "Success" : "Failure"}</dd>
        </dl>
        <details>
          <summary>Survival Details</summary>
          <p>When regular HITs are negative, the absolute negative HIT value is the approximate Body check DC to survive.</p>
        </details>
      </article>
    `
  });
  return { roll, dc, success };
}
