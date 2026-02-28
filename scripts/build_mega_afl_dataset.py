#!/usr/bin/env python3
"""Build a consolidated AFL fantasy dataset for draft-night decision making.

This script merges:
1) rankings-afl-fantasy-2026-02-28.csv
2) AFL-Fantasy-Draft-2026-Ultimate-Spreadsheet.xlsx
3) 2026-AF-Ranks-v2-8wtts9.xlsx
4) data.csv

It writes:
- data/processed/mega-afl-dataset.csv (full context)
- data/processed/players-2026-app-upload.csv (app-upload schema + extra columns)
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import math
import re
import statistics
import zipfile
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover - optional dependency in local envs
    PdfReader = None  # type: ignore[assignment]

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DOWNLOADS = Path.home() / "Downloads"

DEFAULT_RANKINGS_CSV = DEFAULT_DOWNLOADS / "rankings-afl-fantasy-2026-02-28.csv"
DEFAULT_ULTIMATE_XLSX = DEFAULT_DOWNLOADS / "AFL-Fantasy-Draft-2026-Ultimate-Spreadsheet.xlsx"
DEFAULT_EXPERT_XLSX = DEFAULT_DOWNLOADS / "2026-AF-Ranks-v2-8wtts9.xlsx"
DEFAULT_DATA_CSV = DEFAULT_DOWNLOADS / "data.csv"
DEFAULT_DRAFT_DOCTORS_PDF = DEFAULT_DOWNLOADS / "2026-Draft-Kit-gs7zws.pdf"
DEFAULT_OFFICIAL_DRAFT_PDF = DEFAULT_DOWNLOADS / "2026-AFL-Fantasy-Draft-Kit.pdf"

DEFAULT_FULL_OUT = ROOT / "data" / "processed" / "mega-afl-dataset.csv"
DEFAULT_APP_OUT = ROOT / "data" / "processed" / "players-2026-app-upload.csv"
DEFAULT_XLSX_OUT = ROOT / "data" / "processed" / "mega-afl-dataset.xlsx"

NS_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
NS_REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
NS_PKG_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"

POS_ORDER = ["DEF", "MID", "RUC", "FWD"]
SHEET_TO_POS = {
    "Defenders": "DEF",
    "Mids": "MID",
    "Rucks": "RUC",
    "Forwards": "FWD",
}
ROSTER_SLOTS = {"DEF": 42, "MID": 36, "RUC": 12, "FWD": 42}

# Known spelling/format variants found across source files.
MANUAL_ALIASES = {
    "noahrobertsthomson": "noahrobertsthompson",
    "baileyfritsch": "bayleyfritsch",
    "cammckenzie": "cammackenzie",
    "connormcdonald": "connormacdonald",
    "conoridun": "connoridun",
    "devonrobertson": "devenrobertson",
    "elijahhewitt": "elijahhewett",
    "jasperfletcher": "jaspafletcher",
    "joshuaworrell": "joshworrell",
    "kailohman": "kailohmann",
    "kideancoleman": "keideancoleman",
    "lachieschulz": "lachieschultz",
    "mattkennedy": "matthewkennedy",
    "oliflorent": "oliverflorent",
    "olliedempsey": "oliverdempsey",
    "patlipinski": "patricklipinski",
    "rileysanders": "ryleysanders",
    "rileywest": "rhyleewest",
    "tobytravaglia": "tobietravaglia",
    "zacguthrie": "zachguthrie",
    "zacreid": "zachreid",
}


def nkey(value: str | None) -> str:
    if not value:
        return ""
    text = (
        value.lower()
        .replace("’", "'")
        .replace("`", "'")
        .replace("‘", "'")
        .replace("–", "-")
        .replace("—", "-")
    )
    return re.sub(r"[^a-z0-9]+", "", text)


def canonical_key(name: str | None) -> str:
    key = nkey(name)
    return MANUAL_ALIASES.get(key, key)


def first_last(name: str | None) -> tuple[str, str]:
    if not name:
        return "", ""
    parts = re.findall(r"[A-Za-z]+", name.lower())
    if not parts:
        return "", ""
    return parts[0], parts[-1]


def safe_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = text.replace(",", "")
    text = text.replace("%", "")
    text = text.replace("$", "")
    try:
        return float(text)
    except ValueError:
        return None


def safe_int(value: Any) -> int | None:
    num = safe_float(value)
    if num is None:
        return None
    return int(round(num))


def parse_pct(value: Any) -> float | None:
    return safe_float(value)


def parse_bye(value: Any) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    match = re.search(r"(\d+)", text)
    if not match:
        return None
    return int(match.group(1))


def normalize_position(raw: str | None) -> str:
    if not raw:
        return ""
    text = str(raw).upper().replace(" ", "")
    mapped = text
    mapped = mapped.replace("MIDFWD", "MID/FWD")
    mapped = mapped.replace("FWDMID", "FWD/MID")
    mapped = mapped.replace("DEFMID", "DEF/MID")
    mapped = mapped.replace("MIDDEF", "MID/DEF")
    mapped = mapped.replace("RUCK", "RUC")
    mapped = mapped.replace("RUCK/FWD", "RUC/FWD")
    mapped = mapped.replace("RUCKMID", "RUC/MID")
    mapped = mapped.replace("RUCMID", "RUC/MID")

    tokens: list[str] = []
    if "DEF" in mapped:
        tokens.append("DEF")
    if "MID" in mapped:
        tokens.append("MID")
    if "RUC" in mapped:
        tokens.append("RUC")
    if "FWD" in mapped:
        tokens.append("FWD")

    # Fallback for single values like "MID" or "FWD" that are already clean.
    if not tokens and mapped in POS_ORDER:
        tokens = [mapped]

    deduped: list[str] = []
    for pos in POS_ORDER:
        if pos in tokens and pos not in deduped:
            deduped.append(pos)
    return "/".join(deduped)


def position_set(pos: str) -> set[str]:
    return {p.strip() for p in pos.split("/") if p.strip()}


def parse_age_from_dob(dob: str | None, ref_date: dt.date) -> int | None:
    if not dob:
        return None
    match = re.match(r"^\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*$", str(dob))
    if not match:
        return None
    day, month, year = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
    try:
        birth = dt.date(year, month, day)
    except ValueError:
        return None
    age = ref_date.year - birth.year - ((ref_date.month, ref_date.day) < (birth.month, birth.day))
    return age


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def to_xlsx_col_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    col = 0
    for ch in letters:
        col = col * 26 + (ord(ch) - 64)
    return col - 1


def load_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    values: list[str] = []
    for si in root.findall(f"{NS_MAIN}si"):
        values.append("".join((t.text or "") for t in si.iter(f"{NS_MAIN}t")))
    return values


def workbook_sheets(zf: zipfile.ZipFile) -> list[tuple[str, str]]:
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels.findall(NS_PKG_REL)}

    sheets: list[tuple[str, str]] = []
    for sheet in wb.findall(f".//{NS_MAIN}sheet"):
        rid = sheet.attrib.get(f"{NS_REL}id")
        target = rel_map.get(rid, "")
        if target and not target.startswith("xl/"):
            target = f"xl/{target}"
        sheets.append((sheet.attrib.get("name", ""), target))
    return sheets


def read_sheet_rows(zf: zipfile.ZipFile, sheet_path: str, shared_strings: list[str]) -> list[list[str]]:
    root = ET.fromstring(zf.read(sheet_path))
    rows: list[list[str]] = []

    for row in root.findall(f".//{NS_MAIN}row"):
        cells: dict[int, str] = {}
        for cell in row.findall(f"{NS_MAIN}c"):
            ref = cell.attrib.get("r", "")
            ctype = cell.attrib.get("t")
            v = cell.find(f"{NS_MAIN}v")
            is_el = cell.find(f"{NS_MAIN}is")

            value = ""
            if ctype == "s" and v is not None and v.text is not None:
                idx = int(v.text)
                value = shared_strings[idx] if 0 <= idx < len(shared_strings) else ""
            elif ctype == "inlineStr" and is_el is not None:
                value = "".join((t.text or "") for t in is_el.iter(f"{NS_MAIN}t"))
            elif v is not None and v.text is not None:
                value = v.text

            if ref:
                cells[to_xlsx_col_index(ref)] = value

        if cells:
            row_values = [""] * (max(cells.keys()) + 1)
            for idx, value in cells.items():
                row_values[idx] = value
            rows.append(row_values)
        else:
            rows.append([])
    return rows


def load_rankings_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def load_data_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def load_ultimate_xlsx(path: Path) -> list[dict[str, str]]:
    with zipfile.ZipFile(path) as zf:
        shared = load_shared_strings(zf)
        sheet_name, sheet_path = workbook_sheets(zf)[0]
        if not sheet_path:
            raise RuntimeError(f"Unable to resolve sheet path in {path} ({sheet_name}).")
        rows = read_sheet_rows(zf, sheet_path, shared)

    if len(rows) < 4:
        return []

    sec_row = rows[1]
    col_row = rows[2]
    max_cols = max(len(sec_row), len(col_row))

    # Carry forward section labels across merged/blank cells.
    sections: list[str] = []
    current_section = ""
    for i in range(max_cols):
        sec = sec_row[i].strip() if i < len(sec_row) else ""
        if sec:
            current_section = sec
        sections.append(current_section)

    headers: list[str] = []
    seen: dict[str, int] = {}
    for i in range(max_cols):
        section = sections[i].strip()
        col = col_row[i].strip() if i < len(col_row) else ""

        base = col
        if col and section and section not in {"2025"} and section != col:
            base = f"{section}_{col}"
        if not base:
            headers.append("")
            continue

        count = seen.get(base, 0)
        seen[base] = count + 1
        headers.append(base if count == 0 else f"{base}_{count+1}")

    records: list[dict[str, str]] = []
    for row in rows[3:]:
        if not row or not row[0].strip():
            continue
        record: dict[str, str] = {}
        for i, header in enumerate(headers):
            if not header:
                continue
            record[header] = row[i] if i < len(row) else ""
        records.append(record)
    return records


def load_expert_xlsx(path: Path) -> tuple[list[dict[str, Any]], dict[str, int]]:
    entries: list[dict[str, Any]] = []
    sheet_sizes: dict[str, int] = {}

    with zipfile.ZipFile(path) as zf:
        shared = load_shared_strings(zf)
        for sheet_name, sheet_path in workbook_sheets(zf):
            if sheet_name not in SHEET_TO_POS or not sheet_path:
                continue
            rows = read_sheet_rows(zf, sheet_path, shared)
            if not rows:
                continue

            analysts = [a.strip() for a in rows[0]]
            count_rows = 0
            for row_idx, row in enumerate(rows[1:], start=1):
                has_value = False
                for col_idx, player_name in enumerate(row):
                    name = player_name.strip()
                    if not name:
                        continue
                    has_value = True
                    analyst = analysts[col_idx] if col_idx < len(analysts) and analysts[col_idx] else f"A{col_idx+1}"
                    entries.append(
                        {
                            "sheet": sheet_name,
                            "pos": SHEET_TO_POS[sheet_name],
                            "analyst": analyst,
                            "rank": row_idx,
                            "player": name,
                        }
                    )
                if has_value:
                    count_rows = row_idx
            sheet_sizes[SHEET_TO_POS[sheet_name]] = max(sheet_sizes.get(SHEET_TO_POS[sheet_name], 0), count_rows)
    return entries, sheet_sizes


def match_existing_key(
    name: str,
    club: str | None,
    records: dict[str, dict[str, Any]],
    threshold: float,
) -> str | None:
    if not records:
        return None

    raw_key = canonical_key(name)
    if raw_key in records:
        return raw_key

    first, last = first_last(name)
    if not first and not last:
        return None

    best_key = None
    best_score = -1.0
    for key, record in records.items():
        cand_name = record.get("name") or ""
        c_first, c_last = first_last(cand_name)
        if not c_last:
            continue

        key_ratio = SequenceMatcher(None, raw_key, key).ratio()
        last_ratio = SequenceMatcher(None, last, c_last).ratio() if last else 0.0
        first_ratio = SequenceMatcher(None, first, c_first).ratio() if first else 0.0
        score = 0.65 * key_ratio + 0.25 * last_ratio + 0.10 * first_ratio

        record_club = (record.get("club") or "").strip().upper()
        if club and record_club:
            club_up = club.strip().upper()
            if club_up == record_club:
                score += 0.05
            else:
                score -= 0.08

        if score > best_score:
            best_score = score
            best_key = key

    if best_key and best_score >= threshold:
        return best_key
    return None


def first_non_null(*values: Any) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return None


def summarize_note(text: str, max_len: int = 110) -> str:
    note = (text or "").strip()
    if not note:
        return ""
    sentence = re.split(r"(?<=[.!?])\s+", note)[0]
    if len(sentence) <= max_len:
        return sentence
    return sentence[: max_len - 1].rstrip() + "..."


def best_pdf_sentence(snippet: str, player_name: str) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", (snippet or "").strip())
    player_lower = player_name.lower()
    best_sentence = ""
    best_score = -999

    for sentence in sentences:
        text = sentence.strip()
        if len(text) < 28:
            continue
        lower = text.lower()
        score = 0
        if player_lower in lower:
            score += 4
        if any(term in lower for term in PDF_SEASON_OUT_TERMS):
            score += 5
        if any(term in lower for term in PDF_MIDFIELD_TERMS):
            score += 3
        if any(term in lower for term in ["injury", "return", "risk", "concerns", "opportunities"]):
            score += 2

        digit_ratio = sum(ch.isdigit() for ch in text) / max(1, len(text))
        if digit_ratio > 0.22:
            score -= 2

        if score > best_score:
            best_score = score
            best_sentence = text

    if best_sentence:
        return summarize_note(best_sentence, max_len=170)
    return summarize_note(snippet, max_len=170)


PDF_ROLE_TERMS = [
    "role",
    "half back",
    "kick in",
    "wing",
    "forward role",
    "defender role",
]
PDF_MIDFIELD_TERMS = [
    "inside mid",
    "mid time",
    "midfield role",
    "midfield minutes",
    "centre bounce",
    "cba",
    "on-ball",
]
PDF_SEASON_OUT_TERMS = [
    "miss the entirety",
    "miss the entire",
    "out for season",
    "season-ending",
    "season ending",
    "will miss the season",
    "miss the 2026 season",
]

# Manual user-curated insights / category nudges from draft prep notes.
# Keys are canonicalized player name keys.
MANUAL_PLAYER_OVERRIDES: dict[str, dict[str, str]] = {
    # Force-known guns out of smoky bucket.
    nkey("Gryan Miers"): {"category": "value"},
    nkey("Christian Petracca"): {"category": "premium"},
    # Additional smoky/watchlist ideas.
    nkey("Tom McCarthy"): {
        "category": "smoky",
        "note": "Likely to spend more midfield time this year; late draft upside if role sticks.",
    },
    nkey("Miles Bergman"): {
        "category": "smoky",
        "note": "Expected midfield-minute bump; watch role split in-season.",
    },
    nkey("Archie Roberts"): {
        "category": "smoky",
        "note": "Late-pick candidate with talk of extra midfield exposure.",
    },
    nkey("Caleb Windsor"): {
        "category": "smoky",
        "note": "Late pick with preseason midfield role indicators.",
    },
    nkey("Joel Freijah"): {
        "category": "smoky",
        "note": "Training as a midfielder in preseason and has DPP flexibility.",
    },
    nkey("James Worpel"): {
        "category": "smoky",
        "note": "Reasonable mid-late draft target with potential role security at Geelong.",
    },
    nkey("Harry Rowston"): {
        "category": "smoky",
        "note": "Late smoky if midfield opportunity opens at GWS.",
    },
    nkey("Nicholas Madden"): {
        "category": "smoky",
        "note": "Ruck watchlist: chance to open as lead ruck option.",
    },
    nkey("Dante Visentini"): {
        "category": "smoky",
        "note": "Ruck watchlist: possible first-ruck opportunity at Port.",
    },
    nkey("Lachlan McAndrew"): {
        "category": "smoky",
        "note": "Ruck depth smoky with potential early-season opportunity.",
    },
    nkey("Max Hall"): {
        "category": "smoky",
        "note": "Club-rated upside option; worth late-pick consideration.",
    },
    nkey("Connor Macdonald"): {
        "category": "smoky",
        "note": "Preseason signs of more midfield usage.",
    },
    nkey("Josh Rachele"): {
        "category": "smoky",
        "note": "Possible midfield role experimentation; late-round upside only.",
    },
    nkey("Connor Budarick"): {
        "category": "smoky",
        "note": "Back-pocket base role but preseason midfield snippets create bench upside.",
    },
    nkey("Sam Butler"): {
        "category": "smoky",
        "note": "Forward-pocket role with some midfield-minute upside.",
    },
    nkey("Mattaes Phillipou"): {
        "category": "smoky",
        "note": "Expected higher midfield minutes; monitor round-to-round role.",
    },
    nkey("Deven Robertson"): {
        "category": "smoky",
        "note": "Projected midfield-minute spike; useful late draft target.",
    },
    nkey("Todd Marshall"): {
        "category": "smoky",
        "note": "Role-switch possibility down back with kick-in exposure.",
    },
    nkey("Leo Lombard"): {
        "category": "smoky",
        "note": "Likely to get games and can be a bench/late flyer.",
    },
    nkey("Leonardo Lombard"): {
        "category": "smoky",
        "note": "Likely to get games and can be a bench/late flyer.",
    },
    # Extra rookie watchlist mentions.
    nkey("Zeke Uwland"): {"category": "rookie", "note": "Rookie watchlist option."},
    nkey("Harry Dean"): {"category": "rookie", "note": "Rookie watchlist option."},
    nkey("Jordan Boyd"): {"category": "rookie", "note": "Rookie watchlist if selected."},
    nkey("Sam Grlj"): {"category": "rookie", "note": "Rookie watchlist option."},
    nkey("Jacob Farrow"): {"category": "rookie", "note": "Rookie watchlist option."},
    nkey("Josh Lindsay"): {"category": "rookie", "note": "Rookie watchlist option."},
    nkey("Jai Serong"): {"category": "rookie", "note": "Rookie watchlist option."},
    nkey("Lachie Jacques"): {"category": "rookie", "note": "Rookie watchlist option."},
    nkey("Wade Derksen"): {"category": "rookie", "note": "Rookie watchlist option."},
    nkey("Jagga Smith"): {"category": "rookie", "note": "Rookie watchlist option."},
    nkey("Arthur Jones"): {"category": "rookie", "note": "Rookie watchlist option."},
}


def clean_pdf_text(text: str) -> str:
    cleaned = (
        text.replace("ﬁ", "fi")
        .replace("ﬂ", "fl")
        .replace("\u00a0", " ")
        .replace("|", " ")
    )
    return re.sub(r"\s+", " ", cleaned).strip()


def load_pdf_pages(pdf_paths: list[Path]) -> list[tuple[str, list[str]]]:
    if PdfReader is None:
        print("Warning: pypdf not installed; PDF notes will be skipped.")
        return []

    result: list[tuple[str, list[str]]] = []
    for path in pdf_paths:
        if not path.exists():
            continue
        try:
            reader = PdfReader(str(path))
            pages = [clean_pdf_text(page.extract_text() or "") for page in reader.pages]
            result.append((path.stem, pages))
        except Exception as exc:
            print(f"Warning: Failed to parse PDF {path}: {exc}")
    return result


def extract_pdf_insight(
    player_name: str,
    pdf_sources: list[tuple[str, list[str]]],
) -> dict[str, Any]:
    if not player_name or not pdf_sources:
        return {
            "note": "",
            "role_change": 0,
            "midfield_uplift": 0,
            "season_out": 0,
            "source_count": 0,
        }

    pattern = re.compile(rf"\b{re.escape(player_name.lower())}\b")
    snippets: list[tuple[int, str, int, str]] = []
    role_change = False
    midfield_uplift = False
    season_out = False
    source_ids: set[str] = set()

    for source_id, pages in pdf_sources:
        source_hits = 0
        for page_index, page_text in enumerate(pages, start=1):
            page_lower = page_text.lower()
            match = pattern.search(page_lower)
            if not match:
                continue

            source_hits += 1
            source_ids.add(source_id)
            start = max(0, match.start() - 220)
            end = min(len(page_text), match.end() + 320)
            snippet = page_text[start:end].strip()
            snippet_lower = snippet.lower()

            role_hit = any(term in snippet_lower for term in PDF_ROLE_TERMS)
            mid_hit = any(term in snippet_lower for term in PDF_MIDFIELD_TERMS)
            season_hit = any(term in snippet_lower for term in PDF_SEASON_OUT_TERMS)

            role_change = role_change or role_hit
            midfield_uplift = midfield_uplift or mid_hit
            season_out = season_out or season_hit

            score = 0
            if role_hit:
                score += 2
            if mid_hit:
                score += 3
            if season_hit:
                score += 4
            if "opportunities" in snippet_lower or "concerns" in snippet_lower:
                score += 1

            # Down-rank pure stat-table snippets.
            digit_ratio = sum(ch.isdigit() for ch in snippet) / max(1, len(snippet))
            if digit_ratio > 0.22:
                score -= 2

            snippets.append((score, source_id, page_index, snippet))

            if source_hits >= 2:
                break

    if not snippets:
        return {
            "note": "",
            "role_change": 0,
            "midfield_uplift": 0,
            "season_out": 0,
            "source_count": 0,
        }

    snippets.sort(key=lambda x: (x[0], -len(x[3])), reverse=True)
    seen: set[str] = set()
    best: list[str] = []
    for score, source_id, page_index, snippet in snippets:
        if score < 1 and best:
            continue
        if score < 2:
            continue
        short = best_pdf_sentence(snippet, player_name)
        short_lower = short.lower()
        if ("range of outcomes" in short_lower or "supercoach 2023" in short_lower) and not any(
            term in short_lower for term in PDF_SEASON_OUT_TERMS
        ):
            continue
        short_digit_ratio = sum(ch.isdigit() for ch in short) / max(1, len(short))
        if short_digit_ratio > 0.18:
            is_contextual = any(term in short_lower for term in PDF_SEASON_OUT_TERMS) or any(
                term in short_lower for term in ["role", "injury", "opportunities", "concerns", "cba", "centre bounce", "inside mid", "mid time", "midfield role"]
            )
            if not is_contextual:
                continue
        key = nkey(short)
        if not key or key in seen:
            continue
        seen.add(key)
        best.append(f"{source_id} p{page_index}: {short}")
        if len(best) >= 2:
            break

    return {
        "note": " || ".join(best),
        "role_change": 1 if role_change else 0,
        "midfield_uplift": 1 if midfield_uplift else 0,
        "season_out": 1 if season_out else 0,
        "source_count": len(source_ids),
    }


def build_datasets(
    rankings_rows: list[dict[str, str]],
    ultimate_rows: list[dict[str, str]],
    expert_rows: list[dict[str, Any]],
    expert_sheet_sizes: dict[str, int],
    data_rows: list[dict[str, str]],
    reference_date: dt.date,
    pdf_sources: list[tuple[str, list[str]]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    pdf_sources = pdf_sources or []
    records: dict[str, dict[str, Any]] = {}
    mapping_stats = {
        "manual_alias_hits": 0,
        "fuzzy_matches": 0,
        "pdf_notes_added": 0,
    }

    def ensure_record(key: str, fallback_name: str = "") -> dict[str, Any]:
        rec = records.get(key)
        if rec is None:
            rec = {
                "key": key,
                "name": fallback_name.strip(),
                "club": "",
                "pos": "",
                "sources": set(),
                "ultimate": None,
                "rankings": None,
                "data": None,
                "expert_ranks": {},  # pos -> analyst -> rank
            }
            records[key] = rec
        return rec

    # 1) Seed from ultimate spreadsheet.
    for row in ultimate_rows:
        name = (row.get("Player") or "").strip()
        if not name:
            continue
        key = canonical_key(name)
        if key != nkey(name):
            mapping_stats["manual_alias_hits"] += 1
        rec = ensure_record(key, fallback_name=name)
        rec["name"] = first_non_null(rec["name"], name) or name
        rec["club"] = (row.get("Club") or rec["club"] or "").strip().upper()
        rec["pos"] = first_non_null(normalize_position(row.get("Position")), rec["pos"]) or ""
        rec["sources"].add("ultimate")
        rec["ultimate"] = row

    # 2) Merge rankings CSV.
    for row in rankings_rows:
        name = (row.get("Name") or "").strip()
        if not name:
            continue
        raw_key = canonical_key(name)
        matched_key = raw_key if raw_key in records else match_existing_key(name, row.get("Team"), records, threshold=0.90)
        if matched_key and matched_key != raw_key:
            mapping_stats["fuzzy_matches"] += 1
        key = matched_key or raw_key
        rec = ensure_record(key, fallback_name=name)
        rec["name"] = rec["name"] or name
        rec["club"] = first_non_null((row.get("Team") or "").strip().upper(), rec["club"]) or ""
        rec["pos"] = first_non_null(normalize_position(row.get("Position")), rec["pos"]) or ""
        rec["sources"].add("rankings")
        rec["rankings"] = row

    # 3) Merge data.csv (notes + relative-value model output).
    for row in data_rows:
        name = (row.get("Player") or "").strip()
        if not name:
            continue
        raw_key = canonical_key(name)
        club = (row.get("Club") or "").strip().upper()
        matched_key = raw_key if raw_key in records else match_existing_key(name, club, records, threshold=0.88)
        if matched_key and matched_key != raw_key:
            mapping_stats["fuzzy_matches"] += 1
        key = matched_key or raw_key
        rec = ensure_record(key, fallback_name=name)
        rec["name"] = rec["name"] or name
        rec["club"] = first_non_null(club, rec["club"]) or ""
        rec["pos"] = first_non_null(normalize_position(row.get("Position")), rec["pos"]) or ""
        rec["sources"].add("data")
        rec["data"] = row

    # 4) Merge expert positional rankings.
    for row in expert_rows:
        name = row["player"]
        raw_key = canonical_key(name)
        matched_key = raw_key if raw_key in records else match_existing_key(name, None, records, threshold=0.84)
        if matched_key and matched_key != raw_key:
            mapping_stats["fuzzy_matches"] += 1
        key = matched_key or raw_key
        rec = ensure_record(key, fallback_name=name)
        rec["name"] = rec["name"] or name
        rec["pos"] = first_non_null(rec["pos"], row["pos"]) or row["pos"]
        rec["sources"].add("experts")
        pos_map = rec["expert_ranks"].setdefault(row["pos"], {})
        prev = pos_map.get(row["analyst"])
        if prev is None or row["rank"] < prev:
            pos_map[row["analyst"]] = row["rank"]

    # 5) Build output rows.
    output_rows: list[dict[str, Any]] = []
    for rec in records.values():
        r_csv = rec["rankings"] or {}
        r_u = rec["ultimate"] or {}
        r_d = rec["data"] or {}

        name = rec["name"].strip()
        if not name:
            continue

        club_values = [
            (r_csv.get("Team") or "").strip().upper(),
            (r_u.get("Club") or "").strip().upper(),
            (r_d.get("Club") or "").strip().upper(),
            (rec.get("club") or "").strip().upper(),
        ]
        club = next((c for c in club_values if c), "")

        pos_values = [
            normalize_position(r_csv.get("Position")),
            normalize_position(r_u.get("Position")),
            normalize_position(r_d.get("Position")),
            normalize_position(rec.get("pos")),
        ]
        pos = next((p for p in pos_values if p), "")
        primary_pos = pos.split("/")[0] if pos else ""

        market_rank = safe_int(r_csv.get("Rank"))
        adp = first_non_null(safe_float(r_csv.get("ADP")), safe_float(r_d.get("ADP")))
        adp = round(adp, 1) if adp is not None else None

        proj_candidates = [
            safe_float(r_csv.get("Projected")),
            safe_float(r_u.get("AVG")),
            safe_float(r_d.get("Projected")),
        ]
        proj_values = [x for x in proj_candidates if x is not None]
        proj_score = round(statistics.median(proj_values), 1) if proj_values else None
        proj_spread = round(max(proj_values) - min(proj_values), 1) if len(proj_values) >= 2 else 0.0

        ps26 = first_non_null(safe_float(r_csv.get("L5")), safe_float(r_d.get("B23")))
        ps26 = round(ps26, 1) if isinstance(ps26, (int, float)) else None

        bye_values = [
            parse_bye(r_csv.get("Bye Round")),
            safe_int(r_u.get("BYES_Mid")),
            safe_int(r_u.get("BYES_Early")),
        ]
        bye = next((b for b in bye_values if b is not None), None)

        age = parse_age_from_dob(r_u.get("DOB"), reference_date)
        games25 = first_non_null(safe_int(r_u.get("GMS")), safe_int(r_d.get("Gm.25")))
        # Canonical 2025 average for app use:
        # prefer Ultimate sheet AVG (closest to actual AFL Fantasy season average),
        # fallback to rankings CSV 2025 Avg if missing.
        ultimate_avg_2025 = safe_float(r_u.get("AVG"))
        rankings_avg_2025 = safe_float(r_csv.get("2025 Avg"))
        avg_score_2025 = first_non_null(ultimate_avg_2025, rankings_avg_2025)
        if avg_score_2025 is not None:
            avg_score_2025 = round(avg_score_2025, 1)

        relative_value = safe_float(r_d.get("Relative Value"))
        vs_next_pick = safe_float(r_d.get("vs. Next Pick"))
        waiver_strength = safe_float(r_d.get("WaiverStr"))
        data_projected = safe_float(r_d.get("Projected"))
        risk = (r_d.get("Risk") or "").strip()

        injury = (r_csv.get("Injury") or "").strip()
        data_notes = (r_d.get("Notes") or "").strip()
        manual_override = (
            MANUAL_PLAYER_OVERRIDES.get(canonical_key(name))
            or MANUAL_PLAYER_OVERRIDES.get(nkey(name), {})
        )
        manual_note = (manual_override.get("note") or "").strip()
        pdf_insight = extract_pdf_insight(name, pdf_sources)
        pdf_notes = pdf_insight["note"]
        if pdf_notes:
            mapping_stats["pdf_notes_added"] += 1
        notes_parts: list[str] = []
        if data_notes:
            notes_parts.append(data_notes)
        if pdf_notes:
            notes_parts.append(f"PDF insight: {pdf_notes}")
        if manual_note:
            notes_parts.append(f"Manual insight: {manual_note}")
        if injury:
            notes_parts.append(f"Injury flag: {injury}")
        notes = " | ".join(notes_parts)

        # Expert consensus.
        pos_rank_map = rec["expert_ranks"].get(primary_pos, {})
        if not pos_rank_map and primary_pos:
            # fallback to any available position rank if primary doesn't exist
            for p in POS_ORDER:
                if rec["expert_ranks"].get(p):
                    pos_rank_map = rec["expert_ranks"][p]
                    break
        expert_ranks = list(pos_rank_map.values())
        expert_count = len(expert_ranks)
        expert_consensus_rank = round(statistics.mean(expert_ranks), 2) if expert_ranks else None
        expert_rank_std = round(statistics.pstdev(expert_ranks), 2) if len(expert_ranks) > 1 else 0.0
        expert_best_rank = min(expert_ranks) if expert_ranks else None
        expert_worst_rank = max(expert_ranks) if expert_ranks else None

        pos_pool_size = expert_sheet_sizes.get(primary_pos, 0) if primary_pos else 0
        if expert_consensus_rank is not None and pos_pool_size > 1:
            expert_percentile = 1.0 - ((expert_consensus_rank - 1.0) / (pos_pool_size - 1.0))
        else:
            expert_percentile = 0.5
        expert_percentile = clamp(expert_percentile, 0.0, 1.0)

        adp_value_gap = round(adp - market_rank, 1) if adp is not None and market_rank is not None else None

        club_conflict = 0
        position_conflict = 0
        bye_conflict = 0
        projection_conflict = 1 if proj_spread >= 8 else 0
        conflict_notes: list[str] = []

        club_set = {c for c in {(r_csv.get("Team") or "").strip().upper(), (r_u.get("Club") or "").strip().upper(), (r_d.get("Club") or "").strip().upper()} if c}
        if len(club_set) > 1:
            club_conflict = 1
            conflict_notes.append(f"Club mismatch: {', '.join(sorted(club_set))}")

        pos_set_values = [position_set(normalize_position(r_csv.get("Position"))), position_set(normalize_position(r_u.get("Position"))), position_set(normalize_position(r_d.get("Position")))]
        pos_set_values = [s for s in pos_set_values if s]
        if len(pos_set_values) >= 2 and any(s != pos_set_values[0] for s in pos_set_values[1:]):
            position_conflict = 1
            conflict_notes.append("Position mismatch across sources")

        bye_set = {b for b in [parse_bye(r_csv.get("Bye Round")), safe_int(r_u.get("BYES_Mid"))] if b is not None}
        if len(bye_set) > 1:
            bye_conflict = 1
            conflict_notes.append(f"Bye mismatch: {', '.join(str(x) for x in sorted(bye_set))}")

        source_count = len(rec["sources"])
        confidence_score = 0.42 + 0.13 * source_count - 0.08 * (club_conflict + position_conflict + bye_conflict + projection_conflict)
        if data_notes:
            confidence_score += 0.03
        confidence_score = round(clamp(confidence_score, 0.10, 0.99), 2)
        if confidence_score >= 0.80:
            confidence_label = "high"
        elif confidence_score >= 0.62:
            confidence_label = "medium"
        else:
            confidence_label = "low"

        combined_notes = " ".join([data_notes, pdf_notes]).lower()
        note_lower = combined_notes
        upside_note = any(
            phrase in note_lower
            for phrase in [
                "role:",
                "likely",
                "mid time",
                "breakout",
                "bump",
                "inside mid",
                "midfield",
                "centre bounce",
                "on-ball",
            ]
        )
        proven_scorer = avg_score_2025 is not None and avg_score_2025 >= 95 and games25 is not None and games25 >= 14

        if proj_score is None:
            category = "depth"
        elif pdf_insight["season_out"] == 1:
            category = "depth"
        elif proj_score >= 102 or (relative_value is not None and relative_value >= 24):
            category = "premium"
        elif proven_scorer and proj_score >= 97:
            category = "premium"
        elif age is not None and age <= 21 and games25 is not None and games25 <= 8:
            category = "rookie"
        elif not proven_scorer and (
            (relative_value is not None and relative_value >= 16 and upside_note)
            or (
            adp_value_gap is not None and adp_value_gap >= 8 and upside_note
            )
        ):
            category = "smoky"
        elif (
            proven_scorer
            or (relative_value is not None and relative_value >= 10)
            or (adp_value_gap is not None and adp_value_gap >= 4)
        ):
            category = "value"
        else:
            category = "depth"

        manual_category = (manual_override.get("category") or "").strip().lower()
        if manual_category in {"premium", "value", "rookie", "depth"}:
            category = manual_category
        elif manual_category == "smoky":
            # Do not force smoky on season-long unavailables or proven premiums.
            if pdf_insight["season_out"] == 0 and not proven_scorer and category in {
                "depth",
                "value",
                "rookie",
            }:
                category = "smoky"

        smoky_source = manual_note or data_notes or pdf_notes
        smoky_note = summarize_note(smoky_source) if category == "smoky" else ""

        player_id = first_non_null(
            (r_d.get("ID_AFLFAN") or "").strip(),
            (r_csv.get("ID") or "").strip(),
        )
        if not player_id:
            player_id = f"mega_{rec['key']}"

        output_rows.append(
            {
                "name": name,
                "pos": pos,
                "club": club,
                "proj_score": proj_score,
                "ps26": ps26,
                "bye": bye,
                "age": age,
                "games25": games25,
                "category": category,
                "smoky_note": smoky_note,
                "adp": adp,
                "player_id": player_id,
                "notes": notes,
                "manual_insight": manual_note,
                "avg_2025_blend": avg_score_2025,
                "market_rank": market_rank,
                "expert_consensus_rank": expert_consensus_rank,
                "expert_rank_count": expert_count,
                "expert_best_rank": expert_best_rank,
                "expert_worst_rank": expert_worst_rank,
                "expert_rank_stddev": expert_rank_std,
                "expert_percentile": round(expert_percentile, 3),
                "data_relative_value": relative_value,
                "data_vs_next_pick": vs_next_pick,
                "data_waiver_strength": waiver_strength,
                "data_projected": data_projected,
                "data_risk": risk,
                "data_dpp": (r_d.get("DPP") or "").strip(),
                "data_b23": (r_d.get("B23") or "").strip(),
                "data_gm25": safe_int(r_d.get("Gm.25")),
                "data_notes": data_notes,
                "pdf_notes": pdf_notes,
                "pdf_role_change": pdf_insight["role_change"],
                "pdf_midfield_uplift": pdf_insight["midfield_uplift"],
                "pdf_season_out": pdf_insight["season_out"],
                "pdf_source_count": pdf_insight["source_count"],
                "rankings_vorp": safe_float(r_csv.get("VORP")),
                "rankings_projected": safe_float(r_csv.get("Projected")),
                "rankings_avg_2026": safe_float(r_csv.get("2026 Avg")),
                "rankings_avg_2025": safe_float(r_csv.get("2025 Avg")),
                "rankings_variance": safe_float(r_csv.get("Variance")),
                "rankings_l5": safe_float(r_csv.get("L5")),
                "rankings_max": safe_float(r_csv.get("Max")),
                "rankings_cba_pct": parse_pct(r_csv.get("CBA%")),
                "rankings_bye_round": parse_bye(r_csv.get("Bye Round")),
                "rankings_injury": injury,
                "ultimate_price": safe_int(r_u.get("Price")),
                "ultimate_priced_at": safe_float(r_u.get("Priced At")),
                "ultimate_avg_2025": safe_float(r_u.get("AVG")),
                "ultimate_games_2025": safe_int(r_u.get("GMS")),
                "ultimate_max_2025": safe_float(r_u.get("MAX")),
                "ultimate_x100_2025": safe_int(r_u.get("x100")),
                "ultimate_x120_2025": safe_int(r_u.get("x120")),
                "ultimate_tog_pct": safe_float(r_u.get("TOG%")),
                "ultimate_cba_pct": safe_float(r_u.get("CBA%")),
                "ultimate_avg_2024": safe_float(r_u.get("2024_AVG")),
                "ultimate_games_2024": safe_int(r_u.get("2024_GMS")),
                "ultimate_avg_2023": safe_float(r_u.get("2023_AVG")),
                "ultimate_games_2023": safe_int(r_u.get("2023_GMS")),
                "projection_spread": proj_spread,
                "projection_source_count": len(proj_values),
                "adp_value_gap": adp_value_gap,
                "data_confidence": confidence_label,
                "data_confidence_score": confidence_score,
                "source_count": source_count,
                "source_rankings_csv": 1 if "rankings" in rec["sources"] else 0,
                "source_ultimate_xlsx": 1 if "ultimate" in rec["sources"] else 0,
                "source_expert_xlsx": 1 if "experts" in rec["sources"] else 0,
                "source_data_csv": 1 if "data" in rec["sources"] else 0,
                "club_conflict": club_conflict,
                "position_conflict": position_conflict,
                "projection_conflict": projection_conflict,
                "bye_conflict": bye_conflict,
                "conflict_notes": " | ".join(conflict_notes),
            }
        )

    # 5b) Apply a final pass of manual category/note overrides.
    for row in output_rows:
        name = str(row.get("name") or "").strip()
        if not name:
            continue

        override = (
            MANUAL_PLAYER_OVERRIDES.get(canonical_key(name))
            or MANUAL_PLAYER_OVERRIDES.get(nkey(name))
        )
        if not override:
            continue

        manual_note = (override.get("note") or "").strip()
        manual_category = (override.get("category") or "").strip().lower()

        if manual_note:
            row["manual_insight"] = manual_note
            existing_notes = str(row.get("notes") or "")
            if manual_note not in existing_notes:
                row["notes"] = f"{existing_notes} | Manual insight: {manual_note}".strip(" |")

        if manual_category in {"premium", "value", "rookie", "depth"}:
            row["category"] = manual_category
        elif manual_category == "smoky":
            if safe_int(row.get("pdf_season_out")) != 1:
                row["category"] = "smoky"

        if row.get("category") == "smoky" and not (row.get("smoky_note") or "").strip():
            smoky_source = manual_note or str(row.get("data_notes") or "") or str(
                row.get("pdf_notes") or ""
            )
            row["smoky_note"] = summarize_note(smoky_source)

    # 6) Positional replacement + draft score.
    replacement: dict[str, float] = {}
    for pos in POS_ORDER:
        eligible = [r for r in output_rows if r["proj_score"] is not None and pos in position_set(r["pos"])]
        eligible.sort(key=lambda x: x["proj_score"], reverse=True)
        if not eligible:
            replacement[pos] = 0.0
            continue
        idx = min(len(eligible), ROSTER_SLOTS[pos]) - 1
        replacement[pos] = float(eligible[idx]["proj_score"])

    for row in output_rows:
        proj = row["proj_score"]
        if proj is None:
            row["best_pos"] = ""
            row["vorp_proxy"] = None
            row["draft_score"] = None
            continue

        pos_candidates = [p for p in POS_ORDER if p in position_set(row["pos"])]
        if not pos_candidates:
            row["best_pos"] = ""
            row["vorp_proxy"] = None
            row["draft_score"] = None
            continue

        best_pos = pos_candidates[0]
        best_vorp = -math.inf
        for pos in pos_candidates:
            vorp = float(proj) - replacement.get(pos, 0.0)
            if vorp > best_vorp:
                best_vorp = vorp
                best_pos = pos

        rel = min(max(row["data_relative_value"] or 0.0, 0.0), 35.0)
        adp_gap = min(max(row["adp_value_gap"] or 0.0, 0.0), 35.0)
        expert_boost = row["expert_percentile"] * 10.0
        confidence_boost = row["data_confidence_score"] * 4.0

        # Keep projection and replacement value as the primary drivers.
        # ADP/value signals are capped so deep fliers do not outrank true premiums.
        draft_score = (
            float(proj) * 0.72
            + max(best_vorp, 0.0) * 1.35
            + rel * 0.35
            + adp_gap * 0.08
            + expert_boost
            + confidence_boost
        )

        row["best_pos"] = best_pos
        row["vorp_proxy"] = round(best_vorp, 2)
        row["draft_score"] = round(draft_score, 2)

    full_rows = sorted(
        output_rows,
        key=lambda r: (
            r["draft_score"] is None,
            -(r["draft_score"] or -9999),
            -(r["proj_score"] or -9999),
            r["name"],
        ),
    )

    # app rows must satisfy required parser fields.
    app_rows = [r for r in full_rows if r["name"] and r["pos"] and r["club"] and r["proj_score"] is not None and r["bye"] is not None]
    return full_rows, app_rows, mapping_stats


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return

    # Stable column order.
    preferred = [
        "name",
        "pos",
        "club",
        "proj_score",
        "ps26",
        "bye",
        "age",
        "games25",
        "category",
        "smoky_note",
        "adp",
        "player_id",
        "notes",
        "manual_insight",
        "avg_2025_blend",
        "draft_score",
        "best_pos",
        "vorp_proxy",
        "market_rank",
        "expert_consensus_rank",
        "expert_rank_count",
        "expert_best_rank",
        "expert_worst_rank",
        "expert_rank_stddev",
        "expert_percentile",
        "data_relative_value",
        "data_vs_next_pick",
        "data_waiver_strength",
        "data_projected",
        "data_risk",
        "data_dpp",
        "data_b23",
        "data_gm25",
        "data_notes",
        "pdf_notes",
        "pdf_role_change",
        "pdf_midfield_uplift",
        "pdf_season_out",
        "pdf_source_count",
        "rankings_vorp",
        "rankings_projected",
        "rankings_avg_2026",
        "rankings_avg_2025",
        "rankings_variance",
        "rankings_l5",
        "rankings_max",
        "rankings_cba_pct",
        "rankings_bye_round",
        "rankings_injury",
        "ultimate_price",
        "ultimate_priced_at",
        "ultimate_avg_2025",
        "ultimate_games_2025",
        "ultimate_max_2025",
        "ultimate_x100_2025",
        "ultimate_x120_2025",
        "ultimate_tog_pct",
        "ultimate_cba_pct",
        "ultimate_avg_2024",
        "ultimate_games_2024",
        "ultimate_avg_2023",
        "ultimate_games_2023",
        "projection_spread",
        "projection_source_count",
        "adp_value_gap",
        "data_confidence",
        "data_confidence_score",
        "source_count",
        "source_rankings_csv",
        "source_ultimate_xlsx",
        "source_expert_xlsx",
        "source_data_csv",
        "club_conflict",
        "position_conflict",
        "projection_conflict",
        "bye_conflict",
        "conflict_notes",
    ]
    remaining = sorted({k for row in rows for k in row.keys()} - set(preferred))
    fieldnames = preferred + remaining

    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _xlsx_col_name(index: int) -> str:
    result = ""
    value = index + 1
    while value > 0:
        value, remainder = divmod(value - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _xml_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def write_xlsx(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        return

    preferred = [
        "name",
        "pos",
        "club",
        "proj_score",
        "ps26",
        "bye",
        "age",
        "games25",
        "category",
        "smoky_note",
        "adp",
        "player_id",
        "notes",
        "manual_insight",
        "avg_2025_blend",
        "draft_score",
        "best_pos",
        "vorp_proxy",
        "market_rank",
        "expert_consensus_rank",
        "expert_rank_count",
        "expert_best_rank",
        "expert_worst_rank",
        "expert_rank_stddev",
        "expert_percentile",
        "data_relative_value",
        "data_vs_next_pick",
        "data_waiver_strength",
        "data_projected",
        "data_risk",
        "data_dpp",
        "data_b23",
        "data_gm25",
        "data_notes",
        "pdf_notes",
        "pdf_role_change",
        "pdf_midfield_uplift",
        "pdf_season_out",
        "pdf_source_count",
        "rankings_vorp",
        "rankings_projected",
        "rankings_avg_2026",
        "rankings_avg_2025",
        "rankings_variance",
        "rankings_l5",
        "rankings_max",
        "rankings_cba_pct",
        "rankings_bye_round",
        "rankings_injury",
        "ultimate_price",
        "ultimate_priced_at",
        "ultimate_avg_2025",
        "ultimate_games_2025",
        "ultimate_max_2025",
        "ultimate_x100_2025",
        "ultimate_x120_2025",
        "ultimate_tog_pct",
        "ultimate_cba_pct",
        "ultimate_avg_2024",
        "ultimate_games_2024",
        "ultimate_avg_2023",
        "ultimate_games_2023",
        "projection_spread",
        "projection_source_count",
        "adp_value_gap",
        "data_confidence",
        "data_confidence_score",
        "source_count",
        "source_rankings_csv",
        "source_ultimate_xlsx",
        "source_expert_xlsx",
        "source_data_csv",
        "club_conflict",
        "position_conflict",
        "projection_conflict",
        "bye_conflict",
        "conflict_notes",
    ]
    remaining = sorted({k for row in rows for k in row.keys()} - set(preferred))
    fieldnames = preferred + remaining

    table: list[list[Any]] = [fieldnames]
    for row in rows:
        table.append([row.get(col, "") for col in fieldnames])

    last_col = _xlsx_col_name(len(fieldnames) - 1)
    last_row = len(table)
    dimension = f"A1:{last_col}{last_row}"

    sheet_lines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        f'<dimension ref="{dimension}"/>',
        "<sheetViews><sheetView workbookViewId=\"0\"/></sheetViews>",
        "<sheetFormatPr defaultRowHeight=\"15\"/>",
        "<sheetData>",
    ]

    for row_idx, values in enumerate(table, start=1):
        cells: list[str] = []
        for col_idx, raw in enumerate(values):
            if raw is None or raw == "":
                continue
            ref = f"{_xlsx_col_name(col_idx)}{row_idx}"

            if isinstance(raw, bool):
                num = "1" if raw else "0"
                cells.append(f'<c r="{ref}" t="n"><v>{num}</v></c>')
                continue

            if isinstance(raw, (int, float)) and not isinstance(raw, bool):
                if isinstance(raw, float) and (math.isnan(raw) or math.isinf(raw)):
                    text = _xml_escape(str(raw))
                    cells.append(
                        f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>'
                    )
                else:
                    cells.append(f'<c r="{ref}" t="n"><v>{raw}</v></c>')
                continue

            text = _xml_escape(str(raw))
            cells.append(
                f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>'
            )

        if cells:
            sheet_lines.append(f'<row r="{row_idx}">{"".join(cells)}</row>')
        else:
            sheet_lines.append(f'<row r="{row_idx}"/>')

    sheet_lines.extend(
        [
            "</sheetData>",
            "<pageMargins left=\"0.7\" right=\"0.7\" top=\"0.75\" bottom=\"0.75\" header=\"0.3\" footer=\"0.3\"/>",
            "</worksheet>",
        ]
    )
    sheet_xml = "".join(sheet_lines)

    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        "</Types>"
    )
    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
        "</Relationships>"
    )
    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Mega Dataset" sheetId="1" r:id="rId1"/></sheets>'
        "</workbook>"
    )
    workbook_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        "</Relationships>"
    )
    core_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" '
        'xmlns:dcterms="http://purl.org/dc/terms/" '
        'xmlns:dcmitype="http://purl.org/dc/dcmitype/" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        "<dc:creator>Codex</dc:creator>"
        "<cp:lastModifiedBy>Codex</cp:lastModifiedBy>"
        f'<dcterms:created xsi:type="dcterms:W3CDTF">{dt.datetime.utcnow().isoformat()}Z</dcterms:created>'
        f'<dcterms:modified xsi:type="dcterms:W3CDTF">{dt.datetime.utcnow().isoformat()}Z</dcterms:modified>'
        "</cp:coreProperties>"
    )
    app_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
        "<Application>Codex</Application>"
        "</Properties>"
    )

    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", rels_xml)
        zf.writestr("xl/workbook.xml", workbook_xml)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        zf.writestr("docProps/core.xml", core_xml)
        zf.writestr("docProps/app.xml", app_xml)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build consolidated AFL fantasy mega dataset.")
    parser.add_argument("--rankings-csv", type=Path, default=DEFAULT_RANKINGS_CSV)
    parser.add_argument("--ultimate-xlsx", type=Path, default=DEFAULT_ULTIMATE_XLSX)
    parser.add_argument("--expert-xlsx", type=Path, default=DEFAULT_EXPERT_XLSX)
    parser.add_argument("--data-csv", type=Path, default=DEFAULT_DATA_CSV)
    parser.add_argument("--draft-doctors-pdf", type=Path, default=DEFAULT_DRAFT_DOCTORS_PDF)
    parser.add_argument("--official-draft-pdf", type=Path, default=DEFAULT_OFFICIAL_DRAFT_PDF)
    parser.add_argument("--full-out", type=Path, default=DEFAULT_FULL_OUT)
    parser.add_argument("--app-out", type=Path, default=DEFAULT_APP_OUT)
    parser.add_argument("--xlsx-out", type=Path, default=DEFAULT_XLSX_OUT)
    parser.add_argument("--reference-date", default="2026-02-28", help="Date used for age calculation (YYYY-MM-DD).")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    for file_path in [args.rankings_csv, args.ultimate_xlsx, args.expert_xlsx, args.data_csv]:
        if not file_path.exists():
            raise FileNotFoundError(f"Input file not found: {file_path}")

    reference_date = dt.date.fromisoformat(args.reference_date)

    rankings_rows = load_rankings_csv(args.rankings_csv)
    ultimate_rows = load_ultimate_xlsx(args.ultimate_xlsx)
    expert_rows, expert_sheet_sizes = load_expert_xlsx(args.expert_xlsx)
    data_rows = load_data_csv(args.data_csv)
    pdf_sources = load_pdf_pages([args.draft_doctors_pdf, args.official_draft_pdf])

    full_rows, app_rows, mapping_stats = build_datasets(
        rankings_rows=rankings_rows,
        ultimate_rows=ultimate_rows,
        expert_rows=expert_rows,
        expert_sheet_sizes=expert_sheet_sizes,
        data_rows=data_rows,
        reference_date=reference_date,
        pdf_sources=pdf_sources,
    )

    write_csv(args.full_out, full_rows)
    write_csv(args.app_out, app_rows)
    write_xlsx(args.xlsx_out, full_rows)

    print(f"Full dataset rows: {len(full_rows)}")
    print(f"App-ready rows: {len(app_rows)}")
    print(f"Manual alias hits: {mapping_stats['manual_alias_hits']}")
    print(f"Fuzzy matches: {mapping_stats['fuzzy_matches']}")
    print(f"Rows with PDF notes: {mapping_stats['pdf_notes_added']}")
    print(f"Wrote full dataset: {args.full_out}")
    print(f"Wrote app dataset: {args.app_out}")
    print(f"Wrote xlsx dataset: {args.xlsx_out}")


if __name__ == "__main__":
    main()
