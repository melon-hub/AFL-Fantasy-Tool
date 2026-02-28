"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import clsx from "clsx";
import type { LeagueSettings, PlayerWithMetrics, Position } from "@/types";
import { POSITIONS, POSITION_COLORS, POSITION_LABELS } from "@/lib/constants";

interface MyTeamPanelProps {
  players: PlayerWithMetrics[];
  settings: LeagueSettings;
}

interface FieldCoordinate {
  x: number;
  y: number;
}

interface StarterFieldSlot {
  key: string;
  position: Position;
  player: PlayerWithMetrics | null;
  coordinate: FieldCoordinate;
}

interface BenchEntry {
  player: PlayerWithMetrics;
  lineupPosition: Position;
  role: "emergency" | "bench";
}

const MID_COORDINATES: FieldCoordinate[] = [
  { x: 44, y: 40 },
  { x: 50, y: 35 },
  { x: 56, y: 40 },
  { x: 44, y: 60 },
  { x: 50, y: 65 },
  { x: 56, y: 60 },
  { x: 38, y: 50 },
  { x: 62, y: 50 },
];

const RUCK_COORDINATES: FieldCoordinate[] = [
  { x: 50, y: 50 },
  { x: 44, y: 50 },
  { x: 56, y: 50 },
];

const FIELD_TOKEN_STYLES: Record<Position, string> = {
  DEF: "border-blue-200/90 bg-blue-500/95 text-white",
  MID: "border-green-200/90 bg-green-500/95 text-white",
  RUC: "border-purple-200/90 bg-purple-500/95 text-white",
  FWD: "border-red-200/90 bg-red-500/95 text-white",
};

function spreadAcross(count: number, min: number, max: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(min + max) / 2];
  return Array.from(
    { length: count },
    (_, index) => min + ((max - min) * index) / (count - 1)
  );
}

function buildSideZoneCoordinates(
  count: number,
  startX: number,
  endX: number,
  minY: number,
  maxY: number,
  maxPerColumn: number
): FieldCoordinate[] {
  if (count <= 0) return [];
  const columnCount = Math.max(1, Math.ceil(count / maxPerColumn));
  const columnXs = Array.from({ length: columnCount }, (_, index) =>
    columnCount === 1
      ? (startX + endX) / 2
      : startX + ((endX - startX) * index) / (columnCount - 1)
  );

  const coordinates: FieldCoordinate[] = [];
  let remaining = count;
  for (let column = 0; column < columnCount; column += 1) {
    const columnsLeft = columnCount - column;
    const columnPlayerCount = Math.ceil(remaining / columnsLeft);
    const ys = spreadAcross(columnPlayerCount, minY, maxY);
    for (const y of ys) {
      coordinates.push({ x: columnXs[column], y });
    }
    remaining -= columnPlayerCount;
  }

  return coordinates;
}

function getPositionCoordinates(position: Position, count: number): FieldCoordinate[] {
  if (position === "DEF") {
    return buildSideZoneCoordinates(count, 22, 36, 24, 76, 3);
  }
  if (position === "FWD") {
    return buildSideZoneCoordinates(count, 78, 64, 24, 76, 3);
  }
  if (position === "MID") {
    const extras =
      count > MID_COORDINATES.length
        ? buildSideZoneCoordinates(count - MID_COORDINATES.length, 46, 54, 38, 62, 2)
        : [];
    return [...MID_COORDINATES, ...extras].slice(0, count);
  }

  const extras =
    count > RUCK_COORDINATES.length
      ? spreadAcross(count - RUCK_COORDINATES.length, 46, 54).map((y) => ({
          x: 50,
          y,
        }))
      : [];
  return [...RUCK_COORDINATES, ...extras].slice(0, count);
}

function getFieldLabel(name: string): string {
  const parts = name.trim().split(/\s+/);
  const surname = parts[parts.length - 1] || name;
  return surname.slice(0, 5).toUpperCase();
}

export function MyTeamPanel({ players, settings }: MyTeamPanelProps) {
  const myPlayers = useMemo(
    () =>
      players.filter(
        (p) => p.isDrafted && p.draftedBy === settings.myTeamNumber
      ),
    [players, settings.myTeamNumber]
  );

  const byPosition = useMemo(() => {
    const grouped: Record<Position, PlayerWithMetrics[]> = {
      DEF: [],
      MID: [],
      RUC: [],
      FWD: [],
    };
    for (const p of myPlayers) {
      grouped[p.bestVorpPosition].push(p);
    }
    // Sort each group by projScore descending
    for (const pos of POSITIONS) {
      grouped[pos].sort((a, b) => b.projScore - a.projScore);
    }
    return grouped;
  }, [myPlayers]);

  const lineup = useMemo(() => {
    const startersByPosition: Record<Position, PlayerWithMetrics[]> = {
      DEF: [],
      MID: [],
      RUC: [],
      FWD: [],
    };
    const benchEntries: BenchEntry[] = [];

    for (const pos of POSITIONS) {
      const group = byPosition[pos];
      const starterSlots = settings.starters[pos];
      const emergencySlots = settings.emergencies[pos];
      startersByPosition[pos] = group.slice(0, starterSlots);

      for (const player of group.slice(starterSlots, starterSlots + emergencySlots)) {
        benchEntries.push({
          player,
          lineupPosition: pos,
          role: "emergency",
        });
      }

      for (const player of group.slice(starterSlots + emergencySlots)) {
        benchEntries.push({
          player,
          lineupPosition: pos,
          role: "bench",
        });
      }
    }

    benchEntries.sort((a, b) => b.player.projScore - a.player.projScore);

    return { startersByPosition, benchEntries };
  }, [byPosition, settings.emergencies, settings.starters]);

  const fieldSlots = useMemo(() => {
    const slots: StarterFieldSlot[] = [];

    for (const pos of POSITIONS) {
      const starterCount = settings.starters[pos];
      const coordinates = getPositionCoordinates(pos, starterCount);
      const starters = lineup.startersByPosition[pos];
      for (let i = 0; i < starterCount; i += 1) {
        slots.push({
          key: `${pos}-${i}`,
          position: pos,
          player: starters[i] ?? null,
          coordinate: coordinates[i] ?? { x: 50, y: 50 },
        });
      }
    }

    return slots;
  }, [lineup.startersByPosition, settings.starters]);

  const totalProj = useMemo(
    () => myPlayers.reduce((sum, p) => sum + p.projScore, 0),
    [myPlayers]
  );

  const totalStarterSlots = useMemo(
    () => POSITIONS.reduce((sum, pos) => sum + settings.starters[pos], 0),
    [settings.starters]
  );

  const filledStarterSlots = useMemo(
    () =>
      POSITIONS.reduce(
        (sum, pos) => sum + lineup.startersByPosition[pos].length,
        0
      ),
    [lineup.startersByPosition]
  );

  // Bye distribution
  const byeDistribution = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const p of myPlayers) {
      counts[p.bye] = (counts[p.bye] || 0) + 1;
    }
    return counts;
  }, [myPlayers]);

  return (
    <div className="flex flex-col gap-4">
      {myPlayers.length === 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-100/70 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50">
          <Users className="h-4 w-4 shrink-0 text-zinc-500" />
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            No players drafted to Team {settings.myTeamNumber} yet. Field layout
            is shown with empty starter slots.
          </p>
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center gap-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
        <div>
          <p className="text-xs text-zinc-500">Team {settings.myTeamNumber}</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {myPlayers.length} players
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-zinc-500">Avg projected</p>
          <p className="font-mono text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {myPlayers.length > 0
              ? (totalProj / myPlayers.length).toFixed(1)
              : "-"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">Byes</p>
          <div className="flex gap-1">
            {Object.entries(byeDistribution).length === 0 ? (
              <span className="text-xs text-zinc-400">-</span>
            ) : (
              Object.entries(byeDistribution)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([bye, count]) => (
                  <span
                    key={bye}
                    className={clsx(
                      "rounded px-1.5 py-0.5 text-xs font-medium",
                      count >= 4
                        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                        : count >= 3
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    )}
                  >
                    R{bye}: {count}
                  </span>
                ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Field */}
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Starting Field
            </h3>
            <span className="ml-auto text-xs text-zinc-500">
              {filledStarterSlots}/{totalStarterSlots} starter slots filled
            </span>
          </div>

          <div className="relative mx-auto h-[min(52vh,420px)] w-full max-w-5xl overflow-hidden rounded-2xl border border-emerald-900/80 bg-emerald-950 shadow-inner">
            <svg
              viewBox="0 0 100 100"
              className="h-full w-full"
              role="img"
              aria-label="AFL field showing starting players"
            >
              <defs>
                <radialGradient id="afl-field-turf-horizontal" cx="50%" cy="50%" r="70%">
                  <stop offset="0%" stopColor="#2b8a3e" />
                  <stop offset="100%" stopColor="#14532d" />
                </radialGradient>
              </defs>
              <rect width="100" height="100" fill="#052e16" />
              <ellipse
                cx="50"
                cy="50"
                rx="48"
                ry="34"
                fill="url(#afl-field-turf-horizontal)"
                stroke="rgba(255,255,255,0.75)"
                strokeWidth="0.55"
              />
              <ellipse
                cx="50"
                cy="50"
                rx="39"
                ry="25"
                fill="none"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="0.3"
              />
              <line
                x1="50"
                y1="18"
                x2="50"
                y2="82"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth="0.35"
              />
              <line
                x1="12"
                y1="50"
                x2="88"
                y2="50"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="0.25"
              />
              <rect
                x="43"
                y="43"
                width="14"
                height="14"
                fill="none"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="0.35"
              />
              <circle
                cx="50"
                cy="50"
                r="9"
                fill="none"
                stroke="rgba(255,255,255,0.55)"
                strokeWidth="0.35"
              />
              <circle
                cx="50"
                cy="50"
                r="3.75"
                fill="none"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth="0.35"
              />
              <ellipse
                cx="22"
                cy="50"
                rx="12"
                ry="18"
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="0.3"
              />
              <ellipse
                cx="78"
                cy="50"
                rx="12"
                ry="18"
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="0.3"
              />
              <line
                x1="9.5"
                y1="40"
                x2="9.5"
                y2="60"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth="0.3"
              />
              <line
                x1="90.5"
                y1="40"
                x2="90.5"
                y2="60"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth="0.3"
              />
              <g fill="rgba(255,255,255,0.7)">
                <circle cx="9.5" cy="45.5" r="0.6" />
                <circle cx="9.5" cy="48.5" r="0.6" />
                <circle cx="9.5" cy="51.5" r="0.6" />
                <circle cx="9.5" cy="54.5" r="0.6" />
                <circle cx="90.5" cy="45.5" r="0.6" />
                <circle cx="90.5" cy="48.5" r="0.6" />
                <circle cx="90.5" cy="51.5" r="0.6" />
                <circle cx="90.5" cy="54.5" r="0.6" />
              </g>
            </svg>

            <div className="absolute inset-0">
              {fieldSlots.map((slot) => (
                <div
                  key={slot.key}
                  className="-translate-x-1/2 -translate-y-1/2 absolute"
                  style={{
                    left: `${slot.coordinate.x}%`,
                    top: `${slot.coordinate.y}%`,
                  }}
                >
                  {slot.player ? (
                    <div
                      className={clsx(
                        "flex h-9 w-9 items-center justify-center rounded-full border-2 text-[8px] font-bold uppercase tracking-wide shadow-md sm:h-10 sm:w-10",
                        FIELD_TOKEN_STYLES[slot.position]
                      )}
                      title={`${slot.player.name} (${slot.player.positionString})`}
                    >
                      {getFieldLabel(slot.player.name)}
                    </div>
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-white/45 bg-black/20 text-[7px] font-semibold uppercase tracking-wide text-white/70">
                      ---
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {POSITIONS.map((pos) => (
              <span
                key={pos}
                className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              >
                <span className={clsx("h-2 w-2 rounded-full", POSITION_COLORS[pos])} />
                {pos} {POSITION_LABELS[pos]}
              </span>
            ))}
          </div>
        </div>

        {/* Bench + emergencies */}
        <div className="rounded-lg border border-zinc-200 xl:flex xl:max-h-[min(52vh,420px)] xl:flex-col dark:border-zinc-700">
          <div className="flex items-center border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Bench / Emergencies
            </h3>
            <span className="ml-auto text-xs text-zinc-500">
              {lineup.benchEntries.length} players
            </span>
          </div>

          {lineup.benchEntries.length === 0 ? (
            <p className="px-3 py-3 text-xs text-zinc-500">
              {myPlayers.length === 0
                ? "No bench players yet. Draft players to populate bench and emergencies."
                : "All drafted players are currently in starting slots."}
            </p>
          ) : (
            <div className="divide-y divide-zinc-100 xl:min-h-0 xl:overflow-y-auto dark:divide-zinc-800">
              {lineup.benchEntries.map(({ player, lineupPosition, role }) => (
                <div key={player.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {player.name}
                  </span>
                  <span className="text-xs text-zinc-400">{player.club}</span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {player.positionString}
                  </span>
                  <span
                    className={clsx(
                      "rounded px-1.5 py-0.5 text-xs font-medium text-white",
                      POSITION_COLORS[lineupPosition]
                    )}
                  >
                    {lineupPosition}
                  </span>
                  {role === "emergency" && (
                    <span className="rounded bg-amber-100 px-1 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      EMG
                    </span>
                  )}
                  {role === "bench" && (
                    <span className="rounded bg-zinc-100 px-1 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      BENCH
                    </span>
                  )}
                  <span className="ml-auto font-mono text-xs text-zinc-500">
                    {player.projScore.toFixed(1)}
                  </span>
                  <span className="font-mono text-xs text-zinc-400">R{player.bye}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
