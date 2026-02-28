// src/stores/draft-store.ts
// Main draft state managed by Zustand with localStorage persistence

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Player, DraftPick } from "@/types";

interface DraftStore {
  // ── Data ──
  players: Player[];
  draftPicks: DraftPick[];
  currentOverallPick: number;

  // ── Actions ──
  loadPlayers: (players: Player[]) => void;
  draftPlayer: (playerId: string, teamNumber: number) => void;
  undraftPlayer: (playerId: string) => void;
  undoLastPick: () => void;
  undoLastN: (n: number) => void;
  resetDraft: () => void;
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
    }),
    {
      name: "afl-draft-store",
    }
  )
);
