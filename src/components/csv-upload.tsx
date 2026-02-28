"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { parseCsv, readFileAsText } from "@/lib/csv-parser";
import { useDraftStore } from "@/stores/draft-store";

export function CsvUpload() {
  const loadPlayers = useDraftStore((s) => s.loadPlayers);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setErrors([]);
      const text = await readFileAsText(file);
      const result = parseCsv(text);
      if (result.errors.length > 0) {
        setErrors(result.errors);
      }
      if (result.players.length > 0) {
        loadPlayers(result.players);
      }
    },
    [loadPlayers]
  );

  const handleLoadSample = useCallback(async () => {
    setErrors([]);
    const res = await fetch("/sample-data/players-2026-mega.csv");
    const text = await res.text();
    const result = parseCsv(text);
    if (result.errors.length > 0) setErrors(result.errors);
    if (result.players.length > 0) loadPlayers(result.players);
  }, [loadPlayers]);

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <div
        className={`flex w-full max-w-lg cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors ${
          dragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
            : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <Upload className="h-10 w-10 text-zinc-400" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Drop your CSV here, or click to browse
        </p>
        <p className="text-xs text-zinc-400">
          Required: name, pos, club, projection (proj_score or data_projected), bye
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      <button
        onClick={handleLoadSample}
        className="flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <FileText className="h-4 w-4" />
        Load Mega Data (Full)
      </button>

      {errors.length > 0 && (
        <div className="w-full max-w-lg rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
          <div className="mb-1 flex items-center gap-1 text-sm font-medium text-amber-800 dark:text-amber-200">
            <AlertCircle className="h-4 w-4" />
            Parser warnings
          </div>
          {errors.slice(0, 5).map((e, i) => (
            <p key={i} className="text-xs text-amber-700 dark:text-amber-300">
              {e}
            </p>
          ))}
          {errors.length > 5 && (
            <p className="text-xs text-amber-600">
              ...and {errors.length - 5} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}
