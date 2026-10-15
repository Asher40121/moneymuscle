// Savings Quest — data model.
//
// Persistence is localStorage, matching the rest of Money Muscle (no
// backend exists in this app). "Migrations" here means a schema-version
// stamp per stored blob plus an upgrade hook — there's no SQL to migrate,
// but the same problem (old data shape meets new code) still applies.
//
// Storage is injected rather than reaching for `localStorage` directly,
// so the exact same code runs in the browser and in Node's test runner
// (which has no localStorage) against an in-memory stand-in.

import {
  checkMilestonesCrossed,
  computeNetSaveGrowth,
  computeSaveXp,
  computeHeartXp,
  computeStaminaXp,
  computeStreakWeeks,
  levelForTotalXp,
  applyWithdrawalToPowerCharge,
} from "./engine.js";
import { addCharge, isNewCalendarDay, spendCharge } from "./world-engine.js";
import { CONFIG } from "./config.js";

const SCHEMA_VERSION = 1;

const KEYS = {
  hero: "mm_sq_hero",
  heroInventory: "mm_sq_hero_inventory",
  heroSkills: "mm_sq_hero_skills",
  xpLedger: "mm_sq_xp_ledger",
  goalsMilestones: "mm_sq_goals_milestones",
  gameSettings: "mm_sq_game_settings",
  playSessions: "mm_sq_play_sessions",
  worldState: "mm_sq_world_state",
  quests: "mm_sq_quests",
  questProgress: "mm_sq_quest_progress",
  pendingWithdrawals: "mm_sq_pending_withdrawals",
  goalProposals: "mm_sq_goal_proposals",
};

export function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

function defaultHero() {
  return {
    level: 0,
    totalXp: 0,
    heart: 0,
    stamina: 0,
    powerCharge: CONFIG.POWER_CHARGE_MAX,
    updatedAt: null,
    // Set once, at hero creation (Stage 2) — null means "not created yet".
    name: null,
    look: null,
    palette: null,
    heroClass: null,
    densityMode: null, // 'young' (6-9) | 'older' (10-14)
    // Set in Stage 3 — one equipped item per slot, or null.
    loadout: { weapon: null, armor: null, companion: null, cosmetic: null },
  };
}

function startOfWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function descendingWeekKeys(now, count = 60) {
  const keys = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    keys.push(startOfWeekKey(cursor));
    cursor.setDate(cursor.getDate() - 7);
  }
  return keys;
}

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

// Wraps a stored value with a schema version. `migrate` gets the chance
// to transform old shapes forward; there's nothing to migrate yet at v1,
// but the seam exists for later stages.
function migrate(versioned, fallbackData) {
  if (!versioned || typeof versioned !== "object") {
    return { _v: SCHEMA_VERSION, data: fallbackData };
  }
  // No migrations defined yet — future stages add `if (versioned._v < N) {...}` steps here.
  return versioned;
}

export function createSavingsQuestStore(storage) {
  function load(key, fallbackData) {
    const raw = storage.getItem(key);
    if (raw === null) return structuredClone(fallbackData);
    try {
      const parsed = JSON.parse(raw);
      return migrate(parsed, fallbackData).data;
    } catch {
      return structuredClone(fallbackData);
    }
  }

  function save(key, data) {
    storage.setItem(key, JSON.stringify({ _v: SCHEMA_VERSION, data }));
  }

  // --- game_settings (per family and per child) ---

  function getGameSettings() {
    return load(KEYS.gameSettings, { family: { savingsQuestEnabled: false }, byKid: {} });
  }

  function setGameSettings(settings) {
    save(KEYS.gameSettings, settings);
  }

  function isSavingsQuestEnabled() {
    return Boolean(getGameSettings().family.savingsQuestEnabled);
  }

  function setSavingsQuestEnabled(enabled) {
    const settings = getGameSettings();
    settings.family.savingsQuestEnabled = Boolean(enabled);
    setGameSettings(settings);
  }

  // --- hero ---

  // Backfills any fields a stored record predates (e.g. a hero created
  // in Stage 2, before Stage 3 added `loadout`) onto the default shape,
  // so older saved data never crashes on a missing field as the schema
  // grows. Real stored values always win over the defaults.
  function getHero(kidId) {
    const all = load(KEYS.hero, {});
    return all[kidId] ? { ...defaultHero(), ...all[kidId] } : defaultHero();
  }

  function saveHero(kidId, hero) {
    const all = load(KEYS.hero, {});
    all[kidId] = hero;
    save(KEYS.hero, all);
  }

  function isHeroCreated(kidId) {
    return Boolean(getHero(kidId).name);
  }

  // Preserves any XP already on the books (e.g. from a backfill run
  // before the hero was created) — creation only sets the cosmetic/
  // identity fields, never resets progress.
  function createHero(kidId, { name, look, palette, heroClass, densityMode }) {
    const existing = getHero(kidId);
    const hero = {
      ...existing,
      name,
      look,
      palette,
      heroClass,
      densityMode,
      updatedAt: new Date().toISOString(),
    };
    saveHero(kidId, hero);
    return hero;
  }

  // --- hero_inventory: items the kid owns. Each entry's `seen` flag
  // drives the Stage 3 unlock-reveal animation — false until the reveal
  // has actually played, so a page refresh doesn't replay it. ---

  function getHeroInventory(kidId) {
    const all = load(KEYS.heroInventory, {});
    return all[kidId] || [];
  }

  // Writer is deliberately "dumb" — it trusts the caller already checked
  // isItemUnlocked (in unlocks.js). Idempotent: granting an already-owned
  // item is a no-op, consistent with every other writer in this file.
  function grantItem(kidId, itemId, grantedAt) {
    const all = load(KEYS.heroInventory, {});
    const list = all[kidId] || [];
    if (list.some((i) => i.itemId === itemId)) return { written: false };
    list.push({ itemId, acquiredAt: grantedAt, seen: false });
    all[kidId] = list;
    save(KEYS.heroInventory, all);
    return { written: true };
  }

  function markItemSeen(kidId, itemId) {
    const all = load(KEYS.heroInventory, {});
    const list = all[kidId] || [];
    const entry = list.find((i) => i.itemId === itemId);
    if (entry) {
      entry.seen = true;
      all[kidId] = list;
      save(KEYS.heroInventory, all);
    }
  }

  // Equips an owned item into its matching slot (weapon/armor/companion/
  // cosmetic). Also "dumb" by design — ownership and category matching
  // are checked by the caller.
  function equipItem(kidId, slot, itemId) {
    const hero = getHero(kidId);
    hero.loadout = { ...hero.loadout, [slot]: itemId };
    saveHero(kidId, hero);
    return hero;
  }

  // --- hero_skills: skills the kid has learned. ---

  function getHeroSkills(kidId) {
    const all = load(KEYS.heroSkills, {});
    return all[kidId] || [];
  }

  function getLearnedSkillIds(kidId) {
    return getHeroSkills(kidId).map((s) => s.skillId);
  }

  // Writer is "dumb" the same way — canLearnSkill (prerequisites, points
  // available) is checked by the caller before this is called.
  function addLearnedSkill(kidId, skillId, learnedAt) {
    const all = load(KEYS.heroSkills, {});
    const list = all[kidId] || [];
    if (list.some((s) => s.skillId === skillId)) return { written: false };
    list.push({ skillId, unlockedAt: learnedAt });
    all[kidId] = list;
    save(KEYS.heroSkills, all);
    return { written: true };
  }

  // --- xp_ledger (event-sourced, idempotent per sourceEventId + track) ---

  function getXpLedger() {
    return load(KEYS.xpLedger, []);
  }

  function hasLedgerEntry(sourceEventId, track) {
    return getXpLedger().some(
      (e) => e.sourceEventId === sourceEventId && e.track === track,
    );
  }

  // Returns { written: boolean, entry }. written is false if this exact
  // (sourceEventId, track) pair was already recorded — the whole point of
  // idempotency: replaying the same source event (or a bug that calls the
  // hook twice) must never double-count XP.
  function appendLedgerEntry({ kidId, sourceEventId, track, amount, meta, createdAt }) {
    const ledger = getXpLedger();
    const existing = ledger.find(
      (e) => e.sourceEventId === sourceEventId && e.track === track,
    );
    if (existing) return { written: false, entry: existing };

    const entry = {
      id: newId("sqxp"),
      kidId,
      sourceEventId,
      track,
      amount,
      meta: meta || {},
      createdAt,
    };
    ledger.push(entry);
    save(KEYS.xpLedger, ledger);
    return { written: true, entry };
  }

  function ledgerForKid(kidId) {
    return getXpLedger().filter((e) => e.kidId === kidId);
  }

  // Read-only streak query, for display (e.g. "2 more weeks to unlock
  // this"). Deliberately a separate, small duplication of the week-key
  // gathering logic inside recordSaveEvent below, rather than a shared
  // helper — recordSaveEvent's version also seeds "now" into the set
  // before computing XP for an event that hasn't been written yet, which
  // this query must NOT do (it should only ever reflect what's actually
  // on the ledger). Refactoring them together risked changing Stage 1's
  // already-tested XP behavior for a cosmetic win; not worth it.
  function getCurrentStreakWeeks(kidId, now) {
    const weekKeys = new Set(
      ledgerForKid(kidId)
        .filter((e) => e.track === "save")
        .map((e) => startOfWeekKey(e.createdAt)),
    );
    return computeStreakWeeks(weekKeys, descendingWeekKeys(now));
  }

  // --- pending withdrawals (anti-farming support table) ---

  function getPendingWithdrawals(kidId) {
    const all = load(KEYS.pendingWithdrawals, {});
    return all[kidId] || [];
  }

  function setPendingWithdrawals(kidId, list) {
    const all = load(KEYS.pendingWithdrawals, {});
    all[kidId] = list;
    save(KEYS.pendingWithdrawals, all);
  }

  // --- goals_milestones ---

  function getMilestones(kidId) {
    return load(KEYS.goalsMilestones, []).filter((m) => m.kidId === kidId);
  }

  function addMilestoneIfNew({ kidId, goalName, threshold, reachedAt }) {
    const all = load(KEYS.goalsMilestones, []);
    const exists = all.some(
      (m) => m.kidId === kidId && m.goalName === goalName && m.threshold === threshold,
    );
    if (exists) return { written: false };
    all.push({ id: newId("sqms"), kidId, goalName, threshold, reachedAt });
    save(KEYS.goalsMilestones, all);
    return { written: true };
  }

  // --- goal proposals: the child proposes, the parent approves. Approval
  // writes into Money Muscle's OWN existing goal system (setGoal, called
  // from index.html) rather than Savings Quest keeping a second, separate
  // "real" goal — this table only tracks the in-flight proposal itself. ---

  function getGoalProposal(kidId) {
    const all = load(KEYS.goalProposals, {});
    return all[kidId] || null;
  }

  function proposeGoal(kidId, { name, target, image }) {
    const all = load(KEYS.goalProposals, {});
    all[kidId] = {
      id: newId("sqgp"),
      name,
      target,
      image: image || null,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    save(KEYS.goalProposals, all);
    return all[kidId];
  }

  function resolveGoalProposal(kidId, status) {
    const all = load(KEYS.goalProposals, {});
    if (all[kidId]) {
      all[kidId].status = status;
      all[kidId].resolvedAt = new Date().toISOString();
      save(KEYS.goalProposals, all);
    }
    return all[kidId] || null;
  }

  // --- play_sessions / world_state / quests / quest_progress ---
  //
  // world_state holds everything Stage 4 needs "server-validated
  // persistence" for: regions actually discovered, chests opened,
  // puzzles solved, bosses defeated, and the stamina-charge meter that
  // gates how many times per day the world can be entered. Like every
  // other table in this file, there is no real server — this is
  // localStorage, same as the rest of Money Muscle (flagged in the
  // README; carries forward the Stage 0 decision).

  function defaultWorldState() {
    return {
      regionsDiscovered: [],
      chestsOpened: [],
      puzzlesSolved: [],
      bossesDefeated: [],
      staminaCharge: CONFIG.STAMINA_CHARGE_MAX,
      lastCheckInDate: null,
      updatedAt: null,
    };
  }

  function getPlaySessions() {
    return load(KEYS.playSessions, []);
  }

  function getWorldState(kidId) {
    const all = load(KEYS.worldState, {});
    return all[kidId] ? { ...defaultWorldState(), ...all[kidId] } : defaultWorldState();
  }

  function saveWorldState(kidId, worldState) {
    const all = load(KEYS.worldState, {});
    all[kidId] = { ...worldState, updatedAt: new Date().toISOString() };
    save(KEYS.worldState, all);
    return all[kidId];
  }

  // "Dumb" writer, same pattern as grantItem/addLearnedSkill: the caller
  // (ui.js / world.js) already checked canEnterRegion before spending.
  function spendStaminaCharge(kidId, cost) {
    const ws = getWorldState(kidId);
    ws.staminaCharge = spendCharge(ws.staminaCharge, cost, CONFIG.STAMINA_CHARGE_MAX);
    return saveWorldState(kidId, ws);
  }

  // Idempotent per calendar day — replaying this on the same day never
  // grants charge twice, same idempotency spirit as the XP ledger.
  function recordDailyCheckIn(kidId, now) {
    const ws = getWorldState(kidId);
    if (!isNewCalendarDay(ws.lastCheckInDate, now)) {
      return { written: false, worldState: ws };
    }
    ws.staminaCharge = addCharge(ws.staminaCharge, CONFIG.STAMINA_CHARGE_PER_DAILY_CHECKIN, CONFIG.STAMINA_CHARGE_MAX);
    ws.lastCheckInDate = now;
    return { written: true, worldState: saveWorldState(kidId, ws) };
  }

  function markRegionDiscovered(kidId, regionId) {
    const ws = getWorldState(kidId);
    if (ws.regionsDiscovered.includes(regionId)) return { written: false, worldState: ws };
    ws.regionsDiscovered = [...ws.regionsDiscovered, regionId];
    return { written: true, worldState: saveWorldState(kidId, ws) };
  }

  function openChest(kidId, chestId) {
    const ws = getWorldState(kidId);
    if (ws.chestsOpened.includes(chestId)) return { written: false, worldState: ws };
    ws.chestsOpened = [...ws.chestsOpened, chestId];
    return { written: true, worldState: saveWorldState(kidId, ws) };
  }

  function solvePuzzle(kidId, puzzleId) {
    const ws = getWorldState(kidId);
    if (ws.puzzlesSolved.includes(puzzleId)) return { written: false, worldState: ws };
    ws.puzzlesSolved = [...ws.puzzlesSolved, puzzleId];
    return { written: true, worldState: saveWorldState(kidId, ws) };
  }

  function defeatBoss(kidId, bossId) {
    const ws = getWorldState(kidId);
    if (ws.bossesDefeated.includes(bossId)) return { written: false, worldState: ws };
    ws.bossesDefeated = [...ws.bossesDefeated, bossId];
    return { written: true, worldState: saveWorldState(kidId, ws) };
  }

  function getQuests() {
    return load(KEYS.quests, []);
  }

  function getQuestProgress(kidId) {
    const all = load(KEYS.questProgress, {});
    return all[kidId] || {};
  }

  // --- recompute: single source of truth for deriving hero state from
  // the ledger. Called after every write so hero.level/totalXp is always
  // just a projection of the ledger, never hand-edited.

  function recomputeHeroState(kidId) {
    const entries = ledgerForKid(kidId);
    const saveXpTotal = entries
      .filter((e) => e.track === "save")
      .reduce((sum, e) => sum + e.amount, 0);
    const heartTotal = entries
      .filter((e) => e.track === "heart")
      .reduce((sum, e) => sum + e.amount, 0);
    const staminaTotal = entries
      .filter((e) => e.track === "stamina")
      .reduce((sum, e) => sum + e.amount, 0);

    const { level } = levelForTotalXp(saveXpTotal);
    const prior = getHero(kidId);

    const hero = {
      ...prior,
      level,
      totalXp: saveXpTotal,
      heart: heartTotal,
      stamina: staminaTotal,
      updatedAt: new Date().toISOString(),
    };
    saveHero(kidId, hero);
    return hero;
  }

  // --- event recorders: the only write paths events.js should call ---

  function recordSaveEvent({
    kidId,
    amount,
    sourceEventId,
    now,
    priorDollarSaveTotal,
    newDollarSaveTotal,
    goalTarget,
  }) {
    if (hasLedgerEntry(sourceEventId, "save")) {
      return { written: false, hero: getHero(kidId), milestonesCrossed: [] };
    }

    const pendingWithdrawals = getPendingWithdrawals(kidId);
    const { netAmount, updatedWithdrawals } = computeNetSaveGrowth({
      grossAmount: amount,
      pendingWithdrawals,
      now,
    });
    setPendingWithdrawals(kidId, updatedWithdrawals);

    const weekKeys = new Set(
      ledgerForKid(kidId)
        .filter((e) => e.track === "save")
        .map((e) => startOfWeekKey(e.createdAt)),
    );
    weekKeys.add(startOfWeekKey(now));
    const streakWeeks = computeStreakWeeks(weekKeys, descendingWeekKeys(now));

    const xp = computeSaveXp({ netAmount, streakWeeks });

    appendLedgerEntry({
      kidId,
      sourceEventId,
      track: "save",
      amount: xp,
      meta: { grossAmount: amount, netAmount, streakWeeks },
      createdAt: now,
    });

    const hero = recomputeHeroState(kidId);

    const milestonesCrossed = checkMilestonesCrossed({
      priorSaveTotal: priorDollarSaveTotal,
      newSaveTotal: newDollarSaveTotal,
      goalTarget,
    });
    for (const threshold of milestonesCrossed) {
      addMilestoneIfNew({
        kidId,
        goalName: goalTarget ? String(goalTarget) : "unknown",
        threshold,
        reachedAt: now,
      });
    }

    return { written: true, hero, milestonesCrossed };
  }

  function recordGiveEvent({ kidId, amount, sourceEventId, now }) {
    if (hasLedgerEntry(sourceEventId, "heart")) {
      return { written: false, hero: getHero(kidId) };
    }
    const xp = computeHeartXp(amount);
    appendLedgerEntry({
      kidId,
      sourceEventId,
      track: "heart",
      amount: xp,
      meta: { dollarAmount: amount },
      createdAt: now,
    });
    return { written: true, hero: recomputeHeroState(kidId) };
  }

  function recordChoreApprovedEvent({ kidId, price, sourceEventId, now }) {
    if (hasLedgerEntry(sourceEventId, "stamina")) {
      return { written: false, hero: getHero(kidId) };
    }
    const xp = computeStaminaXp(price);
    appendLedgerEntry({
      kidId,
      sourceEventId,
      track: "stamina",
      amount: xp,
      meta: { price },
      createdAt: now,
    });
    // Stage 4: the same approved chore that grants lifetime Stamina XP
    // also refills a few points of the separate, spendable stamina
    // CHARGE meter (see defaultWorldState). Idempotent for free, since
    // this only runs inside the "not already recorded" branch above.
    const ws = getWorldState(kidId);
    ws.staminaCharge = addCharge(ws.staminaCharge, CONFIG.STAMINA_CHARGE_PER_CHORE_APPROVED, CONFIG.STAMINA_CHARGE_MAX);
    saveWorldState(kidId, ws);
    return { written: true, hero: recomputeHeroState(kidId) };
  }

  // Logged for completeness/future use (e.g. a spend-themed NPC lesson).
  // Zero game effect — spending is never punished, so this never writes
  // a negative amount anywhere.
  function recordSpendEvent({ kidId, amount, sourceEventId, now }) {
    if (hasLedgerEntry(sourceEventId, "spend")) {
      return { written: false };
    }
    appendLedgerEntry({
      kidId,
      sourceEventId,
      track: "spend",
      amount: 0,
      meta: { dollarAmount: amount },
      createdAt: now,
    });
    return { written: true };
  }

  // Defensive — Money Muscle has no "withdraw from savings" feature today.
  // This exists so that if one is ever added, level/XP are structurally
  // guaranteed not to move backward: only powerCharge (a separate,
  // explicitly temporary field) is affected.
  function recordWithdrawal({ kidId, amount, sourceEventId, now }) {
    if (hasLedgerEntry(sourceEventId, "withdrawal")) {
      return { written: false, hero: getHero(kidId) };
    }

    const pendingWithdrawals = getPendingWithdrawals(kidId);
    pendingWithdrawals.push({ amount, at: now, remaining: amount });
    setPendingWithdrawals(kidId, pendingWithdrawals);

    appendLedgerEntry({
      kidId,
      sourceEventId,
      track: "withdrawal",
      amount: 0,
      meta: { dollarAmount: amount },
      createdAt: now,
    });

    const hero = getHero(kidId);
    hero.powerCharge = applyWithdrawalToPowerCharge({
      currentPowerCharge: hero.powerCharge,
      amountWithdrawn: amount,
    });
    hero.updatedAt = new Date().toISOString();
    saveHero(kidId, hero);

    return { written: true, hero };
  }

  return {
    getGameSettings,
    setGameSettings,
    isSavingsQuestEnabled,
    setSavingsQuestEnabled,
    getHero,
    isHeroCreated,
    createHero,
    getHeroInventory,
    grantItem,
    markItemSeen,
    equipItem,
    getHeroSkills,
    getLearnedSkillIds,
    addLearnedSkill,
    getXpLedger,
    hasLedgerEntry,
    ledgerForKid,
    getCurrentStreakWeeks,
    getPendingWithdrawals,
    getMilestones,
    getGoalProposal,
    proposeGoal,
    resolveGoalProposal,
    getPlaySessions,
    getWorldState,
    spendStaminaCharge,
    recordDailyCheckIn,
    markRegionDiscovered,
    openChest,
    solvePuzzle,
    defeatBoss,
    getQuests,
    getQuestProgress,
    recomputeHeroState,
    recordSaveEvent,
    recordGiveEvent,
    recordChoreApprovedEvent,
    recordSpendEvent,
    recordWithdrawal,
  };
}
