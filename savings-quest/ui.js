// Savings Quest — DOM rendering.
//
// Same split as the rest of this module: decisions live in ui-data.js
// and get tested there; this file only paints. It reaches across to
// Money Muscle's existing global functions (window.getGoal, setGoal,
// computeTotals, roundsForKid, compressImage, escapeHtml) rather than
// re-implementing them — those are classic-script top-level functions,
// which attach to `window` automatically, so an ES module can call them
// directly without any bundler or shared-scope trick.

import {
  HERO_LOOKS,
  HERO_PALETTES,
  HERO_CLASSES,
  DENSITY_MODES,
  computeNextUnlockTeaser,
  computeMilestonePathState,
} from "./ui-data.js";
import { levelForTotalXp } from "./engine.js";
import {
  isItemUnlocked,
  describeUnlockRequirement,
  computeNewlyUnlockedItems,
  getAvailableSkillPoints,
  canLearnSkill,
  computeHeroStats,
} from "./unlocks.js";
import { createWorld } from "./world.js";
import { CONFIG } from "./config.js";
import { isDailyCheckinQuestComplete, isWeeklySavingsRaidComplete } from "./quests-engine.js";

function escapeHtml(str) {
  if (window.escapeHtml) return window.escapeHtml(str);
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function avatarSvg(lookId, hex) {
  const shapes = {
    round: `<circle cx="32" cy="32" r="26" fill="${hex}"/>`,
    square: `<rect x="8" y="8" width="48" height="48" rx="10" fill="${hex}"/>`,
    star: `<polygon points="32,4 39,24 60,24 43,37 49,58 32,46 15,58 21,37 4,24 25,24" fill="${hex}"/>`,
  };
  const body = shapes[lookId] || shapes.round;
  return `
    <svg viewBox="0 0 64 64" role="img" aria-label="Your hero" xmlns="http://www.w3.org/2000/svg">
      ${body}
      <circle cx="24" cy="30" r="4" fill="#1f2426"/>
      <circle cx="40" cy="30" r="4" fill="#1f2426"/>
      <path d="M22 40 Q32 48 42 40" stroke="#1f2426" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>
  `;
}

// Procedurally generated, not individually hand-illustrated — "original
// art" here means a consistent, never-copied visual language (shape by
// category, color by rarity), not 32 bespoke drawings. See README.
const RARITY_COLORS = {
  common: "#8e999e",
  uncommon: "#1fa34a",
  rare: "#1467e0",
  epic: "#7c3aed",
  legendary: "#faab19",
};

const RARITY_LABELS = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

function itemIconSvg(category, rarity) {
  const color = RARITY_COLORS[rarity] || RARITY_COLORS.common;
  const shapes = {
    weapon: `<polygon points="32,4 40,24 60,30 40,36 32,60 24,36 4,30 24,24" fill="${color}"/>`,
    armor: `<path d="M32 6 L54 16 V32 C54 48 44 58 32 60 C20 58 10 48 10 32 V16 Z" fill="${color}"/>`,
    companion: `<circle cx="32" cy="36" r="22" fill="${color}"/><circle cx="22" cy="30" r="4" fill="#1f2426"/><circle cx="42" cy="30" r="4" fill="#1f2426"/>`,
    cosmetic: `<polygon points="32,2 38,24 60,24 42,38 48,60 32,46 16,60 22,38 4,24 26,24" fill="${color}"/>`,
  };
  const body = shapes[category] || shapes.weapon;
  return `<svg viewBox="0 0 64 64" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

function applyMotionPreference(store) {
  const reduced = Boolean(store.getGameSettings().family.reducedMotion);
  document.documentElement.setAttribute("data-sq-motion", reduced ? "off" : "on");
}

function densityClass(hero) {
  return hero.densityMode === "young" ? "sq-density-young" : "sq-density-older";
}

export function createUi({ store, catalogs }) {
  const world = createWorld({ store, catalogs, buildHeroContext });

  function renderHeroCreator(container, kidId, { onCreated }) {
    let selected = {
      look: HERO_LOOKS[0].id,
      palette: HERO_PALETTES[0].id,
      heroClass: HERO_CLASSES[0].id,
      densityMode: DENSITY_MODES[0].id,
    };

    function optionGroup({ label, groupId, items, selectedId, dataAttr, renderInner }) {
      return `
        <div style="font-size:0.85rem;font-weight:700;color:var(--mm-gray-70);margin-bottom:6px;">${label}</div>
        <div class="sq-option-grid" id="${groupId}" role="group" aria-label="${label}">
          ${items
            .map(
              (item) => `
            <button type="button" class="sq-option-btn" data-${dataAttr}="${item.id}" aria-pressed="${item.id === selectedId}">
              ${renderInner(item)}
            </button>`,
            )
            .join("")}
        </div>
      `;
    }

    function paint() {
      container.innerHTML = `
        <div class="sq-card">
          <h2>Build Your Hero</h2>
          <label for="sqHeroName" style="display:block;font-size:0.85rem;font-weight:700;color:var(--mm-gray-70);margin-bottom:6px;">
            What's your hero's name?
          </label>
          <input type="text" id="sqHeroName" class="sq-text-input" maxlength="20" placeholder="Hero name">

          ${optionGroup({
            label: "Pick a look",
            groupId: "sqLookGrid",
            items: HERO_LOOKS,
            selectedId: selected.look,
            dataAttr: "look",
            renderInner: (l) => l.label,
          })}

          ${optionGroup({
            label: "Pick a color",
            groupId: "sqPaletteGrid",
            items: HERO_PALETTES,
            selectedId: selected.palette,
            dataAttr: "palette",
            renderInner: (p) => `<span class="sq-swatch" style="background:${p.hex}"></span>${p.label}`,
          })}

          ${optionGroup({
            label: "Pick a class",
            groupId: "sqClassGrid",
            items: HERO_CLASSES,
            selectedId: selected.heroClass,
            dataAttr: "class",
            renderInner: (c) => `${c.name}<span class="sq-class-flavor">${c.flavor}</span>`,
          })}

          ${optionGroup({
            label: "How should your game feel?",
            groupId: "sqDensityGrid",
            items: DENSITY_MODES,
            selectedId: selected.densityMode,
            dataAttr: "density",
            renderInner: (d) => `${d.label}<span class="sq-class-flavor">${d.hint}</span>`,
          })}

          <button type="button" class="sq-primary-btn" id="sqCreateHeroBtn">Create My Hero! 🎉</button>
        </div>
      `;

      container.querySelectorAll("[data-look]").forEach((btn) =>
        btn.addEventListener("click", () => {
          selected.look = btn.dataset.look;
          paint();
        }),
      );
      container.querySelectorAll("[data-palette]").forEach((btn) =>
        btn.addEventListener("click", () => {
          selected.palette = btn.dataset.palette;
          paint();
        }),
      );
      container.querySelectorAll("[data-class]").forEach((btn) =>
        btn.addEventListener("click", () => {
          selected.heroClass = btn.dataset.class;
          paint();
        }),
      );
      container.querySelectorAll("[data-density]").forEach((btn) =>
        btn.addEventListener("click", () => {
          selected.densityMode = btn.dataset.density;
          paint();
        }),
      );

      container.querySelector("#sqCreateHeroBtn").addEventListener("click", () => {
        const nameInput = container.querySelector("#sqHeroName");
        const name = nameInput.value.trim();
        if (!name) {
          nameInput.focus();
          return;
        }
        onCreated({ name, ...selected });
      });
    }

    paint();
  }

  function renderHeroCard(container, kidId) {
    const hero = store.getHero(kidId);
    const { level, xpIntoLevel, xpForNextLevel, isMaxLevel } = levelForTotalXp(hero.totalXp);
    const paletteHex = (HERO_PALETTES.find((p) => p.id === hero.palette) || HERO_PALETTES[0]).hex;
    const pct = isMaxLevel ? 100 : Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100));
    const teaser = computeNextUnlockTeaser({
      level,
      itemsCatalog: catalogs.items,
      skillsCatalog: catalogs.skills,
    });

    container.innerHTML = `
      <div class="sq-card" id="sqHeroCardInner">
        <div class="sq-hero-header">
          <div class="sq-hero-avatar" id="sqHeroAvatar">${avatarSvg(hero.look, paletteHex)}</div>
          <div>
            <div class="sq-hero-name">${escapeHtml(hero.name)}</div>
            <div class="sq-hero-level">${isMaxLevel ? "Max Level!" : `Level ${level}`}</div>
          </div>
        </div>
        <div class="sq-xp-track"><div class="sq-xp-fill" style="width:${pct}%"></div></div>
        <div class="sq-xp-label">
          ${isMaxLevel ? "Max level reached!" : `${xpIntoLevel} / ${xpForNextLevel} XP to Level ${level + 1}`}
        </div>
        ${
          teaser
            ? `<div class="sq-next-unlock">🔓 Next unlock: ${escapeHtml(teaser.name)} at Level ${teaser.unlocksAtLevel}</div>`
            : ""
        }
      </div>
    `;
  }

  function renderGoalFlow(container, kidId) {
    const mmGoal = window.getGoal ? window.getGoal(kidId) : null;
    const proposal = store.getGoalProposal(kidId);

    if (mmGoal) {
      const saveTotal =
        window.computeTotals && window.roundsForKid
          ? window.computeTotals(window.roundsForKid(kidId)).save
          : 0;
      const pct = Math.min(100, Math.round((saveTotal / mmGoal.target) * 100));
      const path = computeMilestonePathState(store.getMilestones(kidId).map((m) => m.threshold));

      container.innerHTML = `
        <div class="sq-card">
          <h2>🎯 ${escapeHtml(mmGoal.name)}</h2>
          <div class="sq-xp-label">$${saveTotal} of $${mmGoal.target} saved (${pct}%)</div>
          <div class="sq-milestone-path">
            ${path
              .map(
                (node) => `
              <div class="sq-milestone-node ${node.reached ? "reached" : ""}">
                <div class="sq-milestone-dot">${node.reached ? "✓" : ""}</div>
                <div class="sq-milestone-label">${Math.round(node.threshold * 100)}%</div>
              </div>`,
              )
              .join("")}
          </div>
        </div>
      `;
      return;
    }

    if (proposal && proposal.status === "pending") {
      container.innerHTML = `
        <div class="sq-card">
          <h2>Your Goal</h2>
          <div class="sq-pending-note">⏳ Waiting for your parent to say yes to "${escapeHtml(proposal.name)}"</div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="sq-card">
        <h2>Set a Savings Goal</h2>
        <label for="sqGoalName" style="display:block;font-size:0.85rem;font-weight:700;color:var(--mm-gray-70);margin-bottom:6px;">
          What are you saving for?
        </label>
        <input type="text" id="sqGoalName" class="sq-text-input" maxlength="40">
        <label for="sqGoalTarget" style="display:block;font-size:0.85rem;font-weight:700;color:var(--mm-gray-70);margin-bottom:6px;">
          How much does it cost?
        </label>
        <input type="number" id="sqGoalTarget" class="sq-text-input" min="1" step="1">
        <div class="note-input-wrap">
          <label>Add a picture (optional)</label>
          <div class="photo-picker">
            <input type="file" accept="image/*" capture="environment" id="sqGoalImageInput" class="photo-input">
            <label for="sqGoalImageInput" class="photo-label" id="sqGoalImageLabel">
              <span class="photo-placeholder">📷 Add photo</span>
            </label>
            <button type="button" class="photo-remove-btn" id="sqGoalImageRemoveBtn" style="display:none;">Remove photo</button>
          </div>
        </div>
        <button type="button" class="sq-primary-btn" id="sqProposeGoalBtn">Ask My Parent</button>
      </div>
    `;

    let pendingImage = null;
    const imageInput = container.querySelector("#sqGoalImageInput");
    const imageLabel = container.querySelector("#sqGoalImageLabel");
    const imageRemoveBtn = container.querySelector("#sqGoalImageRemoveBtn");

    imageInput.addEventListener("change", () => {
      const file = imageInput.files && imageInput.files[0];
      if (!file || !window.compressImage) return;
      window.compressImage(file, 240, 0.7, (dataUrl) => {
        pendingImage = dataUrl;
        imageLabel.style.backgroundImage = `url(${dataUrl})`;
        imageLabel.classList.add("has-photo");
        imageRemoveBtn.style.display = "inline-block";
      });
    });

    imageRemoveBtn.addEventListener("click", () => {
      pendingImage = null;
      imageInput.value = "";
      imageLabel.style.backgroundImage = "";
      imageLabel.classList.remove("has-photo");
      imageRemoveBtn.style.display = "none";
    });

    container.querySelector("#sqProposeGoalBtn").addEventListener("click", () => {
      const name = container.querySelector("#sqGoalName").value.trim();
      const target = parseFloat(container.querySelector("#sqGoalTarget").value);
      if (!name || isNaN(target) || target <= 0) return;
      store.proposeGoal(kidId, { name, target, image: pendingImage });
      renderGoalFlow(container, kidId);
    });
  }

  function kidSaveTotal(kidId) {
    return window.computeTotals && window.roundsForKid ? window.computeTotals(window.roundsForKid(kidId)).save : 0;
  }

  // Dollars saved toward the kid's CURRENT goal specifically — resets
  // to $0 when a completed goal is cleared and a new one is set,
  // unlike kidSaveTotal's lifetime running total (which Family Quest
  // deliberately keeps using below, since that's not tied to any one
  // goal). Falls back to the lifetime total if the bridging function
  // isn't available for some reason, same defensive pattern as every
  // other window.* call in this file.
  function kidGoalProgress(kidId) {
    return window.getGoalProgress ? window.getGoalProgress(kidId) : kidSaveTotal(kidId);
  }

  // Stage 5: Family Quest progress is the same number for every kid in
  // the family (sum of everyone's real Save total), so it's computed
  // once here and folded into every kid's heroContext — unlocks.js then
  // handles it with the exact same milestone-style math an individual
  // goal already uses, via the "familyQuest" unlock type.
  function buildFamilyQuestContext() {
    const settings = store.getGameSettings();
    const kids = window.loadKids ? window.loadKids() : [];
    const progress = kids.reduce((sum, kid) => sum + kidSaveTotal(kid.id), 0);
    return {
      familyQuestProgress: progress,
      familyQuestTarget: settings.family.familyQuestTarget || CONFIG.FAMILY_QUEST_DEFAULT_TARGET,
    };
  }

  // Assembles the plain-data context unlocks.js needs, bridging Stage 1's
  // store with Money Muscle's own globals (goal, real save total,
  // completed-goal count) — the only place in this file that does so for
  // gear/skill purposes.
  function buildHeroContext(kidId) {
    const hero = store.getHero(kidId);
    const goal = window.getGoal ? window.getGoal(kidId) : null;
    const completedGoalsCount = window.getCompletedGoalsFor
      ? window.getCompletedGoalsFor(kidId).length
      : 0;
    const streakWeeks = store.getCurrentStreakWeeks(kidId, new Date().toISOString());

    return {
      level: hero.level,
      streakWeeks,
      completedGoalsCount,
      goalTarget: goal ? goal.target : null,
      currentSaveTotal: kidGoalProgress(kidId),
      ...buildFamilyQuestContext(),
    };
  }

  // Checks the whole catalog against current progress, grants anything
  // newly eligible, and queues the reveal overlay for each one. Called
  // after every XP-affecting event (see bootstrap.js) and once on panel
  // render so refreshing the page can't skip a reveal.
  function evaluateAndRevealUnlocks(kidId) {
    const heroContext = buildHeroContext(kidId);
    const ownedItemIds = store.getHeroInventory(kidId).map((i) => i.itemId);
    const newly = computeNewlyUnlockedItems({
      itemsCatalog: catalogs.items,
      heroContext,
      ownedItemIds,
    });
    if (newly.length === 0) return;

    const now = new Date().toISOString();
    for (const item of newly) {
      store.grantItem(kidId, item.id, now);
    }
    queueUnlockReveal(kidId, newly);
  }

  // Stage 6: the Daily Check-In and Weekly Savings Raid quests.
  // Evaluated on every Kid-panel render (same cadence as
  // evaluateAndRevealUnlocks) — checking in or hitting the weekly
  // target doesn't reward instantly mid-action, but the very next
  // panel render (the next split, chore, or just reopening the World
  // tab) always catches up, and completeQuest's idempotency means
  // re-checking costs nothing.
  function evaluateQuests(kidId) {
    if (!catalogs.quests) return;
    const now = new Date().toISOString();
    const worldState = store.getWorldState(kidId);
    const completed = [];

    const dailyQuest = catalogs.quests.quests.find((q) => q.id === "daily_checkin");
    if (dailyQuest && isDailyCheckinQuestComplete(worldState.lastCheckInDate, now)) {
      const result = store.completeQuest(kidId, dailyQuest.id, now.slice(0, 10), dailyQuest.rewardXp, now);
      if (result.written) completed.push(dailyQuest);
    }

    const weeklyQuest = catalogs.quests.quests.find((q) => q.id === "weekly_savings_raid");
    if (weeklyQuest) {
      const weeklyDollars = store.getWeeklySaveDollars(kidId, now);
      if (isWeeklySavingsRaidComplete(weeklyDollars, weeklyQuest.targetAmount)) {
        const result = store.completeQuest(kidId, weeklyQuest.id, store.getWeekKey(now), weeklyQuest.rewardXp, now);
        if (result.written) completed.push(weeklyQuest);
      }
    }

    if (completed.length > 0) showQuestCompleteOverlay(completed[0]);
  }

  function showQuestCompleteOverlay(quest) {
    const overlay = document.createElement("div");
    overlay.className = "sq-levelup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", `Quest complete: ${quest.name}`);
    overlay.innerHTML = `
      <div class="sq-levelup-card">
        <div style="font-size:3rem;" aria-hidden="true">🏆</div>
        <h2>Quest Complete!</h2>
        <p>${escapeHtml(quest.name)}: +${quest.rewardXp} XP</p>
        <button type="button" class="sq-levelup-done-btn">Nice!</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const doneBtn = overlay.querySelector("button");
    doneBtn.addEventListener("click", () => overlay.remove());
    doneBtn.focus();
  }

  let revealQueue = [];
  let revealKidId = null;

  function queueUnlockReveal(kidId, items) {
    revealKidId = kidId;
    revealQueue.push(...items);
    if (revealQueue.length === items.length) showNextUnlockReveal();
  }

  function showNextUnlockReveal() {
    const item = revealQueue.shift();
    if (!item) return;

    const overlay = document.createElement("div");
    overlay.className = "sq-levelup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", `New item unlocked: ${item.name}`);
    overlay.innerHTML = `
      <div class="sq-levelup-card">
        <div class="sq-reveal-icon">${itemIconSvg(item.category, item.rarity)}</div>
        <div class="sq-reveal-rarity" style="color:${RARITY_COLORS[item.rarity]}">${RARITY_LABELS[item.rarity]}</div>
        <h2>${escapeHtml(item.name)}</h2>
        <p>${escapeHtml(item.tooltip)}</p>
        <button type="button" class="sq-levelup-done-btn">Neat!</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const doneBtn = overlay.querySelector("button");
    doneBtn.addEventListener("click", () => {
      overlay.remove();
      if (revealKidId) store.markItemSeen(revealKidId, item.id);
      showNextUnlockReveal();
    });
    doneBtn.focus();
  }

  function renderLoadoutScreen(container, kidId) {
    const hero = store.getHero(kidId);
    const heroContext = buildHeroContext(kidId);
    const owned = store.getHeroInventory(kidId);
    const ownedIds = new Set(owned.map((i) => i.itemId));
    const learnedSkillIds = store.getLearnedSkillIds(kidId);
    const stats = computeHeroStats({
      loadout: hero.loadout,
      itemsCatalog: catalogs.items,
      learnedSkillIds,
      skillsCatalog: catalogs.skills,
    });

    const slots = ["weapon", "armor", "companion", "cosmetic"];
    const slotLabels = { weapon: "Weapon", armor: "Armor", companion: "Companion", cosmetic: "Cosmetic" };

    function slotSection(slot) {
      const itemsInSlot = catalogs.items.items.filter((i) => i.category === slot);
      const equippedId = hero.loadout[slot];

      return `
        <div class="sq-loadout-slot">
          <div class="sq-loadout-slot-label">${slotLabels[slot]}</div>
          <div class="sq-item-grid">
            ${itemsInSlot
              .map((item) => {
                const owns = ownedIds.has(item.id);
                const equipped = equippedId === item.id;
                if (!owns) {
                  const req = describeUnlockRequirement(item, heroContext);
                  return `
                    <div class="sq-item-card sq-item-locked" title="${escapeHtml(item.name)}">
                      <div class="sq-item-icon">${itemIconSvg(item.category, item.rarity)}</div>
                      <div class="sq-item-name">🔒 ${escapeHtml(item.name)}</div>
                      <div class="sq-item-req">${escapeHtml(req)}</div>
                    </div>
                  `;
                }
                return `
                  <button type="button" class="sq-item-card sq-item-owned ${equipped ? "sq-item-equipped" : ""}"
                    data-slot="${slot}" data-item-id="${item.id}" aria-pressed="${equipped}">
                    <div class="sq-item-icon">${itemIconSvg(item.category, item.rarity)}</div>
                    <div class="sq-item-name">${escapeHtml(item.name)}</div>
                    <div class="sq-item-rarity" style="color:${RARITY_COLORS[item.rarity]}">${RARITY_LABELS[item.rarity]}</div>
                    ${equipped ? '<div class="sq-item-equipped-tag">Equipped</div>' : ""}
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="sq-card">
        <h2>🎒 Loadout</h2>
        <div class="sq-stats-row">
          <div class="sq-stat"><span class="sq-stat-label">Power</span><span class="sq-stat-value">${stats.power}</span></div>
          <div class="sq-stat"><span class="sq-stat-label">Heart</span><span class="sq-stat-value">${stats.heart}</span></div>
          <div class="sq-stat"><span class="sq-stat-label">Wisdom</span><span class="sq-stat-value">${stats.wisdom}</span></div>
        </div>
        ${slots.map(slotSection).join("")}
      </div>
    `;

    container.querySelectorAll(".sq-item-owned").forEach((btn) => {
      btn.addEventListener("click", () => {
        store.equipItem(kidId, btn.dataset.slot, btn.dataset.itemId);
        renderLoadoutScreen(container, kidId);
      });
    });
  }

  function renderSkillTree(container, kidId) {
    const hero = store.getHero(kidId);
    const learnedSkillIds = store.getLearnedSkillIds(kidId);
    const availablePoints = getAvailableSkillPoints({
      heroLevel: hero.level,
      learnedSkillIds,
      skillsCatalog: catalogs.skills,
    });

    const branches = [
      { id: "saver", label: "Saver", stat: "Power" },
      { id: "giver", label: "Giver", stat: "Heart" },
      { id: "wise_spender", label: "Wise Spender", stat: "Wisdom" },
    ];

    function branchColumn(branch) {
      const skills = catalogs.skills.skills
        .filter((s) => s.branch === branch.id)
        .sort((a, b) => a.tier - b.tier);

      return `
        <div class="sq-skill-branch">
          <div class="sq-skill-branch-label">${branch.label}<span class="sq-class-flavor">${branch.stat}</span></div>
          ${skills
            .map((skill) => {
              const learned = learnedSkillIds.includes(skill.id);
              const check = learned
                ? { ok: false, reason: "already-learned" }
                : canLearnSkill({ skill, learnedSkillIds, heroLevel: hero.level, skillsCatalog: catalogs.skills });
              return `
                <div class="sq-skill-node ${learned ? "sq-skill-learned" : ""}">
                  <div class="sq-skill-name">${escapeHtml(skill.name)}</div>
                  <div class="sq-skill-desc">${escapeHtml(skill.description)}</div>
                  ${
                    learned
                      ? '<div class="sq-skill-status">✓ Learned</div>'
                      : `<button type="button" class="sq-skill-learn-btn" data-skill-id="${skill.id}" ${check.ok ? "" : "disabled"}>
                          ${check.ok ? "Learn (1 pt)" : check.reason === "prerequisite-missing" ? "Locked" : "Need more points"}
                        </button>`
                  }
                </div>
              `;
            })
            .join("")}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="sq-card">
        <h2>🌳 Skills</h2>
        <div class="sq-xp-label">${availablePoints} skill point${availablePoints === 1 ? "" : "s"} available</div>
        <div class="sq-skill-tree">
          ${branches.map(branchColumn).join("")}
        </div>
      </div>
    `;

    container.querySelectorAll(".sq-skill-learn-btn:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        store.addLearnedSkill(kidId, btn.dataset.skillId, new Date().toISOString());
        renderSkillTree(container, kidId);
      });
    });
  }

  // Stage 5: unseen Bonus XP grants and parent cheers, shown once each,
  // dismissible. Both are small, read-only notices — dismissing one
  // only marks it seen, it never affects XP or anything else.
  function renderMessageBanners(container, kidId) {
    const unseenBonuses = store.getBonusGrants(kidId).filter((g) => !g.seen);
    const unseenCheers = store.getCheers(kidId).filter((c) => !c.seen);
    if (unseenBonuses.length === 0 && unseenCheers.length === 0) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = `
      ${unseenBonuses
        .map(
          (g) => `
        <div class="sq-card sq-banner-card" data-kind="bonus" data-id="${g.id}">
          <strong>✨ Bonus XP from a grown-up: +${g.amount} XP</strong>
          <p>${escapeHtml(g.note)}</p>
          <button type="button" class="sq-decline-btn sq-banner-dismiss">Thanks!</button>
        </div>
      `,
        )
        .join("")}
      ${unseenCheers
        .map(
          (c) => `
        <div class="sq-card sq-banner-card" data-kind="cheer" data-id="${c.id}">
          <strong>💌 A cheer from a grown-up:</strong>
          <p>${escapeHtml(c.message)}</p>
          <button type="button" class="sq-decline-btn sq-banner-dismiss">Thanks!</button>
        </div>
      `,
        )
        .join("")}
    `;

    container.querySelectorAll(".sq-banner-card").forEach((card) => {
      card.querySelector(".sq-banner-dismiss").addEventListener("click", () => {
        if (card.dataset.kind === "bonus") store.markBonusGrantSeen(kidId, card.dataset.id);
        else store.markCheerSeen(kidId, card.dataset.id);
        card.remove();
      });
    });
  }

  function renderKidPanel(container, kidId) {
    applyMotionPreference(store);

    // renderKidPanel re-renders this container's whole innerHTML on
    // every event (split, chore, etc.) — if the World tab was open and
    // mid-game, replacing the DOM out from under a live Phaser.Game
    // would leak its WebGL/canvas context. Always tear it down first;
    // it's a safe no-op if no game is mounted.
    world.destroyGame();

    if (!store.isSavingsQuestEnabled()) {
      container.innerHTML = "";
      container.className = "sq-panel";
      return;
    }

    if (!store.isHeroCreated(kidId)) {
      container.className = "sq-panel sq-density-older";
      renderHeroCreator(container, kidId, {
        onCreated: (data) => {
          store.createHero(kidId, data);
          renderKidPanel(container, kidId);
        },
      });
      return;
    }

    evaluateAndRevealUnlocks(kidId);
    evaluateQuests(kidId);

    const hero = store.getHero(kidId);
    container.className = `sq-panel ${densityClass(hero)}`;
    container.innerHTML = `
      <div id="sqBannerMount"></div>
      <div id="sqHeroCardMount"></div>
      <div id="sqGoalFlowMount"></div>
      <div class="sq-tab-row">
        <button type="button" class="sq-tab-btn" data-tab="world" aria-expanded="false">🗺️ World</button>
        <button type="button" class="sq-tab-btn" data-tab="loadout" aria-expanded="false">🎒 Loadout</button>
        <button type="button" class="sq-tab-btn" data-tab="skills" aria-expanded="false">🌳 Skills</button>
      </div>
      <div id="sqTabMount"></div>
    `;
    renderMessageBanners(container.querySelector("#sqBannerMount"), kidId);
    renderHeroCard(container.querySelector("#sqHeroCardMount"), kidId);
    renderGoalFlow(container.querySelector("#sqGoalFlowMount"), kidId);

    const tabMount = container.querySelector("#sqTabMount");
    let openTab = null;

    container.querySelectorAll(".sq-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        if (openTab === tab) {
          openTab = null;
          world.destroyGame();
          tabMount.innerHTML = "";
          container.querySelectorAll(".sq-tab-btn").forEach((b) => b.setAttribute("aria-expanded", "false"));
          return;
        }
        if (openTab === "world" && tab !== "world") world.destroyGame();
        openTab = tab;
        container.querySelectorAll(".sq-tab-btn").forEach((b) =>
          b.setAttribute("aria-expanded", String(b.dataset.tab === tab)),
        );
        if (tab === "world") world.renderWorldGate(tabMount, kidId);
        if (tab === "loadout") renderLoadoutScreen(tabMount, kidId);
        if (tab === "skills") renderSkillTree(tabMount, kidId);
      });
    });
  }

  // Stage 5 parent dashboard: level, goal progress, recent unlocks, play
  // time, and a plain-language "what they learned" derived from which
  // puzzles were solved in the last 7 days (each puzzle maps to one
  // region, each region to one NPC, each NPC to one lesson sentence).
  function buildWeeklyReport(kidId) {
    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const hero = store.getHero(kidId);
    const goal = window.getGoal ? window.getGoal(kidId) : null;
    const saveTotal = kidGoalProgress(kidId);
    const goalPct = goal && goal.target > 0 ? Math.min(100, Math.round((saveTotal / goal.target) * 100)) : null;

    const recentUnlocks = store
      .getHeroInventory(kidId)
      .slice()
      .sort((a, b) => new Date(b.acquiredAt) - new Date(a.acquiredAt))
      .slice(0, 3)
      .map((owned) => catalogs.items.items.find((i) => i.id === owned.itemId))
      .filter(Boolean);

    const playMinutes = Math.round(store.getPlayMinutesSince(kidId, sinceIso));

    const learnedLessons = new Set();
    for (const solve of store.getPuzzleSolvesSince(kidId, sinceIso)) {
      const puzzle = catalogs.puzzles.puzzles.find((p) => p.id === solve.id);
      const region = puzzle && catalogs.regions.regions.find((r) => r.id === puzzle.region);
      const npc = region && region.npcId && catalogs.npcLessons.npcs.find((n) => n.id === region.npcId);
      if (npc) learnedLessons.add(npc.lesson);
    }

    return { hero, goal, saveTotal, goalPct, recentUnlocks, playMinutes, learnedLessons: [...learnedLessons] };
  }

  function renderParentPanel(container, kidId) {
    const settings = store.getGameSettings();
    const proposal = kidId ? store.getGoalProposal(kidId) : null;
    const showApproval = Boolean(proposal && proposal.status === "pending");
    const kidSettings = kidId ? store.getKidSettings(kidId) : null;
    const report = kidId ? buildWeeklyReport(kidId) : null;
    const family = buildFamilyQuestContext();
    const familyPct = family.familyQuestTarget
      ? Math.min(100, Math.round((family.familyQuestProgress / family.familyQuestTarget) * 100))
      : 0;
    const familyUnlocked = isItemUnlocked({ unlock: { type: "familyQuest", value: 1 } }, family);
    const quietHours = kidSettings ? kidSettings.quietHours : null;

    container.innerHTML = `
      <div class="sq-card">
        <h2>🗡️ Savings Quest</h2>
        <label style="display:flex;align-items:center;gap:8px;font-weight:600;color:var(--mm-gray-70);margin-bottom:10px;">
          <input type="checkbox" id="sqEnableToggle" ${settings.family.savingsQuestEnabled ? "checked" : ""}>
          Turn on Savings Quest
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-weight:600;color:var(--mm-gray-70);">
          <input type="checkbox" id="sqReducedMotionToggle" ${settings.family.reducedMotion ? "checked" : ""}>
          Reduce motion / animation
        </label>
      </div>
      ${
        showApproval
          ? `
        <div class="sq-card">
          <h2>🎯 Goal Request</h2>
          <p>Wants to save for <strong>${escapeHtml(proposal.name)}</strong> — $${proposal.target}</p>
          ${
            proposal.image
              ? `<img src="${proposal.image}" alt="" style="width:80px;height:80px;border-radius:12px;object-fit:cover;margin-bottom:10px;">`
              : ""
          }
          <div class="sq-approval-row">
            <button type="button" class="sq-primary-btn" id="sqApproveGoalBtn">Approve</button>
            <button type="button" class="sq-decline-btn" id="sqDeclineGoalBtn">Not now</button>
          </div>
        </div>
      `
          : ""
      }
      ${
        report
          ? `
        <div class="sq-card">
          <h2>📊 This Week's Progress</h2>
          <p class="sq-xp-label">Level ${report.hero.level}${report.goal ? ` &middot; saving for ${escapeHtml(report.goal.name)}` : ""}</p>
          ${
            report.goalPct !== null
              ? `<div class="sq-xp-track"><div class="sq-xp-fill" style="width:${report.goalPct}%"></div></div>
                 <p class="sq-xp-label">$${report.saveTotal} of $${report.goal.target} saved (${report.goalPct}%)</p>`
              : `<p class="sq-world-gate-hint">No active goal yet.</p>`
          }
          <p class="sq-xp-label">🕹️ Played ${report.playMinutes} minute${report.playMinutes === 1 ? "" : "s"} this week</p>
          <p class="sq-xp-label">Recent unlocks: ${
            report.recentUnlocks.length
              ? report.recentUnlocks.map((i) => escapeHtml(i.name)).join(", ")
              : "none yet"
          }</p>
          <p style="font-weight:700;color:var(--mm-gray-90);margin-bottom:4px;">What ${escapeHtml(report.hero.name || "your child")} learned this week:</p>
          ${
            report.learnedLessons.length
              ? `<ul style="margin:0;padding-left:20px;color:var(--mm-gray-70);">${report.learnedLessons
                  .map((l) => `<li>${escapeHtml(l)}</li>`)
                  .join("")}</ul>`
              : `<p class="sq-world-gate-hint">No world lessons yet this week — try a puzzle in the World tab!</p>`
          }
        </div>
      `
          : ""
      }
      ${
        kidSettings
          ? `
        <div class="sq-card">
          <h2>⚙️ Game Settings for This Child</h2>
          <label style="display:flex;align-items:center;gap:8px;font-weight:600;color:var(--mm-gray-70);margin-bottom:10px;">
            <input type="checkbox" id="sqKidEnabledToggle" ${kidSettings.enabled ? "checked" : ""}>
            Enable the game for this child
          </label>
          <label style="display:block;font-weight:600;color:var(--mm-gray-70);margin-bottom:10px;">
            Daily play-time limit (minutes, blank = no limit)<br>
            <input type="number" min="0" id="sqDailyLimitInput" value="${kidSettings.dailyPlayMinutes ?? ""}" style="margin-top:4px;padding:6px;border-radius:8px;border:2px solid var(--mm-gray-10);width:100px;">
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-weight:600;color:var(--mm-gray-70);margin-bottom:6px;">
            <input type="checkbox" id="sqQuietHoursToggle" ${quietHours ? "checked" : ""}>
            Quiet hours (no play allowed)
          </label>
          <div id="sqQuietHoursInputs" style="display:${quietHours ? "flex" : "none"};gap:10px;align-items:center;margin-bottom:10px;">
            From <input type="time" id="sqQuietStart" value="${quietHours ? pad2(quietHours.startHour) + ":" + pad2(quietHours.startMinute || 0) : "20:00"}">
            to <input type="time" id="sqQuietEnd" value="${quietHours ? pad2(quietHours.endHour) + ":" + pad2(quietHours.endMinute || 0) : "07:00"}">
          </div>
          <label style="display:block;font-weight:600;color:var(--mm-gray-70);margin-bottom:10px;">
            XP rate<br>
            <select id="sqXpPresetSelect" style="margin-top:4px;padding:6px;border-radius:8px;border:2px solid var(--mm-gray-10);">
              <option value="gentle" ${kidSettings.xpRatePreset === "gentle" ? "selected" : ""}>Gentle (faster leveling)</option>
              <option value="standard" ${kidSettings.xpRatePreset === "standard" ? "selected" : ""}>Standard</option>
              <option value="challenging" ${kidSettings.xpRatePreset === "challenging" ? "selected" : ""}>Challenging (slower leveling)</option>
            </select>
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-weight:600;color:var(--mm-gray-70);margin-bottom:6px;">
            <input type="checkbox" id="sqParentMatchToggle" ${kidSettings.parentMatchEnabled ? "checked" : ""}>
            Parent match (game XP only — never real money)
          </label>
          <label style="display:${kidSettings.parentMatchEnabled ? "block" : "none"};font-weight:600;color:var(--mm-gray-70);" id="sqParentMatchRateRow">
            Match rate (% extra XP)<br>
            <input type="number" min="0" step="10" id="sqParentMatchRateInput" value="${Math.round(kidSettings.parentMatchRate * 100)}" style="margin-top:4px;padding:6px;border-radius:8px;border:2px solid var(--mm-gray-10);width:100px;">
          </label>
        </div>

        <div class="sq-card">
          <h2>✨ Manual Bonus XP</h2>
          <p class="sq-world-gate-hint">Reward a good money decision directly — this always counts toward leveling up.</p>
          <label style="display:block;font-weight:600;color:var(--mm-gray-70);margin-bottom:10px;">
            XP amount<br>
            <input type="number" min="1" id="sqBonusAmountInput" value="50" style="margin-top:4px;padding:6px;border-radius:8px;border:2px solid var(--mm-gray-10);width:100px;">
          </label>
          <label style="display:block;font-weight:600;color:var(--mm-gray-70);margin-bottom:10px;">
            Note (shown to your child)<br>
            <input type="text" id="sqBonusNoteInput" placeholder="e.g. Great job comparing prices before buying!" style="margin-top:4px;padding:6px;border-radius:8px;border:2px solid var(--mm-gray-10);width:100%;max-width:320px;">
          </label>
          <button type="button" class="sq-primary-btn" id="sqGrantBonusBtn">Grant Bonus XP</button>
        </div>
      `
          : ""
      }
      <div class="sq-card">
        <h2>🤝 Family Quest</h2>
        <p class="sq-world-gate-hint">Everyone's real Save totals count toward one shared family goal.</p>
        <div class="sq-xp-track"><div class="sq-xp-fill" style="width:${familyPct}%"></div></div>
        <p class="sq-xp-label">$${Math.round(family.familyQuestProgress)} of $${family.familyQuestTarget} saved together (${familyPct}%)</p>
        ${
          familyUnlocked
            ? `<p style="font-weight:700;color:var(--mm-green-dark);">🎉 Unlocked! The Family Unity Banner is now available for everyone to equip.</p>`
            : ""
        }
        <label style="display:block;font-weight:600;color:var(--mm-gray-70);margin:10px 0;">
          Family Quest target ($)<br>
          <input type="number" min="1" id="sqFamilyTargetInput" value="${family.familyQuestTarget}" style="margin-top:4px;padding:6px;border-radius:8px;border:2px solid var(--mm-gray-10);width:100px;">
        </label>
        ${
          kidId
            ? `
          <label style="display:block;font-weight:600;color:var(--mm-gray-70);margin-bottom:10px;">
            Send a cheer to this child<br>
            <input type="text" id="sqCheerInput" placeholder="e.g. So proud of your saving streak!" style="margin-top:4px;padding:6px;border-radius:8px;border:2px solid var(--mm-gray-10);width:100%;max-width:320px;">
          </label>
          <button type="button" class="sq-decline-btn" id="sqSendCheerBtn">Send Cheer 💌</button>
        `
            : ""
        }
      </div>
    `;

    container.querySelector("#sqEnableToggle").addEventListener("change", (e) => {
      const s = store.getGameSettings();
      s.family.savingsQuestEnabled = e.target.checked;
      store.setGameSettings(s);
    });

    container.querySelector("#sqReducedMotionToggle").addEventListener("change", (e) => {
      const s = store.getGameSettings();
      s.family.reducedMotion = e.target.checked;
      store.setGameSettings(s);
      applyMotionPreference(store);
    });

    if (showApproval) {
      container.querySelector("#sqApproveGoalBtn").addEventListener("click", () => {
        if (window.setGoal) window.setGoal(kidId, proposal.name, proposal.target);
        store.resolveGoalProposal(kidId, "approved");
        // Bug fix: window.setGoal() only writes the data — it doesn't
        // re-render Money Muscle's own "Streak & Savings Goal" card,
        // which has no idea anything changed until its own render
        // cycle runs again. Calling renderParentView() (Money Muscle's
        // own full Parent-view render, the same thing its own "Set
        // Goal" button already triggers after a manual setGoal) makes
        // that card pick up the kid's approved goal immediately instead
        // of still saying "No savings goal set yet." until the next
        // tab switch. It also re-renders this very panel, via the
        // window.SavingsQuest.renderParentPanel() call already built
        // into that function — so the direct call below is a fallback
        // for the (never-expected) case that global is missing, not a
        // redundant double-render in the normal case.
        if (window.renderParentView) window.renderParentView();
        else renderParentPanel(container, kidId);
      });
      container.querySelector("#sqDeclineGoalBtn").addEventListener("click", () => {
        store.resolveGoalProposal(kidId, "declined");
        renderParentPanel(container, kidId);
      });
    }

    if (kidSettings) {
      container.querySelector("#sqKidEnabledToggle").addEventListener("change", (e) => {
        store.setKidSettings(kidId, { enabled: e.target.checked });
      });

      container.querySelector("#sqDailyLimitInput").addEventListener("change", (e) => {
        const val = e.target.value.trim();
        store.setKidSettings(kidId, { dailyPlayMinutes: val === "" ? null : Math.max(0, parseInt(val, 10)) });
      });

      const quietInputsEl = container.querySelector("#sqQuietHoursInputs");
      function saveQuietHours() {
        if (!container.querySelector("#sqQuietHoursToggle").checked) {
          store.setKidSettings(kidId, { quietHours: null });
          return;
        }
        const [startHour, startMinute] = container.querySelector("#sqQuietStart").value.split(":").map(Number);
        const [endHour, endMinute] = container.querySelector("#sqQuietEnd").value.split(":").map(Number);
        store.setKidSettings(kidId, { quietHours: { startHour, startMinute, endHour, endMinute } });
      }
      container.querySelector("#sqQuietHoursToggle").addEventListener("change", (e) => {
        quietInputsEl.style.display = e.target.checked ? "flex" : "none";
        saveQuietHours();
      });
      container.querySelector("#sqQuietStart").addEventListener("change", saveQuietHours);
      container.querySelector("#sqQuietEnd").addEventListener("change", saveQuietHours);

      container.querySelector("#sqXpPresetSelect").addEventListener("change", (e) => {
        store.setKidSettings(kidId, { xpRatePreset: e.target.value });
      });

      const matchRateRow = container.querySelector("#sqParentMatchRateRow");
      container.querySelector("#sqParentMatchToggle").addEventListener("change", (e) => {
        matchRateRow.style.display = e.target.checked ? "block" : "none";
        store.setKidSettings(kidId, { parentMatchEnabled: e.target.checked });
      });
      container.querySelector("#sqParentMatchRateInput").addEventListener("change", (e) => {
        store.setKidSettings(kidId, { parentMatchRate: Math.max(0, parseFloat(e.target.value) || 0) / 100 });
      });

      container.querySelector("#sqGrantBonusBtn").addEventListener("click", () => {
        const amount = Math.max(1, parseInt(container.querySelector("#sqBonusAmountInput").value, 10) || 0);
        const note = container.querySelector("#sqBonusNoteInput").value.trim();
        if (!note) return;
        store.grantBonusXp(kidId, { amount, note, grantedAt: new Date().toISOString() });
        renderParentPanel(container, kidId);
      });
    }

    container.querySelector("#sqFamilyTargetInput").addEventListener("change", (e) => {
      const s = store.getGameSettings();
      s.family.familyQuestTarget = Math.max(1, parseInt(e.target.value, 10) || CONFIG.FAMILY_QUEST_DEFAULT_TARGET);
      store.setGameSettings(s);
      renderParentPanel(container, kidId);
    });

    if (kidId) {
      container.querySelector("#sqSendCheerBtn").addEventListener("click", () => {
        const input = container.querySelector("#sqCheerInput");
        const message = input.value.trim();
        if (!message) return;
        store.sendCheer(kidId, message, new Date().toISOString());
        input.value = "";
        input.placeholder = "Cheer sent! 💌";
      });
    }
  }

  function showCoinBurst(anchorEl) {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const coin = document.createElement("div");
    coin.className = "sq-coin-burst";
    coin.textContent = "🪙";
    coin.setAttribute("aria-hidden", "true");
    coin.style.left = `${rect.left + rect.width / 2}px`;
    coin.style.top = `${rect.top}px`;
    coin.style.setProperty("--sq-coin-dy", "-60px");
    document.body.appendChild(coin);
    setTimeout(() => coin.remove(), 1300);
  }

  function showLevelUpOverlay(newLevel, { bonusText } = {}) {
    const overlay = document.createElement("div");
    overlay.className = "sq-levelup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", `Level up! You reached level ${newLevel}.`);
    overlay.innerHTML = `
      <div class="sq-levelup-card">
        <div style="font-size:3rem;" aria-hidden="true">⭐</div>
        <h2>Level ${newLevel}!</h2>
        <p>${bonusText ? escapeHtml(bonusText) : "Your hero grows stronger!"}</p>
        <button type="button" class="sq-levelup-done-btn">Awesome!</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const doneBtn = overlay.querySelector("button");
    doneBtn.addEventListener("click", () => overlay.remove());
    doneBtn.focus();
  }

  return {
    renderKidPanel,
    renderParentPanel,
    showCoinBurst,
    showLevelUpOverlay,
    evaluateAndRevealUnlocks,
    applyMotionPreference: () => applyMotionPreference(store),
  };
}
