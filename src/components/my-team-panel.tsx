"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";
import clsx from "clsx";
import type { PlayerWithMetrics, Position } from "@/types";
import type { LeagueSettings } from "@/types";
import { POSITIONS, POSITION_COLORS, POSITION_LABELS } from "@/lib/constants";

interface MyTeamPanelProps {
  players: PlayerWithMetrics[];
  settings: LeagueSettings;
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

  const totalProj = useMemo(
    () => myPlayers.reduce((sum, p) => sum + p.projScore, 0),
    [myPlayers]
  );

  // Bye distribution
  const byeDistribution = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const p of myPlayers) {
      counts[p.bye] = (counts[p.bye] || 0) + 1;
    }
    return counts;
  }, [myPlayers]);

  if (myPlayers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Users className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
        <p className="text-sm text-zinc-500">
          No players drafted to your team yet.
        </p>
        <p className="text-xs text-zinc-400">
          You are Team {settings.myTeamNumber}. Draft players from the board.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
            {Object.entries(byeDistribution)
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
              ))}
          </div>
        </div>
      </div>

      {/* Position groups */}
      {POSITIONS.map((pos) => {
        const group = byPosition[pos];
        const starterSlots = settings.starters[pos];
        const emergSlots = settings.emergencies[pos];
        const starters = group.slice(0, starterSlots);
        const emergencies = group.slice(
          starterSlots,
          starterSlots + emergSlots
        );
        const bench = group.slice(starterSlots + emergSlots);

        return (
          <div
            key={pos}
            className="rounded-lg border border-zinc-200 dark:border-zinc-700"
          >
            <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              <span
                className={clsx(
                  "rounded px-2 py-0.5 text-xs font-bold text-white",
                  POSITION_COLORS[pos]
                )}
              >
                {pos}
              </span>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {POSITION_LABELS[pos]}
              </span>
              <span className="ml-auto text-xs text-zinc-500">
                {Math.min(group.length, starterSlots)}/{starterSlots} starters
                {" · "}
                {Math.min(emergencies.length, emergSlots)}/{emergSlots} emerg
              </span>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {starters.map((p) => (
                <PlayerRow key={p.id} player={p} role="starter" />
              ))}
              {emergencies.map((p) => (
                <PlayerRow key={p.id} player={p} role="emergency" />
              ))}
              {bench.map((p) => (
                <PlayerRow key={p.id} player={p} role="bench" />
              ))}
              {group.length === 0 && (
                <p className="px-3 py-2 text-xs text-zinc-400">
                  No {POSITION_LABELS[pos].toLowerCase()}s drafted
                </p>
              )}
              {/* Empty starter slots */}
              {Array.from({
                length: Math.max(0, starterSlots - starters.length),
              }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center px-3 py-2"
                >
                  <span className="text-xs italic text-zinc-300 dark:text-zinc-600">
                    Empty starter slot
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlayerRow({
  player,
  role,
}: {
  player: PlayerWithMetrics;
  role: "starter" | "emergency" | "bench";
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {player.name}
      </span>
      <span className="text-xs text-zinc-400">{player.club}</span>
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
  );
}
