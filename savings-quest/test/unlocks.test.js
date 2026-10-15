import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isItemUnlocked,
  describeUnlockRequirement,
  computeNewlyUnlockedItems,
  getAvailableSkillPoints,
  canLearnSkill,
  computeHeroStats,
} from "../unlocks.js";

const baseContext = {
  level: 5,
  streakWeeks: 1,
  completedGoalsCount: 0,
  goalTarget: 100,
  currentSaveTotal: 30,
};

test("isItemUnlocked: level condition", () => {
  assert.equal(isItemUnlocked({ unlock: { type: "level", value: 5 } }, baseContext), true);
  assert.equal(isItemUnlocked({ unlock: { type: "level", value: 6 } }, baseContext), false);
});

test("isItemUnlocked: streak condition", () => {
  assert.equal(isItemUnlocked({ unlock: { type: "streak", value: 1 } }, baseContext), true);
  assert.equal(isItemUnlocked({ unlock: { type: "streak", value: 2 } }, baseContext), false);
});

test("isItemUnlocked: goalCompletion condition", () => {
  assert.equal(
    isItemUnlocked({ unlock: { type: "goalCompletion", value: 0 } }, baseContext),
    true,
  );
  assert.equal(
    isItemUnlocked({ unlock: { type: "goalCompletion", value: 1 } }, baseContext),
    false,
  );
});

test("isItemUnlocked: milestone condition against the real dollar goal", () => {
  // goalTarget=100, currentSaveTotal=30 -> 30% saved
  assert.equal(isItemUnlocked({ unlock: { type: "milestone", value: 0.25 } }, baseContext), true);
  assert.equal(isItemUnlocked({ unlock: { type: "milestone", value: 0.5 } }, baseContext), false);
});

test("isItemUnlocked: milestone condition with no active goal is never true", () => {
  const noGoal = { ...baseContext, goalTarget: null };
  assert.equal(isItemUnlocked({ unlock: { type: "milestone", value: 0.25 } }, noGoal), false);
});

test("describeUnlockRequirement matches the brief's own examples", () => {
  assert.equal(
    describeUnlockRequirement({ unlock: { type: "level", value: 7 } }, baseContext),
    "Unlocks at Level 7",
  );
  // goalTarget=100, 0.5 milestone needs $50, kid has $30 -> $20 more
  assert.equal(
    describeUnlockRequirement({ unlock: { type: "milestone", value: 0.5 } }, baseContext),
    "Save $20 more",
  );
});

test("describeUnlockRequirement: streak and goalCompletion phrasing, singular vs plural", () => {
  assert.equal(
    describeUnlockRequirement({ unlock: { type: "streak", value: 2 } }, baseContext),
    "Save 1 more week in a row",
  );
  assert.equal(
    describeUnlockRequirement({ unlock: { type: "streak", value: 4 } }, baseContext),
    "Save 3 more weeks in a row",
  );
  assert.equal(
    describeUnlockRequirement({ unlock: { type: "goalCompletion", value: 1 } }, baseContext),
    "Finish 1 more goal",
  );
});

test("describeUnlockRequirement: milestone with no goal asks to set one", () => {
  const noGoal = { ...baseContext, goalTarget: null };
  assert.equal(
    describeUnlockRequirement({ unlock: { type: "milestone", value: 0.5 } }, noGoal),
    "Set a savings goal to work toward this",
  );
});

const itemsCatalog = {
  items: [
    { id: "a", unlock: { type: "level", value: 1 } },
    { id: "b", unlock: { type: "level", value: 5 } },
    { id: "c", unlock: { type: "level", value: 10 } },
  ],
};

test("computeNewlyUnlockedItems only returns unlocked-but-not-owned items", () => {
  const newly = computeNewlyUnlockedItems({
    itemsCatalog,
    heroContext: baseContext, // level 5
    ownedItemIds: ["a"], // already owns the level-1 item
  });
  assert.deepEqual(
    newly.map((i) => i.id),
    ["b"], // level-5 item is newly eligible; level-10 item isn't yet
  );
});

const skillsCatalog = {
  skills: [
    { id: "steady_saver", cost: 1, requires: null },
    { id: "rainy_day_ready", cost: 1, requires: "steady_saver" },
    { id: "compound_thinker", cost: 1, requires: "rainy_day_ready" },
  ],
};

test("getAvailableSkillPoints is level minus points already spent", () => {
  assert.equal(
    getAvailableSkillPoints({ heroLevel: 5, learnedSkillIds: [], skillsCatalog }),
    5,
  );
  assert.equal(
    getAvailableSkillPoints({
      heroLevel: 5,
      learnedSkillIds: ["steady_saver"],
      skillsCatalog,
    }),
    4,
  );
});

test("canLearnSkill blocks a skill whose prerequisite isn't learned yet", () => {
  const result = canLearnSkill({
    skill: skillsCatalog.skills[1], // rainy_day_ready, requires steady_saver
    learnedSkillIds: [],
    heroLevel: 10,
    skillsCatalog,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "prerequisite-missing");
});

test("canLearnSkill blocks a skill with no points left", () => {
  const result = canLearnSkill({
    skill: skillsCatalog.skills[0],
    learnedSkillIds: [],
    heroLevel: 0, // no levels yet, no points
    skillsCatalog,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "not-enough-points");
});

test("canLearnSkill allows a skill whose prerequisite is met and points are available", () => {
  const result = canLearnSkill({
    skill: skillsCatalog.skills[1],
    learnedSkillIds: ["steady_saver"],
    heroLevel: 5,
    skillsCatalog,
  });
  assert.equal(result.ok, true);
});

test("computeHeroStats sums equipped gear stats plus learned skill stats", () => {
  const statsItemsCatalog = {
    items: [
      { id: "sword", stats: { power: 5 } },
      { id: "pup", stats: { heart: 2 } },
      { id: "cape", stats: {} }, // cosmetic, contributes nothing
    ],
  };
  const statsSkillsCatalog = {
    skills: [{ id: "pause_button", stats: { wisdom: 2 } }],
  };

  const stats = computeHeroStats({
    loadout: { weapon: "sword", armor: null, companion: "pup", cosmetic: "cape" },
    itemsCatalog: statsItemsCatalog,
    learnedSkillIds: ["pause_button"],
    skillsCatalog: statsSkillsCatalog,
  });

  assert.deepEqual(stats, { power: 5, heart: 2, wisdom: 2 });
});

test("computeHeroStats: an unequipped cosmetic slot never contributes stats, even in theory", () => {
  const statsItemsCatalog = { items: [{ id: "cape", stats: {} }] };
  const stats = computeHeroStats({
    loadout: { cosmetic: "cape" },
    itemsCatalog: statsItemsCatalog,
    learnedSkillIds: [],
    skillsCatalog: { skills: [] },
  });
  assert.deepEqual(stats, { power: 0, heart: 0, wisdom: 0 });
});
