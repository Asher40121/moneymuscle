import { test } from "node:test";
import assert from "node:assert/strict";
import { createSavingsQuestStore, createMemoryStorage } from "../data.js";
import { createHandlers } from "../events.js";
import { backfillForKid } from "../backfill.js";

// Two savings rounds exactly one week apart (so the second one gets a
// streak bonus), given to backfillForKid OUT of chronological order on
// purpose, to prove it sorts them before replaying.
const roundA = {
  id: 1,
  kidId: "kid-1",
  save: 10,
  give: 0,
  spend: 0,
  completedAt: "2026-09-07T00:00:00.000Z",
};
const roundB = {
  id: 2,
  kidId: "kid-1",
  save: 20,
  give: 5,
  spend: 0,
  completedAt: "2026-09-14T00:00:00.000Z", // exactly 7 days after A
};

const paidChore = { id: "cc-1", kidId: "kid-1", price: 6, status: "paid" };
const pendingChore = { id: "cc-2", kidId: "kid-1", price: 3, status: "pending" };

const goal = { name: "Bike", target: 25 };

function setup() {
  const store = createSavingsQuestStore(createMemoryStorage());
  store.setSavingsQuestEnabled(true); // backfill is a no-op while disabled
  const handlers = createHandlers(store);
  return { store, handlers };
}

test("backfillForKid sorts out-of-order rounds before replaying them", () => {
  const { store, handlers } = setup();

  backfillForKid({
    rounds: [roundB, roundA], // deliberately reversed
    choreCompletions: [paidChore, pendingChore],
    goal,
    handlers,
  });

  const hero = store.getHero("kid-1");

  // Round A ($10, first week, streak=1, no bonus): 100 XP.
  // Round B ($20, second consecutive week, streak=2, 1.1x): 220 XP.
  assert.equal(hero.totalXp, 320);
  assert.equal(hero.level, 2); // xpToReachLevel(2)=264, (3)=466

  assert.equal(hero.heart, 50); // only round B gave $5
  assert.equal(hero.stamina, 6); // only the PAID chore counts, not the pending one

  const milestones = store.getMilestones("kid-1").map((m) => m.threshold);
  // Cumulative save: 0 -> 10 (40% of $25) -> 30 (120% of $25).
  assert.deepEqual(milestones, [0.25, 0.5, 0.75, 1.0]);
});

test("running backfillForKid twice on the same history is idempotent", () => {
  const { store, handlers } = setup();
  const data = {
    rounds: [roundA, roundB],
    choreCompletions: [paidChore, pendingChore],
    goal,
  };

  backfillForKid({ ...data, handlers });
  const heroAfterFirstRun = store.getHero("kid-1");
  const ledgerLengthAfterFirstRun = store.getXpLedger().length;

  backfillForKid({ ...data, handlers }); // re-run the "one-time" script

  assert.deepEqual(store.getHero("kid-1"), heroAfterFirstRun);
  assert.equal(store.getXpLedger().length, ledgerLengthAfterFirstRun);
  assert.equal(store.getMilestones("kid-1").length, 4); // not duplicated
});

test("backfill is a no-op if the savingsQuest flag isn't enabled", () => {
  const store = createSavingsQuestStore(createMemoryStorage());
  const handlers = createHandlers(store); // flag left at its default: off

  backfillForKid({
    rounds: [roundA, roundB],
    choreCompletions: [paidChore],
    goal,
    handlers,
  });

  assert.equal(store.getXpLedger().length, 0);
  assert.equal(store.getHero("kid-1").totalXp, 0);
});
