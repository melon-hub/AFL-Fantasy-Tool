// src/stores/settings-store.ts
// League settings state managed by Zustand with localStorage persistence

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LeagueSettings, SmartRankWeights, Position } from "@/types";
import { DEFAULT_LEAGUE_SETTINGS } from "@/lib/constants";

interface SettingsStore extends LeagueSettings {
  // Actions
  setNumTeams: (n: number) => void;
  setStarters: (pos: Position, count: number) => void;
  setEmergencies: (pos: Position, count: number) => void;
  setBenchSize: (n: number) => void;
  setDppBonusValue: (v: number) => void;
  setMyTeamNumber: (n: number) => void;
  setSmartRankWeights: (weights: Partial<SmartRankWeights>) => void;
  resetSettings: () => void;
  getSettings: () => LeagueSettings;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_LEAGUE_SETTINGS,

      setNumTeams: (n) => set({ numTeams: n }),

      setStarters: (pos, count) =>
        set((state) => ({
          starters: { ...state.starters, [pos]: count },
        })),

      setEmergencies: (pos, count) =>
        set((state) => ({
          emergencies: { ...state.emergencies, [pos]: count },
        })),

      setBenchSize: (n) => set({ benchSize: n }),

      setDppBonusValue: (v) => set({ dppBonusValue: v }),

      setMyTeamNumber: (n) => set({ myTeamNumber: n }),

      setSmartRankWeights: (weights) =>
        set((state) => ({
          smartRankWeights: { ...state.smartRankWeights, ...weights },
        })),

      resetSettings: () => set(DEFAULT_LEAGUE_SETTINGS),

      getSettings: () => {
        const s = get();
        return {
          numTeams: s.numTeams,
          starters: s.starters,
          emergencies: s.emergencies,
          benchSize: s.benchSize,
          dppBonusValue: s.dppBonusValue,
          myTeamNumber: s.myTeamNumber,
          smartRankWeights: s.smartRankWeights,
        };
      },
    }),
    {
      name: "afl-settings-store",
    }
  )
);
