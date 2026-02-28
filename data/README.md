# Data Layout

This project keeps input sources and generated outputs separate:

- `data/sources/` -> raw input files used by `scripts/build_mega_afl_dataset.py`
- `data/processed/` -> generated datasets from the merge pipeline

## Expected Source Files

- `rankings-afl-fantasy-2026-02-28.csv`
- `AFL-Fantasy-Draft-2026-Ultimate-Spreadsheet.xlsx`
- `2026-AF-Ranks-v2-8wtts9.xlsx`
- `data.csv`
- `2026-Draft-Kit-gs7zws.pdf`
- `2026-AFL-Fantasy-Draft-Kit.pdf`
- `afl-fantasy-2026.xlsx` (optional enrichment)
- `afl-stats-1772271394545.csv` (optional enrichment)

## Regenerate Outputs

```bash
python3 scripts/build_mega_afl_dataset.py
cp data/processed/players-2026-app-upload.csv public/sample-data/players-2026-mega.csv
```
