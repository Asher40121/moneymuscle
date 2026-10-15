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
