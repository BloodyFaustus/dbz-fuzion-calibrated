// Foundry (and the browser) chokes when a single Roll contains thousands of dice — the dice
// tooltip renders one element per die and can freeze the tab. This system routinely produces
// huge d6 pools (e.g. Perfect Cell can roll well over 999d6), so we split any oversized pool
// into chunks that evaluate safely and sum their totals. For chunked pools we attach a compact
// constant Roll for display instead of the raw thousands-of-dice rolls, so the chat card shows
// the combined total without the behind-the-scenes dice.

export const DBZF_MAX_DICE_PER_ROLL = 999;

export async function evaluateDicePool(count, faces = 6) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n === 0) {
    const roll = await new Roll("0").evaluate();
    return { total: 0, count: 0, faces, formula: `0d${faces}`, result: "0", chunked: false, displayRoll: roll, chunkRolls: [] };
  }
  if (n <= DBZF_MAX_DICE_PER_ROLL) {
    const roll = await new Roll(`${n}d${faces}`).evaluate();
    return { total: roll.total, count: n, faces, formula: roll.formula, result: roll.result ?? roll.formula, chunked: false, displayRoll: roll, chunkRolls: [roll] };
  }

  let total = 0;
  let remaining = n;
  const chunkRolls = [];
  while (remaining > 0) {
    const chunk = Math.min(DBZF_MAX_DICE_PER_ROLL, remaining);
    const roll = await new Roll(`${chunk}d${faces}`).evaluate();
    total += Number(roll.total || 0);
    chunkRolls.push(roll);
    remaining -= chunk;
  }
  // Compact constant Roll so the chat card renders the total, not thousands of dice.
  const displayRoll = await new Roll(String(total)).evaluate();
  return {
    total,
    count: n,
    faces,
    formula: `${n}d${faces}`,
    result: `${total} (split into ${chunkRolls.length} pools of up to ${DBZF_MAX_DICE_PER_ROLL}d${faces})`,
    chunked: true,
    displayRoll,
    chunkRolls
  };
}
