import { toNumber } from "./calculations.mjs";

export function parseKiCost(rawCost, battlePower = 0, { warn = true } = {}) {
  const raw = String(rawCost ?? "").trim();
  if (!raw) return 0;

  const normalized = raw.replace(/\s+/g, "");
  const terms = normalized.split("+").filter(Boolean);
  let total = 0;
  const invalidTerms = [];

  for (const term of terms) {
    if (/^\d+(\.\d+)?%$/.test(term)) {
      total += toNumber(term.slice(0, -1)) / 100 * toNumber(battlePower);
    } else if (/^\d+(\.\d+)?$/.test(term)) {
      total += toNumber(term);
    } else {
      invalidTerms.push(term);
    }
  }

  if (invalidTerms.length && warn) {
    const message = `DBZ Fuzion | Invalid Ki cost term(s): ${invalidTerms.join(", ")}`;
    if (globalThis.ui?.notifications) ui.notifications.warn(message);
    else console.warn(message);
  }

  return Math.round(total);
}
