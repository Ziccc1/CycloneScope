# CycloneScope 数据交付接口 v1

数据版本：`a8-final-2026.07.19`。所有路径相对于 `CycloneScope-data-work/`；所有时间为 UTC ISO 8601；空间坐标为 WGS84/EPSG:4326，GeoJSON 坐标顺序为 `[longitude, latitude]`。

## 1. 数据包总览

| 数据包 | 文件 | 规模 | 用途 |
|---|---|---:|---|
| 全球轨迹 | `output/processed/ibtracs-global-since1980/tracks/track-points.parquet` | 244,113 点 / 4,943 场输入 | 全球筛选、地图轨迹 |
| WP 轨迹 | `output/processed/ibtracs-wp-since1980/tracks/track-points.parquet` | 104,304 点 / 1,515 场输入 | 西北太平洋深入分析 |
| 经典案例 | `output/processed/classic/classic-storms.json` | 16 场 | 案例列表和排序 |
| ERA5 | `output/processed/era5/downloads/manifest.json` | 19 个 NetCDF | 全球演示 + 12 场案例风场 |
| 人口暴露 | `output/processed/impact/exposure-2025-r2025a/taiwan-exposure-summary.parquet` | 15 行 | 5 场台湾相关风暴 × 3 阈值 |
| 台湾设施 | `taiwan/zones.geojson`、`taiwan/facilities/*` | 22 区、5953 避难所、464 医疗 | 设施情景 |
| 轨迹特征 | `output/processed/features/*` | 全球 4,932 场、WP 1,514 场 | 相似度、聚类、手绘匹配 |

## 2. 轨迹接口

`track-points.parquet` 字段：`storm_id`、`time`、`lon`、`lat`、`wind_ms`、`pressure_hpa`、`category`、`storm_status`、`source_agency`、`lon_unwrapped`、`moving_speed_kmh`。

约束：同一 `storm_id` 内按 `time` 升序；`lon/lat` 为观测坐标；缺失强度为 `null`；`moving_speed_kmh` 为相邻轨迹点派生值。

`catalog/storms.parquet` 使用 `id` 作为风暴 ID，包含 `name`、`season`、`basin`、`max_wind_ms`、`min_pressure_hpa`、`ace`、`duration_hours`、`track_point_count`、`data_status`、`source_ids`。

## 3. 64 点特征接口

- `features-64.json`：每项含 `storm_id`、`points[64][2]`、`shape_normalized[64][2]`、`wind_ms[64]`、`pressure_hpa[64]`、`moving_speed_kmh[64]`、`bearing_deg[64]`、`t_fraction[64]`。
- `shape-normalized.npy`：矩阵形状 `[N,128]`，每行对应 `feature-matrix.json.storm_ids`。
- `feature-scalars.parquet`：`storm_id`、`duration_hours`、`path_length_km`、`max_wind_ms`、`min_pressure_hpa`、`max_speed_kmh`。

`shape_normalized` 仅用于形状相似度：首点平移到原点、首尾总体方向旋转至 +x、按最大径向距离缩放；不可用于地图显示。地图必须使用 `points`。

## 4. ERA5 风场接口

入口：`output/processed/era5/downloads/manifest.json`。每项通过 `storm_id`、`mode`、`path`、`request` 找到 NetCDF；变量为 `u10`、`v10`，单位 m/s，时间 6 小时，网格 0.5°（全球演示为 2°）。前端不得假定每个经典案例都有动态风场，应先检查 manifest。

## 5. 影响/人口接口

主版本：WorldPop Global2 R2025A 2025 constrained 100m。`taiwan-exposure-summary.parquet` 字段：`storm_id`、`hazard_class`、`threshold_ms`、`exposed_population_estimate`、`exposed_cell_count`。

`exposed_population_estimate` 是危险格网与人口格网相交后的模型估计，不是报告灾损；不能与 EM-DAT 死亡、受灾人数或经济损失混为一谈。当前主表为 5 场台湾相关风暴的 3 个风速阈值汇总，不是全部 4,943 场风暴的全球影响库。

## 6. 台湾设施接口

- 行政区：`zones.geojson`，字段 `zone_id`、`zone_name`、`zone_code`。
- 避难所：`facilities/shelters.geojson` / `.parquet`，主键 `source_id`，字段含 `facility_type=shelter`、`capacity`、`longitude`、`latitude`、`zone_id`、`zone_name`。
- 医疗：`facilities/medical/medical.geojson` / `.parquet`，主键 `facility_id`，字段含 `facility_type=medical`、`medical_facility_type`、`longitude`、`latitude`、`zone_id`、`zone_name`。
- 覆盖：`facilities/shelter-coverage-2025.json`，5/10/20 km 为近似直线距离人口覆盖，不是道路行驶时间。

避难所此前 67 条未匹配记录已按 EPSG:3826 最近行政区补齐，当前 zone_id 匹配率为 100%；仍需在前端显示匹配来源；医疗 464 条是 22 个行政区质心各 40 km API 查询去重结果，不等同于全国完整医疗设施清单。

## 7. 前端/后端交接规则

1. 先读取 `output/processed/API-INDEX.json` 和本文件，再加载具体数据。
2. 所有主键按字符串处理，避免年份或前导字符被转换。
3. `null` 显示为“暂无/不可比较”，不得自动替换成 0。
4. 正式数据必须显示 `data_version`；演示数据必须显示 `synthetic_fixture` 或 `demo` 标签。
5. 文件不存在或字段版本不匹配时进入 error/empty 状态，不回退到静默空数组。
6. A6 情景新增设施使用独立场景对象，不修改正式设施原表；覆盖计算提交 `facility_type`、经纬度、容量、服务半径和预算字段。

最终 QA：`output/qa/a8-final-audit.json`；接口契约：`output/processed/taiwan/A6-api-contract.json`、`output/processed/features/A7-api-contract.json`、`output/processed/era5/qa/wind-field-contract.json`。

## 8. 新增版本接口
- 16 场暴露：impact/exposure-2025-r2025a/classic-16-exposure.parquet（48 行；15 行有台湾危险格网，33 行为 no_hazard_grid_for_taiwan）。
- 行政区人口：taiwan/population/zones-population-2025.parquet（WorldPop 汇总，population_official=null）。
- 统一设施：taiwan/facilities/facilities-all.geojson / .parquet。
- 报告灾损：impact/reported/reported-impact.parquet（当前空表，等待 EM-DAT/TCE-DAT 导出）。
- ERA5 能力矩阵：era5/qa/era5-capability-matrix.json。
- 道路：当前仅有接入说明，覆盖仍为直线距离。


- EM-DAT：impact/reported/reported-impact.parquet（2159 条热带气旋国家-事件记录）和 classic-reported-impact.parquet（16 场经典案例汇总）。



## Newly added
- `impact/tce-dat/tce-dat-exposure.parquet`: modeled historical exposure, 34/64/96 kt thresholds, 2015-fixed and historic population variants.
- `impact/tce-dat/classic-tce-dat-exposure.parquet`: classic-case subset.
- `taiwan/population/statistical-zones-population-official.parquet`: 138,179 official records, reference date 2024-12-01.
- Road network remains pending until the Geofabrik PBF download is complete and verified.

- `taiwan/roads/nodes.parquet`, `edges.parquet`: official Taiwan road-centerline-derived network.
- `taiwan/roads/facility-service-area.parquet`: 15,699 rows, 10/20/30 minute network thresholds; population reference is WorldPop ADM1 aggregate.

- `taiwan/population/statistical-zones.geojson`: 156,478 official smallest-statistical-area polygons joined to population; 136,724 matched, 19,754 boundary/version mismatches retained in QA.
- `taiwan/population/admin-official-population-spatial.parquet`: official population aggregated to project ADM1 zones.
- `facility-service-area.parquet` now exposes both `reachable_population_official` and `reachable_population_worldpop`; 15,088 rows use official 2024-12 population, 611 rows retain WorldPop fallback.
