# UI Implementation Plan

## Current State
- **Complete**: Types, VORP engine (with VONA, position runs, pick countdown), CSV parser, draft store, settings store, constants, sample data
- **Missing**: All UI components, ui-store, shadcn/ui setup, the actual page.tsx wiring

## Dependencies to Add
- `shadcn/ui` init (adds Radix primitives, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`)
- No other new deps needed — `@tanstack/react-table` and `recharts` already in package.json

## Implementation Steps (7 files to create/modify)

### Step 1: shadcn/ui Init + Base Components
- Run `npx shadcn@latest init` to set up the component system
- Add needed components: `button`, `badge`, `card`, `tabs`, `input`, `select`, `separator`, `tooltip`, `dialog`, `slider`, `switch`, `sheet`
- This creates `src/components/ui/` with all the primitives

### Step 2: UI Store (`src/stores/ui-store.ts`)
- Active tab: "board" | "team" | "bye" | "picks" | "smokies"
- Position filter: "ALL" | Position
- Search query string
- Sort mode: "vorp" | "smartRank"
- Show drafted players toggle
- Sidebar open/closed

### Step 3: CSV Upload Component (`src/components/csv-upload.tsx`)
- File input with drag-and-drop
- Calls `parseCsv()` → `loadPlayers()`
- Shows error messages from parser
- "Load Sample Data" button that fetches from `/sample-data/players-2026-sample.csv`

### Step 4: Draft Board (`src/components/draft-board.tsx`)
- TanStack Table with columns:
  - Rank (#), Name, Pos (badge), Club, Proj, VORP, Final Value, Smart Rank, VONA, Category (badge), Bye, ADP, Notes
- VORP heatmap: bg-gradient on value columns (green→red via Tailwind)
- Tier break lines: insert a visual separator row when finalValue drops >8 between adjacent players
- Position filter chips (ALL / DEF / MID / FWD / RUC / DPP-only)
- Search input (filter by name/club)
- Sort toggle: Classic VORP vs Smart Rank
- "Show drafted" toggle (grey out drafted, hide by default)
- Click row → draft modal: "Draft [Name] to Team [1-6]" with team buttons
- Column sorting on all numeric columns

### Step 5: Intelligence Panel (`src/components/intelligence-panel.tsx`)
- Sits below/beside the draft board
- **Recommendations**: Top 5 picks from `generateRecommendations()` with reasons
- **Position Scarcity**: 4 bars (DEF/MID/FWD/RUC) showing depletion % with urgency colors
- **Position Run Alerts**: From `detectPositionRuns()`
- **Pick Countdown**: From `calculatePickCountdown()` — "X picks until your turn", projected losses per position
- **VONA highlights**: Players with VONA > 10 flagged as "don't skip"

### Step 6: My Team Panel (`src/components/my-team-panel.tsx`)
- Players grouped by position (DEF, MID, FWD, RUC)
- Starters vs emergency slots shown with fill indicators (e.g. "DEF: 4/6 starters, 0/1 emerg")
- Total projected score for the team
- Bye distribution mini-chart (which rounds are heavy/light)

### Step 7: Sidebar + Settings (`src/components/settings-sidebar.tsx`)
- League settings form: numTeams, starters per position, emergencies, bench, DPP bonus
- "My Team Number" selector (1-6)
- Smart Rank weight sliders (VORP weight, scarcity weight, bye weight)
- Reset to defaults button
- Export/Import draft state buttons (JSON download/upload)

### Step 8: Recent Picks (`src/components/recent-picks.tsx`)
- Last 20 draft picks, newest first
- Shows: pick #, player name, position badge, team #
- "Undo Last Pick" button
- "Undo Last N" with input
- "Return Player" button on each pick (undrafts that specific player)

### Step 9: Bye Planner (`src/components/bye-planner.tsx`)
- Recharts bar chart: available players by bye round (R12, R13, R14)
- My team's players grouped by bye round
- Highlights rounds where team is thin

### Step 10: Smokies Tab (`src/components/smokies-panel.tsx`)
- Filtered view: only players with category="smoky"
- Each card shows: name, positions, projScore, VORP, smokyNote
- Dynamic alerts: "Top DEF premiums 80% gone → consider [smoky name]"

### Step 11: App Layout + Page Assembly (`src/app/page.tsx`)
- Header bar: title, CSV upload button, reset button, export/import
- Left sidebar: settings (collapsible)
- Main area: tab navigation + content
- Bottom status bar: "X available | Y drafted | Pick #Z"
- Wire everything together:
  - On load: check localStorage for existing draft, show CSV upload if empty
  - On draft/undraft: recalculate VORP via `calculateVorp()` (memoized with `useMemo`)
  - Tab switching via ui-store

### Step 12: Styling Polish
- VORP heatmap cells (green-to-red gradient based on value)
- Tier break lines in draft board
- Position badge colors (DEF=blue, MID=green, RUC=purple, FWD=red)
- Category badge colors (already defined in constants)
- Dark mode support (already have CSS vars)
- Responsive: sidebar collapses on narrow screens

## File Creation Order
1. `shadcn init` + UI primitives
2. `src/stores/ui-store.ts`
3. `src/components/csv-upload.tsx`
4. `src/components/draft-board.tsx` (largest file — TanStack Table)
5. `src/components/intelligence-panel.tsx`
6. `src/components/my-team-panel.tsx`
7. `src/components/settings-sidebar.tsx`
8. `src/components/recent-picks.tsx`
9. `src/components/bye-planner.tsx`
10. `src/components/smokies-panel.tsx`
11. `src/app/page.tsx` (main assembly)
12. Styling polish pass

## Commits
- Commit after shadcn init + ui-store
- Commit after draft board + intelligence panel (core UX)
- Commit after remaining panels (team, picks, bye, smokies)
- Commit after page assembly + polish
- Push after each commit
