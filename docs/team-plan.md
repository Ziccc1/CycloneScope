# CycloneScope 三人分工、交付与并行开发文档

> 目标：让 A、B、C 在数据尚未全部准备好时仍可并行，实现时不靠口头猜字段。
>
> 人力：每人 7 天 × 8 小时，共约 56 小时；建议第 7 天只做集成、视觉打磨和答辩准备。
>
> 角色：A 数据与空间分析；B 产品框架、服务集成与答辩保障；C 核心算法与交互可视化。

## 1. 责任边界

| 人员 | 主责                                                                                          | 必须交付                                                                            | 不应独自修改                                            |
| ---- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| A    | 数据下载、清洗、空间连接、风场预处理、质量报告                                                | 正式数据文件、生成脚本、字段说明、QA 报告                                           | API 字段名称、前端交互状态、SQLite 表结构               |
| B    | 单页面框架、共享状态、基础面板、FastAPI 数据服务、SQLite、错误/缓存、视觉统一、测试和答辩保障 | 可插拔页面骨架、稳定 API、情景 CRUD、加载与异常状态、响应式设计、验证脚本和演示预设 | A 的原始数据含义、C 的核心算法公式与可视化模块内部实现  |
| C    | 轨迹匹配与设施覆盖算法、MapLibre 分析图层、真实风场粒子、ECharts 协同视图和关键交互           | 可测试算法模块、地图/粒子/图表组件、手绘匹配和设施反事实完整交互                    | A 的数据处理口径、B 的应用框架/API 鉴权与数据库基础设施 |

三个人共同负责：字段契约确认、经典气旋清单、每日集成、演示脚本、数据来源标注和最终验收。

## 2. 冻结数据契约

### 2.1 总规则

- `backend/app/schemas/` 是唯一允许手工修改的 Schema 源；`schemas/generated/` 和 `frontend/src/types/api.generated.ts` 均为生成文件，禁止手改。
- B 修改 Pydantic 后运行 `scripts/generate-contracts.ps1`；A 用 `scripts/validate_contract.py` 验证交付；C 从 `frontend/src/types/contracts.ts` 导入可读别名。
- `scripts/verify.ps1` 会检查 JSON Schema/OpenAPI 是否过期，并重新生成 TypeScript 后执行构建。
- 正式交换目录为 `backend/data/processed/`，不提交大数据到 Git；小于约 5 MB 的演示文件可经全员确认后放入 `backend/data/demo/`。
- A 的脚本放在 `backend/pipeline/`；B 只能通过适配器读取产物，不在路由中临时清洗原始 CSV。
- C 的可视化不读取 NetCDF、GeoTIFF 或来源 CSV，只消费 API、GeoJSON 或风场帧契约；算法只读取 A 交付的标准化特征和格网。
- 所有时间为 UTC ISO 8601；坐标为 WGS84；风速 `m/s`；气压 `hPa`；距离 `km`。
- 未知值为 `null`。禁止用 `0`、空字符串、`-999` 替代缺失值。
- 所有根对象包括 `schema_version: "1.0"`、`data_status`、`source_ids`、`generated_at`。
- 契约变更流程：提议者先改本文件和样例 → B 更新 Pydantic、共享 TypeScript 类型和接口测试 → C 更新算法/可视化消费代码 → 三方确认后合并。

### 2.2 目录交付结构

```text
backend/data/processed/
├─ catalog/
│  ├─ storms.parquet
│  ├─ storms-summary.json
│  └─ classic-storms.json
├─ tracks/
│  ├─ track-points.parquet
│  ├─ simplified/{storm_id}.geojson
│  └─ features/{storm_id}.json
├─ wind/
│  ├─ global/{period_id}/manifest.json
│  ├─ global/{period_id}/frames/*.json.gz
│  └─ storms/{storm_id}/manifest.json + frames/*.json.gz
├─ impact/
│  ├─ storms/{storm_id}/grid.geojson
│  └─ windows/{window_id}/grid.geojson
├─ taiwan/
│  ├─ zones.geojson
│  ├─ population.parquet
│  └─ facilities.geojson
└─ qa/
   ├─ data-profile.json
   ├─ missingness.csv
   └─ manual-checks.md
```

### 2.3 气旋目录 `storms-summary.json`

```json
{
  "schema_version": "1.0",
  "data_status": "observed",
  "source_ids": ["ibtracs"],
  "generated_at": "2026-07-20T12:00:00Z",
  "items": [
    {
      "id": "2013308N07140",
      "name": "HAIYAN",
      "season": 2013,
      "basin": "WP",
      "start_time": "2013-11-03T00:00:00Z",
      "end_time": "2013-11-11T00:00:00Z",
      "max_wind_ms": 87.5,
      "min_pressure_hpa": 895.0,
      "duration_hours": 192,
      "ace": 36.2,
      "landfall_count": 2,
      "classic": true,
      "classic_rank": 1,
      "impact_score": 94.2,
      "score_coverage": 0.8,
      "reported_deaths": 6300,
      "reported_damage_usd_2024": null,
      "wind_available": true,
      "impact_available": true,
      "data_status": "observed",
      "source_ids": ["ibtracs", "emdat"]
    }
  ]
}
```

字段要求：

| 字段             | 类型/空值     | 说明                                               |
| ---------------- | ------------- | -------------------------------------------------- |
| `id`             | string，非空  | 优先使用 IBTrACS SID，系统内永久主键               |
| `season`         | integer，非空 | 不使用含糊的 `year` 作为正式字段；API 可兼容旧字段 |
| `basin`          | enum          | `NA/SA/WP/EP/SP/NI/SI` 等 IBTrACS 规范值           |
| `max_wind_ms`    | number/null   | 统一风速；缺失不得填 0                             |
| `ace`            | number/null   | 明确计算采用的风速源和时间间隔                     |
| `classic_rank`   | integer/null  | 仅经典案例有值                                     |
| `impact_score`   | number/null   | 排序分，不等于真实损失                             |
| `score_coverage` | 0–1           | 影响分实际包含的指标权重比例                       |
| 报告影响字段     | number/null   | 保留来源和价格基年，不允许混为估算值               |

**A → B：** JSON/Parquet、记录数、字段缺失率、重复 SID 数。

**A → C：** 10 条缩小样例和正式字段说明，供地图、图表和算法边界测试。

**B 验收：** Pydantic 校验全量通过，`id` 唯一，排序/筛选测试通过。

**B 界面验收：** 案例列表、基础筛选和缺失状态完整，不因 `null` 出现 `NaN` 或崩溃。
**C 验收：** 地图和分析图表可以消费同一条目并正确跳过不可计算指标。

### 2.4 轨迹点 `track-points.parquet` 与轨迹 API

| 字段               | 类型          | 说明                        |
| ------------------ | ------------- | --------------------------- |
| `storm_id`         | string        | 与目录 `id` 外键一致        |
| `time`             | timestamp UTC | 单场内严格递增              |
| `lon` / `lat`      | float         | `[-180,180]` / `[-90,90]`   |
| `wind_ms`          | float/null    | 当前观测点风速              |
| `pressure_hpa`     | float/null    | 当前观测点中心气压          |
| `category`         | string/null   | `TD/TS/C1…C5`，不适用时为空 |
| `storm_status`     | string/null   | 来源状态代码的标准化值      |
| `moving_speed_kmh` | float/null    | 相邻点球面距离/时间         |
| `is_landfall`      | boolean/null  | 有可靠陆地相交结果才给值    |
| `source_agency`    | string/null   | 选用的机构或 `WMO`          |

轨迹 API 返回：

```json
{
  "schema_version": "1.0",
  "storm_id": "2013308N07140",
  "data_status": "observed",
  "points": [
    {
      "time": "2013-11-08T00:00:00Z",
      "lon": 124.5,
      "lat": 11.5,
      "wind_ms": 87.5,
      "pressure_hpa": 895.0,
      "category": "C5",
      "moving_speed_kmh": 31.4,
      "is_landfall": true
    }
  ]
}
```

**A 必做处理：** 去重、排序、单位统一、日期变更线展开/恢复、异常移动速度标记、地图简化和 64 点重采样。

**B 必做适配：** 按 `storm_id` 查询、404、可选时间区间、缓存；绝不在响应中返回 `NaN`。
**C 必做表现：** 日期变更线不跨整个地图画错误直线；时间插值只用于动画，提示框仍显示真实观测时刻。

### 2.5 风场 `manifest.json` 与帧

```json
{
  "schema_version": "1.0",
  "dataset_id": "haiyan-2013-era5",
  "mode": "storm",
  "storm_id": "2013308N07140",
  "data_status": "reanalysis",
  "source_ids": ["era5"],
  "units": "m/s",
  "grid_order": "north_to_south_west_to_east_row_major",
  "bounds": { "west": 110, "south": 0, "east": 150, "north": 30 },
  "resolution_degrees": 0.5,
  "width": 81,
  "height": 61,
  "frames": [
    {
      "time": "2013-11-08T00:00:00Z",
      "url": "/api/storms/2013308N07140/wind/frames/20131108T0000Z",
      "byte_size": 128400
    }
  ],
  "generated_at": "2026-07-21T12:00:00Z"
}
```

帧解压后的 JSON：

```json
{
  "schema_version": "1.0",
  "dataset_id": "haiyan-2013-era5",
  "time": "2013-11-08T00:00:00Z",
  "width": 81,
  "height": 61,
  "u": [1.25, 1.31],
  "v": [-0.8, -0.72],
  "missing_value": null
}
```

规则：`u.length == v.length == width * height`；数组顺序固定；全球模式建议 1°/6 小时，单场模式 0.5°/3 小时。正式帧以 `.json.gz` 保存，HTTP 对 C 提供普通 JSON 语义，是否由 B 解压或设置内容编码由 B 决定。

**A → B：** manifest、全部帧、每帧 min/max、随机 20 格与 ERA5 对照结果。

**B → C：** 稳定 manifest URL、帧 URL、缓存头、找不到帧时的 404/最近帧策略。
**C 验收：** 使用双线性插值；粒子方向与人工抽查风矢量一致；时间切换不会重置整个地图。

### 2.6 影响格网 `grid.geojson`

GeoJSON Feature 属性固定为：

| 字段                      | 类型         | 说明                                            |
| ------------------------- | ------------ | ----------------------------------------------- |
| `cell_id`                 | string       | 单一格网稳定 ID                                 |
| `time_start` / `time_end` | ISO string   | 单场累计或时间窗范围                            |
| `hazard_index`            | 0–1/null     | 模型危险度，非灾损                              |
| `max_wind_ms`             | number/null  | 时间窗内最大风速                                |
| `precip_mm`               | number/null  | 若未纳入降水则为空，不临时伪造                  |
| `population`              | integer/null | 格网总人口                                      |
| `exposed_population`      | integer/null | 满足阈值的估计暴露人口                          |
| `reported_damage_usd`     | number/null  | 只有来源确实支持该空间层级时使用                |
| `contributing_storm_ids`  | string[]     | 对多事件时间窗有贡献的气旋                      |
| `data_status`             | enum         | `observed/reanalysis/modeled/synthetic_fixture` |

**A 交付：** 至少 3 场完整影响格网和台湾展示时间窗；说明危险指数公式与阈值。

**B 交付：** 事件、时间窗、边界框和阈值参数；返回统计摘要。
**C 交付：** 指标切换、图例、透明度、区域点击和与时间窗联动；不同语义绝不共用标题。

### 2.7 台湾统计区与设施

`zones.geojson` 属性：

```text
zone_id: string             稳定连接键
county_code: string
town_code: string|null
name_zh: string
population: integer|null
population_year: integer|null
area_km2: number
centroid_lon/centroid_lat: number
source_ids: string[]
data_status: string
```

`facilities.geojson` 属性：

```text
facility_id: string         来源 ID；没有时生成稳定哈希
name: string
type: shelter|medical|rescue|warehouse
capacity_value: number|null
capacity_unit: people|beds|teams|people_day|null
service_radius_km: number
budget_points: integer|null 真实点为空；模拟点为 1–5
address: string|null
county_code: string|null
is_simulated: boolean
source_ids: string[]
data_status: string
```

设施经纬度存放在 GeoJSON `geometry.coordinates`，不在 properties 中重复保存；SQLite/API 的 `FacilityRead` 为方便编辑仍使用独立 `lon/lat` 字段。

类型默认参数只用于模拟情景：

| 类型      |    默认容量/单位 | 默认半径 | 默认预算点 | 覆盖指标                   |
| --------- | ---------------: | -------: | ---------: | -------------------------- |
| shelter   |       500 people |     5 km |          3 | 可安置人口                 |
| medical   |          50 beds |    15 km |          5 | 风险人口空间可达，床位单列 |
| rescue    |          5 teams |    20 km |          4 | 风险格网可达数量/人口      |
| warehouse | 5,000 people_day |    30 km |          4 | 物资服务人口日             |

不同单位不得相加成“总容量”。没有真实容量时前端显示“容量未知”，B 只计算空间可达，不把未知容量当成无限容量。

### 2.8 手绘匹配请求与响应

请求：

```json
{
  "mode": "geographic",
  "points": [
    { "lon": 130.0, "lat": 15.0 },
    { "lon": 122.0, "lat": 23.0 }
  ],
  "filters": { "basins": ["WP"], "season_from": 1980, "season_to": 2025 },
  "top_k": 5
}
```

响应：

```json
{
  "schema_version": "1.0",
  "mode": "geographic",
  "normalized_point_count": 64,
  "items": [
    {
      "storm_id": "2013308N07140",
      "rank": 1,
      "similarity": 0.91,
      "frechet_component": 0.93,
      "direction_component": 0.88,
      "explanation": "位置接近且西北向转折相似"
    }
  ],
  "elapsed_ms": 84,
  "data_status": "algorithmic_result"
}
```

C 负责匹配算法、性能基准以及绘制/编辑/结果表现，A 负责提供标准化 64 点历史特征；B 负责请求校验、API 包装、缓存和错误码。少于 2 个手绘点返回 422；`top_k` 最大 20；目标响应时间在本机小于 2 秒。

## 3. 每个人的详细任务

### 3.1 A：数据与空间分析（约 56 小时）

| 工作包                | 小时 | 具体动作                                                              | 交付物                                          | 验收                              |
| --------------------- | ---: | --------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------- |
| A1 数据清单与下载脚本 |    4 | 固定来源 URL、时间范围、许可证、缓存目录和校验值                      | `pipeline/README.md`、下载脚本、source manifest | 新成员可重跑；原始文件不进 Git    |
| A2 IBTrACS 清洗       |    8 | 统一 SID、机构、单位、时间；异常/重复检查；派生 ACE/持续时间/移动速度 | `storms.parquet`、`track-points.parquet`、QA    | 唯一 ID、点有序、抽查 3 场正确    |
| A3 经典案例选择       |    3 | 按数据交集而非知名度选 12–20 场；计算分量和覆盖率                     | `classic-storms.json`、选择说明                 | 多海盆、台湾相关案例、缺失透明    |
| A4 ERA5 风场          |   14 | 下载全球演示窗和区域案例；裁剪、降采样、输出 manifest/帧              | 至少 1 全球窗 + 8 场区域风场                    | u/v 长度、方向、时间、范围通过 QA |
| A5 影响与人口         |    9 | 危险格网、WorldPop/台湾人口相交；汇总时间窗                           | `impact/...`、指标说明                          | 总人口量级检查、无负值、语义清楚  |
| A6 台湾数据           |    8 | 边界/人口/设施坐标统一、去重、字段映射、类型标准化                    | `zones.geojson`、`facilities.geojson`           | 坐标落在合理范围，连接率报告      |
| A7 相似度特征         |    4 | 轨迹日期线处理、64 点重采样、形状归一化                               | `features/{id}.json` 或批量矩阵                 | B 可直接加载，无需再次清洗        |
| A8 文档与集成修复     |    6 | missingness、人工核对、字段变更沟通、演示数据冻结                     | `qa/*`、最终数据版本号                          | B/C 使用同一版本，正式/合成可辨   |

A 每个数据包必须同时交付四样东西：数据文件、可重跑脚本、字段/口径说明、QA 结果。只发一个 CSV 不算完成。

### 3.2 B：产品框架、服务集成与答辩保障（约 56 小时）

| 工作包                    | 小时 | 具体动作                                                     | 交付物                                                | 验收                                 |
| ------------------------- | ---: | ------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------ |
| B1 契约、适配层和共享类型 |    7 | 建 Pydantic/reader 和唯一 TS 类型；兼容 fixture/正式数据     | schemas、repositories、`frontend/src/types`、契约测试 | 两种数据源可切换，字段只定义一次     |
| B2 FastAPI 数据服务       |    8 | 目录/轨迹/风场/影响/台湾查询，筛选、bbox、gzip 和缓存        | 稳定数据 API、OpenAPI                                 | 过滤/404/空结果正确，路由无清洗代码  |
| B3 单页面框架与共享状态   |    8 | 常驻地图槽位、左右面板、底部时间轴、模式/store/API client    | `AppShell`、store、provider、feature slots            | C 的组件可按 props 插入，无页面跳转  |
| B4 基础控制、信息和对比面板 |    6 | 案例列表、筛选器、图层控制、数据来源；指标卡、对比表和简单条形图/点图 | controls、comparison panel、status banner | 2–3 场可比较，缺失值正确，不重复 C 的协同分析 |
| B5 SQLite 与算法服务包装  |    7 | 情景 CRUD、设施保存/拖动/删除；包装 C 的纯算法函数为 API     | models/migration、routes、request validation          | 数据库流程稳定；不复制 C 的算法逻辑  |
| B6 视觉系统与响应式打磨   |    7 | 色彩 token、排版、面板层级、动效规范、1080p 和窄屏适配       | design tokens、layout polish                          | 全站风格一致，重点视图不被面板遮挡   |
| B7 测试、性能和离线保障   |    8 | API/SQLite/组件烟测、错误边界、日志、启动/验证脚本、离线数据 | pytest、build、启动脚本、故障降级                     | `verify.ps1` 通过，断网可演示        |
| B8 答辩集成               |    5 | 演示预设、数据状态说明、讲稿串联、备用数据库和录屏协调       | demo preset、runbook、release checklist               | 8–10 分钟流程可连续完成 3 次         |

B 的工作虽然更碎，但难点在跨前后端集成、状态一致性、接口稳定性和最终交付可靠性。B 不改 C 的核心算法公式；算法响应仍必须通过 B 的 schema 校验并带假设或组成分量。

### 3.3 C：核心算法与交互可视化（约 56 小时）

| 工作包                      | 小时 | 具体动作                                                | 交付物                                   | 验收                                      |
| --------------------------- | ---: | ------------------------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| C1 MapLibre 分析图层        |    8 | 轨迹、聚合、影响、设施、选择高亮和固定图层顺序          | Map viewport、layer registry             | 与 B 的 store/controls 联动，缩放层级正确 |
| C2 真实风场粒子             |   11 | u/v 双线性插值、粒子生命周期、时间换帧、性能自适应      | Canvas/WebGL overlay                     | 真实帧方向正确，目标 45 FPS               |
| C3 手绘匹配算法与交互       |    9 | 64 点归一化、Fréchet/方向差、Top K；绘制/编辑/叠加解释  | Python 纯算法模块、测试、draw feature    | 已知相似样例排名正确，本机 <2 s           |
| C4 动态影响可视分析         |    7 | 指标映射、阈值、时间窗、区域点击、图例和透明度联动      | impact layers + visual logic             | 颜色/统计同步，不混淆危险、暴露和报告值   |
| C5 设施覆盖算法与反事实交互 |    9 | 半径/容量分配、去重覆盖；建设/拖动/删除、基线/方案对比  | 纯算法模块、测试、scenario visualization | 不重复计数，不同单位分开，可恢复基线      |
| C6 单场分析与协同图表       |    7 | 强度/气压、年度分布、平行坐标或影响构成；brush 联动地图 | ECharts feature components               | 图表刷选、时间和地图保持一致              |
| C7 算法与可视化性能 QA      |    5 | 数值边界、日期变更线、NaN、粒子帧率、图层冲突和说明文档 | benchmark、algorithm notes、visual QA    | B 可稳定包装，答辩能解释公式和局限        |

C 的后端算法应写成无数据库、无 HTTP 依赖的纯函数，放在 `backend/app/analysis/` 并带单元测试；B 负责把函数接入 FastAPI 和 SQLite。C 的前端组件必须消费 B 提供的共享类型和状态，不能另建第二套全局 store。

算法交接签名在 Day 1 冻结为类似以下形式，C 可以独立测试，B 可以先用 stub 包装接口：

```python
# C owns implementation and numerical tests.
def match_trajectories(
    query_points: list[GeoPoint],
    candidates: list[TrackFeature],
    mode: Literal["geographic", "shape"],
    top_k: int,
) -> list[TrajectoryMatch]: ...

def evaluate_facility_scenario(
    risk_cells: list[RiskCell],
    existing_facilities: list[FacilityInput],
    simulated_facilities: list[FacilityInput],
    hazard_threshold: float,
) -> FacilityEvaluation: ...
```

```tsx
// B owns state/provider; C owns these analytical feature implementations.
<CycloneMap state={mapState} actions={mapActions} />
<WindParticleLayer manifest={manifest} currentTime={currentTime} settings={windSettings} />
<TrajectoryDrawFeature filters={filters} onSelectStorm={selectStorm} />
<FacilityScenarioFeature scenarioId={scenarioId} hazardThreshold={threshold} />
```

禁止 B 在 API 路由中重写算法，也禁止 C 在可视化组件内绕过 B 的 API/全局状态直接维护另一份服务器数据。

### 3.4 B/C 图表边界

| B 负责的基础描述图表 | C 负责的核心分析图表 |
|---|---|
| 单场指标卡：最大风速、最低气压、持续时间、ACE、登陆次数 | 随时间变化的风速—气压剖面，并可刷选驱动地图和风场 |
| 2–3 场台风的对比表、分组条形图或点图 | 多事件平行坐标、地图联动筛选和视口变化后的统计更新 |
| 数据完整度、来源状态、是否具有风场或影响数据 | 手绘匹配总分及组成分量，点击后轨迹叠加 |
| 年份/海盆的简单数量摘要，只触发 B 的基础筛选状态 | 影响构成、设施建设前后变化和空间盲区联动 |

B 的图表以直接展示 API 已有字段为主，不设计新的分析算法；C 的图表以时间、空间、算法或多个视图协同为主。两者都可以使用 ECharts，但共享主题、格式化函数和颜色 token，禁止分别封装两套基础库。

## 4. 明确交接关系

| 截止点  | 生产者 | 交付给 | 交付内容                                              | 消费方收到后做什么                                                      |
| ------- | ------ | ------ | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| D1 中午 | A/B/C  | 全员   | 冻结契约和各 10 条最小 fixture                        | B 建 Pydantic/TS 类型、AppShell/store；C 定义算法签名和可视化组件 props |
| D2 晚   | A      | B/C    | 正式目录与 3 场正式轨迹                               | B 换 repository；C 核对地图、日期线和算法边界                           |
| D3 中午 | B      | C      | storms/track API、OpenAPI、共享状态和地图插槽         | C 移除对应 mock，把轨迹视图接入框架                                     |
| D3 晚   | A      | B/C    | 首场区域风场 + manifest + QA                          | B 提供帧接口和时间控制状态；C 校验粒子方向和换帧                        |
| D4 中午 | A      | B/C    | 台湾 zones/facilities                                 | B 提供查询与情景 CRUD；C 开发覆盖算法和设施图层                         |
| D4 晚   | A      | B/C    | 影响格网首版                                          | B 提供参数化接口；C 接入影响映射、阈值和图例                            |
| D5 中午 | A      | C      | 全部轨迹特征和格网                                    | C 跑匹配/覆盖算法的正确性和性能测试                                     |
| D5 下午 | C      | B      | `trajectory.py`、`facility.py` 纯函数、类型和单元测试 | B 包装 FastAPI、SQLite、422/404 和缓存，不改公式                        |
| D5 晚   | B      | C      | 匹配和 evaluate 稳定接口                              | C 将手绘与设施组件从本地调用切换为正式 API                              |
| D6 中午 | A      | B/C    | 数据冻结版：经典列表、风场、台湾                      | 之后只修 blocker，不再改字段                                            |
| D6 晚   | B/C    | 全员   | Release candidate                                     | 全员按演示脚本走查并记缺陷                                              |

任何交付都必须在群里用同一模板说明：`版本/路径或接口/字段变更/数据状态/已知问题/验收命令`。

### 4.1 第一场真实数据链路由 A 牵头

第一场建议使用 Morakot 2009；如果 ERA5 下载或事件字段存在明显问题，可经三人确认后改用 Haiyan 2013。A 对“数据链路完成”负责，但端到端验收必须由 B、C 各完成自己的接入步骤，不能把前端和 API 工作全部转给 A。

| 阶段 | 负责人 | 预计工时 | 具体工作 | 完成证据 |
|---|---|---:|---|---|
| IBTrACS 获取与清洗 | A | 3–4 h | SID、轨迹、时间、风速、气压、单位和日期线处理 | 正式 storm/track 文件通过 Schema |
| ERA5 获取与裁剪 | A | 5–7 h | 下载同期 `u10/v10`，裁剪、降采样、输出 manifest/frames | 至少 3 个连续真实时间帧通过 Schema |
| 数据 QA 与交付 | A | 3–5 h | 核对范围、时间、风向、数组顺序、缺失值和来源 | QA 文档、验证日志和抽查图 |
| FastAPI 适配 | B | 2–3 h | repository 读取正式文件，API 返回正式状态和来源 | Swagger/API 能读取 A 的产物 |
| 地图与粒子验收 | C | 2–3 h | 轨迹定位、真实 u/v 粒子、时间换帧和方向抽查 | Chrome 中真实轨迹与粒子正确显示 |

A 必须交付：

```text
backend/data/processed/
├─ catalog/storms-summary.json
├─ tracks/simplified/{storm_id}.geojson
├─ wind/storms/{storm_id}/manifest.json
├─ wind/storms/{storm_id}/frames/*.json.gz
└─ qa/manual-checks.md

backend/pipeline/
├─ 下载脚本
├─ 预处理脚本
└─ README.md
```

其中 `manual-checks.md` 至少记录：来源 URL、下载时间、原始变量名、坐标范围、时间范围、分辨率、单位、缺失比例、随机风矢量抽查和已知限制。A 还需要保存一张 Python quiver/矢量抽查图；该图用于数据 QA，不代替 C 的正式粒子可视化。

A 在交付前至少运行：

```powershell
.\.venv\Scripts\python.exe .\scripts\validate_contract.py storm-detail-list <气旋文件>
.\.venv\Scripts\python.exe .\scripts\validate_contract.py wind-manifest <manifest文件>
.\.venv\Scripts\python.exe .\scripts\validate_contract.py wind-frame <任一帧文件.json或.json.gz>
```

第一场链路只有同时满足以下条件才算完成：

- A 的正式轨迹、manifest 和风场帧全部通过可执行 Schema；
- B 的 API 不再为该事件返回 `synthetic_fixture`，并能显示真实来源；
- C 的地图不出现日期变更线错误，粒子方向与 A 的风矢量抽查一致；
- 连续播放至少 3 个时间帧，无数组长度错误、明显跳帧或控制台异常；
- 三人共同确认后，A 再批量扩展其余经典气旋，不能在首场未通过时直接批处理。

群内同步建议直接使用：

```text
[CycloneScope 首场真实链路]
负责人：A；接入验收：B/C
事件与时间窗：
数据版本与路径：
Schema 验证结果：
QA 结果与抽查图：
B 的 API 状态：
C 的地图/粒子状态：
已知问题：
下一步：
```

## 5. 没有 A 的正式数据时，B 和 C 如何继续

等待数据不是可接受的阻塞理由。D1 就冻结契约，并为每种产品保留小型 fixture。

### 5.1 B 的替代路径

| A 尚未交付 | B 使用什么                             | B 可以完成什么                                       | 正式数据到达后的动作             |
| ---------- | -------------------------------------- | ---------------------------------------------------- | -------------------------------- |
| IBTrACS    | 当前 `storms.json` + 扩展 fixture      | repository、路由、筛选、基础面板、共享状态和错误测试 | 只替换 repository，不改路由/组件 |
| ERA5       | 当前 `wind-demo.json`，扩成 3 个时间帧 | manifest、缓存、帧接口、时间控制条和加载状态         | 跑全量 shape/NaN/时间 QA         |
| 影响格网   | 20–50 个规则小格网 fixture             | bbox/阈值 API、图层控制框架、数据状态和响应大小保护  | 替换文件并做数值量级检查         |
| 台湾设施   | 10 个明确标为 synthetic 的点           | SQLite CRUD、编辑保存、场景列表和算法 API 包装       | 用稳定 ID 替换真实基线点         |
| 轨迹特征   | 约定好的固定 Top 5 响应                | 请求校验、缓存、错误码、结果面板容器                 | 接入 C 的算法函数，不复制算法    |

B 的 fixture 必须包含 `data_status: synthetic_fixture`，不能在正式演示模式静默使用。

### 5.2 C 的替代路径

| A/B 尚未交付      | C 使用什么                           | C 可以完成什么                              | 正式数据/API 到达后的动作     |
| ----------------- | ------------------------------------ | ------------------------------------------- | ----------------------------- |
| 正式轨迹          | 5 条包含直线、转向和日期线的 fixture | 轨迹图层、64 点重采样、Fréchet/方向差和高亮 | 用正式特征跑排名回归测试      |
| 风场 API          | 5×5、20×20 旋转矢量 fixture          | 粒子生命周期、插值、性能控制和图层透明度    | 用真实帧检查方向、尺度和帧率  |
| 影响 API          | 小型 FeatureCollection fixture       | MapLibre fill、阈值、图例、点击详情和联动   | 校验真实 GeoJSON 大小和缺失值 |
| 匹配 API 包装     | 直接调用自己实现的纯算法函数         | 绘制、Top 5、叠加解释和算法测试             | 改由 B 的 POST 调用并补错误态 |
| evaluate API 包装 | 规则格网 + 模拟设施直接调用纯函数    | 容量分配、去重覆盖、编辑和前后对比          | 改由 B 的 API 调用并显示假设  |

B 负责统一的数据访问层和 `mock/real` 开关；C 的组件通过 B 提供的 provider/props 获取数据。C 可以在算法单元测试中直接加载 fixture，但生产组件不能直接 `import` mock。

### 5.3 最迟替换线

- D3 前允许所有模块使用 fixture。
- D4 结束时，轨迹和至少一场真实风场必须端到端联通。
- D5 结束时，影响或台湾设施至少一项必须使用正式数据。
- D6 中午数据冻结；若某项仍无正式数据，按 `system-design.md` 的删减顺序降级，界面明确标识，不伪装完成。

## 6. 七天排期（每天 8 小时）

日期可整体平移；若 27 日展示，建议将 Day 1–7 安排在 20–26 日。

| 日程  | A                                        | B                                               | C                                       | 当日共同出口                    |
| ----- | ---------------------------------------- | ----------------------------------------------- | --------------------------------------- | ------------------------------- |
| Day 1 | 来源确认、IBTrACS 下载/字段映射、fixture | 契约模型、repository、AppShell、store、共享类型 | 地图初始化、算法函数签名和边界 fixture  | 契约 V1、框架槽位和算法接口冻结 |
| Day 2 | 全球轨迹、派生指标、经典初选             | 目录/轨迹 API、筛选缓存、案例/图层控制和基础对比面板 | 轨迹/聚合图层、日期线处理、地图交互     | 真实轨迹和 2–3 场基础对比首次端到端 |
| Day 3 | 首场 ERA5 + 全球小时间窗                 | 风场服务、时间状态/控制条、加载和错误状态       | 粒子引擎、强度图和时间联动              | 真实风场随时间播放              |
| Day 4 | 台湾人口/设施 + 影响格网                 | 台湾/影响 API、SQLite CRUD、情景面板框架        | 影响图层、覆盖算法、设施可视交互        | 动态影响或设施闭环              |
| Day 5 | 全经典风场批处理、轨迹特征               | 包装算法 API、缓存/错误码、全局状态集成         | 手绘匹配算法与 UI、覆盖算法与前后对比   | 两个亮点交互可演示              |
| Day 6 | 数据 QA、来源和最终冻结                  | 视觉系统、响应式、全 API/构建测试、离线降级     | 算法回归、粒子性能、图层冲突和图表 QA   | Release candidate，停止加功能   |
| Day 7 | 数据讲稿与备用文件                       | 演示预设、视觉答辩讲稿、备份/录屏、浏览器 QA    | 算法讲稿、参数/限制说明、核心可视化修复 | 全流程彩排 3 次、只修 blocker   |

每天建议：6 小时实现、1 小时集成、1 小时 review/文档。每天结束前必须把可运行状态合入集成分支，不能连续两天只存在个人电脑。

## 7. Git 与协作规则

建议分支：

```text
main                       稳定演示版本
develop                    每日集成
feat/data-pipeline         A
feat/app-integration       B
feat/visual-algorithms     C
```

- 第一次稳定骨架提交后再分支；不要把 `.venv`、`node_modules`、NetCDF、GeoTIFF 或密钥提交。
- 每个 PR 只解决一个工作包，描述中写输入、输出、验证和截图/接口样例。
- A 修改数据契约必须让 B、C review；B 修改共享状态、API 或页面槽位让 C review；C 修改算法签名让 B review，修改指标语义让 A review。
- 合并前至少运行自己负责的局部测试；合入 `develop` 前运行 `scripts/verify.ps1`。
- 每晚从 `develop` 同步个人分支，先解决冲突再继续，避免 Day 6 集中合并。
- Day 6 中午创建演示标签候选；Day 7 只接受 blocker 修复。

### 7.1 每个人提交前必须完成的本地验证

“代码写完”“文件生成了”或“页面看起来差不多”均不算完成。每个工作包提交前必须同时提供：可重复命令、预期结果、实际结果、代表性证据和已知限制。验证记录使用 [`verification-template.md`](verification-template.md)，可粘贴到 PR 描述或保存在工作包说明中。专项检查以本次工作包实际包含的功能为范围；尚未实现的后续接口标为 `N/A（未进入本工作包）`，不能伪造结果，也不能阻止当前骨架提交。

#### A：证明数据正确、可追溯、可被系统消费

A 的验证分为结构验证、数值 QA、可视抽查和可复现性四层。

1. **结构验证**

   对本次交付的每种正式数据运行对应契约，例如：

   ```powershell
   .\.venv\Scripts\python.exe .\scripts\validate_contract.py storm-detail-list <storms.json>
   .\.venv\Scripts\python.exe .\scripts\validate_contract.py wind-manifest <manifest.json>
   .\.venv\Scripts\python.exe .\scripts\validate_contract.py wind-frame <frame.json或frame.json.gz>
   .\.venv\Scripts\python.exe .\scripts\validate_contract.py impact-grid <grid.geojson>
   .\.venv\Scripts\python.exe .\scripts\validate_contract.py taiwan-facilities <facilities.geojson>
   ```

   每条命令必须得到 `VALID`；只展示 Python 脚本没有报错不够。

2. **数值与连接 QA**

   A 必须在 `backend/data/processed/qa/` 中保存本次数据报告，至少包括：

   - 记录数、唯一气旋数、时间范围、坐标范围和重复 ID 数；
   - 关键字段缺失率，尤其是风速、气压、设施容量和人口；
   - 风速/气压最小值、最大值和异常值数量；
   - IBTrACS—ERA5 的事件 ID/时间连接结果；
   - 台湾人口—行政区连接率、设施坐标落区率；
   - 输出文件数量、总体积、生成时间和输入来源。

   预期至少满足：ID 唯一、轨迹时间递增、坐标在范围内、`u/v` 长度正确、人口非负、正式数据具有 `source_ids`。连接率未达到预设目标时必须解释，而不是删除未连接记录。

3. **可视和人工抽查**

   - 随机选择至少 3 个轨迹点，与来源数据核对时间、经纬度、风速和气压；
   - 随机选择至少 3 个 ERA5 网格点，用 Python quiver/箭头图核对 `u/v` 方向；
   - 将轨迹和风矢量画在同一张 QA 图上，确认没有南北翻转、经度偏移或日期线横跨；
   - 台湾点位至少抽查 5 个地址/县市与坐标是否一致。

4. **可复现性**

   在清空临时输出或使用新的输出目录后重新运行预处理命令，确认能生成相同 schema 版本、记录数和关键统计。下载凭证不得写进脚本或提交。

A 提交时提供：验证命令输出、`qa` 报告路径、抽查图路径、3 条人工核对记录、数据版本和已知问题。原始大文件和处理后大文件仍不得提交 Git；提交的是脚本、Schema、少量 fixture、QA 摘要和文档。

#### B：证明 API、数据库、页面框架和降级流程正确

1. **自动验证**

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1
   ```

   必须得到 `Contract schemas are current`、全部 pytest 通过和 `CycloneScope local verification passed`。如果 B 修改了 Schema，必须先运行 `scripts/generate-contracts.ps1` 并提交源模型及生成产物。

2. **Swagger/API 正常路径验证**

   启动后端后，在 Swagger 或 PowerShell 中完成代表性调用：

   ```powershell
   Invoke-RestMethod http://127.0.0.1:8000/api/health
   Invoke-RestMethod "http://127.0.0.1:8000/api/storms?classic=true&basin=WP"
   Invoke-RestMethod http://127.0.0.1:8000/api/storms/demo-morakot-2009/wind/manifest
   ```

   当前基线的预期结果分别为：`status=ok`；WP 经典夹具 `count=2`；manifest 中 `width=5`、`height=5`、`frames` 长度为 1。接入正式数据后，用对应正式事件更新预期值，并确认 `data_status/source_ids/schema_version` 正确。

3. **SQLite 情景闭环验证**

   ```powershell
   $scenario = Invoke-RestMethod -Method Post `
     -Uri http://127.0.0.1:8000/api/scenarios `
     -ContentType "application/json" `
     -Body '{"name":"pre-submit-smoke"}'

   Invoke-RestMethod -Method Post `
     -Uri "http://127.0.0.1:8000/api/scenarios/$($scenario.id)/facilities" `
     -ContentType "application/json" `
     -Body '{"type":"shelter","lon":121.5,"lat":24.0,"capacity_value":500,"capacity_unit":"people","service_radius_km":5,"budget_points":3}'

   Invoke-RestMethod -Method Post `
     -Uri "http://127.0.0.1:8000/api/scenarios/$($scenario.id)/evaluate" `
     -ContentType "application/json" `
     -Body '{"at_risk_population":1000}'
   ```

   当前基线预期：设施创建为 `201`；评估覆盖 500、未覆盖 500、覆盖率 0.5、预算点 3。B 修改数据库或评估包装后必须重新完成这一闭环。

4. **错误路径验证**

   至少检查：不存在气旋返回 404；手绘少于 2 点返回 422；设施类型与容量单位不匹配返回 422；API 断开时前端显示错误状态而不是无限加载；fixture 与正式数据切换时顶部状态正确。

5. **页面框架与基础图表验证**

   在 Chrome 1920×1080 中确认：左右面板和时间轴无横向溢出；2–3 场基础对比的单位/空值正确；刷新后共享状态没有异常；控制台无红色错误；关闭网络后本地数据、底图降级或明确错误提示符合设计。

B 提交时提供：`verify.ps1` 摘要、至少 3 个 API 的请求/关键响应、SQLite 闭环结果、一个 404/422 证据、页面截图和已知限制。

#### C：证明算法正确、核心可视化真实且交互联动有效

1. **算法单元与基准测试**

   C 实现算法时必须同步创建对应测试文件，建议命令：

   ```powershell
   .\.venv\Scripts\python.exe -m pytest `
     backend/tests/test_trajectory_analysis.py `
     backend/tests/test_facility_analysis.py -q
   ```

   手绘匹配至少包含：完全相同轨迹排第 1；平移后的轨迹在 shape 模式仍相似；反向轨迹得分明显降低；日期变更线轨迹不产生超长错误距离；Top K 排名、分量和总分符合 0.6/0.4 权重。

   设施算法至少包含：零设施、容量不足、容量大于需求、服务区重叠不重复计数、不同容量单位不相加、危险阈值变化和拖动设施后的结果变化。

2. **风场数值验证**

   - 用 `u>0,v=0` 的均匀 fixture 验证粒子向东；`u=0,v>0` 验证粒子向北；
   - 用 2×2 或 5×5 已知网格验证双线性插值的中心值；
   - 使用 A 的真实帧抽查至少 3 个位置，粒子方向必须与 quiver 图一致；
   - 快速切换时间时不得继续渲染旧请求返回的帧。

3. **地图与协同交互验证**

   在 Chrome 中逐项完成：选择气旋后轨迹、指标和时间范围同步；拖动时间轴后粒子、当前位置和强度曲线同步；改变影响阈值后颜色、图例和统计同步；手绘 Top 5 可高亮并定位；设施新增、拖动、删除、恢复基线均触发正确变化。

4. **性能和视觉验证**

   - 答辩设备默认粒子数下连续播放 30 秒，目标 45 FPS，最低不持续低于 25 FPS；
   - 地图缩放/平移期间没有明显主线程冻结，粒子 Canvas 与地图保持对齐；
   - 风场与影响图层分别调节透明度，默认状态下关键颜色不互相遮挡；
   - Chrome 控制台无错误，Network 中没有无限重复请求或单帧异常大响应；
   - 在 1920×1080 完整录制一段 20–30 秒操作证据，包含时间播放或核心交互。

C 提交时提供：算法测试摘要、至少两个“输入—预期—实际”案例、真实风场抽查说明、FPS/响应时间、截图或短录屏和已知限制。

#### 共同提交门禁

每个人完成自己的专项验证后，还必须在项目根目录执行：

```powershell
git status --short
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1
git add <本工作包文件>
git diff --cached --check
git diff --cached --stat
git diff --cached --name-only
```

检查暂存列表中没有 `.env`、Token、`.venv`、`node_modules`、数据库、NetCDF、GeoTIFF、PMTiles 或其他未经确认的大数据。以下任一情况存在时不得提交：专项验证未通过；只能在个人机器的特殊手工步骤下运行；正式数据被标为 fixture 或反之；预期结果未写明；控制台仍有未解释错误；生成 Schema 已过期；测试被删除或跳过以换取通过。

只有“个人专项验证 + 全项目 `verify.ps1` + 暂存文件审查”三项同时通过，才允许提交到个人分支；合入 `develop` 仍需要对应消费者 review。

## 8. 实现细节约束

### 8.1 共享前端状态

至少统一以下状态，禁止散落在各组件：

```ts
type AnalysisMode = "overview" | "storm" | "draw-match" | "taiwan-scenario";

interface AppState {
  mode: AnalysisMode;
  selectedStormId: string | null;
  comparisonStormId: string | null;
  currentTime: string | null;
  timeWindow: { start: string; end: string } | null;
  filters: {
    basins: string[];
    seasonRange: [number, number];
    minWindMs: number;
  };
  layers: Record<string, { visible: boolean; opacity: number }>;
  selectedScenarioId: string | null;
}
```

### 8.2 地图图层顺序

固定从下到上：底图 → 人口/影响填色 → 风速标量 → 历史轨迹 → 选中轨迹 → 风场粒子 Canvas → 真实设施 → 模拟设施 → 手绘线 → 标签/提示。调整顺序需由 C 说明理由，避免粒子遮住影响图层。

### 8.3 请求和错误处理

- 时间轴快速拖动使用取消请求或只保留最后一次响应。
- 设施拖动期间只更新本地预览，拖动结束后再请求评估，并做 200–300 ms 防抖。
- 每个模块具备 loading、empty、error、stale 四种状态。
- 数据缺失时显示“未提供/不可比较”，不要自动变成 0。
- 正式数据接口失败时可显式进入“演示夹具模式”，并在顶部持续显示横幅。

### 8.4 可复现与离线

- 演示所需的最终处理数据必须预先保存在本机，答辩时不依赖 ERA5、CDS 或其他远程服务。
- 保留一条启动后端命令、一条启动前端命令和一条完整验证命令。
- Day 7 保存浏览器书签/演示预设、数据库备份和 1–2 分钟备用录屏。

## 9. 集成验收清单

### A 数据

- [ ] 全部正式文件有来源、生成时间、schema 版本和 data status。
- [ ] 轨迹 ID 唯一、时间有序、日期变更线处理正确。
- [ ] 风场 u/v 方向、单位、数组顺序和时间经过抽查。
- [ ] 台湾人口与边界连接率、设施坐标异常和容量缺失率已报告。
- [ ] 估算、再分析、观测和报告值没有混用标签。

### B 产品框架与服务集成

- [ ] Swagger 可打开，样例响应与本文件一致。
- [ ] 过滤、404、422、空结果、超大请求和算法包装均有测试。
- [ ] SQLite 和文件数据均可在断网环境运行。
- [ ] AppShell、共享状态、基础控制和数据 provider 没有重复实现。
- [ ] 台风指标卡、对比表及简单条形图/点图可以比较 2–3 场事件，单位和空值正确。
- [ ] 1920×1080 Chrome 无溢出，loading/error/data status 清楚，演示预设可恢复。

### C 核心算法与可视化

- [ ] 匹配 Top K 有组成分量、已知样例排序正确且本机小于约 2 秒。
- [ ] 设施覆盖不重复计数，不同容量单位不相加，并有边界测试。
- [ ] 真实风场和影响层可分别调透明度，默认不互相遮挡。
- [ ] 时间、事件、筛选、地图和图表联动没有状态冲突。
- [ ] 手绘可清除/重画，设施可新增/拖动/删除/恢复基线。
- [ ] 核心算法是可测试纯函数，MapLibre/Canvas/ECharts 组件可插入 B 的框架。

### 全员

- [ ] `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1` 通过。
- [ ] 从全新浏览器窗口完成 8–10 分钟演示流程至少 3 次。
- [ ] 每个人能解释自己的输入、处理、输出、局限和与下一位成员的接口。
- [ ] 展示中所有关键数字能追溯到来源或明确标为模型/估算。

## 10. 答辩分讲建议

- A：数据来源、为什么只预处理选定全球时间窗和经典案例、真实风场/影响口径与数据质量。
- B：单页面框架、共享状态、FastAPI/SQLite 集成、视觉系统、错误降级与离线答辩保障。
- C：手绘匹配和设施覆盖算法、MapLibre + 真实粒子、动态影响、协同图表及性能。
- 三人共同结尾：用台湾建设前后情景说明系统不是静态故事图，而是可探索、可比较、可反事实操作的可视分析工具。
