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

## How This Relates to the Broader AFL Draft Tool Landscape

Tools like **Smart Draft Board** (smartdraftboard.com) have popularised VORP-based drafting for AFL SuperCoach and Fantasy. That tool covers 780+ players, works across both SuperCoach and AFL Fantasy, and defaults to 8-team leagues. It's a great reference for the core concepts — if you've used it, this section explains where our approaches align and where they diverge.

### What We Share With Smart Draft Board

Both tools are built on the same foundational insight: **raw projected score is a terrible way to rank draft picks.** A midfielder averaging 110 looks better than a ruck averaging 95, but if the next-available mid averages 105 while the next-available ruck averages 75, the ruck is the smarter pick by a mile. Both tools use VORP to quantify this.

Both tools also layer additional context on top of raw VORP:
- **Positional urgency/scarcity** — how desperate are you at each position?
- **Bye round management** — how does this pick affect your bye week balance?
- **Tier breaks** — visual indicators of where value drops off sharply
- **Live draft intelligence** — real-time alerts that adapt as players are drafted
- **DPP handling** — dual-position players get evaluated at both positions

### Where We Differ

| Area | Smart Draft Board | This Tool |
|---|---|---|
| **Default league size** | 8 teams | 6 teams — most private leagues are smaller |
| **Replacement level** | Uses average score around the cut-off point, includes a proportion of bench slots | Uses the exact Nth player at the cut-off, based on starters + emergencies only (bench is position-agnostic, so excluded) |
| **Smart Rank formula** | `VORP + (Urgency × Weight) + (Bye Score × 0.8)` — additive | `VORP × 0.7 + Scarcity × 0.2 + Bye × 0.1` — weighted composite with tuneable sliders |
| **Urgency vs Scarcity** | "Urgency" combines unfilled roster slots AND positional scarcity into one signal | Scarcity is a standalone metric (pool depletion %); roster completion is handled separately in My Team |
| **Bye scoring** | Density penalty + quadratic team exposure penalty + quality weighting (losing a premium hurts more) | Inverse crowdedness: fewer of your team on this bye = higher score. Simpler but effective |
| **Tier break threshold** | 3+ point VORP gap, adjustable sensitivity | 8+ point value gap (stricter — only shows major cliffs) |
| **Intelligence panels** | 4 separate panels: Best Value, Highest VORP, Tier Drops, Position Scarcity | Single unified panel: Top 5 recommendations with multi-reason explanations, plus scarcity bars, pick countdown, and position run detection |
| **Projections** | Built-in 2025 averages as baseline, with in-app editing and CSV import | Fully BYO — you supply your own projections via CSV. No built-in data. |
| **Smokies** | No dedicated system | First-class smoky tagging with dynamic scarcity-triggered alerts |
| **VONA** | Not surfaced directly | Explicit column + "big drop-off" warnings |
| **Position run detection** | Not featured | Detects when 3+ picks at the same position occur in a window |
| **Pick countdown** | Not featured | Snake draft pick forecasting with positional attrition estimates |
| **Hosting** | Cloud app with accounts | Fully local, offline-capable PWA — your data never leaves your browser |

### Key Insight From Smart Draft Board: "Garbage In, Garbage Out"

Smart Draft Board makes an important point that we've baked into our philosophy: **the tool is a calculator, not a crystal ball.** Their default 2025 averages are convenient but won't win you a 2026 draft — if you think a player is moving into the midfield, you MUST update their projection to see their true value.

We take this further by not including any built-in projections at all. Your CSV is the single source of truth. This forces you to do the research, form opinions, and make those calls before draft night. The tool then does the maths on top of your thinking.

As Smart Draft Board puts it: *"The most successful drafters are those who spend 10 minutes entering their own hot takes before the draft starts."* We agree — except we'd say spend 10 hours over the pre-season, tag your smokies, and the tool will reward you when it matters.

### Smart Draft Board's Bye Score — What They Do Differently

Their bye scoring is more granular than ours in three ways:

1. **Density penalty** — if many players across the league share a bye, that round is "crowded" and those players get penalised. We don't factor in league-wide bye density, only your own team's distribution.

2. **Quadratic team exposure** — if you already have 3 players on R14 and draft a 4th, the penalty increases quadratically (not linearly). This aggressively discourages stacking. Our model is linear — each additional player on a crowded bye reduces the score proportionally.

3. **Quality weighting** — losing a premium for a bye week hurts more than losing a bench player. Their bye penalty is scaled by the player's score. Our bye value treats all players equally — the bye round is either crowded or it isn't, regardless of who's on it.

Whether the extra granularity matters depends on your league. In a 6-team league, bye management is less critical than in 8+ teams because you have more total players to cover bye weeks. Our simpler model keeps bye as a tiebreaker (10% weight) rather than a dominant factor.

### Smart Draft Board's Urgency vs Our Scarcity

Smart Draft Board combines two things into "urgency": how many roster slots you still need at a position AND how scarce viable players are at that position. When you need 1 more RUC and only 3 decent rucks remain, urgency spikes.

We split these into separate signals:
- **Positional scarcity** (in the intelligence panel) tells you how depleted the league-wide pool is
- **My Team panel** tells you how many roster slots you still need

The advantage of splitting them: scarcity alerts fire regardless of your own roster state. Even if you're full on DEFs, you might want to know that the DEF pool is almost empty — because it affects DPP strategy and trade value.

### Smart Draft Board's Full UI — What It Actually Looks Like

Their league settings panel is richer than ours in several ways:

**Draft Format options:**
- **Snake** (default) — pick order reverses each round (1→8, 8→1, 1→8...)
- **Linear** — same order every round
- **Banzai** — reverse-order snake (worst team picks first)
- **Custom** — define your own pick order

We only support snake draft. For 6-team private leagues, snake is near-universal, so this hasn't been a gap — but it's worth knowing if we expand.

**League Type options:**
- **Redraft** (default) — standard, all players available each season
- **Keeper** — retain some players year-to-year
- **Dynasty** — full roster carries over

We're purely a redraft tool. Keeper and dynasty modes would fundamentally change VORP calculations (kept players aren't in the available pool).

**Roster configuration:**
Their default for a 6-team league: DEF 6, MID 8, RUC 2, FWD 6, Flex 0, Bench 5 (total 27 players: 22 on-field + 5 bench). Our default: DEF 6, MID 5, FWD 6, RUC 1, plus 1 emergency per position + 6 flex bench (total 28 per team). The key difference is they use 8 MID starters and 2 RUC starters — this means their MID replacement level is higher (more starters to fill) and their RUC cliff is slightly less extreme (16 rucks rostered across 8 teams vs our 12 across 6). Both are configurable.

**Their column set on the main board:**
`#`, `PLAYER`, `SMART` (Smart Rank), `VORP`, `PROJ` (projected), `COMM` (community consensus average), `2026` (2026 projection), `2025` (2025 actual average), `VAR` (year-on-year variance), `L5` (last 5 games average), `MAX` (season-high score), `CBA%` (centre bounce attendance %), `BYE`, `BYE±` (bye impact score), `ADP`, `EXP` (experience/games), `FORM`, `TOG` (time on ground), `HI/LO` (consistency — high/low ratio)

That's 18+ columns compared to our 11. They show way more historical data. The advantage is context; the disadvantage is information overload. They mitigate this with a "Columns" button to toggle visibility and a "Focus" mode that presumably strips back to essentials.

**Player badge and tag system:**
Each player row is decorated with contextual badges:
- **Position badges:** Colour-coded (DEF blue, MID green, FWD red, RUC purple) — same as ours
- **DPP indicators:** `M/F` (MID/FWD), `G.Def` (general defender) — shorthand for dual position
- **Status tags:** `POS+` (positive role change), `SAFE` (low-risk pick), `RISKY` (injury/role concerns), `INJURED`, `UPSIDE` (breakout candidate), `SLP` (sleeper)
- **Draft position tags:** `#1 PICK`, `#2 PICK`, `#10 PICK` etc — where they're expected to go
- **Value tags:** `STEAL` (going later than they should), `VALUE` (good value at current ADP), `REACH` (going earlier than value suggests)
- **Trend tags:** `HOT` (form trending up), `COLD` (form trending down)

Our equivalent is simpler: category badges (premium/value/smoky/rookie/depth) and position badges. Their tag system gives more at-a-glance draft-night context — you can see "STEAL" and "UPSIDE" without reading numbers. This is a UX pattern worth learning from.

**Filter bar:**
Position counts in the filter bar (`DEF 258`, `MID 250`, `RUC 60`, `FWD 306`) — showing total player pool size per position. Plus team filter, bye filter, VORP range slider (min/max), and tag-based filters (Big Drop, Breakout, Rising). Our filter bar is simpler: position toggle, search, sort mode, show/hide drafted.

**Quick Tour (5-step onboarding):**
When you first open the board, a guided tooltip tour explains each concept:
1. **Smart Rank** — "combines VORP, positional scarcity, and bye impact into one number. Higher = better value pick"
2. **VORP Column** — "Value Over Replacement Player shows how much better a player is than the baseline at their position"
3. **Draft Intelligence** — "This panel suggests the best value picks and warns about tier drops in real-time"
4. **Edit Projections** — "Click 'Edit Now' to enter your own projected averages. Better projections = better rankings"
5. (Fifth step not visible in tour)

This onboarding pattern is something we lack entirely. A first-time user opening our tool sees VORP, VONA, Smart Rank, and finalValue with no explanation. The Quick Tour is a low-effort, high-impact UX feature.

**Navigation:**
Left sidebar with: Rankings, Draft Tracker, My Team, Bye Planner, Tiers, Expert Picks. Plus a Tools section: Projections, Import ADP, Save League, Help. Their "Tiers" is a dedicated tab with collapsible tier groups and per-position filtering — we show tier breaks inline on the draft board but don't have a standalone tiers view. "Expert Picks" is a feature we don't have (curated picks from known analysts).

### What Smart Draft Board Has That We Don't (Yet)

- **Built-in projections** — 780+ players with 2025 averages as a starting point. Useful for people who don't have their own spreadsheet.
- **In-app projection editing** — "Edit Mode" to tweak scores without re-uploading CSV. Their banner says "PROJECTIONS DRIVE VALUE — VORP and Smart Rank are only as good as the numbers behind them. Enter your own expected averages to find the real gems."
- **Account system** — save your draft research across sessions/devices via cloud sync.
- **SuperCoach support** — different scoring system, same VORP framework. Toggle between SuperCoach and AFL Fantasy at the top.
- **Adjustable tier sensitivity** — slider to control how aggressive tier breaks are.
- **Rich player tags** — STEAL/VALUE/REACH/UPSIDE/RISKY/SAFE/HOT/COLD badges that give at-a-glance context beyond raw numbers.
- **CBA% and advanced stats** — centre bounce attendance, time on ground, form rating, consistency metrics. These help evaluate role changes.
- **ADP integration** — "Import ADP" as a dedicated tool, plus STEAL/REACH badges computed from ADP vs VORP rank.
- **Quick Tour onboarding** — 5-step tooltip walkthrough for first-time users.
- **Draft format variety** — Snake, Linear, Banzai, Custom.
- **League types** — Redraft, Keeper, Dynasty.
- **Expert Picks tab** — curated picks from analysts.
- **Focus mode** — simplified view toggle (similar to the Simple Mode concept below).

### What We Have That They Don't

- **VONA (Value Over Next Available)** — the "don't skip this player" metric, surfaced as a column and in recommendations.
- **Position run detection** — live alerts when a position is being raided in the current draft stretch.
- **Pick countdown with positional forecasting** — "6 picks until yours, estimated 2 DEFs will go."
- **Smokies system** — pre-tagged undervalued players with scarcity-triggered alerts.
- **Fully offline** — no account, no cloud, no internet needed after first load.
- **Full draft tracking** — log every pick for every team, not just yours, with undo for any pick.
- **Configurable everything** — all weights, roster sizes, team counts, and DPP bonus exposed in the UI.

---

## UX Design Principle — "Who Should I Pick and Why?"

The tool doesn't need a Simple Mode. It needs to answer one question clearly at all times: **who is the best pick right now, and why?**

Everything else — VORP, scarcity bars, bye charts — is supporting evidence. The intelligence panel's top recommendation should be the first thing your eye hits, with plain-English reasons underneath. The numbers are there for people who want to dig in, but the answer is always front and centre.

### What Smart Draft Board Does Well Here

Their approach to clarity is worth learning from:

- **Quick Tour onboarding** — 5 tooltips on first load that explain Smart Rank, VORP, and draft intelligence in 30 seconds. We should add this. A first-time user shouldn't have to wonder what VONA means.
- **Tag system** — STEAL, VALUE, REACH, SAFE, RISKY, UPSIDE badges communicate conclusions without requiring you to understand the derivation. "This player is a STEAL" is immediately useful. "This player has a valueOverAdp of 12" is not, even though it means the same thing.
- **Heat shading** — gold intensity on the VORP column makes value scannable without reading numbers. We do this with green/yellow/orange, which works similarly.
- **Intelligence banner** — their draft intelligence sits above the rankings as a prominent banner, not tucked in a sidebar. The recommendations are the first thing you see.

### What We Already Do Right

The intelligence panel's recommendation system is actually stronger than Smart Draft Board's — each recommendation comes with multiple human-readable reasons. "Elite value: 28.3 VORP above replacement" and "DEF is CRITICAL — only 4 left, 0 premiums remaining" tells you both the what and the why. Smart Draft Board splits this into 4 separate panels you have to cross-reference.

Our VONA column (which they don't have) directly answers "what do I lose if I skip this player?" — that's one of the most actionable things you can know on draft night.

### Improvements Worth Making

1. **Column header tooltips** — hover over "VORP" and see "How much better this player is than the last starter at their position." Hover over "VONA" and see "If you skip this player, the next best at their position is this many points worse." Low effort, big clarity win.

2. **Recommendation prominence** — the top pick recommendation should be visually dominant. Bold it, give it a coloured background, make it impossible to miss at a glance.

3. **Plain-English alerts** — "DEF is CRITICAL" is already clear, but "DPP flexibility (DEF/MID)" could be "Plays 2 positions — fills multiple roster needs." Small wording tweaks.

4. **Player tags** — adding STEAL/VALUE/REACH badges computed from ADP vs VORP rank would communicate value at a glance without understanding the numbers. A "STEAL" badge next to a player is instantly meaningful.

5. **First-load tour** — a 4-step tooltip walkthrough: Smart Rank → VORP → Recommendations → Draft button. Takes 20 seconds, prevents the "wall of jargon" feeling.

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
