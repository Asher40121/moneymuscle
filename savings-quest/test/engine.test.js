import { test } from "node:test";
import assert from "node:assert/strict";
import {
  xpToReachLevel,
  levelForTotalXp,
  computeStreakWeeks,
  streakMultiplier,
  computeNetSaveGrowth,
  computeSaveXp,
  computeHeartXp,
  computeStaminaXp,
  checkMilestonesCrossed,
  applyWithdrawalToPowerCharge,
} from "../engine.js";

test("xpToReachLevel follows the configured curve", () => {
  assert.equal(xpToReachLevel(0), 0);
  assert.equal(xpToReachLevel(1), 100);
  assert.equal(xpToReachLevel(2), 264);
  assert.equal(xpToReachLevel(3), 466);
});

test("levelForTotalXp derives the right level at and around thresholds", () => {
  assert.equal(levelForTotalXp(0).level, 0);
  assert.equal(levelForTotalXp(99).level, 0);
  assert.equal(levelForTotalXp(100).level, 1);
  assert.equal(levelForTotalXp(263).level, 1);
  assert.equal(levelForTotalXp(264).level, 2);
});

test("level is monotonic non-decreasing as XP grows (never drops)", () => {
  let prevLevel = 0;
  for (let xp = 0; xp <= 20000; xp += 137) {
    const { level } = levelForTotalXp(xp);
    assert.ok(level >= prevLevel, `level dropped at xp=${xp}`);
    prevLevel = level;
  }
});

test("level caps at MAX_LEVEL even with absurd XP", () => {
  const { level, isMaxLevel } = levelForTotalXp(10_000_000);
  assert.equal(level, 50);
  assert.equal(isMaxLevel, true);
});

test("computeStreakWeeks: no activity at all", () => {
  const weeks = computeStreakWeeks(new Set(), ["2026-10-12", "2026-10-05", "2026-09-28"]);
  assert.equal(weeks, 0);
});

test("computeStreakWeeks: streak still alive via last week, this week not over yet", () => {
  const weekKeys = new Set(["2026-10-05", "2026-09-28"]);
  const ordered = ["2026-10-12", "2026-10-05", "2026-09-28", "2026-09-21"];
  assert.equal(computeStreakWeeks(weekKeys, ordered), 2);
});

test("computeStreakWeeks: breaks on the first missing week", () => {
  const weekKeys = new Set(["2026-10-12", "2026-10-05", "2026-09-21"]); // gap at 09-28
  const ordered = ["2026-10-12", "2026-10-05", "2026-09-28", "2026-09-21"];
  assert.equal(computeStreakWeeks(weekKeys, ordered), 2);
});

test("streakMultiplier: no bonus for a single week, grows from the 2nd week, then caps", () => {
  assert.equal(streakMultiplier(0), 1);
  assert.equal(streakMultiplier(1), 1); // one week alone isn't a streak yet
  assert.equal(streakMultiplier(5), 1.4); // 4 bonus weeks
  assert.equal(streakMultiplier(10), 1.9); // 9 bonus weeks
  assert.equal(streakMultiplier(50), 2.0); // capped
});

test("computeNetSaveGrowth: no pending withdrawals, full amount counts", () => {
  const { netAmount, updatedWithdrawals } = computeNetSaveGrowth({
    grossAmount: 10,
    pendingWithdrawals: [],
    now: "2026-10-14T00:00:00.000Z",
  });
  assert.equal(netAmount, 10);
  assert.deepEqual(updatedWithdrawals, []);
});

test("computeNetSaveGrowth: recent withdrawal fully absorbs a matching deposit", () => {
  const { netAmount, updatedWithdrawals } = computeNetSaveGrowth({
    grossAmount: 10,
    pendingWithdrawals: [
      { amount: 10, at: "2026-10-13T00:00:00.000Z", remaining: 10 },
    ],
    now: "2026-10-14T00:00:00.000Z",
  });
  assert.equal(netAmount, 0);
  assert.deepEqual(updatedWithdrawals, []);
});

test("computeNetSaveGrowth: partial absorption leaves a smaller remaining withdrawal", () => {
  const { netAmount, updatedWithdrawals } = computeNetSaveGrowth({
    grossAmount: 10,
    pendingWithdrawals: [
      { amount: 15, at: "2026-10-13T00:00:00.000Z", remaining: 15 },
    ],
    now: "2026-10-14T00:00:00.000Z",
  });
  assert.equal(netAmount, 0);
  assert.equal(updatedWithdrawals.length, 1);
  assert.equal(updatedWithdrawals[0].remaining, 5);
});

test("computeNetSaveGrowth: withdrawal outside the reversal window no longer offsets anything", () => {
  const { netAmount, updatedWithdrawals } = computeNetSaveGrowth({
    grossAmount: 10,
    pendingWithdrawals: [
      { amount: 10, at: "2026-10-01T00:00:00.000Z", remaining: 10 },
    ],
    now: "2026-10-14T00:00:00.000Z",
    reversalWindowDays: 3,
  });
  assert.equal(netAmount, 10);
  assert.deepEqual(updatedWithdrawals, []);
});

test("computeSaveXp applies the streak multiplier to net amount", () => {
  assert.equal(computeSaveXp({ netAmount: 10, streakWeeks: 0 }), 100);
  assert.equal(computeSaveXp({ netAmount: 10, streakWeeks: 10 }), 190); // 1.9x at 9 bonus weeks
});

test("computeHeartXp and computeStaminaXp use their own flat rates", () => {
  assert.equal(computeHeartXp(5), 50);
  assert.equal(computeStaminaXp(5), 5);
});

test("checkMilestonesCrossed: crosses exactly one threshold", () => {
  assert.deepEqual(
    checkMilestonesCrossed({ priorSaveTotal: 0, newSaveTotal: 30, goalTarget: 100 }),
    [0.25],
  );
});

test("checkMilestonesCrossed: a big jump crosses several thresholds at once", () => {
  assert.deepEqual(
    checkMilestonesCrossed({ priorSaveTotal: 20, newSaveTotal: 80, goalTarget: 100 }),
    [0.25, 0.5, 0.75],
  );
});

test("checkMilestonesCrossed: no active goal means no milestones", () => {
  assert.deepEqual(
    checkMilestonesCrossed({ priorSaveTotal: 0, newSaveTotal: 50, goalTarget: null }),
    [],
  );
});

test("applyWithdrawalToPowerCharge drains the meter and clamps to [0, max]", () => {
  assert.equal(
    applyWithdrawalToPowerCharge({ currentPowerCharge: 100, amountWithdrawn: 10 }),
    80,
  );
  assert.equal(
    applyWithdrawalToPowerCharge({ currentPowerCharge: 5, amountWithdrawn: 100 }),
    0,
  );
});
