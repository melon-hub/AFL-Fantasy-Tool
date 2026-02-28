"use client";

import { X } from "lucide-react";
import clsx from "clsx";
import type { PlayerWithMetrics } from "@/types";
import { POSITION_COLORS } from "@/lib/constants";

interface DraftModalProps {
  player: PlayerWithMetrics;
  numTeams: number;
  myTeamNumber: number;
  onDraft: (teamNumber: number) => void;
  onClose: () => void;
}

export function DraftModal({
  player,
  numTeams,
  myTeamNumber,
  onDraft,
  onClose,
}: DraftModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Draft {player.name}
            </h3>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex gap-1">
                {player.positions.map((pos) => (
                  <span
                    key={pos}
                    className={clsx(
                      "rounded px-1.5 py-0.5 text-xs font-medium text-white",
                      POSITION_COLORS[pos]
                    )}
                  >
                    {pos}
                  </span>
                ))}
              </div>
              <span className="text-sm text-zinc-500">{player.club}</span>
              <span className="font-mono text-sm text-zinc-500">
                {player.projScore.toFixed(1)} proj
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Select a team:
        </p>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: numTeams }, (_, i) => i + 1).map((team) => (
            <button
              key={team}
              onClick={() => onDraft(team)}
              className={clsx(
                "rounded-lg py-2.5 text-sm font-semibold transition-colors",
                team === myTeamNumber
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              )}
            >
              Team {team}
              {team === myTeamNumber && (
                <span className="block text-xs font-normal opacity-80">
                  (you)
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
