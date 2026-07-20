# CycloneScope 数据处理、资源清单与接口交付说明 v2.1

更新时间：2026-07-20  数据版本：a8-final-2026.07.19  契约版本：2.1

本文是 A（数据处理）交付给 B（后端/API）和 C（可视化）的唯一操作说明。字段以 backend/app/schemas/ 为准；output/processed/ 中的 Parquet、NetCDF 和内部分析字段不是前端 API。B 应先阅读本文件、API-INDEX.json、DATA-CONTRACTS-v2.1.md 和两个 QA 报告，再编写 adapter。

## 一、最终范围与边界

正式范围：IBTrACS 全球轨迹与西北太平洋子集、16 个经典案例、ERA5 风场、WorldPop 2025 暴露、EM-DAT 报告灾损、TCE-DAT 模型暴露、台湾统计区/人口/避难所/医疗/消防救援设施和静态道路服务区。

明确不纳入本次验收：多灾种（洪水、地震、滑坡、热浪）、实时交通/道路封闭、Natural Earth 离线底图、避难所实时开放状态、16 场全部完整影响格网、EM-DAT 通胀后跨年排名。它们在资源清单中标为“后续扩展”，不能在界面中伪装成已有能力。

## 二、A1–A8 逐项核对

| 工作包 | 初始验收要求 | 当前结果 | 状态 |
|---|---|---|---|
| A1 | 来源、版本、下载日期、许可证、哈希、可重跑脚本 | source-manifest-v2.json、source-manifest-upgrade.json、pipeline/ 脚本齐全；原始文件在 input/raw/，不进 Git | 完成 |
| A2 | IBTrACS 去重、UTC、坐标/单位、速度异常、ACE、持续时间 | 全球 4,943 场/300,007 点；WP 104,304 点；点按时间排序，lon_unwrapped 仅内部使用，is_landfall 可空 | 完成 |
| A3 | 按数据交集选择 12–20 场经典案例 | 16 场，含多个海盆和台湾相关案例；4 场无 ERA5，仍保留轨迹和统计 | 完成，有能力限制 |
| A4 | 全球窗口和至少 8 场区域 ERA5 | 19 个源 NetCDF、13 个契约 manifest、665 个压缩 frame；8 场动态、4 场静态、4 场无风场；实际资料为 00/06/12/18 UTC（6 小时），以 manifest 时间为准 | 完成，有能力限制 |
| A5 | 危险格网、人口暴露、灾损分离 | 2025 WorldPop 暴露；5 场台湾事件格网；EM-DAT 2,159 条报告记录；TCE-DAT 32,079 条模型暴露；三者不合并 | 完成，有覆盖限制 |
| A6 | 台湾边界、人口、设施、服务覆盖 | 22 个行政区契约边界；官方统计人口 138,179 条；5,953 避难所、464 医疗、787 救援/应变；道路节点 3,722,291、边 7,597,166；服务区 8,747 条 | 完成，有质量标记 |
| A7 | 64 点重采样、归一化、相似度特征 | global 4,932、WP 1,514 条有效特征；严格失败记录保留，不能进入 Top-K | 完成 |
| A8 | 缺失率、异常、抽查、版本冻结、接口交付 | frozen-contract-2.1-validation.json：25 项通过、0 失败；Pydantic：目录、台湾图层、13 manifest/665 frame、5 impact grid 全部通过 | 完成 |

## 三、资源清单与用途

| 资源 | 交付路径（相对 output/processed/） | 规模 | B/C 用途 |
|---|---|---:|---|
| 全球 IBTrACS | ibtracs-global-since1980/tracks/track-points.parquet、catalog/storms.parquet | 4,943 场/300,007 点 | 历史轨迹源 |
| WP IBTrACS | ibtracs-wp-since1980/ | 104,304 点 | WP 深入分析 |
| 经典案例 | classic/classic-storms.json | 16 场 | 案例筛选与能力状态 |
| 严格风暴目录 | catalog/storms-summary.json | 4,943 项 | /api/storms 唯一目录入口 |
| 64 点特征 | features/global-since1980/、features/wp-since1980/ | 4,932/1,514 | /api/trajectory-match |
| ERA5 契约风场 | era5/wind/**/manifest.json 与 .json.gz | 13/665 | 动态或静态风场 |
| ERA5 能力矩阵 | era5/qa/era5-capability-matrix.json | 16 案例 | dynamic/static/none UI |
| 影响格网 | impact/storms/{storm_id}/grid.geojson | 5 场/288 features | 台湾事件格网，其余禁用 |
| WorldPop 暴露 | impact/exposure-2025-r2025a/ | 2025 情景 | exposed_population，不是灾损 |
| EM-DAT | impact/reported/ | 2,159 条 | reported_*，原始年份货币 |
| TCE-DAT | impact/tce-dat/ | 32,079 条 | historical_exposure 模型估计 |
| 台湾契约区 | taiwan/zones.geojson | 22 区 | 行政区地图层 |
| 官方统计区人口 | taiwan/population/statistical-zones-population-official.parquet | 138,179 条 | 统计口径表，日期 2024-12-01 |
| 统计区边界 | taiwan/population/statistical-zones.geojson | 156,478 features | 高分辨率分析，19,754 未匹配保留 QA |
| 台湾设施 | taiwan/facilities.geojson | 7,204 点 | shelter/medical/rescue |
| 道路网络 | taiwan/roads/nodes.parquet、edges.parquet | 372 万节点/760 万边 | 静态服务区 |
| 服务区 | taiwan/roads/facility-service-area.parquet | 8,747 条 | 10/20/30 分钟情景 |

来源、下载日期、许可证和 SHA-256 见 source-manifest-v2.json 与 source-manifest-upgrade.json。台湾救援数据来自官方数据集 5969；避难所开放状态数据集 12849 仅列为后续扩展。

## 四、冻结接口字段

### 4.1 通用元数据
所有根对象必须有 schema_version、data_status、source_ids、generated_at。时间为 UTC ISO 8601；坐标为 WGS84/EPSG:4326；风速 m/s、气压 hPa、距离 km；未知值只能是 null；API 模型 extra="forbid"。

### 4.2 StormSummary
固定字段：id、name、season、basin、start_time、end_time、max_wind_ms、min_pressure_hpa、duration_hours、ace、landfall_count、classic、classic_rank、impact_score、score_coverage、reported_deaths、reported_damage_usd_2024、wind_available、impact_available、data_status、source_ids。Parquet 的 track_point_count、track_warning_count 和 classic-storms.json 的 selection_components 等是内部字段，B 输出 API 前必须剥离。

### 4.3 TrackPoint
time、lon、lat、wind_ms、pressure_hpa、category、storm_status、moving_speed_kmh、is_landfall、source_agency。lon_unwrapped 只能内部使用，不返回 C。

### 4.4 WindManifest/WindFrame
manifest frames[] 只能是 time、url、byte_size、sha256，不能使用 frame_path。frame 只能是 schema_version、dataset_id、time、width、height、u、v、missing_value，且 len(u)=len(v)=width*height。

### 4.5 ImpactGrid
Feature 属性：cell_id、time_start、time_end、hazard_index、max_wind_ms、precip_mm、population、exposed_population、reported_damage_usd、reported_damage_price_year、contributing_storm_ids、data_status、source_ids。当前格网人口/灾损为空是有意语义，不得填 0。

### 4.6 Taiwan Zone/Facility
Zone：zone_id、county_code、town_code、name_zh、population、population_year、area_km2、centroid_lon、centroid_lat、source_ids、data_status。Facility：facility_id、name、type、capacity_value、capacity_unit、service_radius_km、budget_points、address、county_code、is_simulated、source_ids、data_status。type 仅 shelter|medical|rescue|warehouse；本次 warehouse 为 0 条；救援容量未知用 null。

### 4.7 ServiceArea 与相似度
ServiceArea 至少保留 facility_id、facility_type、zone_id、travel_time_min、reachable_population、service_threshold_min、coverage_method、population_reference、speed_source、travel_time_quality。当前为静态路网估算，部分速度为道路等级默认值；人口以 WorldPop 行政区汇总为主，官方统计区未匹配处用 fallback 并在 QA 标记。
相似度必须满足 similarity = 0.6 * frechet_component + 0.4 * direction_component；严格特征失败记录排除 Top-K。

## 五、B/C API 建议

GET /api/storms；GET /api/storms/{storm_id}；GET /api/storms/{storm_id}/track；GET /api/storms/{storm_id}/wind/manifest；GET /api/wind/periods/{period_id}/manifest；GET /api/impact/grid?storm_id=&time_start=&time_end=&metric=；POST /api/trajectory-match；GET /api/taiwan/zones；GET /api/taiwan/facilities?type=；GET /api/taiwan/facilities/{facility_id}/service-area；POST /api/scenarios/{scenario_id}/facilities；POST /api/scenarios/{scenario_id}/evaluate。

无风场时返回 capability=none，不返回伪造 manifest；静态风场只显示静态图层；无影响格网时返回 impact_available=false。C 只消费 API、契约 GeoJSON、manifest/frame，不读原始 CSV、NetCDF、GeoTIFF 或 Parquet。

## 六、交付与重跑顺序

1. 阅读 API-INDEX.json、本文件、DATA-CONTRACTS-v2.1.md、CONTRACT-AUDIT-v2.1.md。
2. B 在自己的仓库运行契约生成和校验脚本，不能修改 schemas/generated/。
3. A 重跑台湾基础设施：python pipeline/normalize_frozen_taiwan.py；python pipeline/normalize_rescue_facilities.py。
4. 风场变化时运行 python pipeline/generate_era5_contract_frames.py；格网变化时运行 python pipeline/generate_impact_grid_geojson.py。
5. 最后运行 python pipeline/validate_frozen_contract.py，并检查 output/qa/pydantic-contract-validation.json。

## 七、交付结论

数据处理可以交付。字段、路径和根元数据已按冻结契约统一，机器审计 25/25 通过，后端 Pydantic 对严格目录、台湾图层、13 个 manifest/665 个 frame 和 5 个影响格网验证通过。交付时不要把整个 output/processed/ 当作前端输入；给 B/C 的入口是本文件、API-INDEX.json、严格契约文件和 QA 报告。

剩余事项不是清洗错误，而是范围和语义限制：ERA5 能力不一致、影响格网仅 5/16、统计区边界 19,754 条未匹配、医疗清单非全国完整、官方人口日期为 2024-12-01、道路时间为静态情景、EM-DAT 未通胀调整、TCE-DAT 为模型暴露。前端必须展示这些状态和来源。
