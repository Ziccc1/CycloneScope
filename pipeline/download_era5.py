from pathlib import Path
import json
import hashlib
import time
import cdsapi

ROOT = Path(__file__).resolve().parents[1]
requests_path = ROOT / "output" / "processed" / "era5" / "requests.json"
out_root = ROOT / "output" / "processed" / "era5" / "downloads"
out_root.mkdir(parents=True, exist_ok=True)
requests = json.loads(requests_path.read_text(encoding="utf-8"))["requests"]
client = cdsapi.Client(quiet=True, timeout=120, retry_max=2)
manifest = []
for i, item in enumerate(requests, 1):
    name = f"{item['storm_id']}-{item['year'][0]}-{item['month'][0]}.nc"
    target = out_root / name
    if not target.exists() or target.stat().st_size == 0:
        print(f"[{i}/{len(requests)}] downloading {name}", flush=True)
        client.retrieve("reanalysis-era5-single-levels", item["request"], str(target))
    h = hashlib.sha256(target.read_bytes()).hexdigest()
    manifest.append({"storm_id": item["storm_id"], "name": item["name"], "mode": item["mode"], "path": str(target), "bytes": target.stat().st_size, "sha256": h, "request": item["request"]})
    print(f"[{i}/{len(requests)}] ready {target.stat().st_size} bytes", flush=True)
(out_root / "manifest.json").write_text(json.dumps({"count": len(manifest), "files": manifest}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"count": len(manifest), "manifest": str(out_root / 'manifest.json')}, ensure_ascii=False))
