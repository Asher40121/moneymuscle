// Savings Quest — browser entry point.
//
// Loaded from index.html as a native ES module. Wires the real
// localStorage-backed store to the event handlers and UI, and exposes
// the result as window.SavingsQuest, which index.html's existing code
// calls into at its mutation points and render points.
//
// IMPORTANT: window.SavingsQuest is assigned synchronously, below, with
// XP recording fully wired immediately. The UI layer (hero panel,
// catalogs, animations) loads asynchronously afterward — if a split or
// chore payment happens in that narrow window, XP is still recorded
// correctly; only the on-screen reaction is skipped for that one event
// (the next panel render picks up the correct state regardless). XP
// must never depend on a fetch() having resolved.
//
// NOTE: because this uses native ES module imports, open this app via a
// local server (`python3 -m http.server`), not by double-clicking
// index.html — Chrome blocks module imports over file://. See README.

import { createSavingsQuestStore } from "./data.js";
import { createHandlers } from "./events.js";
import { runBackfillInBrowser } from "./backfill.js";
import { createUi } from "./ui.js";
import { levelForTotalXp } from "./engine.js";

const store = createSavingsQuestStore(window.localStorage);
const dataHandlers = createHandlers(store);

let ui = null; // populated once catalogs finish loading

function activeKidId() {
  return window.localStorage.getItem("mm_activeKidId");
}

function renderKidPanel() {
  if (!ui) return;
  const container = document.getElementById("savingsQuestKidPanel");
  const kidId = activeKidId();
  if (!container || !kidId) return;
  ui.renderKidPanel(container, kidId);
}

function renderParentPanel() {
  if (!ui) return;
  const container = document.getElementById("savingsQuestParentPanel");
  if (container) ui.renderParentPanel(container, activeKidId());

  // The collapsed-by-default cards (This Week's Progress, Game
  // Settings, Manual Bonus XP, and the main enable/motion toggles)
  // live in a separate mount point near the bottom of the Parent
  // page, so they don't share a render call with the always-visible
  // Goal Request card above.
  const collapsiblesContainer = document.getElementById("savingsQuestParentCollapsibles");
  if (collapsiblesContainer) ui.renderParentCollapsibles(collapsiblesContainer, activeKidId());
}

// Stage 6 security hardening: onSplitCompleted/onChoreApproved are the
// only two entry points window.SavingsQuest exposes that can cause an
// XP write, and both accept a plain object the caller built — normally
// that's always index.html's own real mutation-point code, but nothing
// stops a page script (devtools console) from calling
// window.SavingsQuest.onSplitCompleted({round: {...fabricated}}) directly
// with a forged round/completion. These two checks close that: before
// recording anything, cross-check the passed-in object against Money
// Muscle's OWN stored round/chore-completion for that id and kid, and
// reject (no-op, same as the flag being off) if it doesn't match.
//
// Fails OPEN (treats as real) only if the bridging function itself is
// missing — that would mean a future Money Muscle refactor removed it,
// not an attack, and this module's one inviolable rule is that it must
// never be the reason real XP recording silently breaks.
function isRealRound(round) {
  if (!window.roundsForKid) return true;
  const real = window.roundsForKid(round.kidId).find((r) => r.id === round.id);
  return Boolean(real && real.save === round.save && real.give === round.give && real.spend === round.spend);
}

function isRealChoreCompletion(completion) {
  if (!window.loadChoreCompletions) return true;
  const real = window
    .loadChoreCompletions()
    .find((cc) => cc.id === completion.id && cc.kidId === completion.kidId);
  return Boolean(real && real.price === completion.price);
}

// XP recording always runs, synchronously available from the moment this
// script parses. UI reactions (coin burst, level-up overlay, re-render)
// only run once `ui` exists.
function onSplitCompleted(context) {
  if (!isRealRound(context.round)) {
    console.warn("Savings Quest: ignored a split-completed event that didn't match a real stored round.");
    return null;
  }

  const kidId = context.round.kidId;
  const before = store.getHero(kidId);
  const result = dataHandlers.onSplitCompleted(context);
  if (!result) return result; // flag was off, or nothing happened

  if (ui) {
    const after = store.getHero(kidId);

    if (context.round.save > 0 && store.isHeroCreated(kidId)) {
      ui.showCoinBurst(document.getElementById("sqHeroAvatar"));
    }
    if (after.level > before.level && store.isHeroCreated(kidId)) {
      ui.showLevelUpOverlay(after.level);
    }
    renderKidPanel();
    renderParentPanel();
  }

  return result;
}

function onChoreApproved(completion) {
  if (!isRealChoreCompletion(completion)) {
    console.warn("Savings Quest: ignored a chore-approved event that didn't match a real stored chore completion.");
    return null;
  }

  const result = dataHandlers.onChoreApproved(completion);
  if (ui) {
    renderKidPanel();
    renderParentPanel();
  }
  return result;
}

// Stage 6 security hardening: getHero/getLedger/getMilestones used to
// accept an arbitrary kidId, so any page script could read another
// kid's hero/XP ledger/milestones just by passing a different id.
// There's no legitimate caller that ever needed that (nothing in this
// codebase calls these with anything but the active kid) — removing
// the parameter entirely, rather than trying to validate it, closes
// the gap by construction: this can now only ever answer "how's the
// currently active kid doing."
window.SavingsQuest = {
  isEnabled: store.isSavingsQuestEnabled,
  setEnabled: store.setSavingsQuestEnabled,
  getHero: () => store.getHero(activeKidId()),
  getLedger: () => store.ledgerForKid(activeKidId()),
  getMilestones: () => store.getMilestones(activeKidId()),
  onSplitCompleted,
  onChoreApproved,
  runBackfill: runBackfillInBrowser,
  renderKidPanel,
  renderParentPanel,
  levelForTotalXp,
};

// Stage 6: a slow or offline network must not hang catalog loading
// forever — 10s per fetch, then treat it the same as any other catalog
// failure (UI never initializes; XP recording is already unaffected,
// since it never depends on this promise).
async function loadCatalog(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(path, { signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function initUi() {
  const [items, skills, npcLessons, regions, puzzles, bosses, quests] = await Promise.all([
    loadCatalog("savings-quest/content/items_catalog.json"),
    loadCatalog("savings-quest/content/skills_catalog.json"),
    loadCatalog("savings-quest/content/npc_lessons.json"),
    loadCatalog("savings-quest/content/regions.json"),
    loadCatalog("savings-quest/content/puzzles.json"),
    loadCatalog("savings-quest/content/bosses.json"),
    loadCatalog("savings-quest/content/quests.json"),
  ]);
  ui = createUi({ store, catalogs: { items, skills, npcLessons, regions, puzzles, bosses, quests } });
  ui.applyMotionPreference();
  renderKidPanel();
  renderParentPanel();
}

initUi().catch((err) => {
  console.error("Savings Quest UI failed to initialize (XP recording is unaffected):", err);
});
