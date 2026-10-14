// Savings Quest — event listeners.
//
// These are the only functions index.html calls into. Each one takes
// exactly the context Money Muscle already has at its existing mutation
// points — nothing here reaches back into Money Muscle's own globals or
// localStorage keys, keeping the coupling one-directional and explicit.
//
// A Money Muscle "round" (one Give/Save/Spend split) can produce up to
// three ledger entries — one per non-zero bucket — but they all share one
// sourceEventId, since idempotency is keyed on (sourceEventId, track)
// together, not sourceEventId alone.

export function createHandlers(store) {
  function onSplitCompleted({ round, priorSaveTotal, goal }) {
    if (!store.isSavingsQuestEnabled()) return null;

    const now = round.completedAt || new Date().toISOString();
    const sourceEventId = `mm_round_${round.id}`;
    const results = {};

    if (round.save > 0) {
      results.save = store.recordSaveEvent({
        kidId: round.kidId,
        amount: round.save,
        sourceEventId,
        now,
        priorDollarSaveTotal: priorSaveTotal,
        newDollarSaveTotal: priorSaveTotal + round.save,
        goalTarget: goal ? goal.target : null,
      });
    }

    if (round.give > 0) {
      results.give = store.recordGiveEvent({
        kidId: round.kidId,
        amount: round.give,
        sourceEventId,
        now,
      });
    }

    if (round.spend > 0) {
      results.spend = store.recordSpendEvent({
        kidId: round.kidId,
        amount: round.spend,
        sourceEventId,
        now,
      });
    }

    return results;
  }

  function onChoreApproved(completion) {
    if (!store.isSavingsQuestEnabled()) return null;

    const now = new Date().toISOString();
    const sourceEventId = `mm_chore_${completion.id}`;

    return store.recordChoreApprovedEvent({
      kidId: completion.kidId,
      price: completion.price,
      sourceEventId,
      now,
    });
  }

  return { onSplitCompleted, onChoreApproved };
}
