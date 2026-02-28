// src/stores/draft-store.ts
// Main draft state managed by Zustand with localStorage persistence
// Includes JSON export/import for cross-device portability (no account needed)

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Player, DraftPick } from "@/types";

interface DraftPlayerOptions {
  overallPick?: number;
  teamName?: string | null;
  sourceTeamId?: string | null;
  round?: number | null;
  pickInRound?: number | null;
}

function getNextOverallPick(draftPicks: DraftPick[]): number {
  const maxOverall = draftPicks.reduce(
    (max, pick) => Math.max(max, pick.overallPick ?? 0),
    0
  );
  return Math.max(1, maxOverall + 1);
}

/** Shape of the exported JSON blob */
export interface DraftExport {
  version: 1;
  exportedAt: string;
  players: Player[];
  draftPicks: DraftPick[];
  currentOverallPick: number;
}

interface DraftStore {
  // ── Data ──
  players: Player[];
  draftPicks: DraftPick[];
  currentOverallPick: number;

  // ── Draft actions ──
  loadPlayers: (players: Player[]) => void;
  draftPlayer: (
    playerId: string,
    teamNumber: number,
    options?: DraftPlayerOptions
  ) => void;
  setCurrentOverallPick: (pick: number) => void;
  undraftPlayer: (playerId: string) => void;
  undoLastPick: () => void;
  undoLastN: (n: number) => void;
  resetDraft: () => void;

  // ── Export/Import ──
  exportState: () => DraftExport;
  importState: (data: DraftExport) => void;
}

export const useDraftStore = create<DraftStore>()(
  persist(
    (set, get) => ({
      players: [],
      draftPicks: [],
      currentOverallPick: 1,

      loadPlayers: (players) =>
        set({
          players,
          draftPicks: [],
          currentOverallPick: 1,
        }),

      draftPlayer: (playerId, teamNumber, options) => {
        const { players, draftPicks, currentOverallPick } = get();
        const player = players.find((p) => p.id === playerId);
        if (!player || player.isDrafted) return;

        const requestedOverallPick = options?.overallPick;
        const resolvedOverallPick =
          typeof requestedOverallPick === "number" &&
          Number.isFinite(requestedOverallPick) &&
          requestedOverallPick > 0
            ? Math.floor(requestedOverallPick)
            : currentOverallPick;

        const pick: DraftPick = {
          playerId,
          playerName: player.name,
          position: player.positionString,
          teamNumber,
          teamName: options?.teamName ?? null,
          sourceTeamId: options?.sourceTeamId ?? null,
          overallPick: resolvedOverallPick,
          round: options?.round ?? null,
          pickInRound: options?.pickInRound ?? null,
          timestamp: Date.now(),
        };

        set({
          players: players.map((p) =>
            p.id === playerId
              ? {
                  ...p,
                  isDrafted: true,
                  draftedBy: teamNumber,
                  draftOrder: resolvedOverallPick,
                }
              : p
          ),
          draftPicks: [...draftPicks, pick],
          currentOverallPick: Math.max(
            currentOverallPick + 1,
            resolvedOverallPick + 1
          ),
        });
      },

      setCurrentOverallPick: (pick) =>
        set(() => ({
          currentOverallPick: Math.max(1, Math.floor(pick)),
        })),

      undraftPlayer: (playerId) => {
        const { players, draftPicks } = get();
        const nextDraftPicks = draftPicks.filter((dp) => dp.playerId !== playerId);

        set({
          players: players.map((p) =>
            p.id === playerId
              ? { ...p, isDrafted: false, draftedBy: null, draftOrder: null }
              : p
          ),
          draftPicks: nextDraftPicks,
          currentOverallPick: getNextOverallPick(nextDraftPicks),
        });
      },

      undoLastPick: () => {
        const { draftPicks } = get();
        if (draftPicks.length === 0) return;

        const lastPick = draftPicks[draftPicks.length - 1];
        get().undraftPlayer(lastPick.playerId);
      },

      undoLastN: (n) => {
        const { draftPicks } = get();
        const picksToUndo = draftPicks.slice(-n);
        const playerIds = new Set(picksToUndo.map((p) => p.playerId));
        const nextDraftPicks = draftPicks.slice(0, -n);

        set((state) => ({
          players: state.players.map((p) =>
            playerIds.has(p.id)
              ? { ...p, isDrafted: false, draftedBy: null, draftOrder: null }
              : p
          ),
          draftPicks: nextDraftPicks,
          currentOverallPick: getNextOverallPick(nextDraftPicks),
        }));
      },

      resetDraft: () =>
        set((state) => ({
          players: state.players.map((p) => ({
            ...p,
            isDrafted: false,
            draftedBy: null,
            draftOrder: null,
          })),
          draftPicks: [],
          currentOverallPick: 1,
        })),

      // ── Export: serialize full draft state to a portable JSON blob ──
      exportState: () => {
        const { players, draftPicks, currentOverallPick } = get();
        return {
          version: 1 as const,
          exportedAt: new Date().toISOString(),
          players,
          draftPicks,
          currentOverallPick,
        };
      },

      // ── Import: restore draft state from a previously exported blob ──
      importState: (data) => {
        if (data.version !== 1) {
          console.error("Unsupported draft export version:", data.version);
          return;
        }
        const draftPicks = Array.isArray(data.draftPicks) ? data.draftPicks : [];
        set({
          players: data.players,
          draftPicks,
          currentOverallPick: Math.max(
            data.currentOverallPick || 1,
            getNextOverallPick(draftPicks)
          ),
        });
      },
    }),
    {
      name: "afl-draft-store",
    }
  )
);
