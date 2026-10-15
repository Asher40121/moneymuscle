// Savings Quest — tuning config.
//
// Every number that shapes game balance lives here, and only here.
// Nothing else in this module should hardcode a rate, cap, or threshold.
// Change a value, reload, done — no code changes needed to retune.

export const CONFIG = {
  // ---------------------------------------------------------------------
  // SAVE XP — the core driver. Every dollar a kid moves into Save earns
  // this many XP, before the streak multiplier below is applied.
  // ---------------------------------------------------------------------
  SAVE_XP_PER_DOLLAR: 10,

  // ---------------------------------------------------------------------
  // STREAK MULTIPLIER — rewards saving in consecutive weeks, not just
  // saving a lot once. "Week" reuses the same Monday-start week boundary
  // the existing chore system already uses (startOfWeek), so this lines
  // up with a concept the app already has rather than inventing a new one.
  //
  // multiplier = min(STREAK_MAX_MULTIPLIER, 1 + streakWeeks * STREAK_GROWTH_PER_WEEK)
  //
  // Default: +10% per consecutive week, capped at 2x (hit at a 10-week streak).
  // ---------------------------------------------------------------------
  STREAK_GROWTH_PER_WEEK: 0.1,
  STREAK_MAX_MULTIPLIER: 2.0,

  // ---------------------------------------------------------------------
  // STREAK FREEZE (Stage 6) — how many missed weeks in a row are
  // forgiven before a streak actually breaks. Free, always available,
  // never purchased or earned — see engine.js's computeStreakWeeksWithFreeze.
  // ---------------------------------------------------------------------
  STREAK_FREE_FREEZES: 1,

  // ---------------------------------------------------------------------
  // MILESTONES — fractions of a kid's active savings goal. Crossing one
  // writes a goals_milestones entry (separate from, and not a replacement
  // for, Money Muscle's own goal-completion celebration at 100%).
  // ---------------------------------------------------------------------
  MILESTONE_THRESHOLDS: [0.25, 0.5, 0.75, 1.0],

  // ---------------------------------------------------------------------
  // HEART (Giving) — its own track, driven by the Give bucket. Never
  // reduces Level XP or Save power; purely additive, purely separate.
  // ---------------------------------------------------------------------
  HEART_PER_DOLLAR_GIVEN: 10,

  // ---------------------------------------------------------------------
  // STAMINA (Chores) — small, deliberately below the Save rate, and goes
  // to its own track, never to Level XP. Rate is per dollar of chore
  // price so a bigger chore still feels like a bigger reward, but it
  // stays "small" relative to Save (1/10th the rate).
  //
  // ASSUMPTION: the brief says "small Stamina" without specifying flat vs.
  // proportional. Proportional-but-low was chosen so a $10 chore clearly
  // outweighs a $1 chore, without ever approaching Save's reward rate.
  // ---------------------------------------------------------------------
  STAMINA_PER_DOLLAR_CHORE: 1,

  // ---------------------------------------------------------------------
  // LEVEL CURVE — cumulative XP needed to REACH a given level:
  //   xpToReachLevel(level) = round(LEVEL_XP_BASE * level ^ LEVEL_XP_EXPONENT)
  // Level is derived from lifetime Save-track XP only (Heart and Stamina
  // never count toward level).
  // ---------------------------------------------------------------------
  LEVEL_XP_BASE: 100,
  LEVEL_XP_EXPONENT: 1.4,
  MAX_LEVEL: 50,

  // ---------------------------------------------------------------------
  // POWER CHARGE — a temporary meter, NOT level or XP. If Money Muscle
  // ever adds a way to withdraw/spend down savings, draining this meter
  // is the only effect; level and lifetime XP never move backward. There
  // is no withdrawal feature in Money Muscle today — this exists so the
  // engine is ready the moment one is added, per the "level never drops"
  // rule.
  // ---------------------------------------------------------------------
  POWER_CHARGE_MAX: 100,
  POWER_CHARGE_DRAIN_PER_DOLLAR_WITHDRAWN: 2,

  // ---------------------------------------------------------------------
  // ANTI-FARMING — a withdrawal followed by a re-deposit within this many
  // days is treated as "giving the money back", not new savings: XP is
  // only ever awarded on the NET new amount above what was withdrawn.
  // Same caveat as above — there's no withdrawal action in Money Muscle
  // yet, so this logic is exercised today only by direct engine calls
  // (and its tests), not by any real UI flow.
  // ---------------------------------------------------------------------
  REVERSAL_WINDOW_DAYS: 3,

  // ---------------------------------------------------------------------
  // STAMINA CHARGE — Stage 4's "limits session length" meter. This is a
  // SEPARATE field from hero.stamina above (that one is a lifetime XP
  // track driven by recomputeHeroState and can never go down, exactly
  // like Heart). Stamina Charge is a small, discrete, spendable pool —
  // same pattern as powerCharge — that gates how many times per day a
  // kid can enter the world, refilled by chores and a daily check-in.
  //
  // DESIGN CHOICE (see README Stage 4 assumptions): session length is
  // limited by a per-entry cost, not a real-time countdown while
  // playing. Rule #5 explicitly forbids "countdown pressure," and a
  // ticking timer is exactly that — a flat cost per world entry achieves
  // the same "can't play all day nonstop" goal without ever showing a
  // clock to the kid.
  // ---------------------------------------------------------------------
  STAMINA_CHARGE_MAX: 5,
  STAMINA_CHARGE_COST_PER_ENTRY: 1,
  STAMINA_CHARGE_PER_DAILY_CHECKIN: 2,
  STAMINA_CHARGE_PER_CHORE_APPROVED: 1,

  // ---------------------------------------------------------------------
  // WORLD — tuning for the Stage 4 open-world vertical slice.
  // ---------------------------------------------------------------------
  WORLD_HERO_SPEED: 160, // px/sec
  WORLD_CREATURE_SPEED: 40, // px/sec, wandering roam speed
  WORLD_INTERACT_RADIUS: 48, // px, how close the hero must be to interact

  // ---------------------------------------------------------------------
  // XP RATE PRESETS — Stage 5 per-child control. Multiplies Save XP only
  // (the core driver); never negative, never actually punishing even on
  // "Challenging" — it's slower growth, not a penalty, per the
  // never-shame rule.
  // ---------------------------------------------------------------------
  XP_RATE_PRESETS: { gentle: 1.5, standard: 1.0, challenging: 0.75 },
  DEFAULT_XP_RATE_PRESET: "standard",

  // ---------------------------------------------------------------------
  // PARENT MATCH — optional, per-child, game-only. When enabled, Save XP
  // is multiplied by (1 + parentMatchRate). This NEVER moves or matches
  // real money — it's purely an extra XP multiplier a parent can opt
  // into, same as rule #1/#2 (game never drives or touches real money).
  // ---------------------------------------------------------------------
  PARENT_MATCH_DEFAULT_RATE: 1.0,

  // ---------------------------------------------------------------------
  // FAMILY QUEST — a shared, family-wide savings target (sum of every
  // kid's real Save total). Parent-editable; reaching it unlocks a
  // family-wide cosmetic via unlocks.js's existing "familyQuest" unlock
  // type, exactly like an individual goal's milestones.
  // ---------------------------------------------------------------------
  FAMILY_QUEST_DEFAULT_TARGET: 200,
};
