"""Reproducible source downloader with optional SHA-256 verification.

The manifest stores landing pages for sources that require manual selection or
credentials. Pass an explicit file URL for those sources instead of scraping
the landing page implicitly.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True, help="direct file URL, not a landing page")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-sha256")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(args.url, headers={"User-Agent": "CycloneScope-data-pipeline/1.0"})
    with urllib.request.urlopen(request) as response, args.output.open("wb") as handle:
        while chunk := response.read(1024 * 1024):
            handle.write(chunk)
    actual = sha256(args.output)
    if args.expected_sha256 and actual != args.expected_sha256.upper():
        raise SystemExit(f"SHA256 mismatch: {actual} != {args.expected_sha256.upper()}")
    manifest = {
        "source_url": args.url,
        "downloaded_at_utc": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "file_name": args.output.name,
        "file_size_bytes": args.output.stat().st_size,
        "sha256": actual,
    }
    args.output.with_suffix(args.output.suffix + ".manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
