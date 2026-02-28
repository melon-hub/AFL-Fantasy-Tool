"use client";

import { useRef } from "react";
import {
  Settings,
  Download,
  Upload,
  RotateCcw,
  X,
} from "lucide-react";
import type { Position } from "@/types";
import { POSITIONS, POSITION_LABELS } from "@/lib/constants";
import { useSettingsStore } from "@/stores/settings-store";
import { useDraftStore, type DraftExport } from "@/stores/draft-store";
import { useUiStore } from "@/stores/ui-store";

export function SettingsSidebar() {
  const settings = useSettingsStore();
  const { exportState, importState, resetDraft, players } = useDraftStore();
  const { sidebarOpen, setSidebarOpen } = useUiStore();
  const importRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const data = exportState();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `afl-draft-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    const text = await file.text();
    try {
      const data: DraftExport = JSON.parse(text);
      importState(data);
    } catch {
      alert("Invalid draft file.");
    }
  };

  if (!sidebarOpen) return null;

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          <Settings className="h-4 w-4" />
          Settings
        </h2>
        <button
          onClick={() => setSidebarOpen(false)}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-5">
          {/* My Team */}
          <Field label="My Team Number">
            <select
              value={settings.myTeamNumber}
              onChange={(e) => settings.setMyTeamNumber(Number(e.target.value))}
              className="h-8 w-full rounded border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            >
              {Array.from({ length: settings.numTeams }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Team {i + 1}
                </option>
              ))}
            </select>
          </Field>

          {/* Num teams */}
          <Field label="Number of Teams">
            <input
              type="number"
              min={2}
              max={12}
              value={settings.numTeams}
              onChange={(e) => settings.setNumTeams(Number(e.target.value))}
              className="h-8 w-full rounded border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            />
          </Field>

          {/* Starters per position */}
          <div>
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Starters per Position
            </span>
            <div className="grid grid-cols-2 gap-2">
              {POSITIONS.map((pos) => (
                <div key={pos} className="flex items-center gap-1">
                  <label className="w-9 text-xs font-medium text-zinc-500">
                    {pos}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={settings.starters[pos]}
                    onChange={(e) =>
                      settings.setStarters(pos, Number(e.target.value))
                    }
                    className="h-7 w-14 rounded border border-zinc-300 text-center text-sm dark:border-zinc-600 dark:bg-zinc-800"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Emergencies per position */}
          <div>
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Emergencies per Position
            </span>
            <div className="grid grid-cols-2 gap-2">
              {POSITIONS.map((pos) => (
                <div key={pos} className="flex items-center gap-1">
                  <label className="w-9 text-xs font-medium text-zinc-500">
                    {pos}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={4}
                    value={settings.emergencies[pos]}
                    onChange={(e) =>
                      settings.setEmergencies(pos, Number(e.target.value))
                    }
                    className="h-7 w-14 rounded border border-zinc-300 text-center text-sm dark:border-zinc-600 dark:bg-zinc-800"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* DPP Bonus */}
          <Field label="DPP Bonus Value">
            <input
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={settings.dppBonusValue}
              onChange={(e) =>
                settings.setDppBonusValue(Number(e.target.value))
              }
              className="h-8 w-full rounded border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            />
          </Field>

          {/* Smart Rank Weights */}
          <div>
            <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Smart Rank Weights
            </span>
            <div className="flex flex-col gap-2">
              <WeightSlider
                label="VORP"
                value={settings.smartRankWeights.vorpWeight}
                onChange={(v) => settings.setSmartRankWeights({ vorpWeight: v })}
              />
              <WeightSlider
                label="Scarcity"
                value={settings.smartRankWeights.scarcityWeight}
                onChange={(v) =>
                  settings.setSmartRankWeights({ scarcityWeight: v })
                }
              />
              <WeightSlider
                label="Bye"
                value={settings.smartRankWeights.byeWeight}
                onChange={(v) => settings.setSmartRankWeights({ byeWeight: v })}
              />
            </div>
          </div>

          <button
            onClick={() => settings.resetSettings()}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to defaults
          </button>
        </div>
      </div>

      {/* Export/Import/Reset */}
      <div className="flex flex-col gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <button
          onClick={handleExport}
          disabled={players.length === 0}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <Download className="h-3.5 w-3.5" />
          Export Draft State
        </button>
        <button
          onClick={() => importRef.current?.click()}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <Upload className="h-3.5 w-3.5" />
          Import Draft State
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
          }}
        />
        {players.length > 0 && (
          <button
            onClick={() => {
              if (confirm("Reset entire draft? This clears all picks.")) {
                resetDraft();
              }
            }}
            className="flex items-center justify-center gap-1.5 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            <RotateCcw className="h-3 w-3" />
            Reset Draft
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  );
}

function WeightSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-16 text-xs text-zinc-500">{label}</label>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      <span className="w-8 text-right font-mono text-xs text-zinc-500">
        {value.toFixed(2)}
      </span>
    </div>
  );
}
