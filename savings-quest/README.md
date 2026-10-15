# Savings Quest

Stage 1 (data, events, XP engine), Stage 2 (hero, dashboard card, goal
flow), Stage 3 (gear, skills, loadout), and Stage 4 (Open World v1) are
all in. Everything is inert until the `savingsQuest` feature flag is
turned on — that's a real checkbox in the Parent view, not just a
console command.

## How to run tests

```bash
cd savings-quest
npm test
```

No dependencies to install — this uses Node's built-in test runner
(`node --test`), not Jest/Vitest. 75 tests: Stage 1's XP math, level
curve, streaks, idempotency, withdrawal handling, anti-farming, and
event→XP→hero-state integration; Stage 2's pure UI-logic tests
(next-unlock teaser, milestone path state, and a guard that fails loudly
if a hero class ever grows a numeric stat field); Stage 3's unlock
logic and stat calculation (`unlocks.js` — all 4 unlock condition types,
the requirement-text phrasing including the brief's own two examples
verbatim, newly-unlocked diffing, skill-point math and prerequisite
gating, and stat summation with an explicit cosmetic-contributes-nothing
guard); and Stage 4's world logic (`world-engine.js` — stamina-charge
clamping, the daily-check-in date rule, landmark-path staging, both
puzzle checkers, and the boss calm-down sequence checker), plus new
`data.js` writer tests for the stamina-charge hook on chore approval,
daily check-in idempotency, and the four new idempotent world-state
writers (region discovered, chest opened, puzzle solved, boss defeated).

None of the DOM/Phaser rendering (`ui.js`, `world.js`) is unit tested —
this project has stayed dependency-free throughout (Phaser is loaded
from a CDN only when a kid actually opens the World, not an npm
dependency), and testing rendered HTML/canvas honestly needs jsdom or a
real browser. See "Demo steps" below for manual verification instead.

## How to try it in the browser

The main app has always been opened via `file://` (double-clicking
`index.html`). That works for everything except Savings Quest specifically,
because `bootstrap.js` uses native ES module `import` statements, and
**Chrome blocks local module imports over `file://`** (CORS error in the
console; `window.SavingsQuest`'s UI methods never populate, though XP
recording itself is unaffected — see the note in `bootstrap.js`). To
actually see the UI, serve the folder instead:

```bash
cd "/Users/phil.albritton/Library/CloudStorage/OneDrive-RamseySolutions/Desktop/moneymuscle"
python3 -m http.server 8000
```

then open `http://localhost:8000` instead of double-clicking the file.

## Demo steps

1. Serve the app as above (not `file://`).
2. Add a kid if you haven't, and switch to the **Parent** tab.
3. Scroll to the new **🗡️ Savings Quest** card and check **Turn on Savings Quest**.
4. Switch to the **Kid** tab. You should see the **Build Your Hero** form:
   name it, pick a look/color/class/density mode, "Create My Hero!"
5. You'll land on the hero card (avatar, Level 0, XP bar, "Next unlock") and,
   below it, **Set a Savings Goal** (name, amount, optional photo). Submit it.
6. Switch back to **Parent** — the Savings Quest card now shows a
   **🎯 Goal Request** with Approve/Not now. Click **Approve**.
7. Give that kid some money (the existing "Give Money" flow), switch to
   **Kid**, and split it with some amount in Save. Watch for:
   - a coin flying up from the hero avatar
   - the XP bar filling
   - the milestone path (now showing the real goal) lighting up a node if
     you crossed 25/50/75/100%
8. Keep repeating step 7 with larger Save amounts until the hero's level
   increases — a full-screen level-up overlay should appear.
9. If you drive Save all the way to the goal's target, Money Muscle's
   existing goal-complete celebration fires as before, now with an added
   line naming the hero and its level.
10. Back in Parent view, check **Reduce motion / animation** — repeat step
    7 and confirm the coin/level-up animations no longer play (the DOM
    still updates, just without motion).

I could not capture actual screenshots this session (no browser
automation tool available) — everything above is written from tracing
the code and confirming every file path resolves (`curl`'d all of them
against a local server, all 200s) and all tests pass, but hasn't been
visually confirmed in a live browser on my end. Worth you doing an actual
click-through before treating any stage as done.

## Stage 3 demo steps: Gear, Skills, Loadout

1. Serve the app, enable the flag, and get a hero to at least Level 1
   (follow steps 1-8 above) if you haven't already.
2. In the **Kid** view, below the goal flow you'll now see two new
   buttons: **🎒 Loadout** and **🌳 Skills**.
3. The moment the hero reaches a new level/streak/milestone/goal, a
   full-screen reveal plays automatically (same overlay style as the
   level-up screen) showing the newly unlocked item's icon, rarity, name,
   and one-line money-lesson tooltip. This runs every time the Kid panel
   re-renders (after a split, a chore payment, or just reopening the
   page), so it can't be missed even if you weren't looking at the time.
4. Click **🎒 Loadout**. You'll see three stat totals (Power / Heart /
   Wisdom) at the top, then four slot rows (Weapon, Armor, Companion,
   Cosmetic). Owned items are clickable cards — click one to equip it
   into that slot (only one per slot) and watch the stat totals update.
   Locked items show a 🔒, the item's name, and its exact requirement
   text (e.g. "Unlocks at Level 7" or "Save $20 more"), grayed out.
5. Click **🌳 Skills**. You'll see three branch columns — Saver (Power),
   Giver (Heart), Wise Spender (Wisdom, game-only) — each with 3 skills
   in a prerequisite chain. The header shows available skill points
   (1 per hero level, minus points already spent). Click **Learn (1 pt)**
   on an eligible skill; it becomes "✓ Learned" and feeds into the
   Loadout screen's stat totals. A skill whose prerequisite isn't learned
   yet shows "Locked"; one you can't afford yet shows "Need more points."
6. To see higher-rarity items and more of the skill tree, keep saving
   (to level up and hit milestones), building a weekly save streak, or
   completing a savings goal — each is a real, independent unlock path.

## Stage 3 assumptions (flagged for review)

13. **"Inventory persistence via the server" is implemented as
    localStorage, not an actual backend** — this app has never had a
    server (confirmed in Stage 0: "default to local storage"), and
    nothing in Stage 3 introduced one. Gear/skill ownership lives in the
    same `hero_inventory`/`hero_skills` localStorage tables as everything
    else in this app, consistent with items #6 above. Flagging this
    explicitly again since the Stage 3 brief's wording ("via the server")
    directly implied otherwise.
14. **"Original art" is procedural, not 32 hand-illustrated pieces.**
    Each item's icon is generated from its `category` (a shape — star
    burst for weapons, shield for armor, round face for companions,
    sparkle for cosmetics) and its `rarity` (a fill color, paired with a
    text label so it's never color-only — see assumption #16). This is
    original art in the sense that it was never copied or borrowed from
    anywhere, but it's not 32 bespoke illustrations. Upgrading to real
    per-item art later only requires swapping what `itemIconSvg()`
    returns — every call site already treats it as a black box.
15. **Stat model: Power/Heart/Wisdom map onto gear category + skill
    branch.** Weapons and armor grant Power, companions grant Heart,
    cosmetics grant nothing (purely a look, so no cosmetic is ever
    strictly better than another — same "no pay-to-win" spirit as the
    rest of the game). Wisdom is deliberately **skill-only** — no gear
    grants it — so the 4 gear categories and 3 skill branches both map
    cleanly onto exactly 3 stats without an awkward leftover category.
16. **Colorblind-safety is handled via text, not color alone.** Every
    place a rarity renders, it shows the word ("Common", "Uncommon",
    "Rare", "Epic", "Legendary") alongside its color — the color is a
    reinforcing cue, never the only signal.
17. **Loadout is single-equip-per-slot, stored directly on the hero
    record** (`hero.loadout = { weapon, armor, companion, cosmetic }`),
    not a separate inventory-state table — simplest model that satisfies
    "equip gear, companion, cosmetics; show stats," and consistent with
    how `hero` already holds the rest of the hero's live state.
18. **Unlock evaluation runs on every Kid-panel render** (via
    `evaluateAndRevealUnlocks`, called at the top of `renderKidPanel`),
    not only right after an XP-granting event. This guarantees a reveal
    is never silently skipped (e.g. if a level-up happens while the Kid
    panel isn't mounted), at the cost of a small, cheap catalog scan on
    every render — 32 items, pure in-memory comparisons, no measurable
    cost.
19. **Multiple simultaneous unlocks queue and reveal one at a time**, each
    waiting for "Neat!" before the next appears, rather than showing them
    all at once — easier to read, and mirrors how the existing level-up
    overlay already works (one overlay, acknowledged, then gone).

## How to tune

Every number that affects game balance lives in `config.js`, with a
comment above each one explaining what it does. Change a value, refresh
the page — no code changes needed anywhere else. The level curve, XP
rates, streak growth/cap, milestone thresholds, Heart/Stamina rates, and
the anti-farming reversal window are all there.

Static content (`content/*.json`) is separately editable without touching
any `.js` file — add a paint... a weapon, a skill, an NPC, a region by
editing JSON. Right now each file holds just one or two placeholder
entries to prove the shape works; Stages 3–4 build the real content.

## One-time backfill

Grants XP for history that happened before Savings Quest existed. Reuses
the exact same event handlers live play uses, so it can't drift out of
sync with how XP is actually calculated, and it's safe to run more than
once (idempotency is enforced at the ledger level, not just in the
backfill script itself).

```js
// Browser console, after enabling the flag:
window.SavingsQuest.runBackfill()          // all kids
window.SavingsQuest.runBackfill({ kidId: '...' })  // one kid
```

## Assumptions made (flagged for review, per the brief's instruction to ask when an answer would change the design)

1. **"Small Stamina" was read as proportional-but-low** (1 XP per dollar
   of chore price, vs. Save's 10/dollar), not a flat amount — so a $10
   chore still clearly outweighs a $1 chore, without ever approaching
   Save's rate. Easy to change to a flat rate in `config.js` if that's
   not what you pictured.
2. **"Consecutive pay periods/weeks" was implemented as calendar weeks**
   (Monday–Sunday), reusing the exact week-boundary logic the existing
   chore system already uses (`startOfWeek`/`startOfChorePeriod` in
   `index.html`) — deliberately matching an existing convention rather
   than inventing a new one.
3. **Withdrawals and transfer-reversals are fully implemented but currently
   unreachable** — Money Muscle has no "withdraw from savings" feature
   today, so `recordWithdrawal` and the anti-farming net-growth logic are
   exercised only by their own tests, not by any real UI flow yet. They're
   built now so the engine is ready the moment such a feature exists, per
   the "level never drops" rule — but worth knowing this code path is
   currently dead in practice.
4. **Spend events are logged with zero game effect**, not skipped
   entirely — a $0-XP ledger entry still gets written so the data exists
   for later (e.g. a spend-themed NPC lesson in Stage 4), rather than
   Spend being invisible to the system altogether.
5. **Milestones use the kid's CURRENT active goal**, including during
   backfill of historical rounds — Money Muscle doesn't keep a record of
   what the goal target was at each point in the past, so this is the
   closest available approximation, not literally historically accurate
   if a goal's target was ever changed.
6. **"Server-authoritative" is implemented as "tamper-resistant within the
   client"**, not literally server-enforced — there is no backend in this
   app. A technically sophisticated kid could still edit `localStorage`
   directly. This was flagged in Stage 0 and carries forward unchanged.
7. **The module lives at `savings-quest/` as its own set of files**, not
   folded into `index.html`'s single file, per the integration plan from
   Stage 0 — this is the first time this project has had more than one
   source file.

## Stage 2 assumptions

8. **Goal-setting now has two paths, on purpose.** The existing Parent
   view "Streak & Savings Goal" card still lets a parent set a goal
   directly, unchanged — I didn't touch it. Savings Quest adds a second,
   new path: the child proposes a goal (with an optional photo) from
   their own side, and a parent approves it before it becomes real
   (writing into the same `setGoal()` the direct path uses). Both paths
   now coexist rather than one replacing the other.
9. **"Look" is a simple flat-vector avatar** (3 shapes × 6 colors, drawn
   as inline SVG), not sprite art — appropriate for a dashboard card.
   Real game-world art is Stage 3/4 territory once Phaser is in play.
10. **Density mode is asked as a feeling, not an age.** The hero creator
    asks "I'm a bit younger" / "I'm a bit older" rather than a numeric
    age, so a 6-year-old isn't being asked to self-sort by a number.
11. **Coin-burst and level-up animations only fire for an existing
    hero.** If XP accrues before a hero is created (e.g. a backfill run
    before the hero-creator step), nothing animates — there's no avatar
    on screen yet to animate toward.
12. **Reduced motion has two layers, both honored:** the OS-level
    `prefers-reduced-motion` setting, and an explicit in-app toggle in
    the Parent view (since relying on OS detection alone isn't really an
    in-app "option," which is what the brief asked for).

## Stage 4 demo steps: Open World v1

1. Serve the app, enable the flag, and get a hero to at least Level 1
   (Starter Meadow's unlock level) — ideally also set and approve a
   savings goal, since the landmark path needs one to show anything.
2. In the Kid view, click the new **🗺️ World** tab (alongside Loadout
   and Skills). You'll land on the **World Gate**: a row of ⚡ icons
   showing stamina charge (starts full, 5/5), a **Daily Check-In**
   button (+2 ⚡, once per calendar day), and an **Enter the World**
   button — disabled if charge is at 0, with a kind "resting" message
   instead of a warning.
3. Click **Enter the World**. The first time, this injects the Phaser 3
   script tag from its CDN (you'll briefly see "Loading your world...");
   every click after that is instant since the script is already
   cached. Entering spends 1 ⚡.
4. You'll see **Starter Meadow**: your hero (blue dot), two wandering
   green creatures (purely decorative — walking into them does
   nothing), two chests, Coach Penny (the NPC), and a puzzle pedestal.
   - **Touch**: drag the translucent joystick circle, bottom-left, or
     tap anywhere else on the map to walk there.
   - **Desktop**: arrow keys or WASD.
   - Walk close to any object — the bottom-right button relabels itself
     ("Open chest", "Talk to Coach Penny", "Try the puzzle") and
     becomes enabled. Tap it to interact.
5. Open both chests (instant, with a coin beep). Talk to Coach Penny
   (a dialogue card with her saving lesson). Try the puzzle — tap the
   four coin values from smallest to biggest; get it right for a
   "Solved!" beep, or try again if not (no penalty either way).
6. If you've unlocked **Whispering Forest** (Level 4), a region-switch
   button appears at the bottom — tap it to swap regions without
   spending more charge. Forest has Sage Willow (needs-vs-wants NPC),
   a needs/wants sorting puzzle, and the **savings-goal landmark**: a
   row of stepping stones (lit = a milestone you've already crossed, 25/
   50/75/100% of your goal) leading to a building (grey silhouette until
   100%, gold once you've fully reached your goal — walking up to it and
   interacting shows a progress message below 100%, or the arrival
   celebration at 100%).
7. If your real savings have crossed the 50% milestone toward your
   active goal, **Impulse Imp** also appears in Forest. Interact with it
   to start the calm-down encounter: watch a 4-icon sequence flash
   (breathe/count/wait/smile), then tap the icons back in the same
   order from a shuffled button row. Get it right and the Imp calms
   down (defeated, persists); get it wrong and it just re-shows the
   sequence — no penalty, no limit on attempts.
8. Approve a chore for this kid in Parent view, then come back to the
   World Gate — stamina charge goes up by 1 (on top of whatever the
   chore's own Stamina stat gain already was).
9. To see the no-canvas fallback, click **"Prefer no map? Visit the
   Hero Hub instead"** on the World Gate screen — the same NPCs,
   puzzles, chests, boss, and landmark, as plain buttons and cards, no
   canvas at all. (This is also what automatically shows if Phaser's
   script fails to load or the browser has no canvas support — you
   never see a raw error either way.)
10. Use the 🔊/🔇 button in the World HUD to confirm the global mute —
    toggling it silences every beep (chest/puzzle/boss) immediately,
    including on the Hero Hub screen, since it's one shared setting.

## Performance numbers

- **Engine payload:** Phaser 3.80.1 minified is 1.18 MB raw, **≈303 KB
  gzipped** (measured directly: `curl` the CDN file, `gzip -9 | wc -c`)
  — about 15% of the 2 MB gzipped budget, and it's never fetched at all
  unless a kid actually clicks "Enter the World."
- **Scene weight:** each region scene has at most ~13 sprites total (1
  hero + up to 3 creatures + 2 chests + 1 NPC + 1 puzzle pedestal + 1
  boss + up to 4 stepping-stones + 1 landmark), all simple flat-shape
  textures with no particle effects, no tilemaps, and — deliberately —
  no physics engine at all (movement/collision/proximity are all plain
  per-frame math in `update()`, not Arcade Physics bodies). This is
  about as cheap as a Phaser scene gets.
- **60fps on mid-range devices:** I could not literally benchmark this
  (no physical device lab, no browser automation tool available this
  session — same limitation noted in every prior stage's demo steps).
  Given the payload size and scene weight above, there's no structural
  reason this wouldn't hit 60fps on anything from the last several
  years, including budget Android phones — but this is reasoning from
  the code, not a measurement, and is worth you confirming on an actual
  device before calling Stage 4 done.

## Stage 4 assumptions (flagged for review)

20. **"Use the game engine we agreed on in Stage 0" = Phaser 3 via
    CDN**, per the exact decision recorded at the end of Stage 0:
    "Phaser 3 via CDN script tag, kept in its own file(s) rather than
    growing index.html further." `world.js` is that file; the CDN
    script itself is injected lazily (see "How it's lazy-loaded" below),
    not added to `index.html`'s `<head>`.
21. **"Server-validated persistence" is localStorage, not a real
    server** — same flag as Stage 3's assumption #13, same root cause
    (this app has never had a backend; Stage 0 confirmed localStorage).
    Chests opened, puzzles solved, bosses defeated, and regions
    discovered all live in a new `world_state` localStorage table,
    written through the same idempotent-writer pattern as every other
    table in `data.js`.
22. **Stamina as a session-length limiter is a flat cost per world
    entry (1 of 5 charges), not a real-time countdown while playing.**
    Rule #5 explicitly forbids "countdown pressure," and a ticking timer
    while a kid is mid-game is exactly that. A flat entry cost — refilled
    by chores (+1) and a once-daily check-in (+2) — limits how many
    times per day the world can be started without ever putting a clock
    on screen. This is a different field from the existing lifetime
    "Stamina" stat from Stage 1 (`hero.stamina`, driven by chores,
    never spent) — that one is untouched; the new spendable meter lives
    separately in `world_state.staminaCharge`, same pattern as the
    existing `powerCharge` field.
23. **Region and boss unlocking reuses `unlocks.js`'s `isItemUnlocked`
    unchanged** — `regions.json` and `bosses.json` both shape their
    `unlock` field exactly like an item's (`{type, value}`), so no new
    unlock logic was written for Stage 4 at all; it was already generic
    enough. The boss is tied to the existing 0.5 (50%) milestone
    fraction, reusing the same thresholds items already unlock against,
    so the landmark path and the gear/boss unlocks can never disagree
    with each other.
24. **"Hidden chests" means tucked into a corner of the map, not
    literally invisible** — there's no fog-of-war or reveal mechanic in
    this slice; chests are visible sprites placed off the obvious
    walking path between the other landmarks.
25. **The boss encounter is a memory/sequence minigame, not combat** —
    the Impulse Imp "attacks" by whispering impulse-buy pressure, and
    the kid calms it down by repeating back a short breathe/count/wait/
    smile sequence it demonstrates first. There's no health bar, no
    damage, and no way to "lose" beyond trying again — chosen to satisfy
    "non-violent" by construction rather than by just reskinning a
    combat system.
26. **No real art or audio files ship in this slice** — every sprite is
    a procedurally-drawn flat shape (category/rarity-style, like the
    Stage 3 gear icons) and every sound is a synthesized beep via the
    Web Audio API, not a sample. See `ASSETS.md` for the full manifest
    and exactly what to swap if/when real art and audio are ready.
    Nothing here is third-party, so nothing needs a license credit.
27. **One NPC, one puzzle, one boss per region — never more than the
    brief's "one" — and both are replayable, not consumed.** Talking to
    an NPC or retrying a solved puzzle doesn't do anything harmful (the
    writes are idempotent), so there's no need to hide or disable
    already-completed content; it's just there if the kid wants to see
    it again.
28. **Switching regions rebuilds the whole Phaser game** rather than
    hot-swapping the running scene's data. Simpler and more obviously
    correct (no stale per-region state can leak across a switch) at a
    small, one-time re-boot cost per switch — acceptable given how
    light each scene already is (see "Performance numbers").
29. **The landmark lives only in Whispering Forest, not Starter
    Meadow**, even though the Stage 1 placeholder `regions.json` had
    `landmarkRef` on the meadow entry. With two real regions now, the
    goal-as-destination framing reads better as something you journey
    toward in the second, deeper region rather than seeing immediately
    in the first.
