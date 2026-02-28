# AFL Fantasy Draft Tool 2026

A VORP-based draft assistant purpose-built for **6-team AFL Fantasy Draft leagues**. Runs entirely in your browser — no accounts, no servers, no data leaves your machine.

## Features

**Draft Engine**
- VORP (Value Over Replacement Player) with exact roster math: 6 DEF / 5 MID / 6 FWD / 1 RUC starters + 4 emergencies + 6 bench
- DPP handling: calculates VORP at each eligible position and uses the **maximum** (no overwrite bug)
- Configurable DPP bonus (default 3.0)
- Replacement levels recalculate after every pick

**Smart Rank**
- Transparent composite score: `VORP × 0.7 + positional scarcity × 0.2 + bye value × 0.1`
- All weights visible and tuneable in settings
- Toggle between Classic VORP and Smart Rank sorting

**Draft Intelligence**
- Top 5 recommendations with human-readable reasons
- Positional scarcity bars with urgency levels (low / medium / high / critical)
- Position run detection — alerts when 3+ of the same position drafted in the last 5 picks
- Pick countdown — how many picks until your turn + projected positional attrition
- VONA (Value Over Next Available) — highlights players you can't afford to skip

**Smokies System**
- Tag players as premium / value / smoky / rookie / depth in your CSV
- Dedicated Smokies tab with notes and dynamic alerts
- "DEF premiums almost gone — consider Sam Flanders (midfield minutes rising)"

**Draft Management**
- Draft any player to any team (1–6) via modal
- Full undo: undo last pick, undo last N, return any specific player
- Recent picks log with team attribution
- JSON export/import — save and restore your entire draft state across devices

**Bye Planner**
- Available players grouped by bye round (R12, R13, R14)
- Your team's bye distribution with thin/heavy warnings

**My Team**
- Players grouped by position with starter / emergency / bench slots
- Roster completion tracking (e.g. "DEF: 4/6 starters, 0/1 emerg")
- Projected averages and bye distribution

**Other**
- 100% client-side — works offline once loaded
- PWA installable — add to home screen for draft night
- localStorage persistence — close browser, come back, draft is still there
- Dark mode support
- TanStack Table with sorting, filtering, search

## How It Compares

| Feature | Original Shiny Tool | SmartDraftBoard | This Tool |
|---|---|---|---|
| Exact 6-team roster math | Yes | Generic | **Yes + configurable** |
| Smart Rank transparency | No | Opaque | **Fully transparent** |
| DPP handling | Static bonus | Best single pos | **max() + bonus** |
| Undo history | Last 5 | None | **Undo any N + return** |
| State export | None | CSV only | **Full JSON blob** |
| Position run alerts | No | Basic | **Yes** |
| VONA | No | No | **Yes** |
| Pick countdown | No | No | **Yes** |
| Offline / PWA | No | No | **Yes** |
| Open source | No | No | **Yes** |

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm

### Install and Run

```bash
git clone https://github.com/melon-hub/AFL-Fantasy-Tool.git
cd AFL-Fantasy-Tool
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Load Data

**Option 1: Sample data** — click "Load Sample Data (30 players)" on the upload screen.

**Option 2: Your own CSV** — drag and drop a CSV file with these columns:

| Column | Required | Aliases |
|---|---|---|
| `name` | Yes | `player_name`, `player`, `full_name` |
| `pos` | Yes | `position`, `positions` |
| `club` | Yes | `team`, `squad` |
| `proj_score` | Yes | `proj`, `projection`, `projected`, `avg` |
| `bye` | Yes | `bye_round` |
| `ps26` | No | `preseason`, `preseason_score` |
| `age` | No | — |
| `games25` | No | `games_2025`, `games`, `gms` |
| `category` | No | `cat`, `tier` |
| `smoky_note` | No | `smoky`, `smoky_reason` |
| `adp` | No | `average_draft_position` |
| `player_id` | No | `id` (auto-generated if missing) |
| `notes` | No | `note`, `comment` |

Column matching is case-insensitive and whitespace-trimmed.

### CSV Data Source

1. Download the **2026 AFL Fantasy Ultimate Spreadsheet** from AFL.com.au
2. Add your own `proj_score` column (your projected season average)
3. Optionally add `category`, `smoky_note`, and `adp` columns
4. Save as CSV and upload

## Tech Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS v4**
- **TanStack Table v8** — sorting, filtering, virtualisation-ready
- **Zustand** — state management with localStorage persistence
- **Papa Parse** — CSV parsing
- **Lucide React** — icons

## Project Structure

```
src/
  app/
    page.tsx            # Main app (CSV upload → draft board)
    layout.tsx          # Root layout with PWA metadata
  components/
    draft-board.tsx     # TanStack Table with heatmap + tier breaks
    intelligence-panel.tsx  # Recommendations, scarcity, runs, countdown
    my-team-panel.tsx   # Roster grouped by position
    bye-planner.tsx     # Bye round analysis
    recent-picks.tsx    # Pick history with undo
    smokies-panel.tsx   # Smoky alerts and strategy
    settings-sidebar.tsx    # League config + export/import
    draft-modal.tsx     # Team selector for drafting
    csv-upload.tsx      # Drag-and-drop CSV upload
  lib/
    vorp.ts             # VORP engine, Smart Rank, VONA, runs, countdown
    csv-parser.ts       # Flexible CSV → Player[] parser
    constants.ts        # Positions, defaults, colours
  stores/
    draft-store.ts      # Draft state + JSON export/import
    settings-store.ts   # League settings
    ui-store.ts         # Tab, filters, search, sidebar state
  types/
    index.ts            # All TypeScript interfaces
```

## License

Personal use. Not affiliated with AFL or AFL Fantasy.
