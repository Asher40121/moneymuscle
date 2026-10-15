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

// ---------------------------------------------------------------------
// Stage 5 — settings enforcement. All pure: `now` and every setting
// come in as plain data, so quiet hours / daily limits / the flags are
// fully testable without a clock, localStorage, or Phaser.
// ---------------------------------------------------------------------

// quietHours: { startHour, startMinute=0, endHour, endMinute=0 } in the
// browser's local time, or null/undefined for "no quiet hours". Handles
// a window that wraps past midnight (e.g. 20:00 -> 07:00).
export function isWithinQuietHours(now, quietHours) {
  if (!quietHours) return false;
  const d = new Date(now);
  const minutesNow = d.getHours() * 60 + d.getMinutes();
  const start = quietHours.startHour * 60 + (quietHours.startMinute || 0);
  const end = quietHours.endHour * 60 + (quietHours.endMinute || 0);
  if (start === end) return false; // zero-width window = disabled
  if (start < end) return minutesNow >= start && minutesNow < end;
  return minutesNow >= start || minutesNow < end; // wraps past midnight
}

export function dailyLimitReached(minutesPlayedToday, dailyPlayMinutes) {
  if (dailyPlayMinutes == null) return false;
  return minutesPlayedToday >= dailyPlayMinutes;
}

// The single composite gate the World Gate (and the in-world periodic
// re-check) both call. Checked in the order a parent would expect to
// explain it: is the game even on, is it on for THIS kid, is it quiet
// hours, has today's limit already been used up, and only then does
// stamina charge (Stage 4's separate, unrelated gate) get checked.
export function canPlayNow({
  familyEnabled,
  kidEnabled,
  now,
  quietHours,
  minutesPlayedToday,
  dailyPlayMinutes,
  staminaCharge,
  costPerEntry,
}) {
  if (!familyEnabled) return { ok: false, reason: "flag-off" };
  if (!kidEnabled) return { ok: false, reason: "kid-disabled" };
  if (isWithinQuietHours(now, quietHours)) return { ok: false, reason: "quiet-hours" };
  if (dailyLimitReached(minutesPlayedToday, dailyPlayMinutes)) return { ok: false, reason: "daily-limit" };
  if (!canEnterRegion(staminaCharge, costPerEntry)) return { ok: false, reason: "no-charge" };
  return { ok: true, reason: null };
}
