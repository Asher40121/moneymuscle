// Savings Quest — Stage 6 quest eligibility checks.
//
// Pure functions, same philosophy as engine.js/unlocks.js/world-engine.js:
// no storage, no DOM, no Date.now(). The caller (data.js) supplies
// already-computed plain data; this file only answers "is this quest
// complete right now."

// The Daily Check-In quest is complete for "today" once the World
// Gate's check-in action has actually run today — reuses the exact
// same lastCheckInDate field Stage 4's stamina-charge check-in writes.
export function isDailyCheckinQuestComplete(lastCheckInDate, now) {
  if (!lastCheckInDate) return false;
  return lastCheckInDate.slice(0, 10) === new Date(now).toISOString().slice(0, 10);
}

// Generic weekly-dollar-target check — the Weekly Savings Raid and the
// Weekly Giving Quest both just ask "did this bucket's real dollars
// this week meet or exceed the target," so one function covers both.
export function isWeeklyTargetMet(weeklyDollars, targetAmount) {
  return weeklyDollars >= targetAmount;
}
