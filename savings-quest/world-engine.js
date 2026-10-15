// Savings Quest — Stage 4 pure world logic.
//
// Same philosophy as engine.js and unlocks.js: no storage, no DOM, no
// Phaser. Region/boss unlocking deliberately is NOT duplicated here —
// regions.json and bosses.json both shape their `unlock` field exactly
// like an item's, so unlocks.js's isItemUnlocked(region, heroContext)
// and describeUnlockRequirement(...) already work on them unchanged.
// This file only covers what's genuinely new: stamina-charge math, the
// daily-check-in date rule, the landmark path stage, and the two
// in-region puzzles plus the boss's calm-down sequence.

export function canEnterRegion(staminaCharge, costPerEntry) {
  return staminaCharge >= costPerEntry;
}

export function spendCharge(staminaCharge, cost, max) {
  return Math.max(0, Math.min(max, staminaCharge - cost));
}

export function addCharge(staminaCharge, amount, max) {
  return Math.max(0, Math.min(max, staminaCharge + amount));
}

// ISO date-only comparison (yyyy-mm-dd slice), matching the simple
// string-based day/week comparisons already used elsewhere in this
// module (startOfWeekKey in data.js) rather than pulling in a date lib.
export function isNewCalendarDay(lastCheckInDate, now) {
  if (!lastCheckInDate) return true;
  return lastCheckInDate.slice(0, 10) !== now.slice(0, 10);
}

// Counts how many of the (already-sorted-ascending) milestone thresholds
// the kid's current save total has crossed toward their active goal —
// reuses the exact same fractions items/bosses unlock against, so the
// landmark path and the gear/boss unlocks always agree with each other.
export function computeLandmarkStage({ currentSaveTotal, goalTarget, thresholds }) {
  if (!goalTarget || goalTarget <= 0) return 0;
  const progress = currentSaveTotal / goalTarget;
  return thresholds.filter((t) => progress >= t).length;
}

export function checkCoinOrderPuzzle(submittedOrder, correctValues) {
  const sorted = [...correctValues].sort((a, b) => a - b);
  if (submittedOrder.length !== sorted.length) return false;
  return submittedOrder.every((v, i) => v === sorted[i]);
}

export function checkNeedsWantsSort(submittedMap, items) {
  let correct = 0;
  for (const item of items) {
    if (submittedMap[item.id] === item.answer) correct += 1;
  }
  return { correct, total: items.length, passed: correct === items.length };
}

export function checkBossSequence(submittedSequence, correctSequence) {
  if (submittedSequence.length !== correctSequence.length) return false;
  return submittedSequence.every((step, i) => step === correctSequence[i]);
}
