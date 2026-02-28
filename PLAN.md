# AFL Fantasy Draft Tool 2026 - Implementation Plan

## Project Overview

A personal-use web app for 6-team AFL Fantasy Draft leagues. Provides real-time
VORP (Value Over Replacement Player) calculations, manual/mock drafting with
undo, bye planning, and optional live draft sync with the official AFL Fantasy
platform.

**Target**: Laptop browser, personal use, standard AFL Fantasy scoring.

---

## Critical Analysis of Grok's Recommendations

### What was correct:
- Core feature set (VORP, manual draft, bye planner, live sync, smokies)
- 6-team roster: 6 DEF / 5 MID / 6 FWD / 1 RUC + 4 emergencies + 6 bench
- DPP bonus concept for VORP calculation
- Live sync via League ID + X-SID cookie polling
- CSV-based data input (official AFL Fantasy spreadsheet as base)
- No public repos to fork - build from scratch

### What was wrong or oversimplified:

1. **Tech Stack (Streamlit)**: Poor table performance with 800+ rows, limited
   customization, no offline capability. Next.js + React is superior.

2. **VORP Code Bug**: The Python snippet overwrites `vorp_raw` for DPP players.
   A DEF/MID player gets DEF VORP calculated, then overwritten by MID VORP on
   the second loop iteration. Must use `max()` across eligible positions.

3. **Live Sync Hand-waved**: "Just inspect the endpoint" ignores that the AFL
   Fantasy API is undocumented and endpoints change yearly. This is a stretch
   goal, not an MVP feature.

4. **Data Sourcing**: The official spreadsheet does NOT include `proj_score` or
   `ps26` columns. Those require manual addition. Pre-season scores are
   manually curated by the original tool's creator.

---

## Competitive Analysis (Feb 2026)

Reviewed SmartDraftBoard.com/afl-draft-rankings to identify gaps worth filling.

| Aspect                  | SmartDraftBoard          | Our Tool (Planned)           | Winner |
|-------------------------|--------------------------|------------------------------|--------|
| Persistence             | Free account (cloud)     | localStorage + JSON export   | Us     |
| Mobile / Draft-night    | Desktop-only             | PWA — installable + offline  | Us     |
| Dynamic ranking         | "Smart Rank" (opaque)    | Smart Rank (transparent, tuned to 6-team roster) | Us |
| Privacy / Offline       | Requires login           | 100% client-side, no account | Us     |
| Roster flexibility      | Generic                  | Exact 6-team with emergencies split | Us |
| State portability       | Tied to account          | JSON export/import, copy between devices | Us |
| Visual intelligence     | Heatmaps, tier breaks    | VORP heatmap + tier breaks + smokies alerts | Tie |

### What we're borrowing (improved):
- **Smart Rank**: Their composite score is opaque. Ours is transparent:
  `smartRank = finalValue × 0.7 + positionalScarcity × 0.2 + byeValue × 0.1`
  with weights visible in settings. Toggleable vs classic VORP sort.
- **Tier break lines**: Horizontal rules in the draft board when value drops
  significantly between adjacent players. Simple visual, big impact.
- **Value heatmap cells**: Tailwind bg-gradient on VORP/finalValue columns
  so premium players glow and depth players fade.
- **Draft state export**: JSON blob download/upload replaces their "login to
  save" — works offline, shareable, no account needed.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) | React-based, great DX, free Vercel hosting |
| Language | TypeScript | Type safety for complex data model |
| Styling | Tailwind CSS v4 + shadcn/ui | Rapid UI, dark mode, consistent design |
| Tables | TanStack Table v8 | Virtualization, sorting, filtering for 800+ rows |
| State | Zustand | Lightweight, supports undo/redo pattern |
| CSV Parsing | Papa Parse | Best-in-class CSV parser for browser |
| Charts | Recharts | Lightweight charts for bye planner |
| PWA | next-pwa or native manifest | Installable, offline-capable for draft night |
| Package Manager | pnpm | Fast, disk-efficient |

---

## Project Structure

```
AFL-Fantasy-Tool/
├── public/
│   ├── manifest.json                   # PWA manifest
│   ├── icons/                          # PWA icons (192px, 512px)
│   └── sample-data/
│       └── players-2026-sample.csv     # Small sample CSV for demo
├── src/
│   ├── app/
│   │   ├── layout.tsx                   # Root layout with providers
│   │   ├── page.tsx                     # Main app page
│   │   └── globals.css                  # Tailwind imports
│   ├── components/
│   │   ├── ui/                          # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── select.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── slider.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── tooltip.tsx
│   │   │   └── toast.tsx
│   │   ├── draft-board/
│   │   │   ├── draft-board.tsx          # Main draft board with TanStack Table
│   │   │   ├── columns.tsx              # Column definitions
│   │   │   ├── player-row.tsx           # Individual player row
│   │   │   └── position-filter.tsx      # Position filter chips
│   │   ├── my-team/
│   │   │   ├── my-team-panel.tsx        # Your drafted team display
│   │   │   └── team-position-group.tsx  # Players grouped by position
│   │   ├── bye-planner/
│   │   │   ├── bye-planner.tsx          # Bye round analysis
│   │   │   └── bye-chart.tsx            # Visual bye distribution
│   │   ├── recent-picks/
│   │   │   └── recent-picks.tsx         # Recently drafted + undo
│   │   ├── settings/
│   │   │   ├── league-settings.tsx      # League config panel
│   │   │   ├── csv-upload.tsx           # CSV upload component
│   │   │   └── live-sync-settings.tsx   # Live sync config (stretch)
│   │   ├── layout/
│   │   │   ├── app-header.tsx           # Top bar with title + actions
│   │   │   ├── app-sidebar.tsx          # Settings sidebar
│   │   │   └── tab-navigation.tsx       # Main tab switcher
│   │   └── theme-provider.tsx           # Dark mode provider
│   ├── lib/
│   │   ├── vorp.ts                      # VORP calculation engine
│   │   ├── csv-parser.ts                # CSV import/export logic
│   │   ├── live-sync.ts                 # AFL Fantasy polling (stretch)
│   │   ├── constants.ts                 # Position names, defaults
│   │   └── utils.ts                     # Shared utilities
│   ├── stores/
│   │   ├── draft-store.ts               # Main draft state (Zustand)
│   │   ├── settings-store.ts            # League settings state
│   │   └── ui-store.ts                  # UI state (active tab, filters)
│   └── types/
│       └── index.ts                     # All TypeScript interfaces
├── .gitignore
├── next.config.ts
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
├── components.json                       # shadcn/ui config
├── PLAN.md                               # This file
└── README.md
```

---

## Data Model (TypeScript Interfaces)

```typescript
// src/types/index.ts

/** Raw player data from CSV import */
export interface Player {
  id: string;                    // Unique ID (player_id from CSV or generated)
  name: string;                  // Full name
  positions: Position[];         // e.g. ["DEF", "MID"] for DPP
  positionString: string;        // e.g. "DEF/MID" (display)
  club: string;                  // AFL club abbreviation
  projScore: number;             // User's projected season average
  preseason26: number | null;    // Pre-season score (nullable)
  bye: number;                   // Bye round number
  age: number | null;
  games2025: number | null;      // Games played in 2025
  category: PlayerCategory;      // Premium, Value, Smoky, Rookie, Depth
  smokyNote: string;             // Reason for smoky tag
  notes: string;                 // User notes
  adp: number | null;            // Average Draft Position
  isDrafted: boolean;            // Has been drafted by any team
  draftedBy: number | null;      // Team number that drafted (null = undrafted)
  draftOrder: number | null;     // Overall pick number
}

export type Position = "DEF" | "MID" | "RUC" | "FWD";

export type PlayerCategory =
  | "premium"
  | "value"
  | "smoky"
  | "rookie"
  | "depth"
  | "uncategorised";

/** Calculated metrics (not stored in CSV, computed dynamically) */
export interface PlayerWithMetrics extends Player {
  vpiByPosition: Record<Position, number>;  // Raw VORP per eligible position
  vorp: number;                              // Best VORP across positions
  bestVorpPosition: Position;                // Which position gives best VORP
  dppBonus: number;                          // Bonus for dual-position eligibility
  finalValue: number;                        // vorp + dppBonus
  valueOverAdp: number | null;               // finalValue rank vs ADP
  smartRank: number;                         // Composite: VORP + scarcity + bye
  positionalScarcity: number;                // 0–100: how depleted this position is
  byeValue: number;                          // Bye round desirability score
}

/** League configuration */
export interface LeagueSettings {
  numTeams: number;               // Default: 6
  starters: Record<Position, number>;  // DEF:6, MID:5, FWD:6, RUC:1
  emergencies: Record<Position, number>; // 1 per position
  benchSize: number;              // 6 additional flex bench spots
  // Total bench = 10 (4 position-specific emergencies + 6 flexible bench spots)
  // VORP only uses starters + emergencies for replacement level
  // Flexible bench treated as FLEX in Phase 2 if needed
  dppBonusValue: number;          // Static DPP bonus (default: 3.0)
  flexEnabled: boolean;           // Whether FLEX slot adds extra value
}

/** A single draft pick for history/undo */
export interface DraftPick {
  playerId: string;
  playerName: string;
  position: string;
  teamNumber: number;            // 1-6
  overallPick: number;           // 1, 2, 3...
  timestamp: number;
}

/** Draft state managed by Zustand */
export interface DraftState {
  players: Player[];
  draftPicks: DraftPick[];
  myTeamNumber: number;          // Which team is "yours" (1-6)
  currentOverallPick: number;
  // Actions
  loadPlayers: (players: Player[]) => void;
  draftPlayer: (playerId: string, teamNumber: number) => void;
  undraftPlayer: (playerId: string) => void;
  undoLastPick: () => void;
  resetDraft: () => void;
}
```

---

## VORP Calculation (Corrected Algorithm)

The key fix from Grok's buggy version: for DPP players, calculate VORP at
**each** eligible position and use the **maximum**. This prevents the
overwrite bug.

```typescript
// src/lib/vorp.ts

export function calculateVorp(
  players: Player[],
  settings: LeagueSettings
): PlayerWithMetrics[] {
  const available = players.filter(p => !p.isDrafted);

  // Step 1: Calculate replacement level for each position
  // Replacement level = projected score of the LAST rostered player
  // "Rostered" = starters + emergencies across all teams
  const replacementLevels: Record<Position, number> = {
    DEF: 0, MID: 0, RUC: 0, FWD: 0
  };

  for (const pos of ["DEF", "MID", "RUC", "FWD"] as Position[]) {
    const starters = settings.starters[pos];
    const emerg = settings.emergencies[pos];
    const totalRostered = (starters + emerg) * settings.numTeams;

    // Get ALL players eligible at this position (including DPP)
    // sorted by projected score descending
    const eligible = available
      .filter(p => p.positions.includes(pos))
      .sort((a, b) => b.projScore - a.projScore);

    // Replacement level is the score of the last rostered player
    if (eligible.length >= totalRostered) {
      replacementLevels[pos] = eligible[totalRostered - 1].projScore;
    } else {
      // If fewer players than roster spots, replacement level is 0
      replacementLevels[pos] = 0;
    }
  }

  // Step 2: Calculate VORP for each player
  return players.map(player => {
    const vorpByPosition: Partial<Record<Position, number>> = {};

    // Calculate VORP at EACH eligible position (the DPP fix!)
    for (const pos of player.positions) {
      vorpByPosition[pos] = player.projScore - replacementLevels[pos];
    }

    // Best VORP = maximum across all eligible positions
    let bestVorp = -Infinity;
    let bestPos: Position = player.positions[0];
    for (const [pos, vorp] of Object.entries(vorpByPosition)) {
      if (vorp > bestVorp) {
        bestVorp = vorp;
        bestPos = pos as Position;
      }
    }

    // DPP bonus: static bonus for players with 2+ positions
    const dppBonus = player.positions.length > 1
      ? settings.dppBonusValue
      : 0;

    const finalValue = bestVorp + dppBonus;

    return {
      ...player,
      vpiByPosition: vorpByPosition as Record<Position, number>,
      vorp: bestVorp,
      bestVorpPosition: bestPos,
      dppBonus,
      finalValue,
      valueOverAdp: player.adp
        ? player.adp - /* rank by finalValue */ 0  // computed separately
        : null,
    };
  });
}

// Why this is correct for 6-team leagues:
//
// With 6 teams and your roster (6 DEF starters + 1 DEF emerg = 7 per team):
//   DEF replacement level = 42nd best DEF (7 × 6)
//   MID replacement level = 36th best MID (6 × 6)
//   FWD replacement level = 42nd best FWD (7 × 6)
//   RUC replacement level = 12th best RUC (2 × 6)
//
// A DEF/MID DPP player gets TWO VORP scores:
//   - VORP_DEF = projScore - replacementLevel_DEF
//   - VORP_MID = projScore - replacementLevel_MID
//   Their VORP = max(VORP_DEF, VORP_MID)
//   Their finalValue = VORP + 3.0 (DPP bonus)
//
// This means DPP players in a 6-team league are EXTREMELY valuable
// because they can fill the scarcer position AND get a bonus.
```

---

## State Management (Zustand)

### Draft Store (`src/stores/draft-store.ts`)

```typescript
// Simplified structure - full implementation in code

interface DraftStore {
  // Data
  players: Player[];
  draftHistory: DraftPick[];
  currentPick: number;
  myTeam: number; // 1-6

  // Actions
  loadPlayers: (csv: File) => void;
  draftPlayer: (playerId: string, team: number) => void;
  undoLastPick: () => void;
  undoLastN: (n: number) => void;  // Undo last N picks
  returnPlayer: (playerId: string) => void;  // Undraft specific player
  resetDraft: () => void;

  // Computed (via selectors)
  // - availablePlayers (not drafted)
  // - myTeamPlayers (drafted by my team)
  // - recentPicks (last 10 picks)
  // - playersByBye (available grouped by bye round)
}
```

**Persistence**: Draft state saved to `localStorage` on every change.
On page load, restore from localStorage if available. This means you
can close the browser and come back without losing your draft.

**Undo**: The `draftHistory` array acts as an event log. Undo simply
pops the last entry and marks the player as undrafted. Supports
undoing the last N picks (Grok mentioned 5, we'll support any number).

### Settings Store (`src/stores/settings-store.ts`)

League settings also persisted to localStorage. Defaults to the user's
6-team configuration.

---

## Component Architecture

### Main Layout

```
┌──────────────────────────────────────────────────────┐
│  App Header (title, CSV upload button, reset button) │
├──────────────┬───────────────────────────────────────┤
│              │                                       │
│   Settings   │   Tab Content Area                    │
│   Sidebar    │                                       │
│              │   [Draft Board] [My Team] [Bye]       │
│  - Teams     │   [Recent Picks] [Smokies] [Sync]     │
│  - Starters  │                                       │
│  - Emerg     │   ┌─────────────────────────────────┐ │
│  - Bench     │   │                                 │ │
│  - DPP bonus │   │  Main content area              │ │
│              │   │  (table, team list, chart, etc.) │ │
│              │   │                                 │ │
│              │   │                                 │ │
│              │   └─────────────────────────────────┘ │
│              │                                       │
├──────────────┴───────────────────────────────────────┤
│  Status Bar (# available, # drafted, last action)    │
└──────────────────────────────────────────────────────┘
```

### Tab Breakdown

1. **Draft Board** (default tab)
   - TanStack Table with columns: Name, Pos, Club, Proj, PS.26, Bye, VORP,
     Final Value, Smart Rank, Category, Notes
   - VORP heatmap: bg-gradient on value columns (green=high, red=low)
   - Tier break lines: horizontal rules when value drops >8 pts between rows
   - Position filter chips (ALL / DEF / MID / FWD / RUC / DPP)
   - Search box (filter by name)
   - Sort toggle: "Classic VORP" vs "Smart Rank" (default: Final Value desc)
   - Click row → "Draft to Team X" action
   - Smoky filter toggle (show only smokies)

2. **My Team**
   - Players grouped by position (DEF, MID, FWD, RUC)
   - Shows starters vs emergencies vs bench
   - Roster completion status (e.g. "DEF: 4/6 starters")
   - Total projected score

3. **Bye Planner**
   - Bar chart showing available players by bye round
   - Table of your team grouped by bye round
   - Highlights rounds where you're thin

4. **Recent Picks**
   - Last 20 draft picks (any team)
   - "Return Player" button on each
   - "Undo Last Pick" button

5. **Smokies** (optional tab)
   - Filtered view of smoky-tagged players
   - Dynamic strategy alerts based on remaining pool, e.g.:
     "Top 3 DEF premiums gone → next best DEF Smoky: Sam Flanders (finalValue 112.4) — midfield minutes rising"
   - Position-specific alerts update live as players are drafted

6. **Live Sync** (stretch goal)
   - League ID + X-SID input
   - Connection status indicator
   - Sync log

---

## CSV Format

### Expected columns (flexible matching):

| CSV Column | Maps To | Required? |
|---|---|---|
| `name` or `player_name` | `name` | Yes |
| `pos` or `position` or `positions` | `positions` | Yes |
| `club` or `team` | `club` | Yes |
| `proj` or `proj_score` or `projection` | `projScore` | Yes |
| `ps26` or `preseason` or `preseason_score` | `preseason26` | No |
| `bye` or `bye_round` | `bye` | Yes |
| `age` | `age` | No |
| `games25` or `games_2025` | `games2025` | No |
| `player_id` or `id` | `id` | No (auto-generated) |
| `category` | `category` | No |
| `smoky_note` or `notes` | Various | No |
| `adp` | `adp` | No |

The parser should be lenient with column names (case-insensitive, trim
whitespace, support multiple aliases).

### Draft State Export/Import

Full draft state can be exported as a single JSON file (players + draftHistory +
settings) via "Download Draft" button in the header. "Upload Draft" restores
from the same JSON blob. This replaces cloud accounts for cross-device
portability — works 100% offline with no privacy concerns.

### Sample CSV structure:

```csv
name,pos,club,proj_score,ps26,bye,age,games25,category,smoky_note,player_id
Marcus Bontempelli,MID,WBD,118.5,122,12,29,22,premium,,10001
Caleb Serong,MID,FRE,112.0,108,14,24,22,premium,,10002
Sam Flanders,DEF/MID,GCS,95.2,102,8,23,22,smoky,Midfield minutes rising,10003
```

---

## Implementation Order

### Phase 1: Foundation (Day 1)
1. Initialize Next.js project with TypeScript + Tailwind + shadcn/ui
2. Set up project structure (folders, files)
3. Define TypeScript types (`src/types/index.ts`)
4. Implement CSV parser (`src/lib/csv-parser.ts`)
5. Implement VORP engine (`src/lib/vorp.ts`)
6. Create sample CSV data file
7. Set up Zustand stores (draft + settings)

### Phase 2: Core UI (Day 1-2)
8. Build app layout (header, sidebar, tabs)
9. Build league settings sidebar
10. Build draft board table with TanStack Table
11. Implement column sorting + position filtering + search
12. Add "Draft Player" action (click → draft to team)
13. Wire up VORP recalculation on draft/undraft (memoized)
14. Add Smart Rank toggle (Classic VORP vs Smart Rank sort)

### Phase 3: Draft Features (Day 2)
15. Build My Team panel with position grouping
16. Build Recent Picks panel with undo
17. Build Bye Planner with chart
18. Implement localStorage persistence
19. CSV upload UI component

### Phase 4: Polish (Day 3)
20. Smokies filter and tab with intelligence alerts
21. VORP heatmap cells (bg-gradient by value)
22. Tier break lines (horizontal rules on big value drops)
23. Dark mode toggle
24. CSV export (current team + remaining pool)
25. Draft state JSON export/import (Download Draft / Upload Draft)
26. PWA manifest + service worker (installable, offline draft night)
27. Keyboard shortcuts (quick draft, undo)
28. Error handling and edge cases

### Phase 5: Stretch Goals
29. Live sync with AFL Fantasy (if API endpoint discovered)
30. ADP comparison column

---

## Key Design Decisions

1. **All client-side**: No server, no database. Everything runs in the browser.
   The Next.js "server" is only for serving static files. This means zero
   hosting cost and no privacy concerns with X-SID cookies.

2. **VORP recalculates on every draft action**: When a player is drafted, the
   replacement levels shift (fewer players in pool → replacement level drops →
   remaining players' VORP increases). This is the "live VORP refresh" the
   original tool does.

3. **DPP handling**: Players with multiple positions (e.g. DEF/MID) get VORP
   calculated at each position, and the maximum is used. The DPP bonus is
   additive and static (configurable, default 3.0 points).

4. **No user accounts**: Single-user tool. If you want to track which team
   drafted which player, you just click "Draft to Team 1", "Draft to Team 2",
   etc. Your team is set via a "I am Team X (1-6)" dropdown in settings,
   so clicking "Draft" auto-assigns to you (with your team highlighted).

5. **CSV is the single source of truth**: All player data comes from CSV upload.
   No API calls to external services for player data. This makes the tool
   100% offline-capable for the core functionality.

6. **Sample data source**: The official 2026 Ultimate Spreadsheet can be
   downloaded from AFL.com.au, then user adds `projScore`, `preseason26`,
   `category`, and `smokyNote` columns, and saves as CSV.

7. **Installable PWA**: Manifest + service worker so you can install it on
   your phone for draft night. Works 100% offline once loaded — no network
   needed during the live draft.

8. **Smart Rank is transparent**: Unlike SmartDraftBoard's opaque composite
   score, our weights are visible and configurable:
   `smartRank = finalValue × 0.7 + positionalScarcity × 0.2 + byeValue × 0.1`.
   Toggleable — you can always switch back to classic VORP sort.
