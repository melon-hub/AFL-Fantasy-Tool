// src/stores/settings-store.ts
// League settings state managed by Zustand with localStorage persistence

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  LeagueSettings,
  SmartRankWeights,
  Position,
  DraftPhase,
  PhaseWeightVector,
} from "@/types";
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
  setUsePickNowScore: (enabled: boolean) => void;
  setPhaseBoundary: (key: "earlyToMid" | "midToLate", value: number) => void;
  setPhaseWeight: (
    phase: DraftPhase,
    weights: Partial<PhaseWeightVector>
  ) => void;
  resetPickNowSettings: () => void;
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

      setUsePickNowScore: (enabled) => set({ usePickNowScore: enabled }),

      setPhaseBoundary: (key, value) =>
        set((state) => {
          const v = Math.max(0, Math.min(1, value));
          let earlyToMid =
            key === "earlyToMid" ? v : state.phaseBoundaries.earlyToMid;
          let midToLate =
            key === "midToLate" ? v : state.phaseBoundaries.midToLate;

          // Keep valid ordering with small separation.
          if (earlyToMid >= midToLate) {
            if (key === "earlyToMid") {
              midToLate = Math.min(1, earlyToMid + 0.01);
            } else {
              earlyToMid = Math.max(0, midToLate - 0.01);
            }
          }

          return {
            phaseBoundaries: { earlyToMid, midToLate },
          };
        }),

      setPhaseWeight: (phase, weights) =>
        set((state) => ({
          phaseWeights: {
            ...state.phaseWeights,
            [phase]: { ...state.phaseWeights[phase], ...weights },
          },
        })),

      resetPickNowSettings: () =>
        set({
          phaseBoundaries: DEFAULT_LEAGUE_SETTINGS.phaseBoundaries,
          phaseWeights: DEFAULT_LEAGUE_SETTINGS.phaseWeights,
          usePickNowScore: DEFAULT_LEAGUE_SETTINGS.usePickNowScore,
        }),

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
          phaseBoundaries: s.phaseBoundaries,
          phaseWeights: s.phaseWeights,
          usePickNowScore: s.usePickNowScore,
        };
      },
    }),
    {
      name: "afl-settings-store",
      merge: (persisted, current) => {
        const p = (persisted as Partial<SettingsStore>) ?? {};
        const mergedSmartRankWeights = {
          ...current.smartRankWeights,
          ...(p.smartRankWeights ?? {}),
        };

        // One-time default migration: if a persisted profile still exactly
        // matches the old default triple, apply the new lighter scarcity default.
        const persistedLooksLikeOldDefaults =
          p.smartRankWeights?.vorpWeight === 0.7 &&
          p.smartRankWeights?.scarcityWeight === 0.2 &&
          p.smartRankWeights?.byeWeight === 0.1;
        if (persistedLooksLikeOldDefaults) {
          mergedSmartRankWeights.scarcityWeight = current.smartRankWeights.scarcityWeight;
        }

        return {
          ...current,
          ...p,
          starters: { ...current.starters, ...(p.starters ?? {}) },
          emergencies: { ...current.emergencies, ...(p.emergencies ?? {}) },
          smartRankWeights: mergedSmartRankWeights,
          phaseBoundaries: {
            ...current.phaseBoundaries,
            ...(p.phaseBoundaries ?? {}),
          },
          phaseWeights: {
            early: {
              ...current.phaseWeights.early,
              ...(p.phaseWeights?.early ?? {}),
            },
            mid: {
              ...current.phaseWeights.mid,
              ...(p.phaseWeights?.mid ?? {}),
            },
            late: {
              ...current.phaseWeights.late,
              ...(p.phaseWeights?.late ?? {}),
            },
          },
        };
      },
    }
  )
);
