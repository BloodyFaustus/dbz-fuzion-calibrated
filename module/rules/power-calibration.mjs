export const XP_BP_BANDS = [
  { battlePower: 750, xp: 50 },
  { battlePower: 1250, xp: 100 },
  { battlePower: 1750, xp: 150 },
  { battlePower: 2500, xp: 200 },
  { battlePower: 4000, xp: 250 },
  { battlePower: 6000, xp: 300 },
  { battlePower: 10000, xp: 350 },
  { battlePower: 15000, xp: 400 },
  { battlePower: 22500, xp: 450 },
  { battlePower: 35000, xp: 500 },
  { battlePower: 50000, xp: 550 },
  { battlePower: 75000, xp: 600 },
  { battlePower: 100000, xp: 650 },
  { battlePower: 150000, xp: 700 },
  { battlePower: 225000, xp: 750 },
  { battlePower: 350000, xp: 800 },
  { battlePower: 525000, xp: 850 },
  { battlePower: 800000, xp: 900 },
  { battlePower: 1200000, xp: 950 },
  { battlePower: 1800000, xp: 1000 },
  { battlePower: 2700000, xp: 1050 },
  { battlePower: 4000000, xp: 1100 },
  { battlePower: 6000000, xp: 1150 },
  { battlePower: 9000000, xp: 1200 },
  { battlePower: 14000000, xp: 1250 },
  { battlePower: 21000000, xp: 1300 },
  { battlePower: 32000000, xp: 1350 },
  { battlePower: 48000000, xp: 1400 },
  { battlePower: 72000000, xp: 1450 },
  { battlePower: 108000000, xp: 1500 },
  { battlePower: 162000000, xp: 1550 },
  { battlePower: 250000000, xp: 1600 },
  { battlePower: 375000000, xp: 1650 },
  { battlePower: 550000000, xp: 1700 },
  { battlePower: 825000000, xp: 1750 },
  { battlePower: 1200000000, xp: 1800 },
  { battlePower: 1800000000, xp: 1850 },
  { battlePower: 2700000000, xp: 1900 },
  { battlePower: 4000000000, xp: 1950 },
  { battlePower: 6000000000, xp: 2000 }
];

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function xpFromBattlePower(bp, bands = XP_BP_BANDS) {
  bp = number(bp);
  if (bp <= 0) return 0;
  if (bp < 750) return Math.round((bp / 750) * 50);
  const exact = bands.find(b => b.battlePower === bp);
  if (exact) return exact.xp;
  const lower = [...bands].reverse().find(b => b.battlePower < bp);
  const upper = bands.find(b => b.battlePower > bp);
  if (!lower) return 0;
  if (!upper) return lower.xp;
  const t = Math.log(bp / lower.battlePower) / Math.log(upper.battlePower / lower.battlePower);
  return Math.round(lower.xp + ((upper.xp - lower.xp) * t));
}

export function battlePowerFromXp(xp, bands = XP_BP_BANDS) {
  xp = number(xp);
  if (xp <= 0) return 0;
  if (xp < 50) return Math.round((xp / 50) * 750);
  const exact = bands.find(b => b.xp === xp);
  if (exact) return exact.battlePower;
  const lower = [...bands].reverse().find(b => b.xp < xp);
  const upper = bands.find(b => b.xp > xp);
  if (!lower) return 0;
  if (!upper) return lower.battlePower;
  const t = (xp - lower.xp) / (upper.xp - lower.xp);
  return Math.round(lower.battlePower * Math.pow(upper.battlePower / lower.battlePower, t));
}

export function roundBattlePowerSuggestion(bp) {
  bp = Math.round(number(bp));
  if (bp <= 10000) return bp;
  const magnitude = Math.pow(10, Math.floor(Math.log10(bp)) - 1);
  return Math.floor(bp / magnitude) * magnitude;
}

export function getBpBandEnvelope(bp, bands = XP_BP_BANDS) {
  bp = number(bp);
  const lower = [...bands].reverse().find(b => b.battlePower <= bp) ?? bands[0];
  const upper = bands.find(b => b.battlePower >= bp) ?? bands[bands.length - 1];
  return {
    lowerBandBattlePower: lower?.battlePower ?? 0,
    upperBandBattlePower: upper?.battlePower ?? 0
  };
}

export function calculatePowerCalibration({
  basePhysical = 0,
  baseMental = 0,
  experienceTotal = 0,
  currentBattlePower = 0,
  powerScaling = {}
} = {}) {
  const strictFormulaBattlePower = Math.round((number(basePhysical) + number(baseMental)) * 10);
  const xpBandSuggestedBattlePower = number(experienceTotal) > 0
    ? roundBattlePowerSuggestion(battlePowerFromXp(experienceTotal))
    : strictFormulaBattlePower;
  const battlePowerMode = powerScaling.battlePowerMode || "manual";
  const canonPowerLevel = number(powerScaling.canonPowerLevel);
  let suggestedBattlePower;

  if (battlePowerMode === "strictFormula") {
    suggestedBattlePower = strictFormulaBattlePower;
  } else if (battlePowerMode === "hybridCalibration") {
    // Hybrid: anchor to the canon power level when the GM has supplied one, otherwise
    // blend the strict formula with the XP-band suggestion. Previously this mode fell
    // through to the XP-band path and behaved identically to "manual".
    suggestedBattlePower = canonPowerLevel > 0
      ? canonPowerLevel
      : Math.round((strictFormulaBattlePower + (xpBandSuggestedBattlePower || strictFormulaBattlePower)) / 2);
  } else {
    suggestedBattlePower = xpBandSuggestedBattlePower || strictFormulaBattlePower;
  }

  const envelope = getBpBandEnvelope(currentBattlePower);
  return {
    battlePowerMode,
    strictFormulaBattlePower,
    xpBandSuggestedBattlePower,
    suggestedBattlePower: roundBattlePowerSuggestion(suggestedBattlePower),
    xpFromCurrentBattlePower: xpFromBattlePower(currentBattlePower),
    lowerBandBattlePower: envelope.lowerBandBattlePower,
    upperBandBattlePower: envelope.upperBandBattlePower,
    canonToStrictRatio: strictFormulaBattlePower > 0 && canonPowerLevel > 0
      ? Number((canonPowerLevel / strictFormulaBattlePower).toFixed(4))
      : 1
  };
}
