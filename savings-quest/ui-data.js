// Savings Quest — pure UI logic.
//
// No DOM here, same philosophy as engine.js: anything that's a decision
// or a transformation, not a rendering, lives here and gets tested
// directly in Node. ui.js imports these and just paints the result.

import { CONFIG } from "./config.js";

// Small, fixed cosmetic vocabulary for the hero creator. This is NOT
// growable game content (that's items/skills/npcs/regions in content/*.json)
// — it's the handful of choices a kid picks once when making their hero.

export const HERO_LOOKS = [
  { id: "round", label: "Round" },
  { id: "square", label: "Boxy" },
  { id: "star", label: "Star" },
];

// Colorblind-safe: every option is distinguishable by name/label, never
// by hue alone, and the set avoids a red/green-only contrast pair.
export const HERO_PALETTES = [
  { id: "blue", label: "Blue", hex: "#1467e0" },
  { id: "green", label: "Green", hex: "#1fa34a" },
  { id: "orange", label: "Orange", hex: "#e66f20" },
  { id: "magenta", label: "Magenta", hex: "#e30a8d" },
  { id: "amber", label: "Amber", hex: "#faab19" },
  { id: "purple", label: "Purple", hex: "#7c3aed" },
];

// Flavor text only. No stat, rate, or unlock differs by class — this
// exists purely so "pick a class" means something to look at, per the
// brief's "none strictly better" rule.
export const HERO_CLASSES = [
  { id: "ranger", name: "Ranger", flavor: "Spots hidden treasure first." },
  { id: "knight", name: "Knight", flavor: "A steady, dependable defender." },
  { id: "mage", name: "Mage", flavor: "Plans three steps ahead." },
  { id: "inventor", name: "Inventor", flavor: "Builds clever gadgets." },
];

export const DENSITY_MODES = [
  { id: "young", label: "I'm a bit younger", hint: "Bigger buttons, more pictures" },
  { id: "older", label: "I'm a bit older", hint: "A more grown-up look" },
];

// Looks across both catalogs for the lowest unlocksAtLevel strictly
// above the hero's current level. Returns null once nothing's left to
// unlock (so the UI can say something like "You've unlocked it all!").
export function computeNextUnlockTeaser({ level, itemsCatalog, skillsCatalog }) {
  const candidates = [
    ...itemsCatalog.items.map((i) => ({
      kind: "item",
      name: i.name,
      unlocksAtLevel: i.unlocksAtLevel,
    })),
    ...skillsCatalog.skills.map((s) => ({
      kind: "skill",
      name: s.name,
      unlocksAtLevel: s.unlocksAtLevel,
    })),
  ].filter((c) => c.unlocksAtLevel > level);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.unlocksAtLevel - b.unlocksAtLevel);
  return candidates[0];
}

// Builds the 4-node path (25/50/75/100%) for display, given which
// thresholds have actually been reached (from getMilestones()).
export function computeMilestonePathState(reachedThresholds) {
  const reachedSet = new Set(reachedThresholds);
  return CONFIG.MILESTONE_THRESHOLDS.map((threshold) => ({
    threshold,
    reached: reachedSet.has(threshold),
  }));
}
