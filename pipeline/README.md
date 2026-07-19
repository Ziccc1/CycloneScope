# Pipeline 使用说明

主目录只保留当前可重跑的数据处理入口；`pipeline/archive/` 保存历史版本和测试脚本，默认不要运行。

## 推荐顺序

1. `download_sources.py`：登记并缓存原始来源。
2. `process_ibtracs_real.py`：清洗轨迹。
3. `derive_a2_metrics.py`：生成持续时间、移动速度、ACE 等派生指标。
4. `select_classic_storms_revised.py`：选择经典案例。
5. `prepare_era5_requests.py`、`download_era5.py`、`qa_era5_batch.py`：准备、下载和检查 ERA5。
6. `process_worldpop.py`、`derive_taiwan_hazard.py`、`derive_taiwan_hazard_time.py`：生成人口和危险度产品。
7. `normalize_taiwan_boundaries.py`、`normalize_taiwan_stat_population.py`、`join_statistical_boundaries_population.py`：处理台湾统计区人口和边界。
8. `normalize_shelters.py`、`normalize_a6_interface.py`、`merge_facilities.py`：统一设施数据。
9. `build_official_road_network.py`、`calculate_network_service_area.py`：构建道路网络和服务区。
10. `derive_a7_features.py`：生成 64 点轨迹特征。
11. `normalize_reported_impact.py`、`normalize_tce_dat.py`：处理 EM-DAT 和 TCE-DAT。
12. `prepare_frontend_assets.py`：生成前端友好边界、ERA5 能力和相似度资格文件。
13. `a8_final_audit.py`、`upgrade_audit.py`：最终 QA。

## 前端资产

`prepare_frontend_assets.py` 会生成：

- `taiwan-admin-overview.geojson`：行政区级概览，推荐默认加载；
- `statistical-zones-simplified.geojson`：统计区细节，按需加载；
- `era5-frontend-capability.json`：控制动态/静态/禁用风场；
- `similarity-eligibility.json`：排除严格 QA 失败轨迹。

原始大文件不进 GitHub。完整路径和字段见 `docs/data-processing/README.md` 与 `HANDOFF-CONTRACT-v1.md`。
