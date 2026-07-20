# A 数据处理流水线

当前版本：a8-final-2026.07.19；契约版本：2.1。

完整流程、资源清单、字段和接口统一见 [`docs/data-processing/README.md`](../docs/data-processing/README.md) 及其链接的 `DATA-PROCESSING-HANDOFF-v2.1.md`。本目录只保留最终可重跑脚本；旧版 v2/v3 和 archive 脚本已删除，避免重复实现。

## 推荐重跑顺序

```powershell
python pipeline/download_sources.py
python pipeline/process_ibtracs_real.py
python pipeline/derive_a2_metrics.py
python pipeline/select_classic_storms_revised.py
python pipeline/download_era5.py
python pipeline/generate_era5_contract_frames.py
python pipeline/process_worldpop.py
python pipeline/normalize_reported_impact.py
python pipeline/normalize_tce_dat.py
python pipeline/normalize_frozen_taiwan.py
python pipeline/normalize_rescue_facilities.py
python pipeline/build_road_network_osmium.py
python pipeline/calculate_network_service_area.py
python pipeline/derive_a7_features.py
python pipeline/generate_impact_grid_geojson.py
python pipeline/generate_storms_summary_contract.py
python pipeline/validate_frozen_contract.py
```

原始文件放在 `input/raw/`，大型数据不提交 GitHub。前端不直接读取 Parquet、NetCDF、GeoTIFF 或 PBF；B 必须根据 API-INDEX 和冻结契约生成 API。

## Validation with an external delivery package

The validators resolve data in this order: `CYCLONESCOPE_DATA_ROOT`, the repository `output/` directory, then the sibling `CycloneScope-data-work/` directory. For the delivery archive, extract its `output/` folder and run:

```powershell
$env:CYCLONESCOPE_DATA_ROOT = 'C:\path\to\CycloneScope-data-delivery-v2.1'
python pipeline/validate_frozen_contract.py
python pipeline/audit_release_consistency.py
```

The current contract validates `ibtracs-wp-since1980/`; the deprecated `ibtracs-wp/` alias is not required. Raw ERA5 NetCDF files are not required; `era5/downloads/manifest.json` is optional metadata.
