from pathlib import Path
import json
import hashlib
import cdsapi

ROOT = Path(__file__).resolve().parents[1]
items = json.loads((ROOT / "output" / "processed" / "era5" / "requests.json").read_text(encoding="utf-8"))["requests"]
out_root = ROOT / "output" / "processed" / "era5" / "downloads"
out_root.mkdir(parents=True, exist_ok=True)
client = cdsapi.Client(quiet=True, timeout=120, retry_max=2)
manifest = []
for i, item in enumerate(items, 1):
    target = out_root / f"{item['storm_id']}-{item['year'][0]}-{item['month'][0]}.nc"
    request = {k: item[k] for k in ("year", "month", "day", "time", "variable", "area", "grid")}
    request.update({"product_type": ["reanalysis"], "data_format": "netcdf", "download_format": "unarchived"})
    if not target.exists() or target.stat().st_size == 0:
        print(f"[{i}/{len(items)}] downloading {target.name}", flush=True)
        client.retrieve("reanalysis-era5-single-levels", request, str(target))
    manifest.append({"storm_id": item["storm_id"], "name": item["name"], "mode": item["mode"], "path": str(target), "bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "request": request})
    print(f"[{i}/{len(items)}] ready {target.stat().st_size} bytes", flush=True)
(out_root / "manifest.json").write_text(json.dumps({"count": len(manifest), "files": manifest}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"count": len(manifest), "manifest": str(out_root / 'manifest.json')}, ensure_ascii=False))
