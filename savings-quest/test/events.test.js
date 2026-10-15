import { test } from "node:test";
import assert from "node:assert/strict";
import { createSavingsQuestStore, createMemoryStorage } from "../data.js";
import { createHandlers } from "../events.js";

function freshSetup({ enabled = true } = {}) {
  const store = createSavingsQuestStore(createMemoryStorage());
  if (enabled) store.setSavingsQuestEnabled(true);
  return { store, handlers: createHandlers(store) };
}

test("onSplitCompleted no-ops entirely when the feature flag is off", () => {
  const { store, handlers } = freshSetup({ enabled: false });
  const result = handlers.onSplitCompleted({
    round: {
      id: 1,
      kidId: "kid-1",
      save: 10,
      give: 5,
      spend: 2,
      completedAt: "2026-10-14T00:00:00.000Z",
    },
    priorSaveTotal: 0,
    goal: null,
  });
  assert.equal(result, null);
  assert.equal(store.getXpLedger().length, 0);
  assert.equal(store.getHero("kid-1").totalXp, 0);
});

test("onSplitCompleted no-ops for a specific kid the parent disabled, even with the family flag on", () => {
  const { store, handlers } = freshSetup();
  store.setKidSettings("kid-1", { enabled: false });
  const result = handlers.onSplitCompleted({
    round: { id: 1, kidId: "kid-1", save: 10, give: 0, spend: 0, completedAt: "2026-10-14T00:00:00.000Z" },
    priorSaveTotal: 0,
    goal: null,
  });
  assert.equal(result, null);
  assert.equal(store.getXpLedger().length, 0);
});

test("onChoreApproved no-ops for a specific kid the parent disabled", () => {
  const { store, handlers } = freshSetup();
  store.setKidSettings("kid-1", { enabled: false });
  const result = handlers.onChoreApproved({ id: "c1", kidId: "kid-1", price: 5 });
  assert.equal(result, null);
  assert.equal(store.getXpLedger().length, 0);
});

test("onSplitCompleted writes one ledger entry per non-zero bucket", () => {
  const { store, handlers } = freshSetup();
  handlers.onSplitCompleted({
    round: {
      id: 1,
      kidId: "kid-1",
      save: 10,
      give: 5,
      spend: 2,
      completedAt: "2026-10-14T00:00:00.000Z",
    },
    priorSaveTotal: 0,
    goal: null,
  });
  const ledger = store.getXpLedger();
  assert.equal(ledger.length, 3);
  // Ledger tracks are named by game currency (heart/save/spend), not by
  // the Money Muscle bucket name (give) that produced the heart entry.
  assert.deepEqual(
    ledger.map((e) => e.track).sort(),
    ["heart", "save", "spend"].sort(),
  );
  // All three share one sourceEventId — one Money Muscle round, one source event.
  assert.equal(new Set(ledger.map((e) => e.sourceEventId)).size, 1);
});

test("onSplitCompleted is fully idempotent when the exact same round is replayed", () => {
  const { store, handlers } = freshSetup();
  const round = {
    id: 1,
    kidId: "kid-1",
    save: 10,
    give: 5,
    spend: 2,
    completedAt: "2026-10-14T00:00:00.000Z",
  };
  handlers.onSplitCompleted({ round, priorSaveTotal: 0, goal: null });
  const heroAfterFirst = store.getHero("kid-1");

  const secondResult = handlers.onSplitCompleted({ round, priorSaveTotal: 0, goal: null });
  assert.equal(secondResult.save.written, false);
  assert.equal(secondResult.give.written, false);
  assert.equal(secondResult.spend.written, false);
  assert.equal(store.getXpLedger().length, 3); // still just the first three
  assert.deepEqual(store.getHero("kid-1"), heroAfterFirst); // unchanged
});

test("onChoreApproved raises Stamina and is idempotent", () => {
  const { store, handlers } = freshSetup();
  const completion = { id: "cc-1", kidId: "kid-1", price: 8 };
  handlers.onChoreApproved(completion);
  assert.equal(store.getHero("kid-1").stamina, 8);

  const second = handlers.onChoreApproved(completion);
  assert.equal(second.written, false);
  assert.equal(store.getHero("kid-1").stamina, 8); // not doubled
});

test("integration: a sequence of real-shaped events produces the expected hero state", () => {
  const { store, handlers } = freshSetup();

  // Round 1: kid saves $10 of a $15 split (first save ever this week).
  handlers.onSplitCompleted({
    round: {
      id: 1001,
      kidId: "kid-1",
      save: 10,
      give: 3,
      spend: 2,
      completedAt: "2026-10-14T00:00:00.000Z", // a Wednesday
    },
    priorSaveTotal: 0,
    goal: { name: "Lego Set", target: 50 },
  });

  // Round 2, later the same week: kid saves $15 more, crossing 25% and 50%.
  handlers.onSplitCompleted({
    round: {
      id: 1002,
      kidId: "kid-1",
      save: 15,
      give: 0,
      spend: 0,
      completedAt: "2026-10-16T00:00:00.000Z", // same week
    },
    priorSaveTotal: 10,
    goal: { name: "Lego Set", target: 50 },
  });

  // A paid chore in between.
  handlers.onChoreApproved({ id: "cc-9", kidId: "kid-1", price: 4 });

  const hero = store.getHero("kid-1");

  // Round 1: $10 save, streak=1 week (no bonus yet) -> 100 XP.
  // Round 2: $15 save, still the same single week -> streak=1 -> 150 XP.
  // Total Save XP = 250 -> level 1 (xpToReachLevel(2) = 264, not reached).
  assert.equal(hero.totalXp, 250);
  assert.equal(hero.level, 1);

  // Heart: only round 1 gave $3 -> 30 Heart.
  assert.equal(hero.heart, 30);

  // Stamina: one $4 chore -> 4 Stamina.
  assert.equal(hero.stamina, 4);

  // Milestones: cumulative save went 0 -> 10 (20%) -> 25 (50%) against a
  // $50 goal, so 25% and 50% both got crossed, in order.
  const milestones = store.getMilestones("kid-1").map((m) => m.threshold);
  assert.deepEqual(milestones, [0.25, 0.5]);

  // Round 1: save + give + spend = 3 entries. Round 2: save only (its
  // give/spend were both $0, so no entries for those buckets). Chore: 1
  // stamina entry. Total = 3 + 1 + 1 = 5.
  assert.equal(store.getXpLedger().length, 5);
});
