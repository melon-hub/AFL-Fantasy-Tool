# AFL Fantasy Draft Tool — How It Works

A deep dive into the app, the thinking behind every feature, and the AFL Fantasy draft lessons baked into the code.

---

## What This Is

This is a draft-night companion for **AFL Fantasy Draft leagues** — specifically tuned for the 6-team format that most private leagues run. You load your player projections via CSV, and the tool tells you who to pick, why, and what you're risking if you wait.

It runs entirely in your browser. No login, no server, no data sent anywhere. You can install it as a PWA on your phone or laptop, and it works offline once loaded — which matters because draft night Wi-Fi at someone's house is never reliable.

---

## The Problem It Solves

Most AFL Fantasy draft tools fall into two camps:

1. **Spreadsheets** — powerful but hard to use live. You're scrolling, filtering, forgetting who's been picked, losing track of positional balance. By round 8 you're panicking and picking on vibes.

2. **Existing draft tools** — either built for 8+ team leagues (wrong replacement levels), use opaque ranking algorithms you can't inspect, or don't handle DPP players correctly.

This tool gives you:
- Correct VORP math for your exact league size and roster structure
- Transparent ranking you can see and tune
- Live intelligence: "3 DEFs just went in the last 5 picks, you've got 4 picks until your turn, and there'll only be 2 DEFs left by then"
- A smokies system so your pre-draft research is surfaced at the right moment

---

## Core Concept: VORP (Value Over Replacement Player)

### What Is Replacement Level?

In a 6-team league with 6 DEF starters + 1 DEF emergency per team, there are 42 "rostered" DEF slots across the league (7 x 6). The 42nd-best available defender is the **replacement level** — that's the calibre of player you can always get for free if you wait.

A player's VORP is: `projected average - replacement level at their position`.

A DEF projected at 95 when the replacement DEF averages 70 has a VORP of 25. A MID projected at 95 when the replacement MID averages 80 has a VORP of 15. Same player projection, different value — because midfield is deeper.

**Why VORP matters for drafting:** It tells you where you're getting the biggest upgrade over "doing nothing." A 95-averaging DEF is more valuable than a 95-averaging MID because the DEF you'd otherwise end up with is much worse.

### Replacement Levels Recalculate After Every Pick

This is critical. As players get drafted, the pool shrinks, and replacement levels change. A position that was deep in round 1 might be shallow by round 6. The tool recalculates VORP from scratch after every single pick — yours and your opponents'.

### The DPP Fix

Dual Position Players (DPP) are players eligible at two positions — e.g., DEF/MID. Naive implementations calculate VORP at one position and overwrite it when they process the second. This tool calculates VORP at **each** eligible position independently and uses the **maximum**:

```
VORP_DEF = projScore - replacementLevel_DEF
VORP_MID = projScore - replacementLevel_MID
bestVORP = max(VORP_DEF, VORP_MID)
```

On top of that, DPP players get a configurable bonus (default: 3.0 points) because roster flexibility is genuinely valuable — a DEF/MID can fill whichever line is thinner on your roster.

### Concrete Example

In a standard 6-team league:
- **DEF replacement** = 42nd best DEF (6 starters + 1 emergency x 6 teams)
- **MID replacement** = 36th best MID (5 starters + 1 emergency x 6 teams)
- **FWD replacement** = 42nd best FWD (6 starters + 1 emergency x 6 teams)
- **RUC replacement** = 12th best RUC (1 starter + 1 emergency x 6 teams)

RUC replacement is always low because there are so few ruck slots. This is why the top ruck (Grundy, English, etc.) has enormous VORP — the drop-off to the 12th-best ruck is massive.

---

## Smart Rank: Going Beyond Raw VORP

Pure VORP is a great foundation, but it doesn't capture everything that matters on draft night. Smart Rank is a weighted composite:

```
Smart Rank = VORP × 0.7 + Positional Scarcity × 0.2 + Bye Value × 0.1
```

All three weights are visible in the settings sidebar and fully tuneable with sliders. Nothing is hidden.

### Positional Scarcity (0–100)

Tracks how depleted each position is. If 80% of rosterable DEFs have been drafted, the scarcity score is 80. The urgency levels are:

| Scarcity | Urgency | What It Means |
|---|---|---|
| < 40% | Low | Plenty of options, no rush |
| 40–59% | Medium | Starting to thin out |
| 60–79% | High | Running low, premiums disappearing |
| 80%+ or 0 premiums left | Critical | Act now or settle for depth |

This prevents the classic draft mistake: ignoring a position because "there are heaps of mids" until suddenly there aren't.

### Bye Value (0–100)

Measures how well a player's bye round balances your team. If your team already has 5 players on R12 byes and only 1 on R14, a R14 player scores higher than an equally talented R12 player.

When your team is empty, bye value is neutral (50) — it only activates once you have players and a distribution to balance.

### Why These Weights?

The defaults (0.7 / 0.2 / 0.1) reflect the reality that:
- **VORP is king** — getting the best player available relative to replacement is the single most important thing in fantasy drafts
- **Scarcity is the tiebreaker** — when two players have similar VORP, pick the one at the scarcer position
- **Bye management is a luxury** — it matters, but you should never reach for a worse player just to balance byes

You might shift scarcity higher (0.3) if you're in a league where people hoard positions early. You might zero out bye weight if you don't care about bye rounds at all.

---

## Draft Intelligence Features

### VONA (Value Over Next Available)

For each available player, VONA shows the gap between them and the next-best player at their position. A VONA of 15 means: "If you skip this player, the next-best option at their position is 15 points worse."

High VONA (>10) triggers a bold red highlight and a recommendation reason: **"Big drop-off: 12.3 pts better than next DEF — don't skip."**

This is how you avoid the regret of "I could have had Ridley but I took another mid instead, and now the best DEF left is averaging 72."

### Position Run Detection

Monitors the last 5 picks (configurable window). When 3+ picks at the same position occur, you get an amber alert:

> **DEF run: 3 of the last 5 picks were DEF — consider acting now or pivoting**

This gives you two options:
1. **Jump in** — if your own DEF stocks are thin, get one before they're all gone
2. **Pivot** — if everyone's panic-buying DEFs, the MID pool is being left alone. Grab a premium mid while it's still there

### Pick Countdown + Positional Forecasting

Shows how many picks until your next turn in the snake draft, and estimates how many players at each position will be taken before you pick again.

Example: "6 picks until yours (#19). DEF: 8 → 6, MID: 12 → 9, RUC: 3 → 2, FWD: 10 → 8"

This uses the recent draft rate (what positions have been picked in the last 2 rounds) to project forward. If DEFs have been going at 40% of picks, it projects 40% of the remaining picks will be DEFs.

The snake draft math handles the reversal correctly:
- Odd rounds: Team 1 picks 1st, Team 6 picks 6th
- Even rounds: Team 6 picks 1st, Team 1 picks 6th

### Top 5 Recommendations

The intelligence panel shows your top 5 picks ranked by Smart Rank, each with human-readable reasons:

- "Elite value: 28.3 VORP above replacement"
- "DPP flexibility (DEF/MID) — fills multiple roster needs"
- "DEF is CRITICAL — only 4 left, 0 premiums remaining"
- "Great bye (R14) — balances your team's bye spread"
- "Smoky: midfield minutes rising, averaged 85 in last 4"
- "Big drop-off: 12.3 pts better than next FWD — don't skip"
- "Sliding in draft: ADP 35 but ranked 22 by value"

Every reason is generated from real data — nothing is hardcoded or cosmetic.

---

## The Smokies System

### What's a Smoky?

AFL Fantasy slang for a player who's flying under the radar — undervalued, under-drafted, but likely to outperform expectations. Maybe they had an injury-interrupted 2025 and their ADP has dropped. Maybe they've moved into the midfield in preseason. Maybe they're a 20-year-old who averaged 75 in the last month of last season.

### How It Works

You tag players as "smoky" in your CSV with a `category` column and add a `smoky_note` explaining why:

```csv
name,pos,club,proj_score,bye,category,smoky_note
Sam Flanders,DEF/MID,GEE,88,13,smoky,midfield minutes rising — averaged 85 in last 4
```

The Smokies tab shows all your tagged smokies sorted by value, with their notes and key stats.

### Dynamic Smoky Alerts

The smart part: when a position hits "high" or "critical" scarcity, the app finds your best available smoky at that position and surfaces an alert:

> **DEF premiums almost gone (0 left) — consider Sam Flanders (12.3 value: midfield minutes rising)**

This means your pre-draft research pays off at exactly the right moment. You identified Flanders as a smoky weeks ago, and now the app is telling you this is when to pull the trigger.

---

## Bye Planning

### Why Byes Matter

In AFL Fantasy, each club has a bye in rounds 12, 13, or 14. During your team's bye round, those players score 0. If you stack too many players on the same bye, you'll have a terrible week when they're all out simultaneously.

### What the Tool Shows

**Available players by bye round:** A bar chart showing how many undrafted players are on each bye. If R13 is running thin, you know R13 players are in demand.

**Your team's bye distribution:** Groups your drafted players by bye round with warnings:
- **"Thin"** (2 or fewer on a bye, once you have 6+ players) — you might struggle to fill your team that week
- **"Heavy"** (5+ on a bye) — you're going to have a bad round

The ideal distribution is roughly even across all three bye rounds. The bye planner helps you spot imbalances before they become problems.

---

## My Team Panel

Shows your drafted players grouped by position (DEF, MID, RUC, FWD) with clear roster slot tracking:

- **Starters** — your best players, sorted by projected average
- **Emergency** — the next player at each position, tagged EMG
- **Bench** — everyone else

Each position group shows completion: "DEF: 4/6 starters, 0/1 emerg" so you know exactly what you still need.

The summary bar shows your total player count, average projected score, and bye distribution at a glance.

---

## Draft Management

### Drafting

Click "Draft" on any player → modal appears → select which team (1–6) → done. The modal highlights "My Team" for one-click drafting of your own picks.

Draft any player to any team — you're tracking the entire draft, not just your picks. This is essential because VORP depends on the entire available pool.

### Undo System

Mistakes happen on draft night. The tool provides:
- **Undo last pick** — one click to reverse the most recent pick
- **Undo last N** — undo the last 3, 5, or however many picks
- **Return specific player** — click any pick in the history to undraft that specific player

All undo actions recalculate VORP from scratch, so the board is always accurate.

### State Export/Import

Click "Export Draft State" in settings → downloads a JSON file with your entire draft: all players, all picks, current pick number. Click "Import Draft State" on another device → upload the JSON → you're exactly where you left off.

This means you can:
- Start on your laptop, continue on your phone
- Back up mid-draft in case your browser crashes
- Share your draft state with a mate for post-draft analysis

---

## The Draft Board

Built on TanStack Table with full column sorting. Columns:

| Column | What It Shows |
|---|---|
| # | Row number in current sort |
| Player | Name + club, struck through if drafted |
| Pos | Position badges (colour-coded, shows DPP) |
| Proj | Your projected season average |
| VORP | Raw VORP at best position |
| Value | VORP + DPP bonus = final value |
| Smart | Smart Rank composite score |
| VONA | Gap to next-best at same position |
| Bye | Bye round |
| Cat | Category badge (premium/value/smoky/rookie/depth) |
| ADP | Average draft position (from your data) |
| Action | Draft button or "T3 #14" (Team 3, pick 14) |

### Heatmap

VORP and Value columns use a green/yellow/orange heatmap. Top 30% of available players glow green, middle tier is yellow, bottom is neutral. This makes it instant to spot elite value.

### Tier Breaks

When there's a >8 point gap in value between adjacent players, a dashed amber line appears. This is a natural tier break — the drop in quality is significant enough that you should be aware of it.

### Filtering

- **Position filter:** ALL / DEF / MID / RUC / FWD / DPP (players with 2+ positions)
- **Search:** Filter by player name or club
- **Sort toggle:** Switch between Classic VORP and Smart Rank ordering
- **Show/hide drafted:** Toggle whether drafted players appear (greyed out) or are hidden entirely

---

## CSV Parser — Designed for Real Data

The CSV parser is deliberately lenient because every spreadsheet exports slightly differently:

- **Column matching is case-insensitive** — "Name", "NAME", "name" all work
- **Multiple aliases per field** — `proj_score`, `proj`, `projection`, `projected`, `avg` all map to projected score
- **Whitespace is trimmed** — leading/trailing spaces in headers and values are ignored
- **Missing optional columns are fine** — only name, position, club, projected score, and bye are required
- **Position parsing handles both formats** — "DEF/MID" and "DEF,MID" both work
- **Auto-generated IDs** — if your CSV doesn't have a player_id column, sequential IDs are assigned
- **Error reporting** — invalid rows are skipped with specific error messages ("Skipping 'John Smith': invalid position 'MIDS'")

This means you can take the AFL Fantasy Ultimate Spreadsheet, add a projection column, save as CSV, and it just works.

---

## AFL Fantasy Draft Lessons Built Into the Tool

### 1. Ruck is always scarce

With only 1 starter + 1 emergency per team (12 total rostered rucks across 6 teams), the top rucks have enormous VORP. The gap between the #1 ruck and the #12 ruck is usually 25+ points. The tool reflects this automatically — when you see a ruck with 30 VORP, that's real.

**Draft implication:** Don't leave ruck too late. The cliff is real and it's steep.

### 2. DPP players are undervalued by most tools

A DEF/MID who averages 85 is more valuable than a pure DEF who averages 85, because the DPP can fill whichever line is thinner. Most tools treat them the same. This tool adds a configurable bonus (default 3.0) and shows the VORP at each position so you can see exactly why.

**Draft implication:** When two players are close on projections, take the DPP.

### 3. Don't draft for need too early

The scarcity system prevents panic-drafting. If DEF scarcity is "low" (plenty left), you don't need to reach for a DEF — take the best available player by VORP. The tool will warn you when a position actually becomes urgent.

**Draft implication:** Best player available in the early rounds, positional need in the later rounds. The scarcity indicators tell you when to switch.

### 4. The mid-rounds are where drafts are won

Premiums pick themselves — everyone knows Bontempelli and Laird are good. The mid-rounds (picks 40–90) are where knowledge wins. This is where the smokies system pays off: you've done your research, tagged undervalued players with notes about why, and the app surfaces them at the right time.

**Draft implication:** Spend your pre-draft research time on the mid-tier, not the top 20.

### 5. Byes are a tiebreaker, not a strategy

You should never reach for a clearly worse player to fix your bye spread. But when two players are genuinely close in value, take the one that balances your byes. The 10% bye weight in Smart Rank reflects this — it nudges, it doesn't override.

**Draft implication:** Draft the best player available. If it's close, check the bye planner.

### 6. Watch what others are doing

Position run detection exists because drafts have momentum. Someone takes a DEF, then another owner thinks "oh, I should get one too," and suddenly 4 DEFs go in 5 picks. If you're paying attention, you can either join the run (if you need DEFs) or exploit it (grab a premium MID while everyone's distracted).

**Draft implication:** Track every pick, not just yours. The intelligence panel does this for you.

### 7. Know your drop-offs

VONA (Value Over Next Available) is arguably the most actionable metric. If a player has a VONA of 20, that means there's a massive cliff after them. If you skip them, you're not getting someone 2 points worse — you're getting someone 20 points worse.

**Draft implication:** When VONA is high, don't get cute. Take the player.

---

## Technical Architecture

### State Management

Three Zustand stores, each persisted to localStorage independently:

- **Draft Store** — players array, draft picks history, current pick number. This is the source of truth for the entire draft.
- **Settings Store** — league configuration (team count, roster slots, DPP bonus, Smart Rank weights). Survives between sessions.
- **UI Store** — active tab, sidebar open/closed, search query, position filter, sort mode, draft modal state. Ephemeral but persisted for convenience.

### Calculation Flow

Every time a player is drafted or undrafted:
1. The player's `isDrafted` / `draftedBy` / `draftOrder` fields are updated in the draft store
2. The main page recalculates `calculateVorp()` which:
   - Filters to available (undrafted) players
   - Computes replacement levels for each position based on the current pool
   - Calculates VORP at each eligible position for every player
   - Picks the maximum VORP + applies DPP bonus
   - Calculates positional scarcity, bye value, Smart Rank
   - Computes VONA for each player
   - Computes value over ADP
3. The intelligence panel recalculates recommendations, scarcity bars, position runs, and pick countdown
4. All panels update via React's reactivity

This is deliberate — recalculating from scratch is correct because replacement levels shift after every pick. Caching would risk stale data.

### Why Client-Side Only

1. **Privacy** — your draft projections and strategy shouldn't be on someone else's server
2. **Reliability** — no API to go down, no latency, no auth flow
3. **Simplicity** — one `pnpm dev` and you're running
4. **Offline** — the service worker caches the app shell so it works without internet

### PWA Support

The app registers a service worker with a network-first strategy: try the network, cache the response, fall back to cache if offline. The manifest enables "Add to Home Screen" on mobile with a standalone display mode (no browser chrome).

---

## Settings You Should Know About

| Setting | Default | Why |
|---|---|---|
| Number of Teams | 6 | Standard private league size. Changing this shifts all replacement levels. |
| Starters (DEF/MID/FWD/RUC) | 6/5/6/1 | Standard AFL Fantasy Draft roster. |
| Emergencies per position | 1 each | Standard. Included in replacement level calculation. |
| Bench size | 6 | Flexible bench spots. NOT included in VORP — these are position-agnostic. |
| DPP Bonus | 3.0 | How much to reward dual-position eligibility. Set to 0 to ignore DPP. |
| My Team Number | 1 | Which team is yours (1–6). Affects bye value and My Team panel. |
| VORP Weight | 0.70 | Smart Rank: how much raw value matters |
| Scarcity Weight | 0.20 | Smart Rank: how much positional depletion matters |
| Bye Weight | 0.10 | Smart Rank: how much bye balance matters |

---

## The Ideal Draft Night Workflow

1. **Weeks before:** Build your projections in a spreadsheet. Tag smokies with notes. Export as CSV.
2. **Before the draft:** Load the CSV. Set your team number. Glance at the board to make sure data looks right.
3. **During the draft:**
   - Every pick (yours and opponents'), click Draft → select team
   - Watch the intelligence panel for recommendations and alerts
   - When it's your turn, check: VONA (any big drop-offs?), scarcity (any positions getting critical?), recommendations (what does the algorithm say?)
   - Check the Smokies tab when scarcity alerts fire
   - Check the Bye Planner if you're torn between two similar players
4. **After each round:** Glance at My Team to see your roster shape
5. **Mid-draft:** Export your state as a backup
6. **After the draft:** Review your team in the My Team panel. Export final state for records.
