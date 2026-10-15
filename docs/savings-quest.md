# Savings Quest — Architecture, Tuning, and Rollout

Savings Quest is a game layer bolted onto Money Muscle (the kids'
chores/allowance tracker). A child's hero gets more powerful as they
SAVE real money, but the game never moves, approves, or requests money
itself — it only listens to events Money Muscle already produces.

This document is the engineering reference. For what a parent/content
reviewer should read about the actual lesson text, see
`savings-quest/content/lessons.md`. For the stage-by-stage build log,
assumptions, and demo steps, see `savings-quest/README.md`.

## 1. Architecture

### No backend, no build step

Money Muscle is a single static `index.html` with no framework, no
bundler, and no server. Savings Quest matches that: it's a folder of
native ES modules (`<script type="module">`), persisted entirely to
`localStorage`, with zero npm dependencies except one external runtime
library loaded from a CDN only when needed (Phaser 3, for the Stage 4+
open world — see §1.4). Tests run on Node's built-in test runner
(`node --test`), no Jest/Vitest/babel.

### The one-directional bridge

```
index.html (classic script, Money Muscle's own code)
    │  calls, at its two real mutation points:
    │    window.SavingsQuest?.onSplitCompleted?.({round, priorSaveTotal, goal})
    │    window.SavingsQuest?.onChoreApproved?.(completion)
    ▼
savings-quest/bootstrap.js (ES module, the only file that assigns to window.SavingsQuest)
    │  validates the event is real (§6), then delegates to
    ▼
savings-quest/events.js  →  savings-quest/data.js  (writes the XP ledger, hero state, world state)
    │
    └─ savings-quest/ui.js / world.js  (read the store, render the Kid/Parent panels)
```

Money Muscle's own globals (`window.getGoal`, `window.setGoal`,
`window.computeTotals`, `window.roundsForKid`, `window.loadKids`,
`window.loadChoreCompletions`, `window.compressImage`,
`window.escapeHtml`, `window.getCompletedGoalsFor`) are plain top-level
functions in its classic (non-module) script, which attach to `window`
automatically — Savings Quest calls these directly rather than
duplicating any of that logic. The coupling is deliberately
one-directional: Money Muscle doesn't know Savings Quest exists beyond
the two optional-chained hook calls (wrapped in try/catch — a bug in
Savings Quest can never break the real money flow).

### File map

| File | Role |
|---|---|
| `config.js` | Every tuning number, one place, heavily commented |
| `engine.js` | Pure XP/level/streak math — no storage, no DOM |
| `unlocks.js` | Pure gear/skill/region/boss unlock logic + stat math |
| `world-engine.js` | Pure world logic: stamina charge, puzzles, boss sequence, quiet hours/daily-limit enforcement |
| `quests-engine.js` | Pure quest-eligibility checks (daily check-in, weekly raid) |
| `ui-data.js` | Pure UI-adjacent helpers (next-unlock teaser, milestone path state) |
| `data.js` | The data model — all localStorage reads/writes, all event recorders |
| `events.js` | The two entry points Money Muscle's hooks call into |
| `backfill.js` | Replays historical rounds/chores through the same event handlers |
| `ui.js` | DOM rendering for the Kid and Parent panels |
| `world.js` | The Phaser-based open world, lazy-loaded, plus its Hero Hub fallback |
| `bootstrap.js` | Browser entry point — wires everything together, owns `window.SavingsQuest` |
| `content/*.json` | All game content (items, skills, regions, NPCs, bosses, puzzles, quests) |
| `content/lessons.md` | Human-reviewable copy of every money lesson a kid can see |
| `test/*.test.js` | Node test-runner tests for every pure-logic file plus `data.js`/`events.js` |

### Why some files aren't unit tested

`ui.js` and `world.js` touch the DOM/canvas directly and are not unit
tested — the project stayed dependency-free throughout, and testing
rendered HTML/canvas honestly needs jsdom or a real browser. Every
decision that CAN be pure (unlock math, XP math, settings enforcement,
puzzle/boss checking) was deliberately split out into its own
pure-logic file specifically so it could be tested without a DOM. This
is why there are 6 separate "engine"-style files instead of one.

### 1.4 — Lazy-loaded game engine

Phaser 3 (chosen in Stage 0) is only fetched from
`cdn.jsdelivr.net/npm/phaser@3.80.1` the moment a kid clicks "Enter the
World" — never on page load. Measured size: ~303 KB gzipped (well
under the brief's 2 MB budget). If the script fails to load, or the
browser lacks canvas support, or `new Phaser.Game(...)` throws for any
reason, the kid is dropped into the **Hero Hub**: the exact same
regions/NPCs/puzzles/bosses/chests, as plain DOM cards and buttons
instead of a walkable map. No feature is canvas-exclusive.

## 2. Tuning guide

Everything that shapes game balance lives in `config.js`, one constant
per concern, each with a comment explaining what it does and why that
default was picked. Change a value, reload — no code changes needed
anywhere else. Key groups:

- **XP rates**: `SAVE_XP_PER_DOLLAR`, `HEART_PER_DOLLAR_GIVEN`,
  `STAMINA_PER_DOLLAR_CHORE` — the base rate per track.
- **Level curve**: `LEVEL_XP_BASE`, `LEVEL_XP_EXPONENT`, `MAX_LEVEL` —
  `xpToReachLevel(level) = round(LEVEL_XP_BASE * level ^ LEVEL_XP_EXPONENT)`.
- **Streaks**: `STREAK_GROWTH_PER_WEEK`, `STREAK_MAX_MULTIPLIER`,
  `STREAK_FREE_FREEZES` (how many missed weeks in a row are forgiven
  before a streak actually breaks — see §3).
- **Milestones**: `MILESTONE_THRESHOLDS` — the fractions of a goal that
  unlock items/bosses/landmark-path stages. One shared list; gear,
  bosses, and the landmark path all key off the exact same fractions,
  so they can never disagree with each other.
- **Anti-farming**: `REVERSAL_WINDOW_DAYS`, `POWER_CHARGE_*` — see §6.
- **Stamina charge** (session-length limiter, separate from the
  lifetime Stamina stat): `STAMINA_CHARGE_MAX`,
  `STAMINA_CHARGE_COST_PER_ENTRY`, `STAMINA_CHARGE_PER_DAILY_CHECKIN`,
  `STAMINA_CHARGE_PER_CHORE_APPROVED`.
- **XP-rate presets / parent match**: `XP_RATE_PRESETS` (Gentle/
  Standard/Challenging multipliers), `PARENT_MATCH_DEFAULT_RATE`.
- **Family Quest**: `FAMILY_QUEST_DEFAULT_TARGET` (parent can override
  per-family in the Parent panel).
- **World feel**: `WORLD_HERO_SPEED`, `WORLD_CREATURE_SPEED`,
  `WORLD_INTERACT_RADIUS`.

## 3. How to add content without touching code

All of items, skills, regions, NPCs, bosses, puzzles, and quests are
plain JSON in `savings-quest/content/`. Adding one is a content change,
not a code change, **except** a brand-new puzzle *type* or boss
*mechanic*, which does need a small code addition (see below).

### Add an item (weapon/armor/companion/cosmetic)

Edit `items_catalog.json`, add an object with: `id` (unique), `name`,
`category` (`weapon`/`armor`/`companion`/`cosmetic`), `rarity`
(`common`/`uncommon`/`rare`/`epic`/`legendary`), `tooltip` (one
money-lesson sentence), `unlock` (`{type, value}` — see below), `stats`
(`{power?, heart?, wisdom?}`, cosmetics always `{}`). Art is generated
automatically from `category` + `rarity` (see `itemIconSvg` in
`ui.js`/`world.js`) — no art asset to create.

### Add a region

Edit `regions.json`, add `{id, name, unlock, npcId, puzzleId, bossId,
hasLandmark, bgColor, creatures: [{id, kind, x, y}], chests: [{id, x,
y}]}`. `hasLandmark: true` should only be set on ONE region at a
time — it's where the real savings goal appears as a world landmark.
`unlock` is shaped like an item's, so it's gated by
`unlocks.js:isItemUnlocked` with zero new code.

### Add an NPC

Edit `npc_lessons.json`, add `{id, name, region, topic, lesson,
detail}` — `region` must match an existing region's `id`, and that
region's `npcId` must point at this NPC's `id`. **Also update
`content/lessons.md`** with the same text in the human-reviewable copy
— the two are not auto-synced.

### Add a boss

Edit `bosses.json`, add `{id, name, region, unlock, flavor,
winFlavor, sequence}`. `sequence` must only use the four existing icon
keys (`breathe`, `count`, `wait`, `smile` — see `ICONS` in
`world.js:showBossModal`); adding a genuinely new icon/step type needs
a one-line addition to that map. The encounter is always the same
"watch, then repeat the sequence" memory game — non-violent by
construction, never combat.

### Add a puzzle

Edit `puzzles.json`. Reuse an existing `type` (`coin_order` or
`needs_wants_sort`) with new content — that needs zero code. A
genuinely new puzzle type needs a new `if (puzzleDef.type === "...")`
branch in both `world.js:showPuzzleModal` (the DOM UI) and a matching
pure checker in `world-engine.js` (tested the same way
`checkCoinOrderPuzzle`/`checkNeedsWantsSort` are).

### Add a quest

Edit `quests.json`, add `{id, name, type: "daily"|"weekly",
description, rewardXp, targetAmount?}`. A new quest TYPE beyond
daily/weekly needs a new eligibility checker in `quests-engine.js` and
a branch in `ui.js:evaluateQuests`.

## 4. Feature flag rollout plan

Everything lives behind `savingsQuestEnabled` (family-wide) and, since
Stage 5, a per-child `enabled` flag layered on top — both must be true
for a given kid to see or earn anything. Both are real UI toggles in
the Parent panel, not just a console command.

Recommended rollout:

1. **Internal/dogfood**: ship with the flag off by default (already
   the case — `getGameSettings()`'s fallback is
   `savingsQuestEnabled: false`). Turn it on for a small number of
   families manually.
2. **Opt-in beta**: keep the default off; let any parent who wants it
   turn it on themselves. Nothing async needs to happen server-side —
   the flag, all content, and all logic already ship in every build.
3. **Default-on for new kids only**: flip the default to `true` going
   forward without touching `byKid` settings for existing families —
   existing families keep whatever they'd already chosen.
4. **Rollback**: turning the family flag off makes the whole module
   inert immediately (every `events.js` entry point no-ops, every Kid/
   Parent panel renders nothing) with **no data loss** — all XP/
   inventory/world state stays in localStorage, ready to pick back up
   the moment the flag goes back on. There is nothing to "undo" on a
   server because there is no server.

There is no gradual percentage-based rollout mechanism (no backend to
run an experiment framework against) — rollout stages above are either
"everyone with the flag on" or "nobody," controlled per-family by the
toggle itself.

## 5. Known gaps and recommended v2 ideas

See the end of `savings-quest/README.md`'s Stage 6 section for the
full Definition-of-Done checklist and the complete known-gaps/v2-ideas
list that accompanies it.

## 6. Security review summary

See `savings-quest/README.md`'s Stage 6 section, "Security review," for
the full writeup. In short: `onSplitCompleted`/`onChoreApproved` (the
only two `window.SavingsQuest` entry points that can cause an XP write)
now cross-validate the passed-in round/chore-completion against Money
Muscle's own stored records before recording anything, closing the
most direct "forge a round via devtools" self-XP-grant path;
`getHero`/`getLedger`/`getMilestones` no longer accept an arbitrary
kidId (they only ever answer for the currently active kid); and a full
`console.*` audit found no kid-identifying data logged anywhere in the
bridge. The caveat present since Stage 0 still holds: this is a
client-only app with no backend, so a technically sophisticated user
with devtools access can still edit localStorage directly — there is
no way to fully close that without an actual server, and every stage
of this build has said so plainly rather than overclaiming
"server-authoritative" as something it structurally cannot be.

## Changelog

- **Stage 1** — Data model, event listeners (`onSplitCompleted`,
  `onChoreApproved`), XP/level/streak engine, one-time backfill script.
  No UI.
- **Stage 2** — Hero creator, dashboard hero card, goal flow with
  parent approval, feedback animations (coin burst, level-up, goal
  celebration), two density modes, reduced-motion toggle.
- **Stage 3** — Gear/skill/loadout system: 32→33-item catalog, 9-skill
  tree across 3 branches, Loadout and Skill Tree screens, unlock-reveal
  animation.
- **Stage 4** — Open World v1: Phaser 3 (lazy-loaded), 2 regions
  (Starter Meadow, Whispering Forest), roaming creatures, hidden chests,
  1 puzzle + 1 NPC + 1 boss per region, the savings-goal landmark, a
  stamina-charge session limiter, Hero Hub fallback, procedural art,
  synthesized sound.
- **Stage 5** — Parent Experience: weekly parent dashboard, per-child
  controls (enable/disable, daily play-time limit, quiet hours,
  XP-rate preset, parent match), manual Bonus XP, Family Quest with
  parent cheer messages, settings enforcement with a gentle in-game
  rest prompt.
- **Stage 6** — Content, Polish, Hardening: 3 more regions (Coin
  Canyon, Frost Peaks, Sky Kingdom), 3 more bosses (Sneaky Subscription,
  Fee Phantom, Inflation Dragon), 3 more NPCs, a consolidated
  human-reviewable lesson file, Daily Check-In + Weekly Savings Raid
  quests, a free streak freeze, audio captions, a security-hardening
  pass (forged-event validation, scoped reads, storage-failure
  resilience, fetch timeouts), and this document.
