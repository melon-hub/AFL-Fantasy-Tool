"use client";

import { useRef, useState, useEffect } from "react";
import {
  Settings,
  Download,
  Upload,
  RotateCcw,
  X,
  Radio,
  Zap,
  ZapOff,
  FlaskConical,
} from "lucide-react";
import clsx from "clsx";
import type { DraftPhase } from "@/types";
import { POSITIONS } from "@/lib/constants";
import { parseCsv, readFileAsText } from "@/lib/csv-parser";
import { useSettingsStore } from "@/stores/settings-store";
import { useDraftStore, type DraftExport } from "@/stores/draft-store";
import { useUiStore } from "@/stores/ui-store";
import { useLiveSync } from "@/hooks/use-live-sync";

// Bookmarklet source — reads X-SID + league ID from the AFL Fantasy page
// and POSTs them to your local draft tool.
const BOOKMARKLET_CODE = `javascript:(function(){var c=document.cookie.split(';'),x='';for(var i=0;i<c.length;i++){var t=c[i].trim();if(t.indexOf('X-SID=')===0){x=t.substring(6);break}}var m=window.location.href.match(/leagues?\\/(\\d+)/),l=m?m[1]:'';if(!x||!l){alert('Open your AFL Fantasy draft page first');return}var targets=['http://localhost:3000','http://127.0.0.1:3000'];var body=JSON.stringify({leagueId:l,xSid:x});function send(idx){if(idx>=targets.length){alert('Failed to connect to your draft tool. Is it running on localhost:3000 or 127.0.0.1:3000?');return}fetch(targets[idx]+'/api/live-sync/connect',{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:body}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(function(){alert('Connected! League '+l+' — return to your draft tool')}).catch(function(){send(idx+1)})}send(0)})();`;

// Console helper: paste into DevTools Console on the AFL draft page.
const CONSOLE_CONNECT_CODE = `(function(){var c=document.cookie.split(';'),x='';for(var i=0;i<c.length;i++){var t=c[i].trim();if(t.indexOf('X-SID=')===0){x=t.substring(6);break}}var m=window.location.href.match(/leagues?\\/(\\d+)/),l=m?m[1]:'';if(!x||!l){alert('Open your AFL Fantasy draft page first');return}var targets=['http://localhost:3000','http://127.0.0.1:3000'];var body=JSON.stringify({leagueId:l,xSid:x});function send(idx){if(idx>=targets.length){alert('Failed to connect to your draft tool. Is it running on localhost:3000 or 127.0.0.1:3000?');return}fetch(targets[idx]+'/api/live-sync/connect',{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:body}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(function(){alert('Connected! League '+l+' — return to your draft tool')}).catch(function(){send(idx+1)})}send(0)})();`;

const LIVE_SYNC_LEAGUE_ID_KEY = "afl-live-sync-league-id";
const LIVE_SYNC_XSID_KEY = "afl-live-sync-xsid";

const PHASES: { key: DraftPhase; label: string }[] = [
  { key: "early", label: "Early" },
  { key: "mid", label: "Mid" },
  { key: "late", label: "Late" },
];

export function SettingsSidebar() {
  const settings = useSettingsStore();
  const { exportState, importState, resetDraft, loadPlayers, players } =
    useDraftStore();
  const { sidebarOpen, setSidebarOpen } = useUiStore();
  const importRef = useRef<HTMLInputElement>(null);
  const importCsvRef = useRef<HTMLInputElement>(null);

  // Live sync
  const sync = useLiveSync();
  const [leagueId, setLeagueId] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(LIVE_SYNC_LEAGUE_ID_KEY) ?? "";
  });
  const [xSid, setXSid] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(LIVE_SYNC_XSID_KEY) ?? "";
  });
  const [showXSid, setShowXSid] = useState(false);
  const [bookmarkletCopied, setBookmarkletCopied] = useState(false);
  const [consoleCopied, setConsoleCopied] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());

  // Persist credentials to localStorage.
  useEffect(() => {
    if (leagueId.trim()) {
      localStorage.setItem(LIVE_SYNC_LEAGUE_ID_KEY, leagueId.trim());
    } else {
      localStorage.removeItem(LIVE_SYNC_LEAGUE_ID_KEY);
    }

    if (xSid.trim()) {
      localStorage.setItem(LIVE_SYNC_XSID_KEY, xSid.trim());
    } else {
      localStorage.removeItem(LIVE_SYNC_XSID_KEY);
    }
  }, [leagueId, xSid]);

  // Poll for bookmarklet connection every 3s when not connected
  useEffect(() => {
    if (sync.isActive || leagueId) return;
    const interval = setInterval(async () => {
      const result = await sync.checkBookmarklet();
      if (result.connected && result.leagueId) {
        setLeagueId(result.leagueId);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [sync, leagueId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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

  const handleImportCsv = async (file: File) => {
    try {
      const text = await readFileAsText(file);
      const result = parseCsv(text);

      if (result.players.length === 0) {
        const reason =
          result.errors.length > 0
            ? `\n\n${result.errors.slice(0, 5).join("\n")}`
            : "";
        alert(`Could not load CSV.${reason}`);
        return;
      }

      const confirmed = confirm(
        `Replace player data with ${result.players.length} players?\n\nThis resets all picks in the current draft.`
      );
      if (!confirmed) return;

      loadPlayers(result.players);

      if (result.errors.length > 0) {
        alert(
          `Loaded ${result.players.length} players with ${result.errors.length} parser warning(s).`
        );
      }
    } catch {
      alert("Failed to read CSV file.");
    }
  };

  const handleCopyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(BOOKMARKLET_CODE);
      setBookmarkletCopied(true);
      setTimeout(() => setBookmarkletCopied(false), 2000);
    } catch {
      window.prompt("Copy this bookmark URL:", BOOKMARKLET_CODE);
    }
  };

  const handleCopyConsoleHelper = async () => {
    try {
      await navigator.clipboard.writeText(CONSOLE_CONNECT_CODE);
      setConsoleCopied(true);
      setTimeout(() => setConsoleCopied(false), 2000);
    } catch {
      window.prompt("Copy this Console script:", CONSOLE_CONNECT_CODE);
    }
  };

  const handleLeagueInput = (value: string) => {
    const trimmed = value.trim();
    const match = trimmed.match(/leagues?\/(\d+)/);
    setLeagueId(match?.[1] ?? value);
  };

  const handleClearSavedCredentials = () => {
    setLeagueId("");
    setXSid("");
    localStorage.removeItem(LIVE_SYNC_LEAGUE_ID_KEY);
    localStorage.removeItem(LIVE_SYNC_XSID_KEY);
  };

  const handleSyncToggle = () => {
    if (sync.isActive) {
      sync.stopPolling();
    } else {
      sync.startPolling(leagueId || undefined, xSid || undefined);
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
          {/* ── Live Sync ── */}
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <div className="mb-2 flex items-center gap-1.5">
              <Radio className="h-4 w-4 text-zinc-500" />
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Live Sync
              </span>
              {/* Status dot */}
              <span
                className={clsx(
                  "ml-auto h-2 w-2 rounded-full",
                  sync.statusColor === "green" && "bg-green-500",
                  sync.statusColor === "yellow" && "bg-yellow-500",
                  sync.statusColor === "red" && "bg-red-500",
                  sync.statusColor === "gray" && "bg-zinc-300 dark:bg-zinc-600"
                )}
              />
            </div>

            <p className="mb-2 text-[10px] text-zinc-400">
              {sync.status}
              {sync.lastSyncTime && (
                <> &middot; {Math.round((nowTs - sync.lastSyncTime) / 1000)}s ago</>
              )}
            </p>

            {/* Inputs */}
            <div className="mb-2 flex flex-col gap-1.5">
              <input
                type="text"
                placeholder="League ID (e.g. 5849)"
                value={leagueId}
                onChange={(e) => handleLeagueInput(e.target.value)}
                disabled={sync.isActive}
                className="h-7 w-full rounded border border-zinc-300 bg-white px-2 text-xs outline-none focus:border-blue-500 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800"
              />
              <div className="relative">
                <input
                  type={showXSid ? "text" : "password"}
                  placeholder="X-SID cookie"
                  value={xSid}
                  onChange={(e) => setXSid(e.target.value)}
                  disabled={sync.isActive}
                  className="h-7 w-full rounded border border-zinc-300 bg-white px-2 pr-12 text-xs outline-none focus:border-blue-500 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800"
                />
                <button
                  onClick={() => setShowXSid(!showXSid)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 hover:text-zinc-600"
                >
                  {showXSid ? "hide" : "show"}
                </button>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-1.5">
              <button
                onClick={handleSyncToggle}
                className={clsx(
                  "flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition-colors",
                  sync.isActive
                    ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                )}
              >
                {sync.isActive ? (
                  <>
                    <ZapOff className="h-3 w-3" />
                    Disconnect
                  </>
                ) : (
                  <>
                    <Zap className="h-3 w-3" />
                    Connect
                  </>
                )}
              </button>
              <button
                onClick={() =>
                  sync.testConnection(leagueId || undefined, xSid || undefined)
                }
                disabled={sync.isActive}
                className="flex items-center gap-1 rounded border border-zinc-300 px-2 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <FlaskConical className="h-3 w-3" />
                Test
              </button>
            </div>

            {/* Bookmarklet */}
            <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <p className="mb-1 text-[10px] text-zinc-400">
                Bookmarklet setup (React blocks direct javascript links):
              </p>
              <button
                onClick={handleCopyBookmarklet}
                className="inline-flex items-center rounded bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                {bookmarkletCopied ? "Copied bookmark URL" : "Copy Bookmarklet URL"}
              </button>
              <ol className="mt-1 list-decimal pl-4 text-[10px] text-zinc-400">
                <li>Create a bookmark named AFL Draft Connect.</li>
                <li>Paste the copied text into the bookmark URL field.</li>
                <li>Open your AFL draft page and click that bookmark once.</li>
              </ol>

              <p className="mb-1 mt-2 text-[10px] text-zinc-400">
                Easier option: paste one script in AFL page Console (no bookmark needed):
              </p>
              <button
                onClick={handleCopyConsoleHelper}
                className="inline-flex items-center rounded bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                {consoleCopied ? "Copied Console Script" : "Copy Console Connect Script"}
              </button>
              <ol className="mt-1 list-decimal pl-4 text-[10px] text-zinc-400">
                <li>Open AFL draft page, press F12, go to Console.</li>
                <li>Paste script, press Enter, accept popup.</li>
                <li>Return here and click Connect.</li>
              </ol>

              <button
                onClick={handleClearSavedCredentials}
                className="mt-2 text-[10px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              >
                Clear saved League ID + X-SID
              </button>
            </div>
          </div>

          {/* ── My Team ── */}
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

          {/* Pick-Now Score Controls */}
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Pick-Now Score
              </span>
              <label className="flex items-center gap-2 text-xs text-zinc-500">
                <input
                  type="checkbox"
                  checked={settings.usePickNowScore}
                  onChange={(e) => settings.setUsePickNowScore(e.target.checked)}
                />
                Enabled
              </label>
            </div>

            <div className="mb-3 rounded bg-zinc-50 p-2 dark:bg-zinc-800/60">
              <span className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                Phase Boundaries
              </span>
              <WeightSlider
                label="Early→Mid"
                value={settings.phaseBoundaries.earlyToMid}
                onChange={(v) => settings.setPhaseBoundary("earlyToMid", v)}
                step={0.01}
              />
              <WeightSlider
                label="Mid→Late"
                value={settings.phaseBoundaries.midToLate}
                onChange={(v) => settings.setPhaseBoundary("midToLate", v)}
                step={0.01}
              />
            </div>

            <div className="flex flex-col gap-2">
              {PHASES.map((phase) => (
                <div
                  key={phase.key}
                  className="rounded bg-zinc-50 p-2 dark:bg-zinc-800/60"
                >
                  <span className="mb-1 block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                    {phase.label} Weights
                  </span>
                  <WeightSlider
                    label="VONA"
                    value={settings.phaseWeights[phase.key].vona}
                    onChange={(v) =>
                      settings.setPhaseWeight(phase.key, { vona: v })
                    }
                  />
                  <WeightSlider
                    label="Value"
                    value={settings.phaseWeights[phase.key].value}
                    onChange={(v) =>
                      settings.setPhaseWeight(phase.key, { value: v })
                    }
                  />
                  <WeightSlider
                    label="Cons"
                    value={settings.phaseWeights[phase.key].consistency}
                    onChange={(v) =>
                      settings.setPhaseWeight(phase.key, { consistency: v })
                    }
                  />
                  <WeightSlider
                    label="Risk Pen"
                    value={settings.phaseWeights[phase.key].riskPenalty}
                    onChange={(v) =>
                      settings.setPhaseWeight(phase.key, { riskPenalty: v })
                    }
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() => settings.resetPickNowSettings()}
              className="mt-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Reset Pick-Now Weights
            </button>
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

      {/* Data/Export/Import/Reset */}
      <div className="flex flex-col gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <button
          onClick={() => importCsvRef.current?.click()}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <Upload className="h-3.5 w-3.5" />
          Replace Player Data (CSV)
        </button>
        <input
          ref={importCsvRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportCsv(file);
            e.target.value = "";
          }}
        />
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
  step = 0.05,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-16 text-xs text-zinc-500">{label}</label>
      <input
        type="range"
        min={0}
        max={1}
        step={step}
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
