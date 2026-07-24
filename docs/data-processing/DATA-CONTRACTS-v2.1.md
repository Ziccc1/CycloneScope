# CycloneScope 冻结数据契约 2.1：数据处理交付定义

版本：2.1  
数据版本：`a8-final-2026.07.19`  
更新时间：2026-07-19

本文是 A 数据处理组交给 B（后端）和 C（可视化）的统一字段与接口说明。冻结规则以 `backend/app/schemas/` 中的 Pydantic Schema 为最高优先级；生成的 JSON Schema、OpenAPI 和 TypeScript 类型禁止手工修改。

## 1. 总规则

- 所有根对象必须包含 `schema_version: "1.0"`、`data_status`、`source_ids`、`generated_at`。
- 时间统一为 UTC ISO 8601，例如 `2013-11-08T00:00:00Z`。
- 坐标统一 WGS84/EPSG:4326，GeoJSON 坐标为 `[longitude, latitude]`。
- 风速单位为 `m/s`，气压为 `hPa`，距离为 `km`。
- 缺失值只能使用 `null`，禁止使用 `0`、空字符串或 `999` 代替未知值。
- 所有 ID 按字符串处理；IBTrACS SID 是风暴永久主键。
- C 不直接读取 NetCDF、GeoTIFF、原始 CSV 或 Parquet；C 只消费 API、标准 GeoJSON 和风场帧契约。
- 原始数据只能由 A 的 pipeline 读取；B 的 adapter 不能在路由中临时清洗原始数据。
- 正式大数据放在 `backend/data/processed/` 或外部共享存储；Git 只放脚本、契约、QA 和小型 demo fixture。

允许的 `data_status`：`observed`、`reanalysis`、`reported`、`modeled`、`mixed`、`synthetic_fixture`、`synthetic_demo`、`algorithmic_result`、`scenario_model`。

## 2. 目录与角色

| 契约目录 | 本项目 A 侧实际位置 | B/C 使用方式 |
|---|---|---|
| `catalog/` | `output/processed/classic/`、`ibtracs-*/catalog/` | B 适配为风暴目录 API |
| `tracks/` | `ibtracs-*/tracks/` | B 适配为轨迹 API；C 不读 Parquet |
| `wind/` | `output/processed/era5/` | B 将 NetCDF 转为 manifest/frame API |
| `impact/` | `output/processed/impact/` | B 将汇总/格网数据包装为 ImpactGrid |
| `taiwan/` | `output/processed/taiwan/` | B 统一 zone/facility 字段后提供 GeoJSON/API |
| `qa/` | `output/qa/` 与各数据包 `qa/` | B/C 展示状态，不把 QA 当业务数据 |

## 3. 风暴目录：`storms-summary.json`

根对象：

```json
{
  "schema_version": "1.0",
  "data_status": "observed",
  "source_ids": ["ibtracs"],
  "generated_at": "2026-07-20T12:00:00Z",
  "items": [],
  "count": 0
}
```

`items[]` 字段：

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | string | 非空；优先 IBTrACS SID |
| `name` | string | 非空；无名风暴使用标准化名称 |
| `season` | integer | 1840–2200 |
| `basin` | enum | `NA/SA/WP/EP/SP/NI/SI/AU/XX` |
| `start_time` / `end_time` | UTC timestamp | `end_time >= start_time` |
| `max_wind_ms` | number/null | 缺失为 null，不能填 0 |
| `min_pressure_hpa` | number/null | 缺失为 null |
| `duration_hours` | number | 必须等于生命周期小时数 |
| `ace` | number/null | 必须记录计算口径 |
| `landfall_count` | integer | 无可靠登陆判定时为 0，并在 QA 说明 |
| `classic` | boolean | 是否进入 16 场经典案例 |
| `classic_rank` | integer/null | 仅经典案例有值 |
| `impact_score` | number/null | 排序分，不等于真实灾损 |
| `score_coverage` | number | 0–1，表示评分指标覆盖比例 |
| `reported_deaths` | integer/null | EM-DAT 报告值，不是暴露估计 |
| `reported_damage_usd_2024` | number/null | 只有完成通胀调整才填写，否则 null |
| `wind_available` | boolean | 是否有可用 ERA5 风场 |
| `impact_available` | boolean | 是否有对应影响数据 |
| `data_status` | enum | 通常为 `observed` 或 `mixed` |
| `source_ids` | string[] | 不重复；例如 `ibtracs/emdat/era5` |

A 侧实际文件：

- `ibtracs-global-since1980/catalog/storms.parquet`
- `ibtracs-wp-since1980/catalog/storms.parquet`
- `classic/classic-storms.json`

B 适配要求：Parquet 的 nullable/object 列必须转换为 `number|null` 或 `integer|null`；`source_ids` 转为字符串数组；根级元数据由 adapter 补齐。`classic-storms.json` 根 `data_status` 必须使用允许枚举中的 `mixed`，不能使用 `observed_ibtracs_plus_era5` 这种扩展值。

## 4. 轨迹接口：`track-points.parquet` → `StormTrackResponse`

存储字段：

| 字段 | 类型 | 规则 |
|---|---|---|
| `storm_id` | string | 外键，等于目录 `id` |
| `time` | UTC timestamp | 单场内严格递增且不重复 |
| `lon` / `lat` | float | [-180,180] / [-90,90] |
| `wind_ms` | float/null | m/s |
| `pressure_hpa` | float/null | hPa |
| `category` | string/null | TD/TS/C1–C5 或标准化类别 |
| `storm_status` | string/null | 标准化状态 |
| `moving_speed_kmh` | float/null | 相邻点球面距离/时间派生 |
| `is_landfall` | boolean/null | 无可靠判定必须为 null |
| `source_agency` | string/null | 机构或 WMO |

`lon_unwrapped` 是 A 内部用于跨日界线插值的字段，不对外暴露；地图显示必须使用 `lon`。

API 响应：

```json
{
  "schema_version": "1.0",
  "data_status": "observed",
  "source_ids": ["ibtracs"],
  "generated_at": "2026-07-20T12:00:00Z",
  "storm_id": "2013308N07140",
  "points": []
}
```

A 已在标准化轨迹表中补充 nullable `is_landfall` 列；当前数据没有可靠登陆判定，因此全部为 `null`。B adapter 必须保留该字段，不得把 null 转换为 false。

## 5. 64 点轨迹特征

A 交付：

- `features/global-since1980/features-64.json`
- `features/wp-since1980/features-64.json`
- `features/*/shape-normalized.npy`
- `features/*/feature-matrix.json`
- `features/*/feature-scalars.parquet`

单场特征字段：`storm_id`、`point_count_original`、`start_time`、`end_time`、`points[64][2]`、`shape_normalized[64][2]`、`wind_ms[64]`、`pressure_hpa[64]`、`moving_speed_kmh[64]`、`bearing_deg[64]`、`t_fraction[64]`。

对外 API 的 `TrackFeature` 字段为：

- `storm_id`
- `basin`
- `season`
- `geographic_points[64]`
- `normalized_points[64]`

`shape_normalized` 只用于相似度，不能用于地图显示。严格质量失败的风暴必须列在 QA，并从 Top-K 排名排除；不得伪造插值。

## 6. 风场接口：`WindManifest` / `WindFrame`

manifest 必须包含：

```json
{
  "schema_version": "1.0",
  "data_status": "reanalysis",
  "source_ids": ["era5"],
  "generated_at": "2026-07-20T12:00:00Z",
  "dataset_id": "haiyan-2013-era5",
  "mode": "storm",
  "storm_id": "2013308N07140",
  "units": "m/s",
  "grid_order": "north_to_south_west_to_east_row_major",
  "bounds": {},
  "resolution_degrees": 0.5,
  "width": 81,
  "height": 61,
  "frames": []
}
```

每个 frame：

- `schema_version`
- `dataset_id`
- `time`
- `width`
- `height`
- `u[]`
- `v[]`
- `missing_value`

必须满足 `u.length == v.length == width * height`；缺测使用 null。C 不读 NetCDF，只读 B 提供的 manifest 和 frame JSON（推荐 `.json.gz`）。A 已生成 `output/processed/era5/wind/**/manifest.json` 与 `frames/*.json.gz`，13 个数据集可直接作为 B adapter 输入。

## 7. 影响格网接口：`ImpactGridCollection`

每个 GeoJSON Feature 的 properties 固定为：

| 字段 | 类型 |
|---|---|
| `cell_id` | string |
| `time_start` / `time_end` | UTC ISO string |
| `hazard_index` | number/null，0–1 |
| `max_wind_ms` | number/null |
| `precip_mm` | number/null |
| `population` | integer/null |
| `exposed_population` | integer/null |
| `reported_damage_usd` | number/null |
| `reported_damage_price_year` | integer/null |
| `contributing_storm_ids` | string[] |
| `data_status` | observed/reanalysis/modeled/synthetic_fixture |
| `source_ids` | string[] |

`reported_damage_usd` 只有来源真正支持空间级经济损失时才填写。A 已为有台湾危险点的 5 场风暴生成事件级 `impact/storms/{storm_id}/grid.geojson`；其余经典案例没有危险格网时，B 必须返回 `impact_available=false`，不能扩展宣称为全球完整影响库。

## 8. 台湾 zone/facility 接口

### 8.1 `zones.geojson`

对外 properties 固定为：

- `zone_id: string`
- `county_code: string`
- `town_code: string|null`
- `name_zh: string`
- `population: integer|null`
- `population_year: integer|null`
- `area_km2: number`
- `centroid_lon: number`
- `centroid_lat: number`
- `source_ids: string[]`
- `data_status: string`

A 已生成契约化 `taiwan/zones.geojson`；旧 ADM1 属性保留在 `taiwan/zones-legacy-adm1.geojson`。高分辨率统计区边界另存为 `taiwan/population/statistical-zones.geojson`，不应直接作为前端默认图层。

### 8.2 `facilities.geojson`

几何必须是 Point，坐标只放在 `geometry.coordinates`。properties 固定为：

- `facility_id: string`
- `name: string`
- `type: shelter|medical|rescue|warehouse`
- `capacity_value: number|null`
- `capacity_unit: people|beds|teams|people_day|null`
- `service_radius_km: number`
- `budget_points: integer|null`
- `address: string|null`
- `county_code: string|null`
- `is_simulated: boolean`
- `source_ids: string[]`
- `data_status: string`

A 已生成契约化 `taiwan/facilities.geojson`，包含避难所、医疗和 787 条消防/救援设施；旧字段文件保留在 `taiwan/facilities/facilities-all.geojson`。`service_radius_km=10.0` 是情景默认值，不表示实时导航范围。

容量单位不可相加。未知容量显示“容量未知”，不能当作无限容量或 0。

### 8.3 服务区

A 当前输出：`taiwan/roads/facility-service-area.parquet`。

字段：`facility_id`、`facility_type`、`zone_id`、`travel_time_min`、`reachable_population`、`service_threshold_min`、`coverage_method`、`population_reference`、`speed_source`、`travel_time_quality`。

这是分析存储表，不是冻结 GeoJSON Facility schema。B 对外返回时必须保留：

- `coverage_method=network_travel_time`
- `population_reference=WorldPop ADM1 aggregate`
- `speed_source=mixed_osm_and_default_by_road_class`
- `travel_time_quality=low`

不得把它描述成实时导航时间，也不得把 WorldPop 汇总人口描述成官方统计区人口。

## 9. 报告灾损、模型暴露与情景人口

- EM-DAT：`impact/reported/reported-impact.parquet`，字段包括 `reported_event_id`、`storm_id`、`event_name`、`country`、`iso`、`start_date`、`end_date`、`deaths`、`injured`、`affected`、`homeless`、`damage_usd_nominal`、`damage_currency_year`、`damage_usd_2024`、`damage_adjustment_status`、`data_status`。
- TCE-DAT：`impact/tce-dat/tce-dat-exposure.parquet`，字段包括 `storm_id`、`event_name`、`year`、`genesis_basin`、`iso3`、`threshold_kn`、`exposed_population`、`exposed_assets`、`reference_year`、`model_variant`、`data_status`。
- WorldPop：人口格网暴露为估计值，不能解释为报告灾损。
- `damage_usd_2024` 当前大多为 null；`damage_adjustment_status=nominal_unadjusted` 时禁止跨年份直接排序。

## 10. 相似度请求接口

请求字段：`mode`、`points[]`、`filters.basins`、`filters.season_from`、`filters.season_to`、`top_k`。

响应字段：`schema_version`、`data_status=algorithmic_result`、`source_ids`、`generated_at`、`mode`、`normalized_point_count=64`、`items[]`、`elapsed_ms`。

`items[]`：`storm_id`、`rank`、`similarity`、`frechet_component`、`direction_component`、`explanation`。必须满足：

```text
similarity = 0.6 * frechet_component + 0.4 * direction_component
```

`top_k` 范围 1–20；严格特征失败记录不得进入 Top-K。

## 11. 当前契约审计结论

### 已通过

- 全部 Pydantic Schema 使用 `extra="forbid"`，禁止未知字段静默进入 API；
- 单位、WGS84 坐标、UTC 时间和 null 规则已经写入基础 Schema；
- IBTrACS 轨迹排序、64 点特征、ERA5 网格数组长度、道路网络 QA 均已完成；
- EM-DAT 与 TCE-DAT 已分字段族处理；
- OSM PBF 已验证，路网使用有向图处理单行道。

### 必须由 B adapter 完成

1. 统一根级元数据：`schema_version/data_status/source_ids/generated_at`；
2. 补齐轨迹 API 的 `is_landfall=null`；
3. 将 Parquet nullable/object 列转换为 Pydantic 接受的 number/null；
4. 生成 ERA5 manifest/frame JSON 契约，不让 C 读 NetCDF；
5. 将台湾 zone/facility 原始属性映射为冻结字段；
6. 对不存在影响格网的案例返回 `impact_available=false`，不得返回伪造网格；
7. 将所有缺失值保持为 null，不转换成 NaN 或 0。

### A 后续可补充但不是当前交付阻塞

- 补充至少 3 个正式 `impact grid.geojson` 示例；
- 生成 `tracks/simplified/{storm_id}.geojson`；
- 生成前端风场帧 JSON.gz；
- 完成官方统计区人口的剩余边界版本匹配。

## 12. 变更流程

修改字段前必须先修改本文和 `backend/app/schemas/`，然后运行：

```powershell
scripts/generate-contracts.ps1
python scripts/validate_contract.py
scripts/verify.ps1
```

B 修改 Pydantic 后通知 A/C；C 只能从 `frontend/src/types/contracts.ts` 导入类型。未经三方确认，不得直接改生成文件或自行新增字段。

