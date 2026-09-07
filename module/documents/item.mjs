import { parseKiCost } from "../rules/ki-cost-parser.mjs";
import { applyItemInstantHeals } from "../rules/boosts.mjs";

export class DBZFItem extends Item {
  prepareDerivedData() {
    super.prepareDerivedData();

    // Inline the Battle Power lookup rather than calling a private helper: prepareDerivedData
    // runs from the base Document constructor BEFORE subclass private methods are installed on
    // the instance, so `this.#method()` would throw "Receiver must be an instance of DBZFItem".
    const parent = this.parent;
    const battlePower = Number(
      parent?.system?.resources?.battlePower?.effective
      ?? parent?.system?.resources?.ki?.max
      ?? parent?.system?.resources?.battlePower?.value
      ?? 0
    );

    if (this.type === "technique") {
      const rawCost = String(this.system.kiCostRaw ?? "").trim();
      if (rawCost) this.system.kiCostResolved = parseKiCost(rawCost, battlePower, { warn: false });
      else this.system.kiCostResolved = Number(this._source?.system?.kiCostResolved || this.system.kiCostResolved || 0);
    }

    // Boost and trait costs are raw expressions (numbers and/or %-of-BP). Resolve them the same
    // way techniques resolve Ki cost so every cost field accepts percentages. For owned items the
    // authoritative pass is in the actor's derive (after effective BP is known); this covers
    // standalone items shown in the sidebar/compendium.
    if (this.type === "boost" || this.type === "trait") {
      this.system.costResolved = parseKiCost(this.system.cost ?? "", battlePower, { warn: false });
    }

    for (const effect of this.system.effects ?? []) {
      effect.kiCostResolved = parseKiCost(effect.kiCostRaw ?? "", battlePower, { warn: false });
    }
  }

  async _onUpdate(changed, options, userId) {
    await super._onUpdate(changed, options, userId);
    // When a non-boost activatable item (trait, technique, ...) is toggled active, resolve any
    // Current/Temp HITs effect as a one-time heal on the owning actor. Boosts already do this in
    // activateBoost, so they are skipped here to avoid a double heal. Only the acting client runs.
    if (game.userId !== userId) return;
    if (this.type === "boost") return;
    const actor = this.parent;
    if (!actor || actor.documentName !== "Actor") return;
    if (foundry.utils.getProperty(changed, "system.active") !== true) return;
    const hasHeal = (this.system.effects ?? []).some(effect =>
      effect?.enabled && ["resources.hits.value", "resources.tempHits.value"].includes(effect.target));
    if (!hasHeal) return;
    const healed = await applyItemInstantHeals(actor, this);
    if (healed.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<article class="dbzf-chat-card" data-kind="item"><header class="dbzf-chat-header-with-img"><img src="${this.img}" alt="" /><div><h3>${escapeHtml(this.name)}</h3><p>${escapeHtml(actor.name)} activates ${escapeHtml(this.type)}.</p></div></header><dl class="dbzf-chat-grid"><dt>Resolved</dt><dd>${escapeHtml(healed.join("; "))}</dd></dl></article>`
      });
    }
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}
