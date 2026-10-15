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
  store.markRegionDiscovered("kid-1", "meadow");
  store.markRegionDiscovered("kid-1", "meadow"); // replayed
  store.openChest("kid-1", "meadow_chest_1");
  store.openChest("kid-1", "meadow_chest_1"); // replayed
  store.solvePuzzle("kid-1", "coin_order_meadow");
  store.solvePuzzle("kid-1", "coin_order_meadow"); // replayed
  store.defeatBoss("kid-1", "impulse_imp");
  store.defeatBoss("kid-1", "impulse_imp"); // replayed

  const ws = store.getWorldState("kid-1");
  assert.deepEqual(ws.regionsDiscovered, ["meadow"]);
  assert.deepEqual(ws.chestsOpened, ["meadow_chest_1"]);
  assert.deepEqual(ws.puzzlesSolved, ["coin_order_meadow"]);
  assert.deepEqual(ws.bossesDefeated, ["impulse_imp"]);
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
