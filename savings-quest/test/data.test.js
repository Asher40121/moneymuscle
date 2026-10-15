import { test } from "node:test";
import assert from "node:assert/strict";
import { createSavingsQuestStore, createMemoryStorage } from "../data.js";

function freshStore() {
  return createSavingsQuestStore(createMemoryStorage());
}

test("getHero returns a sane default for a kid with no history", () => {
  const store = freshStore();
  const hero = store.getHero("kid-1");
  assert.equal(hero.level, 0);
  assert.equal(hero.totalXp, 0);
  assert.equal(hero.heart, 0);
  assert.equal(hero.stamina, 0);
  assert.equal(hero.powerCharge, 100);
});

test("recordSaveEvent writes one ledger entry and updates hero level/XP", () => {
  const store = freshStore();
  const { written, hero } = store.recordSaveEvent({
    kidId: "kid-1",
    amount: 10,
    sourceEventId: "evt-1",
    now: "2026-10-14T00:00:00.000Z",
    priorDollarSaveTotal: 0,
    newDollarSaveTotal: 10,
    goalTarget: null,
  });
  assert.equal(written, true);
  assert.equal(hero.totalXp, 100); // 10 * 10 XP/$ * 1.0 multiplier (no streak yet)
  assert.equal(hero.level, 1);
  assert.equal(store.getXpLedger().length, 1);
});

test("recordSaveEvent is idempotent per sourceEventId", () => {
  const store = freshStore();
  store.recordSaveEvent({
    kidId: "kid-1",
    amount: 10,
    sourceEventId: "evt-1",
    now: "2026-10-14T00:00:00.000Z",
    priorDollarSaveTotal: 0,
    newDollarSaveTotal: 10,
    goalTarget: null,
  });
  const second = store.recordSaveEvent({
    kidId: "kid-1",
    amount: 10,
    sourceEventId: "evt-1", // same source event replayed
    now: "2026-10-14T00:00:00.000Z",
    priorDollarSaveTotal: 0,
    newDollarSaveTotal: 10,
    goalTarget: null,
  });
  assert.equal(second.written, false);
  assert.equal(store.getXpLedger().length, 1); // still just one entry
  assert.equal(store.getHero("kid-1").totalXp, 100); // not doubled
});

test("recordGiveEvent raises Heart without ever touching Level XP", () => {
  const store = freshStore();
  store.recordSaveEvent({
    kidId: "kid-1",
    amount: 10,
    sourceEventId: "evt-save",
    now: "2026-10-14T00:00:00.000Z",
    priorDollarSaveTotal: 0,
    newDollarSaveTotal: 10,
    goalTarget: null,
  });
  const { hero } = store.recordGiveEvent({
    kidId: "kid-1",
    amount: 5,
    sourceEventId: "evt-give",
    now: "2026-10-14T00:00:00.000Z",
  });
  assert.equal(hero.heart, 50);
  assert.equal(hero.totalXp, 100); // unchanged by giving
  assert.equal(hero.level, 1); // unchanged by giving
});

test("recordChoreApprovedEvent raises Stamina without touching Level XP", () => {
  const store = freshStore();
  const { hero } = store.recordChoreApprovedEvent({
    kidId: "kid-1",
    price: 5,
    sourceEventId: "evt-chore",
    now: "2026-10-14T00:00:00.000Z",
  });
  assert.equal(hero.stamina, 5);
  assert.equal(hero.totalXp, 0);
  assert.equal(hero.level, 0);
});

test("milestones are recorded once even if checked repeatedly for the same threshold", () => {
  const store = freshStore();
  store.recordSaveEvent({
    kidId: "kid-1",
    amount: 30,
    sourceEventId: "evt-1",
    now: "2026-10-14T00:00:00.000Z",
    priorDollarSaveTotal: 0,
    newDollarSaveTotal: 30,
    goalTarget: 100,
  });
  // A second, different save event that doesn't cross a NEW threshold.
  store.recordSaveEvent({
    kidId: "kid-1",
    amount: 5,
    sourceEventId: "evt-2",
    now: "2026-10-14T00:00:00.000Z",
    priorDollarSaveTotal: 30,
    newDollarSaveTotal: 35,
    goalTarget: 100,
  });
  const milestones = store.getMilestones("kid-1");
  assert.equal(milestones.length, 1);
  assert.equal(milestones[0].threshold, 0.25);
});

test("the savingsQuest flag persists across store instances on the same storage", () => {
  const storage = createMemoryStorage();
  const storeA = createSavingsQuestStore(storage);
  assert.equal(storeA.isSavingsQuestEnabled(), false);
  storeA.setSavingsQuestEnabled(true);

  const storeB = createSavingsQuestStore(storage); // fresh instance, same backing storage
  assert.equal(storeB.isSavingsQuestEnabled(), true);
});

test("a withdrawal drains Power Charge but never reduces level or lifetime XP", () => {
  const store = freshStore();
  store.recordSaveEvent({
    kidId: "kid-1",
    amount: 20,
    sourceEventId: "evt-save",
    now: "2026-10-01T00:00:00.000Z",
    priorDollarSaveTotal: 0,
    newDollarSaveTotal: 20,
    goalTarget: null,
  });
  const beforeLevel = store.getHero("kid-1").level;
  const beforeXp = store.getHero("kid-1").totalXp;

  const { hero } = store.recordWithdrawal({
    kidId: "kid-1",
    amount: 10,
    sourceEventId: "evt-withdraw",
    now: "2026-10-02T00:00:00.000Z",
  });

  assert.equal(hero.powerCharge, 80); // 100 - 10*2
  assert.equal(hero.level, beforeLevel);
  assert.equal(hero.totalXp, beforeXp);
});

test("anti-farming: a save shortly after a withdrawal of the same amount nets ~0 new XP", () => {
  const store = freshStore();
  store.recordSaveEvent({
    kidId: "kid-1",
    amount: 20,
    sourceEventId: "evt-save-1",
    now: "2026-10-01T00:00:00.000Z",
    priorDollarSaveTotal: 0,
    newDollarSaveTotal: 20,
    goalTarget: null,
  });
  const xpAfterFirstSave = store.getHero("kid-1").totalXp;

  store.recordWithdrawal({
    kidId: "kid-1",
    amount: 20,
    sourceEventId: "evt-withdraw",
    now: "2026-10-02T00:00:00.000Z",
  });

  // Same money comes right back one day later — within the 3-day window.
  const { hero } = store.recordSaveEvent({
    kidId: "kid-1",
    amount: 20,
    sourceEventId: "evt-save-2",
    now: "2026-10-03T00:00:00.000Z",
    priorDollarSaveTotal: 0,
    newDollarSaveTotal: 20,
    goalTarget: null,
  });

  // No new Level XP from "shuffling" the same $20 back in.
  assert.equal(hero.totalXp, xpAfterFirstSave);
});

test("getHero backfills new fields onto a record saved before they existed", () => {
  const storage = createMemoryStorage();
  // Simulate a Stage-2-era hero record with no `loadout` field at all,
  // written directly (bypassing createHero/defaultHero, as an old stored
  // blob genuinely would be).
  storage.setItem(
    "mm_sq_hero",
    JSON.stringify({
      _v: 1,
      data: { "kid-1": { level: 3, totalXp: 264, name: "Zara", heroClass: "ranger" } },
    }),
  );
  const store = createSavingsQuestStore(storage);
  const hero = store.getHero("kid-1");

  assert.equal(hero.name, "Zara"); // real stored value preserved
  assert.equal(hero.level, 3);
  assert.deepEqual(hero.loadout, { weapon: null, armor: null, companion: null, cosmetic: null });
});

test("recordChoreApprovedEvent also refills stamina charge, idempotently", () => {
  const store = freshStore();
  store.spendStaminaCharge("kid-1", 2); // drop below max so a refill is visible
  const before = store.getWorldState("kid-1").staminaCharge;
  store.recordChoreApprovedEvent({
    kidId: "kid-1",
    price: 5,
    sourceEventId: "evt-chore",
    now: "2026-10-14T00:00:00.000Z",
  });
  assert.equal(store.getWorldState("kid-1").staminaCharge, before + 1);

  // Replaying the same chore event must not double-grant charge.
  store.recordChoreApprovedEvent({
    kidId: "kid-1",
    price: 5,
    sourceEventId: "evt-chore",
    now: "2026-10-14T00:00:00.000Z",
  });
  assert.equal(store.getWorldState("kid-1").staminaCharge, before + 1);
});

test("spendStaminaCharge clamps at 0 and recordDailyCheckIn is idempotent per calendar day", () => {
  const store = freshStore();
  const max = store.getWorldState("kid-1").staminaCharge; // starts full

  store.spendStaminaCharge("kid-1", max + 10); // spend more than available
  assert.equal(store.getWorldState("kid-1").staminaCharge, 0);

  const first = store.recordDailyCheckIn("kid-1", "2026-10-14T09:00:00.000Z");
  assert.equal(first.written, true);
  const afterFirstCheckIn = store.getWorldState("kid-1").staminaCharge;
  assert.ok(afterFirstCheckIn > 0);

  // Same calendar day, later that day — must not grant twice.
  const second = store.recordDailyCheckIn("kid-1", "2026-10-14T20:00:00.000Z");
  assert.equal(second.written, false);
  assert.equal(store.getWorldState("kid-1").staminaCharge, afterFirstCheckIn);

  // Next day — grants again.
  const third = store.recordDailyCheckIn("kid-1", "2026-10-15T09:00:00.000Z");
  assert.equal(third.written, true);
  assert.ok(store.getWorldState("kid-1").staminaCharge > afterFirstCheckIn);
});

test("markRegionDiscovered, openChest, solvePuzzle, and defeatBoss are each idempotent", () => {
  const store = freshStore();
  const at = "2026-10-14T00:00:00.000Z";
  store.markRegionDiscovered("kid-1", "meadow", at);
  store.markRegionDiscovered("kid-1", "meadow", at); // replayed
  store.openChest("kid-1", "meadow_chest_1", at);
  store.openChest("kid-1", "meadow_chest_1", at); // replayed
  store.solvePuzzle("kid-1", "coin_order_meadow", at);
  store.solvePuzzle("kid-1", "coin_order_meadow", at); // replayed
  store.defeatBoss("kid-1", "impulse_imp", at);
  store.defeatBoss("kid-1", "impulse_imp", at); // replayed

  const ws = store.getWorldState("kid-1");
  assert.deepEqual(ws.regionsDiscovered, [{ id: "meadow", at }]);
  assert.deepEqual(ws.chestsOpened, [{ id: "meadow_chest_1", at }]);
  assert.deepEqual(ws.puzzlesSolved, [{ id: "coin_order_meadow", at }]);
  assert.deepEqual(ws.bossesDefeated, [{ id: "impulse_imp", at }]);
});

test("Bug fix: opening a chest actually grants XP once, not just a silent 'opened' flag", () => {
  const store = freshStore();
  const at = "2026-10-14T00:00:00.000Z";

  const first = store.openChest("kid-1", "meadow_chest_1", at);
  assert.equal(first.written, true);
  assert.equal(first.rewardXp, 10); // CONFIG.CHEST_REWARD_XP
  assert.equal(first.hero.totalXp, 10);
  assert.equal(store.getHero("kid-1").totalXp, 10);

  // Replaying the same chest must not grant XP a second time.
  const replay = store.openChest("kid-1", "meadow_chest_1", at);
  assert.equal(replay.written, false);
  assert.equal(replay.rewardXp, 0);
  assert.equal(store.getHero("kid-1").totalXp, 10);

  // A different chest grants again.
  const second = store.openChest("kid-1", "meadow_chest_2", at);
  assert.equal(second.written, true);
  assert.equal(store.getHero("kid-1").totalXp, 20);
});

test("Chests reset and re-grant their reward once CONFIG.CHEST_RESET_MS has passed", () => {
  const store = freshStore();
  const openedAt = "2026-10-14T12:00:00.000Z";
  store.openChest("kid-1", "meadow_chest_1", openedAt);
  assert.equal(store.getHero("kid-1").totalXp, 10);

  // 30 seconds later — still within the 60s reset window, blocked.
  const tooSoon = store.openChest("kid-1", "meadow_chest_1", "2026-10-14T12:00:30.000Z");
  assert.equal(tooSoon.written, false);
  assert.equal(store.getHero("kid-1").totalXp, 10);

  // 61 seconds later — reset window has elapsed, grants again.
  const reopened = store.openChest("kid-1", "meadow_chest_1", "2026-10-14T12:01:01.000Z");
  assert.equal(reopened.written, true);
  assert.equal(reopened.rewardXp, 10);
  assert.equal(store.getHero("kid-1").totalXp, 20);
});

test("getWorldState normalizes a pre-Stage-5 plain-string id list to {id, at: null}", () => {
  const storage = createMemoryStorage();
  storage.setItem(
    "mm_sq_world_state",
    JSON.stringify({ _v: 1, data: { "kid-1": { chestsOpened: ["meadow_chest_1"], puzzlesSolved: ["coin_order_meadow"] } } }),
  );
  const store = createSavingsQuestStore(storage);
  const ws = store.getWorldState("kid-1");
  assert.deepEqual(ws.chestsOpened, [{ id: "meadow_chest_1", at: null }]);
  assert.deepEqual(ws.puzzlesSolved, [{ id: "coin_order_meadow", at: null }]);
});

test("getPuzzleSolvesSince excludes pre-Stage-5 solves with an unknown (null) time", () => {
  const storage = createMemoryStorage();
  storage.setItem(
    "mm_sq_world_state",
    JSON.stringify({ _v: 1, data: { "kid-1": { puzzlesSolved: ["coin_order_meadow"] } } }),
  );
  const store = createSavingsQuestStore(storage);
  assert.deepEqual(store.getPuzzleSolvesSince("kid-1", "2026-01-01T00:00:00.000Z"), []);
});

test("getWorldState backfills new fields onto a record saved before Stage 4 existed", () => {
  const storage = createMemoryStorage();
  storage.setItem(
    "mm_sq_world_state",
    JSON.stringify({ _v: 1, data: { "kid-1": { regionsUnlocked: ["meadow"] } } }),
  );
  const store = createSavingsQuestStore(storage);
  const ws = store.getWorldState("kid-1");
  assert.equal(ws.staminaCharge, 5); // CONFIG.STAMINA_CHARGE_MAX, backfilled
  assert.deepEqual(ws.chestsOpened, []);
});

test("getKidSettings returns sane defaults, and setKidSettings merges a partial patch", () => {
  const store = freshStore();
  const defaults = store.getKidSettings("kid-1");
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.xpRatePreset, "standard");
  assert.equal(defaults.dailyPlayMinutes, null);

  store.setKidSettings("kid-1", { dailyPlayMinutes: 30 });
  const patched = store.getKidSettings("kid-1");
  assert.equal(patched.dailyPlayMinutes, 30);
  assert.equal(patched.enabled, true); // untouched fields keep their defaults
});

test("recordSaveEvent applies the kid's XP-rate preset: Gentle > Standard > Challenging for the same save", () => {
  function xpFor(preset) {
    const store = freshStore();
    store.setKidSettings("kid-1", { xpRatePreset: preset });
    const { hero } = store.recordSaveEvent({
      kidId: "kid-1",
      amount: 10,
      sourceEventId: "evt-1",
      now: "2026-10-14T00:00:00.000Z",
      priorDollarSaveTotal: 0,
      newDollarSaveTotal: 10,
      goalTarget: null,
    });
    return hero.totalXp;
  }
  const gentle = xpFor("gentle");
  const standard = xpFor("standard");
  const challenging = xpFor("challenging");
  assert.ok(gentle > standard);
  assert.ok(standard > challenging);
});

test("recordSaveEvent applies the parent-match bonus on top of the preset, as a game-only XP multiplier", () => {
  const store = freshStore();
  store.setKidSettings("kid-1", { parentMatchEnabled: true, parentMatchRate: 1.0 }); // double XP
  const { hero } = store.recordSaveEvent({
    kidId: "kid-1",
    amount: 10,
    sourceEventId: "evt-1",
    now: "2026-10-14T00:00:00.000Z",
    priorDollarSaveTotal: 0,
    newDollarSaveTotal: 10,
    goalTarget: null,
  });
  // Standard preset (1.0) * (1 + 1.0 match) = 2x the plain 100 XP baseline.
  assert.equal(hero.totalXp, 200);
});

test("grantBonusXp counts toward level (via the 'bonus' track) and is visible as a note-bearing grant", () => {
  const store = freshStore();
  const { hero, grant } = store.grantBonusXp("kid-1", {
    amount: 150,
    note: "Great job comparing prices before buying!",
    grantedAt: "2026-10-14T00:00:00.000Z",
  });
  assert.equal(hero.totalXp, 150);
  assert.equal(hero.level, 1);
  assert.equal(grant.note, "Great job comparing prices before buying!");
  assert.equal(grant.seen, false);

  const grants = store.getBonusGrants("kid-1");
  assert.equal(grants.length, 1);
  store.markBonusGrantSeen("kid-1", grant.id);
  assert.equal(store.getBonusGrants("kid-1")[0].seen, true);
});

test("sendCheer / getCheers / markCheerSeen round-trip", () => {
  const store = freshStore();
  const cheer = store.sendCheer("kid-1", "So proud of your saving streak!", "2026-10-14T00:00:00.000Z");
  assert.equal(store.getCheers("kid-1").length, 1);
  assert.equal(store.getCheers("kid-1")[0].seen, false);
  store.markCheerSeen("kid-1", cheer.id);
  assert.equal(store.getCheers("kid-1")[0].seen, true);
});

test("recordPlaySession logs minutes, and getPlayMinutesSince/getPlayMinutesToday sum correctly", () => {
  const store = freshStore();
  store.recordPlaySession("kid-1", "2026-10-14T10:00:00.000Z", "2026-10-14T10:05:00.000Z"); // 5 min
  store.recordPlaySession("kid-1", "2026-10-13T10:00:00.000Z", "2026-10-13T10:10:00.000Z"); // 10 min, yesterday
  store.recordPlaySession("kid-2", "2026-10-14T10:00:00.000Z", "2026-10-14T10:20:00.000Z"); // another kid, excluded

  assert.equal(store.getPlayMinutesToday("kid-1", "2026-10-14T23:00:00.000Z"), 5);
  assert.equal(store.getPlayMinutesSince("kid-1", "2026-10-01T00:00:00.000Z"), 15);
});

test("getWeeklySaveDollars sums only this week's net Save dollars for the given kid", () => {
  const store = freshStore();
  store.recordSaveEvent({
    kidId: "kid-1",
    amount: 3,
    sourceEventId: "evt-1",
    now: "2026-10-14T00:00:00.000Z", // a Wednesday
    priorDollarSaveTotal: 0,
    newDollarSaveTotal: 3,
    goalTarget: null,
  });
  store.recordSaveEvent({
    kidId: "kid-1",
    amount: 4,
    sourceEventId: "evt-2",
    now: "2026-10-15T00:00:00.000Z", // same week
    priorDollarSaveTotal: 3,
    newDollarSaveTotal: 7,
    goalTarget: null,
  });
  store.recordSaveEvent({
    kidId: "kid-1",
    amount: 100,
    sourceEventId: "evt-3",
    now: "2026-09-01T00:00:00.000Z", // a different week entirely
    priorDollarSaveTotal: 7,
    newDollarSaveTotal: 107,
    goalTarget: null,
  });
  assert.equal(store.getWeeklySaveDollars("kid-1", "2026-10-16T00:00:00.000Z"), 7);
});

test("getWeeklyGiveDollars sums only this week's Give dollars for the given kid", () => {
  const store = freshStore();
  store.recordGiveEvent({
    kidId: "kid-1",
    amount: 2,
    sourceEventId: "evt-1",
    now: "2026-10-14T00:00:00.000Z", // a Wednesday
  });
  store.recordGiveEvent({
    kidId: "kid-1",
    amount: 5,
    sourceEventId: "evt-2",
    now: "2026-10-15T00:00:00.000Z", // same week
  });
  store.recordGiveEvent({
    kidId: "kid-1",
    amount: 50,
    sourceEventId: "evt-3",
    now: "2026-09-01T00:00:00.000Z", // a different week entirely
  });
  assert.equal(store.getWeeklyGiveDollars("kid-1", "2026-10-16T00:00:00.000Z"), 7);
});

test("completeQuest is idempotent per period and its reward counts toward level", () => {
  const store = freshStore();
  const first = store.completeQuest("kid-1", "daily_checkin", "2026-10-14", 5, "2026-10-14T00:00:00.000Z");
  assert.equal(first.written, true);
  assert.equal(first.hero.totalXp, 5);

  // Same period replayed — no double reward.
  const replay = store.completeQuest("kid-1", "daily_checkin", "2026-10-14", 5, "2026-10-14T12:00:00.000Z");
  assert.equal(replay.written, false);
  assert.equal(store.getHero("kid-1").totalXp, 5);

  // A new period (the next day) rewards again.
  const nextDay = store.completeQuest("kid-1", "daily_checkin", "2026-10-15", 5, "2026-10-15T00:00:00.000Z");
  assert.equal(nextDay.written, true);
  assert.equal(nextDay.hero.totalXp, 10);
});

test("Stage 6 hardening: a storage that throws (quota exceeded / private browsing) degrades gracefully", () => {
  const throwingStorage = {
    getItem: () => {
      throw new Error("SecurityError: localStorage is not available");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {},
  };
  const store = createSavingsQuestStore(throwingStorage);
  // Reading never throws — falls back to defaults, same as a missing key.
  assert.doesNotThrow(() => store.getHero("kid-1"));
  assert.equal(store.getHero("kid-1").level, 0);
  // Writing never throws either — the change just doesn't persist.
  assert.doesNotThrow(() =>
    store.recordSaveEvent({
      kidId: "kid-1",
      amount: 10,
      sourceEventId: "evt-1",
      now: "2026-10-14T00:00:00.000Z",
      priorDollarSaveTotal: 0,
      newDollarSaveTotal: 10,
      goalTarget: null,
    }),
  );
});

test("getCurrentStreakWeeks reflects only what's actually on the ledger (a pure query)", () => {
  const store = freshStore();
  assert.equal(store.getCurrentStreakWeeks("kid-1", "2026-10-14T00:00:00.000Z"), 0);

  store.recordSaveEvent({
    kidId: "kid-1",
    amount: 10,
    sourceEventId: "evt-1",
    now: "2026-10-14T00:00:00.000Z",
    priorDollarSaveTotal: 0,
    newDollarSaveTotal: 10,
    goalTarget: null,
  });

  // Querying "right now" (same moment as the save) sees that week active.
  assert.equal(store.getCurrentStreakWeeks("kid-1", "2026-10-14T00:00:00.000Z"), 1);
  // Querying a week that never had any activity shows 0 — unlike
  // recordSaveEvent's internal calc, this never assumes "now" counts.
  assert.equal(store.getCurrentStreakWeeks("kid-1", "2026-11-01T00:00:00.000Z"), 0);
});
