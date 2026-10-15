// Savings Quest — progression engine.
//
// Pure functions only: no localStorage, no DOM, no Date.now() calls baked
// in. Everything that varies (current time, stored ledgers) comes in as a
// parameter, so this file can be unit-tested directly in Node with no
// browser and no mocking.

import { CONFIG } from "./config.js";

// ---------------------------------------------------------------------
// Level curve
// ---------------------------------------------------------------------

// Cumulative Save-track XP required to REACH `level` (level 0 = 0 XP).
export function xpToReachLevel(level) {
  if (level <= 0) return 0;
  return Math.round(CONFIG.LEVEL_XP_BASE * Math.pow(level, CONFIG.LEVEL_XP_EXPONENT));
}

// Given lifetime Save-track XP, returns the current level (capped at
// MAX_LEVEL) plus progress toward the next level. Level never decreases
// by construction — it's a pure function of a monotonically-increasing
// input (lifetime XP only ever grows, enforced in data.js).
export function levelForTotalXp(totalXp) {
  const safeXp = Math.max(0, totalXp);
  let level = 0;
  while (level < CONFIG.MAX_LEVEL && safeXp >= xpToReachLevel(level + 1)) {
    level++;
  }
  const xpForCurrentLevel = xpToReachLevel(level);
  const xpForNextLevel = level >= CONFIG.MAX_LEVEL ? null : xpToReachLevel(level + 1);
  return {
    level,
    totalXp: safeXp,
    xpIntoLevel: safeXp - xpForCurrentLevel,
    xpForNextLevel: xpForNextLevel === null ? null : xpForNextLevel - xpForCurrentLevel,
    isMaxLevel: level >= CONFIG.MAX_LEVEL,
  };
}

// ---------------------------------------------------------------------
// Streaks (weekly, mirrors the existing daily-streak logic in index.html)
// ---------------------------------------------------------------------

// weekKeysWithSave: Set<string> of week-start keys that had >=1 Save event.
// orderedWeekKeysDescending: array of week-start keys, most recent first
// (index 0 = this week, index 1 = last week, ...).
//
// Mirrors computeStreak()'s day-level logic at week granularity: the
// streak is "still alive" if last week had activity even if this week
// doesn't yet, since this week isn't over.
export function computeStreakWeeks(weekKeysWithSave, orderedWeekKeysDescending) {
  if (orderedWeekKeysDescending.length === 0) return 0;

  let idx = 0;
  if (!weekKeysWithSave.has(orderedWeekKeysDescending[0])) {
    idx = 1;
    if (
      orderedWeekKeysDescending.length < 2 ||
      !weekKeysWithSave.has(orderedWeekKeysDescending[1])
    ) {
      return 0;
    }
  }

  let streak = 0;
  for (; idx < orderedWeekKeysDescending.length; idx++) {
    if (weekKeysWithSave.has(orderedWeekKeysDescending[idx])) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// Stage 6: a FREE streak freeze — missing one week in the middle of an
// otherwise-active streak doesn't reset it to zero. Always available,
// never purchased, never a limited/scarce resource (rule #5 forbids
// loss-pressure mechanics, and a depletable "streak insurance" you have
// to earn or buy would just be loss-pressure with extra steps). A
// brand-new saver with zero recent activity still gets 0 — the freeze
// protects an existing streak, it doesn't fabricate one.
//
// Separate function, not a modification of computeStreakWeeks above,
// so every existing caller/test of the plain version is untouched;
// data.js opts into the freeze-aware version explicitly where it wants
// this more forgiving behavior.
export function computeStreakWeeksWithFreeze(weekKeysWithSave, orderedWeekKeysDescending, freezesAvailable = 1) {
  if (orderedWeekKeysDescending.length === 0) return { streak: 0, freezesUsed: 0 };

  let idx = 0;
  if (!weekKeysWithSave.has(orderedWeekKeysDescending[0])) {
    idx = 1;
    if (
      orderedWeekKeysDescending.length < 2 ||
      !weekKeysWithSave.has(orderedWeekKeysDescending[1])
    ) {
      return { streak: 0, freezesUsed: 0 };
    }
  }

  let streak = 0;
  let freezesUsed = 0;
  for (; idx < orderedWeekKeysDescending.length; idx++) {
    if (weekKeysWithSave.has(orderedWeekKeysDescending[idx])) {
      streak++;
      continue;
    }
    // A gap only gets frozen if there's real activity immediately
    // behind it (further back in time) to actually continue the chain
    // toward — otherwise this "gap" is just where the saver's history
    // ends, and spending a freeze on it would fabricate streak length
    // out of weeks that were never part of any streak at all. This is
    // why a brand-new saver's very first week still correctly reports
    // streak=1, not 2: the week before their first save isn't a
    // "missed" week, it's simply before they existed as a saver.
    const nextWeekIsActive =
      idx + 1 < orderedWeekKeysDescending.length && weekKeysWithSave.has(orderedWeekKeysDescending[idx + 1]);
    if (nextWeekIsActive && freezesUsed < freezesAvailable) {
      freezesUsed++;
      streak++; // the frozen week still counts — the chain isn't broken
    } else {
      break;
    }
  }
  return { streak, freezesUsed };
}

// streakWeeks counts the current week too (see computeStreakWeeks), so a
// brand-new saver's very first week is streakWeeks=1 — that's one data
// point, not a streak, so it earns no bonus. The multiplier only grows
// from the SECOND consecutive week onward.
export function streakMultiplier(streakWeeks) {
  const bonusWeeks = Math.max(0, streakWeeks - 1);
  return Math.min(
    CONFIG.STREAK_MAX_MULTIPLIER,
    1 + bonusWeeks * CONFIG.STREAK_GROWTH_PER_WEEK,
  );
}

// ---------------------------------------------------------------------
// Anti-farming: net Save growth after accounting for recent withdrawals
// ---------------------------------------------------------------------

// pendingWithdrawals: array of { amount, at (ISO string), remaining }.
// Returns the portion of `grossAmount` that counts as genuinely NEW
// savings (eligible for XP), plus the updated withdrawal list (expired
// or fully-absorbed entries removed).
export function computeNetSaveGrowth({
  grossAmount,
  pendingWithdrawals,
  now,
  reversalWindowDays = CONFIG.REVERSAL_WINDOW_DAYS,
}) {
  const cutoff = new Date(now).getTime() - reversalWindowDays * 24 * 60 * 60 * 1000;
  let remainingGross = grossAmount;
  const updatedWithdrawals = [];

  for (const w of pendingWithdrawals) {
    const withinWindow = new Date(w.at).getTime() >= cutoff;
    if (!withinWindow || w.remaining <= 0) continue;

    if (remainingGross > 0) {
      const absorbed = Math.min(w.remaining, remainingGross);
      remainingGross -= absorbed;
      const newRemaining = w.remaining - absorbed;
      if (newRemaining > 0) updatedWithdrawals.push({ ...w, remaining: newRemaining });
    } else {
      updatedWithdrawals.push(w);
    }
  }

  return { netAmount: Math.max(0, remainingGross), updatedWithdrawals };
}

// ---------------------------------------------------------------------
// XP calculations per track
// ---------------------------------------------------------------------

// rateMultiplier folds in Stage 5's per-child XP-rate preset
// (Gentle/Standard/Challenging) and, if enabled, the parent-match
// bonus — both layered on top of the streak multiplier, never
// replacing it. Defaults to 1 so every pre-Stage-5 caller/test is
// unaffected.
export function computeSaveXp({ netAmount, streakWeeks, rateMultiplier = 1 }) {
  const multiplier = streakMultiplier(streakWeeks);
  return Math.round(netAmount * CONFIG.SAVE_XP_PER_DOLLAR * multiplier * rateMultiplier);
}

export function computeHeartXp(giveAmount) {
  return Math.round(Math.max(0, giveAmount) * CONFIG.HEART_PER_DOLLAR_GIVEN);
}

export function computeStaminaXp(chorePrice) {
  return Math.round(Math.max(0, chorePrice) * CONFIG.STAMINA_PER_DOLLAR_CHORE);
}

// ---------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------

// Returns the subset of CONFIG.MILESTONE_THRESHOLDS newly crossed by
// going from priorSaveTotal to newSaveTotal against goalTarget. Returns
// [] if there's no goal (goalTarget is null/undefined/<=0).
export function checkMilestonesCrossed({ priorSaveTotal, newSaveTotal, goalTarget }) {
  if (!goalTarget || goalTarget <= 0) return [];
  const priorFraction = priorSaveTotal / goalTarget;
  const newFraction = newSaveTotal / goalTarget;
  return CONFIG.MILESTONE_THRESHOLDS.filter(
    (threshold) => priorFraction < threshold && newFraction >= threshold,
  );
}

// ---------------------------------------------------------------------
// Withdrawals / Power Charge — never touches level or lifetime XP.
// ---------------------------------------------------------------------

export function applyWithdrawalToPowerCharge({ currentPowerCharge, amountWithdrawn }) {
  const drain = Math.max(0, amountWithdrawn) * CONFIG.POWER_CHARGE_DRAIN_PER_DOLLAR_WITHDRAWN;
  return Math.max(0, Math.min(CONFIG.POWER_CHARGE_MAX, currentPowerCharge - drain));
}
