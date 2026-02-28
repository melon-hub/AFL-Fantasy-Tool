// src/stores/draft-store.ts
// Main draft state managed by Zustand with localStorage persistence
// Includes JSON export/import for cross-device portability (no account needed)

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Player, DraftPick } from "@/types";

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
  draftPlayer: (playerId: string, teamNumber: number) => void;
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

      draftPlayer: (playerId, teamNumber) => {
        const { players, draftPicks, currentOverallPick } = get();
        const player = players.find((p) => p.id === playerId);
        if (!player || player.isDrafted) return;

        const pick: DraftPick = {
          playerId,
          playerName: player.name,
          position: player.positionString,
          teamNumber,
          overallPick: currentOverallPick,
          timestamp: Date.now(),
        };

        set({
          players: players.map((p) =>
            p.id === playerId
              ? {
                  ...p,
                  isDrafted: true,
                  draftedBy: teamNumber,
                  draftOrder: currentOverallPick,
                }
              : p
          ),
          draftPicks: [...draftPicks, pick],
          currentOverallPick: currentOverallPick + 1,
        });
      },

      undraftPlayer: (playerId) => {
        const { players, draftPicks } = get();

        set({
          players: players.map((p) =>
            p.id === playerId
              ? { ...p, isDrafted: false, draftedBy: null, draftOrder: null }
              : p
          ),
          draftPicks: draftPicks.filter((dp) => dp.playerId !== playerId),
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

        set((state) => ({
          players: state.players.map((p) =>
            playerIds.has(p.id)
              ? { ...p, isDrafted: false, draftedBy: null, draftOrder: null }
              : p
          ),
          draftPicks: state.draftPicks.slice(0, -n),
          currentOverallPick: state.currentOverallPick - n,
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
        set({
          players: data.players,
          draftPicks: data.draftPicks,
          currentOverallPick: data.currentOverallPick,
        });
      },
    }),
    {
      name: "afl-draft-store",
    }
  )
);
