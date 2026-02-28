// src/lib/csv-parser.ts
// Lenient CSV parser that maps flexible column names to Player objects

import Papa from "papaparse";
import type { Player, Position, PlayerCategory } from "@/types";
import { CSV_COLUMN_MAPPING } from "./constants";

/**
 * Find the matching CSV header for a target field.
 * Case-insensitive, trims whitespace, supports multiple aliases.
 */
function findColumn(
  headers: string[],
  aliases: string[]
): string | null {
  const normalised = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalised.indexOf(alias.toLowerCase());
    if (idx !== -1) return headers[idx];
  }
  return null;
}

/**
 * Parse a position string like "DEF/MID" into an array of Position values.
 */
function parsePositions(raw: string): Position[] {
  const valid: Position[] = ["DEF", "MID", "RUC", "FWD"];
  return raw
    .split(/[\/,]/)
    .map((s) => s.trim().toUpperCase() as Position)
    .filter((p) => valid.includes(p));
}

/**
 * Parse a category string into a PlayerCategory, defaulting to "uncategorised".
 */
function parseCategory(raw: string | undefined): PlayerCategory {
  if (!raw) return "uncategorised";
  const lower = raw.trim().toLowerCase();
  const categories: PlayerCategory[] = [
    "premium",
    "value",
    "smoky",
    "rookie",
    "depth",
  ];
  return categories.includes(lower as PlayerCategory)
    ? (lower as PlayerCategory)
    : "uncategorised";
}

/**
 * Parse a CSV file (or string) into an array of Player objects.
 * Returns { players, errors } where errors contains any parsing issues.
 */
export function parseCsv(input: string): {
  players: Player[];
  errors: string[];
} {
  const errors: string[] = [];

  const result = Papa.parse<Record<string, string>>(input, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    errors.push(
      ...result.errors.map(
        (e) => `Row ${e.row}: ${e.message}`
      )
    );
  }

  const headers = result.meta.fields ?? [];

  // Map headers to our fields
  const colName = findColumn(headers, CSV_COLUMN_MAPPING.name);
  const colPos = findColumn(headers, CSV_COLUMN_MAPPING.positions);
  const colClub = findColumn(headers, CSV_COLUMN_MAPPING.club);
  const colProj = findColumn(headers, CSV_COLUMN_MAPPING.projScore);
  const colPs26 = findColumn(headers, CSV_COLUMN_MAPPING.preseason26);
  const colBye = findColumn(headers, CSV_COLUMN_MAPPING.bye);
  const colAge = findColumn(headers, CSV_COLUMN_MAPPING.age);
  const colGames = findColumn(headers, CSV_COLUMN_MAPPING.games2025);
  const colId = findColumn(headers, CSV_COLUMN_MAPPING.id);
  const colCat = findColumn(headers, CSV_COLUMN_MAPPING.category);
  const colSmoky = findColumn(headers, CSV_COLUMN_MAPPING.smokyNote);
  const colAdp = findColumn(headers, CSV_COLUMN_MAPPING.adp);
  const colNotes = findColumn(headers, CSV_COLUMN_MAPPING.notes);

  // Validate required columns
  if (!colName) errors.push('Required column missing: "name"');
  if (!colPos) errors.push('Required column missing: "pos" / "position"');
  if (!colClub) errors.push('Required column missing: "club" / "team"');
  if (!colProj) errors.push('Required column missing: "proj_score" / "projection"');
  if (!colBye) errors.push('Required column missing: "bye"');

  if (!colName || !colPos || !colClub || !colProj || !colBye) {
    return { players: [], errors };
  }

  const players: Player[] = [];
  let autoId = 1;

  for (const row of result.data) {
    const name = row[colName]?.trim();
    if (!name) continue;

    const positions = parsePositions(row[colPos] || "");
    if (positions.length === 0) {
      errors.push(`Skipping "${name}": invalid position "${row[colPos]}"`);
      continue;
    }

    const projScore = parseFloat(row[colProj]);
    if (isNaN(projScore)) {
      errors.push(`Skipping "${name}": invalid proj_score "${row[colProj]}"`);
      continue;
    }

    const bye = parseInt(row[colBye], 10);
    if (isNaN(bye)) {
      errors.push(`Skipping "${name}": invalid bye "${row[colBye]}"`);
      continue;
    }

    const id = colId ? row[colId]?.trim() || String(autoId++) : String(autoId++);
    const ps26 = colPs26 ? parseFloat(row[colPs26]) : NaN;
    const age = colAge ? parseInt(row[colAge], 10) : NaN;
    const games = colGames ? parseInt(row[colGames], 10) : NaN;
    const adp = colAdp ? parseFloat(row[colAdp]) : NaN;

    players.push({
      id,
      name,
      positions,
      positionString: positions.join("/"),
      club: row[colClub]?.trim() || "",
      projScore,
      preseason26: isNaN(ps26) ? null : ps26,
      bye,
      age: isNaN(age) ? null : age,
      games2025: isNaN(games) ? null : games,
      category: parseCategory(colCat ? row[colCat] : undefined),
      smokyNote: colSmoky ? row[colSmoky]?.trim() || "" : "",
      notes: colNotes ? row[colNotes]?.trim() || "" : "",
      adp: isNaN(adp) ? null : adp,
      isDrafted: false,
      draftedBy: null,
      draftOrder: null,
    });
  }

  return { players, errors };
}

/**
 * Read a File object and return its text content.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}
