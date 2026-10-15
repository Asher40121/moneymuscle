import { test } from "node:test";
import assert from "node:assert/strict";
import { isDailyCheckinQuestComplete, isWeeklyTargetMet } from "../quests-engine.js";

test("isDailyCheckinQuestComplete: null means never checked in", () => {
  assert.equal(isDailyCheckinQuestComplete(null, "2026-10-14T12:00:00.000Z"), false);
});

test("isDailyCheckinQuestComplete: true only for today's date, regardless of time", () => {
  assert.equal(
    isDailyCheckinQuestComplete("2026-10-14T08:00:00.000Z", "2026-10-14T23:59:00.000Z"),
    true,
  );
});

test("isDailyCheckinQuestComplete: false for yesterday's check-in", () => {
  assert.equal(
    isDailyCheckinQuestComplete("2026-10-13T23:59:00.000Z", "2026-10-14T00:00:01.000Z"),
    false,
  );
});

test("isWeeklyTargetMet: at or above target passes", () => {
  assert.equal(isWeeklyTargetMet(5, 5), true);
  assert.equal(isWeeklyTargetMet(10, 5), true);
});

test("isWeeklyTargetMet: below target does not pass", () => {
  assert.equal(isWeeklyTargetMet(4.99, 5), false);
  assert.equal(isWeeklyTargetMet(0, 5), false);
});
