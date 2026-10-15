// Savings Quest — Stage 4 Open World v1.
//
// Phaser 3 (chosen in Stage 0, loaded from a CDN) is lazy-loaded: the
// script tag is only injected the first time a kid actually clicks
// "Enter the World," not on initial page load. Everything up to that
// point — the World Gate (stamina charge, daily check-in, Enter
// button) and the Hero Hub fallback — is plain DOM, so there is no
// engine cost at all unless the kid asks for the canvas experience.
//
// If canvas isn't supported, or the Phaser script fails to load (CDN
// blocked, offline), this falls back to the Hero Hub: the exact same
// regions/NPCs/puzzles/bosses/chests, but as plain DOM cards and
// buttons instead of a walkable map. No feature is canvas-exclusive —
// only the "walk around and bump into things" presentation is.
//
// All sprites/textures are generated procedurally at runtime via
// Phaser's Graphics -> generateTexture, and all sound is synthesized
// with the Web Audio API — no image or audio files are loaded, so
// there is nothing third-party to license. See ASSETS.md.

import { isItemUnlocked, describeUnlockRequirement } from "./unlocks.js";
import {
  canEnterRegion,
  computeLandmarkStage,
  checkCoinOrderPuzzle,
  checkNeedsWantsSort,
  checkBossSequence,
  canPlayNow,
} from "./world-engine.js";
import { CONFIG } from "./config.js";

const PHASER_CDN_URL = "https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js";

function escapeHtml(str) {
  if (window.escapeHtml) return window.escapeHtml(str);
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function canvasSupported() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext && c.getContext("2d"));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// Sound: short synthesized beeps, not audio files. Muted entirely when
// the family's "muted" setting is on. Stage 6: every beep also gets a
// visual caption — shown even when muted, so a deaf/hard-of-hearing
// kid gets the same information sound would have carried, not just a
// generic "something happened."
// ---------------------------------------------------------------------
function showSoundCaption(text) {
  const toast = document.createElement("div");
  toast.className = "sq-sound-caption";
  toast.setAttribute("role", "status");
  toast.textContent = `🔊 ${text}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1600);
}

let audioCtx = null;
function playBeep(freq, durationMs, muted, caption) {
  if (caption) showSoundCaption(caption);
  if (muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + durationMs / 1000);
  } catch {
    // Audio is a nice-to-have flourish; never let it break the game.
  }
}

// ---------------------------------------------------------------------
// Procedural textures — one Graphics object generates each, then is
// discarded. Rarity-style flat shapes, matching the rest of the game's
// flat-vector art direction (see RARITY_COLORS in ui.js).
// ---------------------------------------------------------------------
function buildTextures(scene) {
  const make = (key, size, draw) => {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    draw(g, size);
    g.generateTexture(key, size, size);
    g.destroy();
  };

  make("hero", 40, (g, s) => {
    g.fillStyle(0x1467e0, 1);
    g.fillCircle(s / 2, s / 2, s / 2 - 2);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(s / 2, 4, s / 2 - 6, s / 2, s / 2 + 6, s / 2);
  });

  make("blob", 32, (g, s) => {
    g.fillStyle(0x1fa34a, 1);
    g.fillEllipse(s / 2, s / 2, s - 4, s - 10);
    g.fillStyle(0x1f2426, 1);
    g.fillCircle(s / 2 - 6, s / 2 - 2, 2.5);
    g.fillCircle(s / 2 + 6, s / 2 - 2, 2.5);
  });

  make("chest-closed", 36, (g, s) => {
    g.fillStyle(0x8e5a2b, 1);
    g.fillRoundedRect(2, s / 2 - 2, s - 4, s / 2 - 2, 4);
    g.fillStyle(0xb3792f, 1);
    g.fillRoundedRect(2, s / 2 - 10, s - 4, 12, 6);
    g.fillStyle(0xfaab19, 1);
    g.fillRect(s / 2 - 3, s / 2 - 6, 6, 8);
  });

  make("chest-open", 36, (g, s) => {
    g.fillStyle(0x8e5a2b, 1);
    g.fillRoundedRect(2, s / 2 - 2, s - 4, s / 2 - 2, 4);
    g.fillStyle(0xb3792f, 1);
    g.fillRoundedRect(2, s / 2 - 16, s - 4, 10, 6);
    g.fillStyle(0xfaab19, 1);
    g.fillCircle(s / 2, s / 2 - 10, 5);
  });

  make("npc", 34, (g, s) => {
    g.fillStyle(0x7c3aed, 1);
    g.fillCircle(s / 2, s / 2 + 2, s / 2 - 4);
    g.fillStyle(0xffe6b3, 1);
    g.fillCircle(s / 2, s / 2 - 8, 8);
  });

  make("puzzle-pedestal", 34, (g, s) => {
    g.fillStyle(0xaab4b8, 1);
    g.fillRoundedRect(4, s / 2, s - 8, s / 2 - 4, 4);
    g.fillStyle(0x1467e0, 1);
    g.fillCircle(s / 2, s / 2 - 6, 9);
  });

  make("boss", 48, (g, s) => {
    g.fillStyle(0xe0527a, 1);
    g.fillEllipse(s / 2, s / 2, s - 6, s - 10);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(s / 2 - 10, 6, s / 2 - 16, 18, s / 2 - 4, 18);
    g.fillTriangle(s / 2 + 10, 6, s / 2 + 4, 18, s / 2 + 16, 18);
    g.fillStyle(0x1f2426, 1);
    g.fillCircle(s / 2 - 7, s / 2, 3);
    g.fillCircle(s / 2 + 7, s / 2, 3);
  });

  make("boss-calm", 48, (g, s) => {
    g.fillStyle(0xf7c6d4, 1);
    g.fillEllipse(s / 2, s / 2, s - 6, s - 10);
    g.fillStyle(0x1f2426, 1);
    g.fillRect(s / 2 - 9, s / 2, 5, 2);
    g.fillRect(s / 2 + 4, s / 2, 5, 2);
  });

  make("landmark", 56, (g, s) => {
    g.fillStyle(0xfaab19, 1);
    g.fillRect(6, s / 2, s - 12, s / 2 - 6);
    g.fillTriangle(2, s / 2, s / 2, 4, s - 2, s / 2);
    g.fillStyle(0xffffff, 1);
    g.fillRect(s / 2 - 5, s / 2 + 10, 10, 14);
  });

  make("landmark-silhouette", 56, (g, s) => {
    g.fillStyle(0xcfd4d6, 1);
    g.fillRect(6, s / 2, s - 12, s / 2 - 6);
    g.fillTriangle(2, s / 2, s / 2, 4, s - 2, s / 2);
  });

  make("stepping-stone", 16, (g, s) => {
    g.fillStyle(0xd8b36a, 1);
    g.fillCircle(s / 2, s / 2, s / 2 - 1);
  });

  make("stepping-stone-dim", 16, (g, s) => {
    g.fillStyle(0xe4e7e8, 1);
    g.fillCircle(s / 2, s / 2, s / 2 - 1);
  });
}

// ---------------------------------------------------------------------
// The single, data-driven region scene. Both Starter Meadow and
// Whispering Forest run through this exact class — adding a third
// region later is a content.json change, not a new scene class.
// ---------------------------------------------------------------------
// Defined lazily, inside a function, because `extends Phaser.Scene`
// would otherwise evaluate `Phaser` at module-import time — before the
// CDN script has ever been requested. getRegionSceneClass() is only
// ever called after loadPhaser() has resolved.
let RegionSceneClass = null;
function getRegionSceneClass() {
  if (RegionSceneClass) return RegionSceneClass;

  RegionSceneClass = class RegionScene extends Phaser.Scene {
  constructor() {
    super("region");
  }

  init(data) {
    // Phaser auto-starts the first scene in the config array with no
    // data before we get a chance to call scene.start(key, realData)
    // ourselves (see mountGame). Guard against that throwaway boot.
    this.opts = data && data.regionDef ? data : null;
    this.joystickVector = { x: 0, y: 0 };
    this.joystickActive = false;
    this.moveTarget = null;
    this.nearby = null;
  }

  create() {
    if (!this.opts) return;
    buildTextures(this);
    this.cameras.main.setBackgroundColor(this.opts.regionDef.bgColor || "#bfe6a8");

    const { width, height } = this.scale;
    this.worldBounds = { minX: 20, minY: 20, maxX: width - 20, maxY: height - 20 };

    this.hero = this.add.image(width / 2, height / 2, "hero");

    this.creatureSprites = (this.opts.regionDef.creatures || []).map((c) => {
      const sprite = this.add.image(c.x, c.y, "blob");
      sprite.wanderTimer = 0;
      sprite.wanderVel = { x: 0, y: 0 };
      return sprite;
    });

    this.chestSprites = (this.opts.regionDef.chests || []).map((c) => {
      const opened = this.opts.worldState.chestsOpened.some((e) => e.id === c.id);
      const sprite = this.add.image(c.x, c.y, opened ? "chest-open" : "chest-closed");
      sprite.chestDef = c;
      sprite.opened = opened;
      return sprite;
    });

    this.npcSprite = null;
    if (this.opts.npcDef) {
      this.npcSprite = this.add.image(width - 100, 90, "npc");
      this.npcSprite.npcDef = this.opts.npcDef;
    }

    this.puzzleSprite = null;
    if (this.opts.puzzleDef) {
      this.puzzleSprite = this.add.image(100, height - 90, "puzzle-pedestal");
      this.puzzleSprite.puzzleDef = this.opts.puzzleDef;
      this.puzzleSprite.solved = this.opts.worldState.puzzlesSolved.some((e) => e.id === this.opts.puzzleDef.id);
    }

    this.bossSprite = null;
    if (this.opts.bossDef && this.opts.bossUnlocked) {
      const defeated = this.opts.worldState.bossesDefeated.some((e) => e.id === this.opts.bossDef.id);
      this.bossSprite = this.add.image(width / 2, 70, defeated ? "boss-calm" : "boss");
      this.bossSprite.bossDef = this.opts.bossDef;
      this.bossSprite.defeated = defeated;
    }

    this.landmarkStones = [];
    this.landmarkSprite = null;
    if (this.opts.regionDef.hasLandmark) {
      const stageCount = CONFIG.MILESTONE_THRESHOLDS.length;
      const startX = 140;
      const endX = width - 140;
      for (let i = 0; i < stageCount; i++) {
        const x = startX + ((endX - startX) * i) / (stageCount - 1);
        const lit = i < this.opts.landmarkStage;
        const stone = this.add.image(x, height / 2 + 140, lit ? "stepping-stone" : "stepping-stone-dim");
        this.landmarkStones.push(stone);
      }
      this.landmarkSprite = this.add.image(
        endX,
        height / 2 + 140,
        this.opts.landmarkStage >= stageCount ? "landmark" : "landmark-silhouette",
      );
      this.landmarkSprite.isLandmark = true;
    }

    // Always-visible virtual joystick, bottom-left — touch devices use
    // it directly; it's harmless (just unused) on desktop with a
    // keyboard. Tap-to-move works anywhere else on the canvas.
    const jx = 90;
    const jy = height - 90;
    this.joyBase = this.add.circle(jx, jy, 46, 0x000000, 0.12).setScrollFactor(0);
    this.joyStick = this.add.circle(jx, jy, 20, 0xffffff, 0.35).setScrollFactor(0);

    this.input.on("pointerdown", (pointer) => {
      const distFromJoy = Phaser.Math.Distance.Between(pointer.x, pointer.y, jx, jy);
      if (distFromJoy < 60) {
        this.joystickActive = true;
        this.moveTarget = null;
      } else {
        this.moveTarget = { x: pointer.x, y: pointer.y };
      }
    });
    this.input.on("pointermove", (pointer) => {
      if (!this.joystickActive) return;
      const dx = pointer.x - jx;
      const dy = pointer.y - jy;
      const dist = Math.min(40, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      const sx = jx + Math.cos(angle) * dist;
      const sy = jy + Math.sin(angle) * dist;
      this.joyStick.setPosition(sx, sy);
      this.joystickVector = dist > 6 ? { x: Math.cos(angle), y: Math.sin(angle) } : { x: 0, y: 0 };
    });
    this.input.on("pointerup", () => {
      this.joystickActive = false;
      this.joystickVector = { x: 0, y: 0 };
      this.joyStick.setPosition(jx, jy);
    });

    this.cursors = this.input.keyboard ? this.input.keyboard.createCursorKeys() : null;
    this.wasd = this.input.keyboard
      ? this.input.keyboard.addKeys({ up: "W", down: "S", left: "A", right: "D" })
      : null;
  }

  interactables() {
    const list = [];
    for (const c of this.chestSprites) if (!c.opened) list.push({ type: "chest", sprite: c, def: c.chestDef });
    if (this.npcSprite) list.push({ type: "npc", sprite: this.npcSprite, def: this.npcSprite.npcDef });
    if (this.puzzleSprite) list.push({ type: "puzzle", sprite: this.puzzleSprite, def: this.puzzleSprite.puzzleDef });
    if (this.bossSprite && !this.bossSprite.defeated) list.push({ type: "boss", sprite: this.bossSprite, def: this.bossSprite.bossDef });
    if (this.landmarkSprite) list.push({ type: "landmark", sprite: this.landmarkSprite, def: null });
    return list;
  }

  update(time, delta) {
    if (!this.opts) return;
    let vx = 0;
    let vy = 0;
    const kbLeft = (this.cursors && this.cursors.left.isDown) || (this.wasd && this.wasd.left.isDown);
    const kbRight = (this.cursors && this.cursors.right.isDown) || (this.wasd && this.wasd.right.isDown);
    const kbUp = (this.cursors && this.cursors.up.isDown) || (this.wasd && this.wasd.up.isDown);
    const kbDown = (this.cursors && this.cursors.down.isDown) || (this.wasd && this.wasd.down.isDown);

    if (kbLeft || kbRight || kbUp || kbDown) {
      this.moveTarget = null;
      if (kbLeft) vx -= 1;
      if (kbRight) vx += 1;
      if (kbUp) vy -= 1;
      if (kbDown) vy += 1;
    } else if (this.joystickVector.x !== 0 || this.joystickVector.y !== 0) {
      vx = this.joystickVector.x;
      vy = this.joystickVector.y;
    } else if (this.moveTarget) {
      const dx = this.moveTarget.x - this.hero.x;
      const dy = this.moveTarget.y - this.hero.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 4) {
        this.moveTarget = null;
      } else {
        vx = dx / dist;
        vy = dy / dist;
      }
    }

    const len = Math.hypot(vx, vy);
    if (len > 0) {
      const speed = (CONFIG.WORLD_HERO_SPEED * delta) / 1000;
      this.hero.x = Phaser.Math.Clamp(this.hero.x + (vx / len) * speed, this.worldBounds.minX, this.worldBounds.maxX);
      this.hero.y = Phaser.Math.Clamp(this.hero.y + (vy / len) * speed, this.worldBounds.minY, this.worldBounds.maxY);
    }

    for (const creature of this.creatureSprites) {
      creature.wanderTimer -= delta;
      if (creature.wanderTimer <= 0) {
        const angle = Math.random() * Math.PI * 2;
        creature.wanderVel = { x: Math.cos(angle), y: Math.sin(angle) };
        creature.wanderTimer = 1500 + Math.random() * 2000;
      }
      const speed = (CONFIG.WORLD_CREATURE_SPEED * delta) / 1000;
      creature.x = Phaser.Math.Clamp(creature.x + creature.wanderVel.x * speed, this.worldBounds.minX, this.worldBounds.maxX);
      creature.y = Phaser.Math.Clamp(creature.y + creature.wanderVel.y * speed, this.worldBounds.minY, this.worldBounds.maxY);
    }

    let closest = null;
    let closestDist = CONFIG.WORLD_INTERACT_RADIUS;
    for (const item of this.interactables()) {
      const dist = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, item.sprite.x, item.sprite.y);
      if (dist <= closestDist) {
        closest = item;
        closestDist = dist;
      }
    }
    const nearbyKey = closest ? `${closest.type}:${closest.def ? closest.def.id : "landmark"}` : null;
    const prevKey = this.nearby ? `${this.nearby.type}:${this.nearby.def ? this.nearby.def.id : "landmark"}` : null;
    if (nearbyKey !== prevKey) {
      this.nearby = closest;
      this.opts.onNearbyChange(closest);
    }
  }

  handleInteract() {
    if (!this.nearby) return;
    const { type, sprite, def } = this.nearby;
    if (type === "chest") this.opts.onOpenChest(def, sprite);
    if (type === "npc") this.opts.onTalkToNpc(def);
    if (type === "puzzle") this.opts.onOpenPuzzle(def, sprite);
    if (type === "boss") this.opts.onOpenBoss(def, sprite);
    if (type === "landmark") this.opts.onLandmark();
  }

  markChestOpened(chestDef) {
    const sprite = this.chestSprites.find((c) => c.chestDef.id === chestDef.id);
    if (sprite) {
      sprite.opened = true;
      sprite.setTexture("chest-open");
    }
  }

  markPuzzleSolved() {
    if (this.puzzleSprite) this.puzzleSprite.solved = true;
  }

  markBossDefeated() {
    if (this.bossSprite) {
      this.bossSprite.defeated = true;
      this.bossSprite.setTexture("boss-calm");
      this.opts.onNearbyChange(null);
    }
  }
  };

  return RegionSceneClass;
}

export function createWorld({ store, catalogs, buildHeroContext }) {
  let game = null;
  let phaserLoadPromise = null;
  let activeSession = null; // { kidId, startedAt } — flushed to store.recordPlaySession on every teardown
  let restCheckInterval = null; // Stage 5: periodic server-side-equivalent re-check while playing

  function loadPhaser() {
    if (window.Phaser) return Promise.resolve(window.Phaser);
    if (phaserLoadPromise) return phaserLoadPromise;
    phaserLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PHASER_CDN_URL;
      script.async = true;
      script.onload = () => (window.Phaser ? resolve(window.Phaser) : reject(new Error("Phaser did not attach to window")));
      script.onerror = () => reject(new Error("Phaser script failed to load"));
      document.head.appendChild(script);
    });
    return phaserLoadPromise;
  }

  function regionFor(regionId) {
    return catalogs.regions.regions.find((r) => r.id === regionId);
  }

  function unlockedRegions(heroContext) {
    return catalogs.regions.regions.filter((r) => isItemUnlocked(r, heroContext));
  }

  function isMuted() {
    return Boolean(store.getGameSettings().family.muted);
  }

  // Counts today's already-recorded play minutes PLUS whatever's
  // elapsed in the in-progress session (if any) — otherwise a long
  // live session would never trip the daily limit until after it
  // ended and got flushed.
  function minutesPlayedTodayIncludingActive(kidId, now) {
    const stored = store.getPlayMinutesToday(kidId, now);
    const live = activeSession ? (Date.now() - new Date(activeSession.startedAt).getTime()) / 60000 : 0;
    return stored + live;
  }

  // The non-stamina half of Stage 5's settings enforcement: is the game
  // even on, on for this kid, outside quiet hours, and under today's
  // limit? Stamina charge is checked separately (see canEnterRegion)
  // because it's Stage 4's canvas-specific gate — the Hero Hub
  // fallback never required it and still doesn't.
  function sessionAllowed(kidId) {
    const now = new Date().toISOString();
    const kidSettings = store.getKidSettings(kidId);
    return canPlayNow({
      familyEnabled: store.isSavingsQuestEnabled(),
      kidEnabled: kidSettings.enabled,
      now,
      quietHours: kidSettings.quietHours,
      minutesPlayedToday: minutesPlayedTodayIncludingActive(kidId, now),
      dailyPlayMinutes: kidSettings.dailyPlayMinutes,
      staminaCharge: CONFIG.STAMINA_CHARGE_MAX,
      costPerEntry: 0,
    });
  }

  const REASON_MESSAGES = {
    "flag-off": "Savings Quest isn't turned on yet — ask a parent.",
    "kid-disabled": "The game is turned off right now — ask a parent to turn it back on.",
    "quiet-hours": "It's quiet hours right now. Time to rest, hero! Try again later.",
    "daily-limit": "You've used up today's play time. See you tomorrow!",
  };

  // ---------------- World Gate: stamina charge + daily check-in ----------------

  function renderWorldGate(container, kidId) {
    const worldState = store.getWorldState(kidId);
    const heroContext = buildHeroContext(kidId);
    const playCheck = sessionAllowed(kidId);
    const canEnter = playCheck.ok && canEnterRegion(worldState.staminaCharge, CONFIG.STAMINA_CHARGE_COST_PER_ENTRY);
    const canVisitHub = playCheck.ok;
    const canCheckIn = !worldState.lastCheckInDate || worldState.lastCheckInDate.slice(0, 10) !== new Date().toISOString().slice(0, 10);

    const charges = Array.from({ length: CONFIG.STAMINA_CHARGE_MAX }, (_, i) =>
      i < worldState.staminaCharge ? "⚡" : "·",
    ).join(" ");

    let hint;
    if (!playCheck.ok) {
      hint = REASON_MESSAGES[playCheck.reason];
    } else if (!canEnterRegion(worldState.staminaCharge, CONFIG.STAMINA_CHARGE_COST_PER_ENTRY)) {
      hint = "Your hero is resting. Finish a chore or check in tomorrow for more energy.";
    } else {
      hint = "Your hero has enough energy to explore!";
    }

    container.innerHTML = `
      <div class="sq-card sq-world-gate">
        <h2>🗺️ The World</h2>
        <div class="sq-stamina-row" aria-label="${worldState.staminaCharge} of ${CONFIG.STAMINA_CHARGE_MAX} stamina charges">
          ${charges}
        </div>
        <p class="sq-world-gate-hint">${escapeHtml(hint)}</p>
        <div class="sq-approval-row">
          <button type="button" class="sq-primary-btn" id="sqEnterWorldBtn" ${canEnter ? "" : "disabled"}>Enter the World</button>
          <button type="button" class="sq-decline-btn" id="sqCheckInBtn" ${canCheckIn ? "" : "disabled"}>${canCheckIn ? "Daily Check-In (+2 ⚡)" : "Checked in today ✓"}</button>
        </div>
        <button type="button" class="sq-herohub-link" id="sqHeroHubBtn" ${canVisitHub ? "" : "disabled"}>Prefer no map? Visit the Hero Hub instead</button>
      </div>
      <div id="sqWorldBody"></div>
    `;

    container.querySelector("#sqCheckInBtn").addEventListener("click", () => {
      store.recordDailyCheckIn(kidId, new Date().toISOString());
      renderWorldGate(container, kidId);
    });

    container.querySelector("#sqHeroHubBtn").addEventListener("click", () => {
      if (canVisitHub) renderHeroHub(container, kidId);
    });

    container.querySelector("#sqEnterWorldBtn").addEventListener("click", () => {
      if (canEnter) enterWorld(container, kidId);
    });

    if (canEnter && unlockedRegions(heroContext).length === 0) {
      container.querySelector("#sqEnterWorldBtn").disabled = true;
      container
        .querySelector("#sqWorldBody")
        .insertAdjacentHTML("beforeend", `<p class="sq-world-gate-hint">Reach Level ${catalogs.regions.regions[0].unlock.value} to unlock Starter Meadow.</p>`);
    }
  }

  function enterWorld(container, kidId) {
    if (!sessionAllowed(kidId).ok) {
      renderWorldGate(container, kidId);
      return;
    }
    if (!canvasSupported()) {
      renderHeroHub(container, kidId);
      return;
    }
    const body = container.querySelector("#sqWorldBody");
    body.innerHTML = `<p class="sq-world-gate-hint">Loading your world...</p>`;

    loadPhaser()
      .then(() => {
        const worldState = store.getWorldState(kidId);
        if (!sessionAllowed(kidId).ok || !canEnterRegion(worldState.staminaCharge, CONFIG.STAMINA_CHARGE_COST_PER_ENTRY)) {
          renderWorldGate(container, kidId);
          return;
        }
        store.spendStaminaCharge(kidId, CONFIG.STAMINA_CHARGE_COST_PER_ENTRY);

        const heroContext = buildHeroContext(kidId);
        const firstRegion = unlockedRegions(heroContext)[0];
        mountGame(container, kidId, firstRegion.id);
      })
      .catch((err) => {
        console.error("Savings Quest: Phaser failed to load, falling back to Hero Hub.", err);
        renderHeroHub(container, kidId);
      });
  }

  // ---------------- Phaser game lifecycle + DOM HUD ----------------

  function mountGame(container, kidId, regionId) {
    destroyGame(); // flushes any prior session (e.g. switching regions) before starting a new one
    const heroContext = buildHeroContext(kidId);
    const worldState = store.getWorldState(kidId);
    const regionDef = regionFor(regionId);
    store.markRegionDiscovered(kidId, regionId, new Date().toISOString());

    const npcDef = regionDef.npcId ? catalogs.npcLessons.npcs.find((n) => n.id === regionDef.npcId) : null;
    const puzzleDef = regionDef.puzzleId ? catalogs.puzzles.puzzles.find((p) => p.id === regionDef.puzzleId) : null;
    const bossDef = regionDef.bossId ? catalogs.bosses.bosses.find((b) => b.id === regionDef.bossId) : null;
    const bossUnlocked = Boolean(bossDef && isItemUnlocked(bossDef, heroContext));
    const landmarkStage = regionDef.hasLandmark
      ? computeLandmarkStage({
          currentSaveTotal: heroContext.currentSaveTotal,
          goalTarget: heroContext.goalTarget,
          thresholds: CONFIG.MILESTONE_THRESHOLDS,
        })
      : 0;

    container.innerHTML = `
      <div class="sq-world-shell">
        <div class="sq-world-hud-top">
          <span class="sq-world-region-name">${escapeHtml(regionDef.name)}</span>
          <button type="button" class="sq-world-hud-btn" id="sqWorldMuteBtn">${isMuted() ? "🔇" : "🔊"}</button>
          <button type="button" class="sq-world-hud-btn" id="sqWorldExitBtn">Exit</button>
        </div>
        <div id="sqWorldCanvasMount"></div>
        <div class="sq-world-hud-bottom">
          <div class="sq-world-region-switch" id="sqWorldRegionSwitch"></div>
          <button type="button" class="sq-primary-btn sq-world-interact-btn" id="sqWorldInteractBtn" disabled>Look around</button>
        </div>
      </div>
    `;

    const regionSwitchEl = container.querySelector("#sqWorldRegionSwitch");
    unlockedRegions(heroContext).forEach((r) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sq-world-region-btn" + (r.id === regionId ? " sq-world-region-btn-active" : "");
      btn.textContent = r.name;
      btn.addEventListener("click", () => mountGame(container, kidId, r.id));
      regionSwitchEl.appendChild(btn);
    });

    container.querySelector("#sqWorldExitBtn").addEventListener("click", () => {
      destroyGame();
      renderWorldGate(container, kidId);
    });

    container.querySelector("#sqWorldMuteBtn").addEventListener("click", () => {
      const s = store.getGameSettings();
      s.family.muted = !s.family.muted;
      store.setGameSettings(s);
      container.querySelector("#sqWorldMuteBtn").textContent = isMuted() ? "🔇" : "🔊";
    });

    const interactBtn = container.querySelector("#sqWorldInteractBtn");

    const sceneOpts = {
      regionDef,
      worldState,
      npcDef,
      puzzleDef,
      bossDef,
      bossUnlocked,
      landmarkStage,
      onNearbyChange: (nearby) => {
        if (!nearby) {
          interactBtn.disabled = true;
          interactBtn.textContent = "Look around";
          return;
        }
        interactBtn.disabled = false;
        const labels = {
          chest: "Open chest",
          npc: `Talk to ${npcDef ? npcDef.name : "NPC"}`,
          puzzle:
            puzzleDef && store.getWorldState(kidId).puzzlesSolved.some((e) => e.id === puzzleDef.id)
              ? "Puzzle (solved)"
              : "Try the puzzle",
          boss: `Face ${bossDef ? bossDef.name : "the boss"}`,
          landmark: "Visit your goal",
        };
        interactBtn.textContent = labels[nearby.type] || "Interact";
      },
      onOpenChest: (chestDef, sprite) => {
        const result = store.openChest(kidId, chestDef.id, new Date().toISOString());
        if (result.written) {
          playBeep(880, 180, isMuted(), "Chest opened!");
          sceneInstance.markChestOpened(chestDef);
        }
      },
      onTalkToNpc: (npcDefArg) => showNpcDialogue(npcDefArg),
      onOpenPuzzle: (puzzleDefArg) =>
        showPuzzleModal(puzzleDefArg, () => {
          store.solvePuzzle(kidId, puzzleDefArg.id, new Date().toISOString());
          playBeep(1046, 220, isMuted(), "Puzzle solved!");
          sceneInstance.markPuzzleSolved();
        }),
      onOpenBoss: (bossDefArg) =>
        showBossModal(bossDefArg, () => {
          store.defeatBoss(kidId, bossDefArg.id, new Date().toISOString());
          playBeep(660, 300, isMuted(), "Boss calmed!");
          sceneInstance.markBossDefeated();
        }),
      onLandmark: () => {
        if (landmarkStage >= CONFIG.MILESTONE_THRESHOLDS.length) {
          showLandmarkCelebration();
        } else {
          showLandmarkProgress(landmarkStage);
        }
      },
    };

    // Phaser.AUTO already tries WebGL then falls back to Canvas2D
    // internally. This try/catch covers the rest of what "if
    // Canvas/WebGL fails, fall back to the Hero Hub" needs to mean in
    // practice: any unexpected engine construction error, on any
    // device, drops back to the plain-DOM Hero Hub instead of crashing
    // the Kid panel.
    let sceneInstance;
    try {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container.querySelector("#sqWorldCanvasMount"),
        width: 800,
        height: 480,
        backgroundColor: "#bfe6a8",
        scene: [getRegionSceneClass()],
      });
      // getScene() returns the same Scene instance for a given key for
      // the game's whole lifetime, created as soon as it's added via
      // config — safe to grab immediately, before boot finishes.
      sceneInstance = game.scene.getScene("region");
    } catch (err) {
      console.error("Savings Quest: the game engine failed to start, falling back to Hero Hub.", err);
      game = null;
      renderHeroHub(container, kidId);
      return;
    }
    interactBtn.addEventListener("click", () => sceneInstance.handleInteract());

    // The config array above auto-starts "region" with no data (a
    // harmless no-op thanks to the opts guard in init()/create()/
    // update()). Once the game is fully booted, start it again for
    // real, this time with the actual region data.
    game.events.once("ready", () => {
      game.scene.start("region", sceneOpts);
    });

    // Session tracking + the in-game "time to rest, hero!" re-check
    // only start once the game has actually, successfully mounted —
    // never while we're about to fall back to the Hero Hub instead.
    activeSession = { kidId, startedAt: new Date().toISOString() };
    restCheckInterval = setInterval(() => {
      const check = sessionAllowed(kidId);
      if (!check.ok) showRestPrompt(container, kidId, check.reason);
    }, 30000);
  }

  // Gently interrupts an in-progress session the moment settings
  // enforcement (quiet hours / daily limit / kid disabled / flag off)
  // makes it no longer allowed — "server-side" here means this check
  // runs against stored settings and real elapsed time, not anything
  // the kid's own client-side clock display could be used to fool.
  function showRestPrompt(container, kidId, reason) {
    destroyGame();
    const overlay = baseOverlay(
      `
      <div class="sq-levelup-card">
        <div style="font-size:2.5rem;" aria-hidden="true">😴</div>
        <h2>Time to rest, hero!</h2>
        <p>${escapeHtml(REASON_MESSAGES[reason] || "It's time for a break.")}</p>
        <button type="button" class="sq-levelup-done-btn">Okay</button>
      </div>
    `,
      "Time to rest, hero!",
    );
    const btn = overlay.querySelector("button");
    btn.addEventListener("click", () => {
      overlay.remove();
      renderWorldGate(container, kidId);
    });
    btn.focus();
  }

  function destroyGame() {
    if (restCheckInterval) {
      clearInterval(restCheckInterval);
      restCheckInterval = null;
    }
    if (activeSession) {
      store.recordPlaySession(activeSession.kidId, activeSession.startedAt, new Date().toISOString());
      activeSession = null;
    }
    if (game) {
      game.destroy(true);
      game = null;
    }
  }

  // ---------------- Hero Hub: canvas-free fallback, same content ----------------

  function renderHeroHub(container, kidId) {
    const worldState = store.getWorldState(kidId);
    const heroContext = buildHeroContext(kidId);
    const regions = catalogs.regions.regions;

    container.innerHTML = `
      <div class="sq-card">
        <h2>🏠 Hero Hub</h2>
        <p class="sq-world-gate-hint">A simpler way to visit the world's people and puzzles, no map needed.</p>
      </div>
      <div id="sqHeroHubRegions"></div>
    `;

    const regionsEl = container.querySelector("#sqHeroHubRegions");
    for (const regionDef of regions) {
      const unlocked = isItemUnlocked(regionDef, heroContext);
      const npcDef = regionDef.npcId ? catalogs.npcLessons.npcs.find((n) => n.id === regionDef.npcId) : null;
      const puzzleDef = regionDef.puzzleId ? catalogs.puzzles.puzzles.find((p) => p.id === regionDef.puzzleId) : null;
      const bossDef = regionDef.bossId ? catalogs.bosses.bosses.find((b) => b.id === regionDef.bossId) : null;
      const bossUnlocked = Boolean(bossDef && isItemUnlocked(bossDef, heroContext));

      const card = document.createElement("div");
      card.className = "sq-card";
      if (!unlocked) {
        card.innerHTML = `
          <h3>🔒 ${escapeHtml(regionDef.name)}</h3>
          <p class="sq-world-gate-hint">${escapeHtml(describeUnlockRequirement(regionDef, heroContext))}</p>
        `;
        regionsEl.appendChild(card);
        continue;
      }

      card.innerHTML = `
        <h3>${escapeHtml(regionDef.name)}</h3>
        <div class="sq-herohub-actions">
          ${npcDef ? `<button type="button" class="sq-decline-btn" data-action="npc">Talk to ${escapeHtml(npcDef.name)}</button>` : ""}
          ${
            puzzleDef
              ? `<button type="button" class="sq-decline-btn" data-action="puzzle">${
                  worldState.puzzlesSolved.some((e) => e.id === puzzleDef.id) ? "Puzzle (solved) ✓" : "Try the puzzle"
                }</button>`
              : ""
          }
          ${(regionDef.chests || [])
            .map(
              (c) =>
                `<button type="button" class="sq-decline-btn" data-action="chest" data-chest-id="${c.id}">
                  ${worldState.chestsOpened.some((e) => e.id === c.id) ? "Chest opened ✓" : "Open a chest"}
                </button>`,
            )
            .join("")}
          ${
            bossDef
              ? bossUnlocked
                ? `<button type="button" class="sq-decline-btn" data-action="boss">${
                    worldState.bossesDefeated.some((e) => e.id === bossDef.id) ? `${escapeHtml(bossDef.name)} calmed ✓` : `Face ${escapeHtml(bossDef.name)}`
                  }</button>`
                : `<span class="sq-item-req">${escapeHtml(describeUnlockRequirement(bossDef, heroContext))}</span>`
              : ""
          }
          ${
            regionDef.hasLandmark
              ? `<button type="button" class="sq-decline-btn" data-action="landmark">Visit your goal</button>`
              : ""
          }
        </div>
      `;

      card.querySelectorAll("[data-action='npc']").forEach((b) => b.addEventListener("click", () => showNpcDialogue(npcDef)));
      card.querySelectorAll("[data-action='puzzle']").forEach((b) =>
        b.addEventListener("click", () => {
          if (store.getWorldState(kidId).puzzlesSolved.some((e) => e.id === puzzleDef.id)) return;
          showPuzzleModal(puzzleDef, () => {
            store.solvePuzzle(kidId, puzzleDef.id);
            playBeep(1046, 220, isMuted(), "Puzzle solved!");
            renderHeroHub(container, kidId);
          });
        }),
      );
      card.querySelectorAll("[data-action='chest']").forEach((b) =>
        b.addEventListener("click", () => {
          const chestId = b.dataset.chestId;
          const result = store.openChest(kidId, chestId);
          if (result.written) playBeep(880, 180, isMuted(), "Chest opened!");
          renderHeroHub(container, kidId);
        }),
      );
      card.querySelectorAll("[data-action='boss']").forEach((b) =>
        b.addEventListener("click", () => {
          if (store.getWorldState(kidId).bossesDefeated.some((e) => e.id === bossDef.id)) return;
          showBossModal(bossDef, () => {
            store.defeatBoss(kidId, bossDef.id);
            playBeep(660, 300, isMuted(), "Boss calmed!");
            renderHeroHub(container, kidId);
          });
        }),
      );
      card.querySelectorAll("[data-action='landmark']").forEach((b) =>
        b.addEventListener("click", () => {
          const stage = computeLandmarkStage({
            currentSaveTotal: heroContext.currentSaveTotal,
            goalTarget: heroContext.goalTarget,
            thresholds: CONFIG.MILESTONE_THRESHOLDS,
          });
          if (stage >= CONFIG.MILESTONE_THRESHOLDS.length) showLandmarkCelebration();
          else showLandmarkProgress(stage);
        }),
      );

      regionsEl.appendChild(card);
    }
  }

  // ---------------- Shared DOM overlays (used by both canvas and Hero Hub) ----------------

  function baseOverlay(innerHtml, ariaLabel) {
    const overlay = document.createElement("div");
    overlay.className = "sq-levelup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", ariaLabel);
    overlay.innerHTML = innerHtml;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showNpcDialogue(npcDef) {
    const overlay = baseOverlay(
      `
      <div class="sq-levelup-card sq-npc-card">
        <h2>${escapeHtml(npcDef.name)}</h2>
        <p class="sq-npc-lesson">"${escapeHtml(npcDef.lesson)}"</p>
        <p>${escapeHtml(npcDef.detail)}</p>
        <button type="button" class="sq-levelup-done-btn">Got it!</button>
      </div>
    `,
      `${npcDef.name} says: ${npcDef.lesson}`,
    );
    const btn = overlay.querySelector("button");
    btn.addEventListener("click", () => overlay.remove());
    btn.focus();
  }

  function showPuzzleModal(puzzleDef, onSolved) {
    let body = "";
    if (puzzleDef.type === "coin_order") {
      body = `
        <p>${escapeHtml(puzzleDef.prompt)}</p>
        <div class="sq-puzzle-tiles" id="sqPuzzleTiles">
          ${[...puzzleDef.values]
            .sort(() => Math.random() - 0.5)
            .map((v) => `<button type="button" class="sq-puzzle-tile" data-value="${v}">$${v}</button>`)
            .join("")}
        </div>
        <div class="sq-puzzle-answer" id="sqPuzzleAnswer" aria-live="polite"></div>
      `;
    } else if (puzzleDef.type === "needs_wants_sort") {
      body = `
        <p>${escapeHtml(puzzleDef.prompt)}</p>
        <div class="sq-puzzle-sort">
          ${puzzleDef.items
            .map(
              (item) => `
            <div class="sq-puzzle-sort-row" data-item-id="${item.id}">
              <span>${escapeHtml(item.label)}</span>
              <span class="sq-puzzle-sort-choices">
                <button type="button" class="sq-puzzle-choice" data-answer="need">Need</button>
                <button type="button" class="sq-puzzle-choice" data-answer="want">Want</button>
              </span>
            </div>
          `,
            )
            .join("")}
        </div>
      `;
    }

    const overlay = baseOverlay(
      `<div class="sq-levelup-card sq-puzzle-card">
        <h2>🧩 Puzzle</h2>
        ${body}
        <button type="button" class="sq-levelup-done-btn" id="sqPuzzleCloseBtn">Close</button>
      </div>`,
      `Puzzle: ${puzzleDef.prompt}`,
    );

    overlay.querySelector("#sqPuzzleCloseBtn").addEventListener("click", () => overlay.remove());

    if (puzzleDef.type === "coin_order") {
      const submitted = [];
      overlay.querySelectorAll(".sq-puzzle-tile").forEach((tile) => {
        tile.addEventListener("click", () => {
          if (tile.disabled) return;
          tile.disabled = true;
          tile.classList.add("sq-puzzle-tile-picked");
          submitted.push(Number(tile.dataset.value));
          if (submitted.length === puzzleDef.values.length) {
            const correct = checkCoinOrderPuzzle(submitted, puzzleDef.values);
            const answerEl = overlay.querySelector("#sqPuzzleAnswer");
            if (correct) {
              answerEl.textContent = "Solved! Great job ordering those coins.";
              onSolved();
              setTimeout(() => overlay.remove(), 1400);
            } else {
              answerEl.textContent = "Not quite — try again!";
              setTimeout(() => {
                overlay.querySelectorAll(".sq-puzzle-tile").forEach((t) => {
                  t.disabled = false;
                  t.classList.remove("sq-puzzle-tile-picked");
                });
                submitted.length = 0;
                answerEl.textContent = "";
              }, 1000);
            }
          }
        });
      });
    } else if (puzzleDef.type === "needs_wants_sort") {
      const submittedMap = {};
      overlay.querySelectorAll(".sq-puzzle-sort-row").forEach((row) => {
        const itemId = row.dataset.itemId;
        row.querySelectorAll(".sq-puzzle-choice").forEach((btn) => {
          btn.addEventListener("click", () => {
            submittedMap[itemId] = btn.dataset.answer;
            row.querySelectorAll(".sq-puzzle-choice").forEach((b) => b.classList.remove("sq-puzzle-choice-picked"));
            btn.classList.add("sq-puzzle-choice-picked");
            if (Object.keys(submittedMap).length === puzzleDef.items.length) {
              const result = checkNeedsWantsSort(submittedMap, puzzleDef.items);
              if (result.passed) {
                onSolved();
                setTimeout(() => overlay.remove(), 1400);
              }
            }
          });
        });
      });
    }
  }

  function showBossModal(bossDef, onDefeated) {
    const overlay = baseOverlay(
      `
      <div class="sq-levelup-card sq-boss-card">
        <h2>${escapeHtml(bossDef.name)}</h2>
        <p>${escapeHtml(bossDef.flavor)}</p>
        <div id="sqBossBody"></div>
      </div>
    `,
      `Boss encounter: ${bossDef.name}`,
    );

    const ICONS = { breathe: "🌬️", count: "🔢", wait: "⏳", smile: "😊" };
    const body = overlay.querySelector("#sqBossBody");

    function showFlash() {
      body.innerHTML = `<p>Watch closely...</p><div class="sq-boss-sequence" id="sqBossFlash"></div>`;
      const flash = body.querySelector("#sqBossFlash");
      bossDef.sequence.forEach((step, i) => {
        setTimeout(() => {
          flash.innerHTML = `<span class="sq-boss-icon sq-boss-icon-flash">${ICONS[step]}</span>`;
          if (i === bossDef.sequence.length - 1) {
            setTimeout(showChoices, 700);
          }
        }, i * 800);
      });
    }

    function showChoices() {
      const shuffled = [...bossDef.sequence].sort(() => Math.random() - 0.5);
      body.innerHTML = `
        <p>Now tap them back in the same order the Imp showed you:</p>
        <div class="sq-boss-sequence" id="sqBossSubmitted"></div>
        <div class="sq-boss-choices">
          ${shuffled.map((step) => `<button type="button" class="sq-boss-icon-btn" data-step="${step}">${ICONS[step]}</button>`).join("")}
        </div>
      `;
      const submitted = [];
      const submittedEl = body.querySelector("#sqBossSubmitted");
      body.querySelectorAll(".sq-boss-icon-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          submitted.push(btn.dataset.step);
          submittedEl.innerHTML += `<span class="sq-boss-icon">${ICONS[btn.dataset.step]}</span>`;
          if (submitted.length === bossDef.sequence.length) {
            if (checkBossSequence(submitted, bossDef.sequence)) {
              body.innerHTML = `<p class="sq-boss-win">${escapeHtml(bossDef.winFlavor)}</p>
                <button type="button" class="sq-levelup-done-btn" id="sqBossDoneBtn">Yay!</button>`;
              onDefeated();
              body.querySelector("#sqBossDoneBtn").addEventListener("click", () => overlay.remove());
            } else {
              body.innerHTML = `<p>Not quite — let's watch again.</p>`;
              setTimeout(showFlash, 1000);
            }
          }
        });
      });
    }

    showFlash();
  }

  function showLandmarkProgress(stage) {
    const totalStages = CONFIG.MILESTONE_THRESHOLDS.length;
    const overlay = baseOverlay(
      `
      <div class="sq-levelup-card">
        <div style="font-size:2.5rem;" aria-hidden="true">🏰</div>
        <h2>On the way!</h2>
        <p>The path to your goal has ${stage} of ${totalStages} stones lit so far. Keep saving to light the rest!</p>
        <button type="button" class="sq-levelup-done-btn">Keep going!</button>
      </div>
    `,
      "Your savings goal landmark, in progress",
    );
    const btn = overlay.querySelector("button");
    btn.addEventListener("click", () => overlay.remove());
    btn.focus();
  }

  function showLandmarkCelebration() {
    const overlay = baseOverlay(
      `
      <div class="sq-levelup-card">
        <div style="font-size:3rem;" aria-hidden="true">🏰✨</div>
        <h2>You made it!</h2>
        <p>Your hero has reached the goal landmark — every stone on the path is lit. Amazing saving!</p>
        <button type="button" class="sq-levelup-done-btn">Woohoo!</button>
      </div>
    `,
      "Arrival celebration: your savings goal landmark is complete",
    );
    const btn = overlay.querySelector("button");
    btn.addEventListener("click", () => overlay.remove());
    btn.focus();
  }

  return { renderWorldGate, renderHeroHub, destroyGame };
}
