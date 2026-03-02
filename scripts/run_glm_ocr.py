#!/usr/bin/env python3
"""
Run GLM OCR (Z.AI layout parsing) against a PDF/image and save Markdown + JSON.

Usage example:
  export ZHIPU_API_KEY="your-key"
  python3 scripts/run_glm_ocr.py \
    --input /Users/michaelhofstein/Coding/tmp/2026-AFL-Fantasy-Draft-Kit.pdf \
    --outdir tmp/glm-ocr \
    --start-page 1 \
    --end-page 5
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path
from typing import Optional

from zai import ZhipuAiClient
from zai.core._errors import APIStatusError


def get_api_key() -> Optional[str]:
  return (
    os.getenv("ZHIPU_API_KEY")
    or os.getenv("ZHIPUAI_API_KEY")
    or os.getenv("GLM_API_KEY")
  )


def file_payload(input_value: str) -> str:
  if input_value.startswith("http://") or input_value.startswith("https://"):
    return input_value

  path = Path(input_value).expanduser().resolve()
  if not path.exists():
    raise FileNotFoundError(f"Input file not found: {path}")

  raw = path.read_bytes()
  encoded = base64.b64encode(raw).decode("ascii")
  return encoded


def run_parse(
  client: ZhipuAiClient,
  model: str,
  payload: str,
  start_page: Optional[int],
  end_page: Optional[int],
  need_layout_visualization: bool,
):
  kwargs: dict = {
    "model": model,
    "file": payload,
    "need_layout_visualization": need_layout_visualization,
  }
  if start_page is not None:
    kwargs["start_page_id"] = start_page
  if end_page is not None:
    kwargs["end_page_id"] = end_page

  return client.layout_parsing.create(**kwargs)


def main() -> int:
  parser = argparse.ArgumentParser(description="Run GLM OCR and save outputs.")
  parser.add_argument("--input", required=True, help="Local path or URL to PDF/image")
  parser.add_argument("--outdir", default="tmp/glm-ocr", help="Output directory")
  parser.add_argument("--model", default="glm-ocr", help="Model name")
  parser.add_argument(
    "--timeout-seconds",
    type=int,
    default=180,
    help="Request timeout in seconds",
  )
  parser.add_argument("--start-page", type=int, default=None, help="1-based page start")
  parser.add_argument("--end-page", type=int, default=None, help="1-based page end")
  parser.add_argument(
    "--layout-visualization",
    action="store_true",
    help="Request layout visualization images from API",
  )
  args = parser.parse_args()

  api_key = get_api_key()
  if not api_key:
    print(
      "Missing API key. Set one of: ZHIPU_API_KEY, ZHIPUAI_API_KEY, GLM_API_KEY",
      file=sys.stderr,
    )
    return 2

  outdir = Path(args.outdir).expanduser().resolve()
  outdir.mkdir(parents=True, exist_ok=True)

  input_name = Path(args.input).name if "://" not in args.input else "remote_input"
  stem = Path(input_name).stem or "glm_ocr_output"

  client = ZhipuAiClient(api_key=api_key, max_retries=1, timeout=args.timeout_seconds)
  payload = file_payload(args.input)

  try:
    response = run_parse(
      client=client,
      model=args.model,
      payload=payload,
      start_page=args.start_page,
      end_page=args.end_page,
      need_layout_visualization=args.layout_visualization,
    )
  except APIStatusError as status_error:
    try:
      detail = status_error.response.text
    except Exception:
      detail = str(status_error)
    print(f"API status error: {detail}", file=sys.stderr)
    return 3
  except Exception as first_error:
    # Some backends require data URL format for base64; retry once for local files.
    if "://" in args.input:
      raise
    data_url_payload = f"data:application/pdf;base64,{payload}"
    try:
      response = run_parse(
        client=client,
        model=args.model,
        payload=data_url_payload,
        start_page=args.start_page,
        end_page=args.end_page,
        need_layout_visualization=args.layout_visualization,
      )
      print(
        f"Retried with data URL payload after initial error: {first_error}",
        file=sys.stderr,
      )
    except APIStatusError as status_error:
      try:
        detail = status_error.response.text
      except Exception:
        detail = str(status_error)
      print(f"API status error: {detail}", file=sys.stderr)
      return 3

  markdown = response.md_results or ""
  markdown_path = outdir / f"{stem}.md"
  markdown_path.write_text(markdown, encoding="utf-8")

  json_path = outdir / f"{stem}.layout.json"
  json_payload = response.model_dump(mode="json")
  json_path.write_text(
    json.dumps(json_payload, ensure_ascii=False, indent=2),
    encoding="utf-8",
  )

  print(f"Saved Markdown: {markdown_path}")
  print(f"Saved JSON: {json_path}")
  if response.data_info and response.data_info.num_pages is not None:
    print(f"Pages parsed: {response.data_info.num_pages}")
  if response.request_id:
    print(f"Request ID: {response.request_id}")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
