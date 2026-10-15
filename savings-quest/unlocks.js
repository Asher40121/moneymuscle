// Savings Quest — gear/skill unlock logic and stat calculation.
//
// Pure functions, same philosophy as engine.js and ui-data.js: no
// storage, no DOM. heroContext is assembled by the caller (ui.js, which
// has access to both the Savings Quest store and Money Muscle's own
// globals) and passed in as plain data, so everything here is testable
// in Node with hand-built fixtures.
//
// heroContext shape:
//   {
//     level: number,
//     streakWeeks: number,
//     completedGoalsCount: number,
//     goalTarget: number | null,       // active goal's dollar target, if any
//     currentSaveTotal: number,        // kid's real cumulative Save $, from Money Muscle
//   }

export function isItemUnlocked(item, heroContext) {
  const { type, value } = item.unlock;
  switch (type) {
    case "level":
      return heroContext.level >= value;
    case "streak":
      return heroContext.streakWeeks >= value;
    case "goalCompletion":
      return heroContext.completedGoalsCount >= value;
    case "milestone":
      if (!heroContext.goalTarget) return false;
      return heroContext.currentSaveTotal >= value * heroContext.goalTarget;
    default:
      return false;
  }
}

// Human-readable requirement text for a locked item. Mirrors the two
// examples in the brief exactly ("Save $20 more", "Unlocks at Level 7")
// and extends the same style to the other two condition types.
export function describeUnlockRequirement(item, heroContext) {
  const { type, value } = item.unlock;

  if (type === "level") {
    return `Unlocks at Level ${value}`;
  }

  if (type === "streak") {
    const remaining = Math.max(0, value - heroContext.streakWeeks);
    if (remaining === 0) return "Streak requirement met";
    return `Save ${remaining} more week${remaining === 1 ? "" : "s"} in a row`;
  }

  if (type === "goalCompletion") {
    const remaining = Math.max(0, value - heroContext.completedGoalsCount);
    if (remaining === 0) return "Goal requirement met";
    return `Finish ${remaining} more goal${remaining === 1 ? "" : "s"}`;
  }

  if (type === "milestone") {
    if (!heroContext.goalTarget) {
      return "Set a savings goal to work toward this";
    }
    const neededDollars = value * heroContext.goalTarget;
    const remaining = Math.max(0, Math.round(neededDollars - heroContext.currentSaveTotal));
    if (remaining === 0) return "Milestone met";
    return `Save $${remaining} more`;
  }

  return "Locked";
}

// Compares the full catalog against what's already owned and returns
// only the items that are unlocked now but weren't owned yet — the
// "what just became available" delta the reveal animation plays for.
export function computeNewlyUnlockedItems({ itemsCatalog, heroContext, ownedItemIds }) {
  const ownedSet = new Set(ownedItemIds);
  return itemsCatalog.items.filter(
    (item) => !ownedSet.has(item.id) && isItemUnlocked(item, heroContext),
  );
}

export function getAvailableSkillPoints({ heroLevel, learnedSkillIds, skillsCatalog }) {
  const spent = learnedSkillIds.reduce((sum, id) => {
    const skill = skillsCatalog.skills.find((s) => s.id === id);
    return sum + (skill ? skill.cost : 0);
  }, 0);
  return Math.max(0, heroLevel - spent);
}

export function canLearnSkill({ skill, learnedSkillIds, heroLevel, skillsCatalog }) {
  if (learnedSkillIds.includes(skill.id)) {
    return { ok: false, reason: "already-learned" };
  }
  if (skill.requires && !learnedSkillIds.includes(skill.requires)) {
    return { ok: false, reason: "prerequisite-missing" };
  }
  const available = getAvailableSkillPoints({ heroLevel, learnedSkillIds, skillsCatalog });
  if (available < skill.cost) {
    return { ok: false, reason: "not-enough-points" };
  }
  return { ok: true };
}

// Sums stats from every equipped item (loadout: { weapon, armor,
// companion, cosmetic } -> itemId|null) plus every learned skill.
// Cosmetics contribute nothing by construction (empty stats in the
// catalog), so equipping one is purely a look, never an advantage.
export function computeHeroStats({ loadout, itemsCatalog, learnedSkillIds, skillsCatalog }) {
  const stats = { power: 0, heart: 0, wisdom: 0 };

  for (const itemId of Object.values(loadout || {})) {
    if (!itemId) continue;
    const item = itemsCatalog.items.find((i) => i.id === itemId);
    if (!item) continue;
    stats.power += item.stats.power || 0;
    stats.heart += item.stats.heart || 0;
    stats.wisdom += item.stats.wisdom || 0;
  }

  for (const skillId of learnedSkillIds || []) {
    const skill = skillsCatalog.skills.find((s) => s.id === skillId);
    if (!skill) continue;
    stats.power += skill.stats.power || 0;
    stats.heart += skill.stats.heart || 0;
    stats.wisdom += skill.stats.wisdom || 0;
  }

  return stats;
}
