import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HERO_LOOKS,
  HERO_PALETTES,
  HERO_CLASSES,
  computeNextUnlockTeaser,
  computeMilestonePathState,
} from "../ui-data.js";

test("hero classes carry flavor text only — no stat fields at all", () => {
  for (const cls of HERO_CLASSES) {
    assert.equal(typeof cls.flavor, "string");
    assert.ok(cls.flavor.length > 0);
    // Deliberately asserting these keys do NOT exist, so a future edit
    // that sneaks in a numeric advantage fails loudly.
    assert.equal("statBonus" in cls, false);
    assert.equal("multiplier" in cls, false);
  }
});

test("every hero palette option has a distinct label, not just a color", () => {
  const labels = HERO_PALETTES.map((p) => p.label);
  assert.equal(new Set(labels).size, labels.length);
});

test("hero looks list is non-empty and each has a label", () => {
  assert.ok(HERO_LOOKS.length > 0);
  for (const look of HERO_LOOKS) {
    assert.equal(typeof look.label, "string");
  }
});

const itemsCatalog = {
  items: [
    { name: "Training Sword", unlocksAtLevel: 1 },
    { name: "Copper Shield", unlocksAtLevel: 5 },
  ],
};
const skillsCatalog = {
  skills: [{ name: "Steady Saver", unlocksAtLevel: 3 }],
};

test("computeNextUnlockTeaser picks the nearest unlock above current level", () => {
  const teaser = computeNextUnlockTeaser({ level: 2, itemsCatalog, skillsCatalog });
  assert.equal(teaser.name, "Steady Saver"); // level 3, before Copper Shield at 5
  assert.equal(teaser.kind, "skill");
});

test("computeNextUnlockTeaser returns null once nothing is left to unlock", () => {
  const teaser = computeNextUnlockTeaser({ level: 10, itemsCatalog, skillsCatalog });
  assert.equal(teaser, null);
});

test("computeMilestonePathState marks only the reached thresholds", () => {
  const path = computeMilestonePathState([0.25, 0.5]);
  assert.deepEqual(path, [
    { threshold: 0.25, reached: true },
    { threshold: 0.5, reached: true },
    { threshold: 0.75, reached: false },
    { threshold: 1.0, reached: false },
  ]);
});
