// Savings Quest — one-time backfill for historical savings.
//
// Replays past rounds/chores through the SAME handlers live play uses
// (events.js), rather than a second copy of the XP math — so backfill
// can never drift out of sync with how XP is actually calculated, and
// running it twice (or running it after some live events already fired)
// is naturally safe: every write still goes through the same idempotency
// check.
//
// NOTE: the live handlers no-op when the savingsQuest flag is off, so
// backfill is also a no-op until the flag is enabled. Turn it on first.

import { createSavingsQuestStore, createMemoryStorage } from "./data.js";
import { createHandlers } from "./events.js";

// Pure core: takes already-filtered data for one kid, replays it through
// the given handlers in chronological order (required, since streaks and
// milestones depend on sequence), and returns what happened.
export function backfillForKid({ rounds, choreCompletions, goal, handlers }) {
  const sortedRounds = [...rounds].sort(
    (a, b) => new Date(a.completedAt) - new Date(b.completedAt),
  );

  let runningSaveTotal = 0;
  const results = [];

  for (const round of sortedRounds) {
    const result = handlers.onSplitCompleted({
      round,
      priorSaveTotal: runningSaveTotal,
      goal,
    });
    runningSaveTotal += round.save;
    results.push({ type: "round", id: round.id, result });
  }

  const paidChores = choreCompletions.filter((c) => c.status === "paid");
  for (const completion of paidChores) {
    const result = handlers.onChoreApproved(completion);
    results.push({ type: "chore", id: completion.id, result });
  }

  return results;
}

// Browser-only wrapper: reads Money Muscle's real localStorage data
// (not Savings Quest's own tables — this is the one place Savings
// Quest code reads another app's storage directly, since backfill's
// whole job is translating pre-existing history) and replays it.
//
// Run from the browser console:
//   import('./savings-quest/backfill.js').then(m => m.runBackfillInBrowser())
// or, once bootstrap.js has loaded, via window.SavingsQuest.runBackfill().
export function runBackfillInBrowser({ kidId } = {}) {
  const storageSource =
    typeof localStorage !== "undefined" ? localStorage : createMemoryStorage();

  const read = (key, fallback) => {
    const raw = storageSource.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const kids = read("mm_kids", []);
  const allRounds = read("mm_rounds", []);
  const allChoreCompletions = read("mm_choreCompletions", []);
  const allGoals = read("mm_goals", {});

  const store = createSavingsQuestStore(storageSource);
  const handlers = createHandlers(store);

  const targets = kidId ? kids.filter((k) => k.id === kidId) : kids;
  const summary = [];

  for (const kid of targets) {
    const rounds = allRounds.filter((r) => r.kidId === kid.id);
    const completions = allChoreCompletions.filter((c) => c.kidId === kid.id);
    const goal = allGoals[kid.id] || null;

    const results = backfillForKid({ rounds, choreCompletions: completions, goal, handlers });

    summary.push({
      kidId: kid.id,
      name: kid.name,
      eventsProcessed: results.length,
      hero: store.getHero(kid.id),
    });
  }

  return summary;
}
