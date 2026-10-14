# Savings Quest

Stage 1 (data, events, XP engine) and Stage 2 (hero, dashboard card, goal
flow) are both in. Everything is inert until the `savingsQuest` feature
flag is turned on — as of Stage 2, that's a real checkbox in the Parent
view, not just a console command.

## How to run tests

```bash
cd savings-quest
npm test
```

No dependencies to install — this uses Node's built-in test runner
(`node --test`), not Jest/Vitest. 41 tests: Stage 1's XP math, level
curve, streaks, idempotency, withdrawal handling, anti-farming, and
event→XP→hero-state integration, plus Stage 2's pure UI-logic tests
(next-unlock teaser, milestone path state, and a guard that fails loudly
if a hero class ever grows a numeric stat field).

Stage 2's actual DOM rendering (`ui.js`) is **not** unit tested — this
project has stayed dependency-free throughout, and testing rendered HTML
honestly needs jsdom or similar. See "Demo steps" below for manual
verification instead.

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
click-through before treating Stage 2 as done.

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
