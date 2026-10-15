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
  if (!container) return;
  ui.renderParentPanel(container, activeKidId());
}

// XP recording always runs, synchronously available from the moment this
// script parses. UI reactions (coin burst, level-up overlay, re-render)
// only run once `ui` exists.
function onSplitCompleted(context) {
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
  const result = dataHandlers.onChoreApproved(completion);
  if (ui) {
    renderKidPanel();
    renderParentPanel();
  }
  return result;
}

window.SavingsQuest = {
  isEnabled: store.isSavingsQuestEnabled,
  setEnabled: store.setSavingsQuestEnabled,
  getHero: store.getHero,
  getLedger: store.ledgerForKid,
  getMilestones: store.getMilestones,
  onSplitCompleted,
  onChoreApproved,
  runBackfill: runBackfillInBrowser,
  renderKidPanel,
  renderParentPanel,
  levelForTotalXp,
};

async function loadCatalog(path) {
  const res = await fetch(path);
  return res.json();
}

async function initUi() {
  const [items, skills, npcLessons, regions, puzzles, bosses] = await Promise.all([
    loadCatalog("savings-quest/content/items_catalog.json"),
    loadCatalog("savings-quest/content/skills_catalog.json"),
    loadCatalog("savings-quest/content/npc_lessons.json"),
    loadCatalog("savings-quest/content/regions.json"),
    loadCatalog("savings-quest/content/puzzles.json"),
    loadCatalog("savings-quest/content/bosses.json"),
  ]);
  ui = createUi({ store, catalogs: { items, skills, npcLessons, regions, puzzles, bosses } });
  ui.applyMotionPreference();
  renderKidPanel();
  renderParentPanel();
}

initUi().catch((err) => {
  console.error("Savings Quest UI failed to initialize (XP recording is unaffected):", err);
});
