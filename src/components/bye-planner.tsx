"use client";

import { useMemo } from "react";
import { Calendar } from "lucide-react";
import clsx from "clsx";
import type { PlayerWithMetrics } from "@/types";
import type { LeagueSettings } from "@/types";
import { BYE_ROUNDS, POSITION_COLORS } from "@/lib/constants";

interface ByePlannerProps {
  players: PlayerWithMetrics[];
  settings: LeagueSettings;
}

export function ByePlanner({ players, settings }: ByePlannerProps) {
  const myPlayers = useMemo(
    () =>
      players.filter(
        (p) => p.isDrafted && p.draftedBy === settings.myTeamNumber
      ),
    [players, settings.myTeamNumber]
  );

  const availableByBye = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const bye of BYE_ROUNDS) counts[bye] = 0;
    for (const p of players) {
      if (!p.isDrafted && BYE_ROUNDS.includes(p.bye as 12 | 13 | 14)) {
        counts[p.bye] = (counts[p.bye] || 0) + 1;
      }
    }
    return counts;
  }, [players]);

  const myByeGroups = useMemo(() => {
    const groups: Record<number, PlayerWithMetrics[]> = {};
    for (const bye of BYE_ROUNDS) groups[bye] = [];
    for (const p of myPlayers) {
      if (groups[p.bye]) groups[p.bye].push(p);
    }
    return groups;
  }, [myPlayers]);

  const maxAvailable = Math.max(...Object.values(availableByBye), 1);

  return (
    <div className="flex flex-col gap-4">
      {/* Available players by bye — bar chart */}
      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Calendar className="h-3.5 w-3.5" />
          Available Players by Bye Round
        </h3>
        <div className="flex flex-col gap-3">
          {BYE_ROUNDS.map((bye) => {
            const count = availableByBye[bye] || 0;
            const pct = (count / maxAvailable) * 100;
            return (
              <div key={bye} className="flex items-center gap-3">
                <span className="w-10 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  R{bye}
                </span>
                <div className="flex-1">
                  <div className="h-6 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="flex h-full items-center rounded bg-blue-500 px-2 text-xs font-medium text-white transition-all"
                      style={{ width: `${Math.max(pct, 8)}%` }}
                    >
                      {count}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* My team bye distribution */}
      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          My Team by Bye Round
        </h3>
        {myPlayers.length === 0 ? (
          <p className="text-sm text-zinc-400">No players drafted yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {BYE_ROUNDS.map((bye) => {
              const group = myByeGroups[bye] || [];
              const isThin = group.length <= 2 && myPlayers.length >= 6;
              const isHeavy = group.length >= 5;
              return (
                <div key={bye}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Round {bye}
                    </span>
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        isHeavy
                          ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                          : isThin
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      )}
                    >
                      {group.length} players
                      {isHeavy && " — heavy!"}
                      {isThin && " — thin"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {group.map((p) => (
                      <span
                        key={p.id}
                        className="flex items-center gap-1 rounded bg-zinc-50 px-2 py-0.5 text-xs dark:bg-zinc-800"
                      >
                        <span
                          className={clsx(
                            "inline-block h-2 w-2 rounded-full",
                            POSITION_COLORS[p.bestVorpPosition]
                          )}
                        />
                        {p.name}
                      </span>
                    ))}
                    {group.length === 0 && (
                      <span className="text-xs italic text-zinc-400">
                        No players
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
