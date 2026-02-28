"use client";

import { useState } from "react";
import { Undo2, RotateCcw, History } from "lucide-react";
import clsx from "clsx";
import type { DraftPick } from "@/types";
import { POSITION_COLORS } from "@/lib/constants";
import type { Position } from "@/types";

interface RecentPicksProps {
  draftPicks: DraftPick[];
  onUndoLast: () => void;
  onUndoLastN: (n: number) => void;
  onUndraftPlayer: (playerId: string) => void;
}

export function RecentPicks({
  draftPicks,
  onUndoLast,
  onUndoLastN,
  onUndraftPlayer,
}: RecentPicksProps) {
  const [undoCount, setUndoCount] = useState(1);

  if (draftPicks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <History className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
        <p className="text-sm text-zinc-500">No picks yet.</p>
      </div>
    );
  }

  const recent = [...draftPicks].reverse().slice(0, 20);

  return (
    <div className="flex flex-col gap-3">
      {/* Undo controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onUndoLast}
          className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
        >
          <Undo2 className="h-4 w-4" />
          Undo Last Pick
        </button>
        <div className="flex items-center gap-1">
          <span className="text-xs text-zinc-500">Undo last</span>
          <input
            type="number"
            min={1}
            max={draftPicks.length}
            value={undoCount}
            onChange={(e) =>
              setUndoCount(
                Math.max(1, Math.min(draftPicks.length, Number(e.target.value)))
              )
            }
            className="h-7 w-12 rounded border border-zinc-300 text-center text-sm dark:border-zinc-600 dark:bg-zinc-800"
          />
          <button
            onClick={() => onUndoLastN(undoCount)}
            className="flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <RotateCcw className="h-3 w-3" />
            Undo
          </button>
        </div>
        <span className="ml-auto text-xs text-zinc-400">
          {draftPicks.length} total picks
        </span>
      </div>

      {/* Pick list */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {recent.map((pick) => {
            const primaryPos = pick.position.split("/")[0] as Position;
            return (
              <div
                key={pick.overallPick}
                className="flex items-center gap-2 px-3 py-2"
              >
                <span className="w-8 text-right font-mono text-xs text-zinc-400">
                  #{pick.overallPick}
                </span>
                <span
                  className={clsx(
                    "rounded px-1.5 py-0.5 text-xs font-medium text-white",
                    POSITION_COLORS[primaryPos] || "bg-zinc-500"
                  )}
                >
                  {pick.position}
                </span>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {pick.playerName}
                </span>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {pick.teamName
                    ? `${pick.teamName} (Team ${pick.teamNumber})`
                    : `Team ${pick.teamNumber}`}
                </span>
                {pick.round != null && pick.pickInRound != null && (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    R{pick.round}.{pick.pickInRound}
                  </span>
                )}
                <button
                  onClick={() => onUndraftPlayer(pick.playerId)}
                  className="ml-auto text-xs text-zinc-400 transition-colors hover:text-red-600 dark:hover:text-red-400"
                >
                  Return
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
