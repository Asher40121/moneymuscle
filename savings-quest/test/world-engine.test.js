import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canEnterRegion,
  spendCharge,
  addCharge,
  isNewCalendarDay,
  computeLandmarkStage,
  checkCoinOrderPuzzle,
  checkNeedsWantsSort,
  checkBossSequence,
  isWithinQuietHours,
  dailyLimitReached,
  canPlayNow,
} from "../world-engine.js";

test("canEnterRegion: enough charge vs. not enough", () => {
  assert.equal(canEnterRegion(1, 1), true);
  assert.equal(canEnterRegion(0, 1), false);
});

test("spendCharge clamps to [0, max] and never goes negative", () => {
  assert.equal(spendCharge(1, 1, 5), 0);
  assert.equal(spendCharge(0, 1, 5), 0); // already empty, still 0, not -1
});

test("addCharge clamps to the max, never exceeds it", () => {
  assert.equal(addCharge(4, 2, 5), 5);
  assert.equal(addCharge(0, 2, 5), 2);
});

test("isNewCalendarDay: null last check-in is always a new day", () => {
  assert.equal(isNewCalendarDay(null, "2026-10-14T00:00:00.000Z"), true);
});

test("isNewCalendarDay: same day (even different time) is not new", () => {
  assert.equal(
    isNewCalendarDay("2026-10-14T08:00:00.000Z", "2026-10-14T23:00:00.000Z"),
    false,
  );
});

test("isNewCalendarDay: next day is new", () => {
  assert.equal(
    isNewCalendarDay("2026-10-14T23:00:00.000Z", "2026-10-15T00:00:01.000Z"),
    true,
  );
});

test("computeLandmarkStage: no active goal is stage 0", () => {
  assert.equal(
    computeLandmarkStage({ currentSaveTotal: 50, goalTarget: null, thresholds: [0.25, 0.5, 0.75, 1] }),
    0,
  );
});

test("computeLandmarkStage: counts how many thresholds are crossed", () => {
  const thresholds = [0.25, 0.5, 0.75, 1];
  assert.equal(computeLandmarkStage({ currentSaveTotal: 10, goalTarget: 100, thresholds }), 0);
  assert.equal(computeLandmarkStage({ currentSaveTotal: 30, goalTarget: 100, thresholds }), 1);
  assert.equal(computeLandmarkStage({ currentSaveTotal: 60, goalTarget: 100, thresholds }), 2);
  assert.equal(computeLandmarkStage({ currentSaveTotal: 100, goalTarget: 100, thresholds }), 4);
});

test("checkCoinOrderPuzzle: correct ascending order passes regardless of input array order", () => {
  assert.equal(checkCoinOrderPuzzle([1, 5, 10, 20], [20, 1, 10, 5]), true);
  assert.equal(checkCoinOrderPuzzle([1, 10, 5, 20], [1, 5, 10, 20]), false);
});

test("checkCoinOrderPuzzle: wrong length never passes", () => {
  assert.equal(checkCoinOrderPuzzle([1, 5, 10], [1, 5, 10, 20]), false);
});

const needsWantsItems = [
  { id: "coat", answer: "need" },
  { id: "game", answer: "want" },
];

test("checkNeedsWantsSort: all correct", () => {
  const result = checkNeedsWantsSort({ coat: "need", game: "want" }, needsWantsItems);
  assert.deepEqual(result, { correct: 2, total: 2, passed: true });
});

test("checkNeedsWantsSort: partially correct never reports passed", () => {
  const result = checkNeedsWantsSort({ coat: "want", game: "want" }, needsWantsItems);
  assert.deepEqual(result, { correct: 1, total: 2, passed: false });
});

test("checkBossSequence: exact match only", () => {
  const correct = ["breathe", "count", "wait", "smile"];
  assert.equal(checkBossSequence(["breathe", "count", "wait", "smile"], correct), true);
  assert.equal(checkBossSequence(["breathe", "wait", "count", "smile"], correct), false);
  assert.equal(checkBossSequence(["breathe", "count"], correct), false);
});

test("isWithinQuietHours: no quiet hours configured is never quiet", () => {
  assert.equal(isWithinQuietHours("2026-10-14T22:00:00", null), false);
});

test("isWithinQuietHours: simple same-day window", () => {
  const q = { startHour: 13, endHour: 15 };
  assert.equal(isWithinQuietHours("2026-10-14T13:30:00", q), true);
  assert.equal(isWithinQuietHours("2026-10-14T12:59:00", q), false);
  assert.equal(isWithinQuietHours("2026-10-14T15:00:00", q), false); // end is exclusive
});

test("isWithinQuietHours: window wraps past midnight", () => {
  const q = { startHour: 20, endHour: 7 };
  assert.equal(isWithinQuietHours("2026-10-14T23:00:00", q), true); // late night
  assert.equal(isWithinQuietHours("2026-10-14T06:30:00", q), true); // early morning
  assert.equal(isWithinQuietHours("2026-10-14T12:00:00", q), false); // midday
});

test("isWithinQuietHours: zero-width window (start === end) is disabled", () => {
  assert.equal(isWithinQuietHours("2026-10-14T20:00:00", { startHour: 20, endHour: 20 }), false);
});

test("dailyLimitReached: null limit means no limit", () => {
  assert.equal(dailyLimitReached(500, null), false);
});

test("dailyLimitReached: reached at or above the limit", () => {
  assert.equal(dailyLimitReached(29, 30), false);
  assert.equal(dailyLimitReached(30, 30), true);
  assert.equal(dailyLimitReached(45, 30), true);
});

const basePlayArgs = {
  familyEnabled: true,
  kidEnabled: true,
  now: "2026-10-14T12:00:00",
  quietHours: null,
  minutesPlayedToday: 0,
  dailyPlayMinutes: null,
  staminaCharge: 5,
  costPerEntry: 1,
};

test("canPlayNow: flag-off beats every other reason", () => {
  const result = canPlayNow({ ...basePlayArgs, familyEnabled: false, kidEnabled: false });
  assert.deepEqual(result, { ok: false, reason: "flag-off" });
});

test("canPlayNow: kid-disabled, even with the family flag on", () => {
  const result = canPlayNow({ ...basePlayArgs, kidEnabled: false });
  assert.deepEqual(result, { ok: false, reason: "kid-disabled" });
});

test("canPlayNow: quiet hours block play even with charge and time available", () => {
  const result = canPlayNow({ ...basePlayArgs, now: "2026-10-14T21:00:00", quietHours: { startHour: 20, endHour: 7 } });
  assert.deepEqual(result, { ok: false, reason: "quiet-hours" });
});

test("canPlayNow: daily limit blocks play", () => {
  const result = canPlayNow({ ...basePlayArgs, minutesPlayedToday: 30, dailyPlayMinutes: 30 });
  assert.deepEqual(result, { ok: false, reason: "daily-limit" });
});

test("canPlayNow: no stamina charge blocks play", () => {
  const result = canPlayNow({ ...basePlayArgs, staminaCharge: 0 });
  assert.deepEqual(result, { ok: false, reason: "no-charge" });
});

test("canPlayNow: everything clear", () => {
  assert.deepEqual(canPlayNow(basePlayArgs), { ok: true, reason: null });
});
