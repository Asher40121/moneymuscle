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

function escapeHtml(str) {
  if (window.escapeHtml) return window.escapeHtml(str);
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
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

function applyMotionPreference(store) {
  const reduced = Boolean(store.getGameSettings().family.reducedMotion);
  document.documentElement.setAttribute("data-sq-motion", reduced ? "off" : "on");
}

function densityClass(hero) {
  return hero.densityMode === "young" ? "sq-density-young" : "sq-density-older";
}

export function createUi({ store, catalogs }) {
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

  function renderKidPanel(container, kidId) {
    applyMotionPreference(store);

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

    const hero = store.getHero(kidId);
    container.className = `sq-panel ${densityClass(hero)}`;
    container.innerHTML = '<div id="sqHeroCardMount"></div><div id="sqGoalFlowMount"></div>';
    renderHeroCard(container.querySelector("#sqHeroCardMount"), kidId);
    renderGoalFlow(container.querySelector("#sqGoalFlowMount"), kidId);
  }

  function renderParentPanel(container, kidId) {
    const settings = store.getGameSettings();
    const proposal = kidId ? store.getGoalProposal(kidId) : null;
    const showApproval = Boolean(proposal && proposal.status === "pending");

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
        renderParentPanel(container, kidId);
      });
      container.querySelector("#sqDeclineGoalBtn").addEventListener("click", () => {
        store.resolveGoalProposal(kidId, "declined");
        renderParentPanel(container, kidId);
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
    applyMotionPreference: () => applyMotionPreference(store),
  };
}
