// Foundry only lets a user write to documents they own. That makes several system features
// GM-only by accident: a player cannot apply damage to an enemy, cannot mark an attack card as
// already applied when a GM authored it, and cannot push a Team Attack bonus onto an ally.
//
// These writes are handed to the connected GM's client through Foundry's user query API. Only
// the actions registered by the system entry point can be requested, and each one re-validates
// its payload GM-side - a request never carries a raw document update.

const QUERY_PREFIX = "dbz-fuzion-calibrated.";
const RESPONSE_TIMEOUT_MS = 20000;

export function registerGmRelay(actions = {}) {
  for (const [name, handler] of Object.entries(actions)) CONFIG.queries[`${QUERY_PREFIX}${name}`] = handler;
}

// True when this client cannot write these documents itself and has to ask a GM to do it.
export function needsGmRelay(...documents) {
  if (game.user?.isGM) return false;
  return documents.some(doc => doc && !doc.canUserModify(game.user, "update"));
}

/**
 * Ask the connected GM's client to run one of the registered actions.
 * @param {string} action             Registered action name.
 * @param {object} payload            Plain, serialisable data for that action.
 * @param {object} [options]
 * @param {boolean} [options.quiet]   Suppress the failure notification.
 * @returns {Promise<{ok: boolean, result?: *, reason?: string}>}
 */
export async function requestGmAction(action, payload, { quiet = false } = {}) {
  const gm = game.users?.activeGM;
  if (!gm) {
    if (!quiet) ui.notifications.error("No Gamemaster is connected, so this could not be applied. Ask your GM to log in and try again.");
    return { ok: false, reason: "no-gm" };
  }
  try {
    return { ok: true, result: await gm.query(`${QUERY_PREFIX}${action}`, payload, { timeout: RESPONSE_TIMEOUT_MS }) };
  } catch (error) {
    if (!quiet) ui.notifications.error(`The Gamemaster's client could not apply this: ${error.message}`);
    console.error(`dbz-fuzion-calibrated | GM relay action "${action}" failed`, error);
    return { ok: false, reason: error.message };
  }
}
