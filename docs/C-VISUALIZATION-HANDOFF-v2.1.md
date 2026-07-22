# CycloneScope C 可视化实现交接文档 v2.1

更新时间：2026-07-20  
适用分支：`feat/visual-algorithms`  
当前基线：`f2a25b8`（已合并 B 的 `feat/app-integration`，B 已完成 A v2.1 数据目录适配）

本文是 C 开始实现地图、轨迹、ERA5 粒子、影响图层、手绘匹配和台湾设施交互前的执行交接文档。A 的数据处理口径以 `docs/data-processing/DATA-PROCESSING-HANDOFF-v2.1.md` 和 `DATA-CONTRACTS-v2.1.md` 为准；B 的服务接口以 `backend/app/routers/`、`backend/app/schemas/` 和 Swagger 为准。C 不应重新清洗 A 的原始数据，也不应在前端自行猜测字段。

## 1. 当前已经具备的内容

### 1.1 A 已交付的数据

数据版本为 `a8-final-2026.07.19`，契约版本为 `2.1`。A 的处理结果包括：

| 内容 | 可用范围 | C 的用途 |
| --- | --- | --- |
| IBTrACS 全球目录与轨迹 | 4,943 场、约 300,007 个轨迹点 | 全球事件筛选、轨迹线、轨迹指标 |
| 西北太平洋轨迹 | 约 104,304 点 | WP 区域分析 |
| 经典案例 | 16 场，多海盆 | 左侧案例库、重点事件分析 |
| 64 点轨迹特征 | global 4,932 条、WP 1,514 条有效特征 | 手绘轨迹匹配 |
| ERA5 风场 | 13 个 manifest、665 个压缩帧 | 动态/静态风场和粒子 |
| ERA5 能力矩阵 | 8 场 dynamic、4 场 static、4 场 none | 决定界面显示动态、静态或不可用 |
| 影响格网 | 5/16 个经典案例 | hazard、风速、暴露人口等空间图层 |
| 台湾区划 | 22 个行政区契约边界 | 台湾情景地图 |
| 台湾设施 | 避难所、医疗、救援设施共 7,204 点 | 设施图层、覆盖分析、情景编辑 |
| 台湾道路/服务区 | 静态路网和 8,747 条服务区记录 | 设施可达范围展示 |

数据目录的真实布局为：

```text
output/processed/
├─ catalog/storms-summary.json
├─ classic/classic-storms.json
├─ ibtracs-global-since1980/...
├─ ibtracs-wp-since1980/...
├─ features/global-since1980/...
├─ era5/wind/global/{period_id}/manifest.json
├─ era5/wind/storms/{storm_id}/manifest.json
├─ era5/wind/storms/{storm_id}/frames/*.json.gz
├─ impact/storms/{storm_id}/grid.geojson
├─ impact/windows/{window_id}/grid.geojson
└─ taiwan/{zones.geojson,facilities.geojson,roads/...}
```

C 不能直接读取 CSV、NetCDF、GeoTIFF、原始 Parquet 或 A 的内部字段。前端只消费 B API、契约 GeoJSON、manifest 和 API 返回的普通 JSON 风场帧。

### 1.2 B 已交付的 API

B 已在 `ProcessedRepository` 中适配 A v2.1 的 `era5/wind/**` 路径，并根据磁盘上实际存在的 manifest/grid 动态计算 `wind_available` 和 `impact_available`。主要 API 如下：

| API | 返回内容 | C 的使用方式 |
| --- | --- | --- |
| `GET /api/health` | 服务、数据模式、版本 | 顶部状态和正式/夹具提示 |
| `GET /api/data-sources` | 来源清单 | 数据来源面板 |
| `GET /api/storms` | 目录摘要与筛选结果 | 案例列表、筛选和地图概览 |
| `GET /api/storms/{storm_id}` | 单场详情和完整轨迹 | 事件详情、指标卡、完整轨迹 |
| `GET /api/storms/{storm_id}/track` | 可按 UTC 时间过滤的轨迹 | 时间轴、轨迹动画、当前位置 |
| `GET /api/storms/{storm_id}/wind/manifest` | 风场范围、网格、帧时间和 URL | 风场能力判断、帧索引 |
| `GET /api/storms/{storm_id}/wind/frames/{frame_name}` | `u/v` 风场数组 | 双线性插值和粒子推进 |
| `GET /api/wind/periods/{period_id}/manifest` | 全球窗口风场 manifest | 全球概览风场 |
| `GET /api/impact/grid?storm_id=...` | 影响 GeoJSON | 影响格网、图例和点击详情 |
| `GET /api/taiwan/zones` | 台湾区划 GeoJSON | 台湾区域填色和边界 |
| `GET /api/taiwan/facilities?type=...` | 设施 GeoJSON | 避难所/医疗/救援图层 |
| `GET /api/taiwan/facilities/{id}/service-area` | 设施静态服务范围 | 可达范围叠加 |
| `POST /api/trajectory-match` | Top-K 轨迹匹配结果 | 手绘结果列表和高亮 |
| `/api/scenarios/**` | 情景、设施 CRUD 与评估 | 台湾设施增删拖动和反事实评估 |

`frontend/src/types/contracts.ts` 是前端使用的类型入口；`schemas/generated/` 与 `frontend/src/types/api.generated.ts` 均为生成文件，不能手工修改。

## 2. C 当前代码状态

已经存在的 C 基础代码：

- `backend/app/algorithms/trajectory.py`：轨迹重采样、形状归一化和距离函数；
- `backend/app/algorithms/wind.py`：双线性插值和粒子推进基础函数；
- `backend/app/algorithms/facilities.py`：设施距离和人口分配基础函数；
- `backend/tests/test_algorithms.py`：基础算法测试；
- `frontend/src/components/MapView.tsx`：MapLibre 地球、底图、轨迹线和图层容器；
- `frontend/src/components/AppShell.tsx`：共享筛选、案例库、状态面板和时间轴；
- `frontend/src/state/AppState.tsx`：事件、时间、图层、情景和播放状态；
- `frontend/src/api.ts`：统一 JSON 请求和情景 API；
- `frontend/src/components/GlobeStage.tsx`：旧 SVG 地球原型，目前不应继续扩展；
- `frontend/public/a-data-demo/`：本地演示资产，仅用于离线临时预览，不是最终数据入口。

当前仍需调整的旧逻辑：

1. `MapView` 仍有 `VITE_C_DATA_MODE=local` 分支，应改为 API provider 优先；
2. `basinPoint()` 生成的是演示位置，不能作为正式事件位置，需删除或改为加载真实轨迹首点/质心；
3. ERA5 粒子目前没有读取 manifest/frame，不能继续使用伪随机粒子；
4. 影响格网、台湾区划和设施图层尚未接入 MapLibre source/layer；
5. 当前 `maxZoom: 7` 偏小，台湾情景需要更高缩放并自动定位；
6. 时间轴需要统一驱动轨迹可见段、风场帧、影响时间窗和右侧指标；
7. 需要为 API 的 `dynamic/static/none` 能力状态提供明确 UI，而不是显示空白图层。

## 3. C 接下来应按以下顺序实现

### C1：先切换到 B API 数据源

前端正式运行时使用：

```powershell
$env:CYCLONESCOPE_DATA_ROOT="D:\path\to\CycloneScope-data-delivery-v2.1"
$env:CYCLONESCOPE_DATA_MODE="processed"
```

生产/答辩模式中不要设置 `VITE_C_DATA_MODE=local`。本地 A demo 只用于 API 尚未启动时的临时开发。

建议在 `frontend/src/api.ts` 增加明确的 C provider：

```ts
getStormTrack(id, start?, end?)
getWindManifest(id)
getWindFrame(id, frameName)
getImpactGrid(id, params)
getTaiwanZones()
getTaiwanFacilities(type?)
getFacilityServiceArea(id)
matchTrajectory(payload)
```

所有请求都必须支持 `AbortSignal`。时间轴快速拖动时取消旧请求，避免旧帧覆盖新帧。

### C2：完成 MapLibre 地球与台湾定位

地图固定图层顺序：

```text
底图 → 台湾区划/人口 → 影响格网 → 历史轨迹 → 当前轨迹段
→ 风场粒子 → 真实设施 → 模拟设施 → 手绘线 → 标签/Popup
```

地图要求：

- `maxZoom` 提高到 9–10；
- 全球模式保持地球投影；
- 台湾情景切换到中心约 `[120.9, 23.7]`；
- 台湾范围建议使用 `119.0–122.5E、21.5–25.5N` 自动 `fitBounds`；
- 影响格网和设施必须使用 GeoJSON source，不依赖 OSM 标签来表达台湾数据；
- 日期变更线轨迹必须拆线，不能在地图上画出跨越整张世界地图的错误直线；
- 图层透明度由 `AppState.layers` 控制，不在组件内部另设状态。

### C3：接入真实轨迹和时间轴

选择事件后请求 `/api/storms/{id}/track`。时间轴的行为：

- 起点显示第一个真实观测点；
- 播放时只显示 `time <= currentTime` 的轨迹段；
- 当前点显示风速、气压、类别和真实观测时间；
- 插值仅用于动画，不得把插值值伪装成观测值；
- 选择没有轨迹或时间范围不合法时显示 empty/error 状态；
- 轨迹请求和案例详情请求不能互相覆盖。

### C4：接入 ERA5 粒子

粒子实现必须严格使用 manifest/frame：

1. 请求 manifest，读取 `bounds`、`width`、`height`、`resolution_degrees` 和 `frames[]`；
2. 根据 `currentTime` 选择最近帧或相邻两帧；
3. 请求 `/api/storms/{id}/wind/frames/{frame_name}`；
4. 按 `grid_order=north_to_south_west_to_east_row_major` 解析数组；
5. 通过双线性插值读取粒子当前位置的 `u/v`；
6. 使用经纬度推进粒子，再通过 MapLibre 投影到 Canvas；
7. 粒子只在 manifest bounds 内生成，不能在整张页面随机漂移；
8. `wind_available=false` 或 capability 为 `none` 时不绘制粒子；
9. static 只显示静态风场/箭头，不播放动态粒子；
10. 加载失败时显示“风场不可用”，不得回退到伪粒子。

必须删除或永久关闭原来的公式随机粒子。真实粒子至少完成均匀东西风、均匀南北风、2×2 双线性插值和真实帧方向抽查。

### C5：接入影响格网

请求 `/api/impact/grid?storm_id={id}`，按 `metric` 切换：

- `hazard_index`：模型危险度，0–1；
- `max_wind_ms`：最大风速；
- `population`：格网总人口；
- `exposed_population`：阈值下暴露人口；
- `reported_damage_usd`：只有数据存在时显示。

要求：

- 图例、标题和单位随指标变化；
- `null` 显示“未提供”，不能显示为 0；
- 影响格网只有 5/16 经典案例，其他事件明确显示“暂无影响格网”；
- 点击格网显示 `cell_id`、时间窗、数据状态和来源；
- `hazard_threshold` 过滤只作用于危险度，不误用到人口或灾损字段。

### C6：接入台湾设施和情景

台湾情景中加载 zones、facilities 和 service-area：

- 区划作为背景填色/边界；
- 设施按 `shelter/medical/rescue/warehouse` 分色；
- 容量未知显示“容量未知”，不得当作无限容量；
- 不同容量单位不能相加；
- 真实设施与模拟设施视觉区分；
- 新增、拖动、删除调用 `/api/scenarios/**`；
- 拖动结束后再评估，增加 200–300ms 防抖；
- 显示覆盖人口、未覆盖人口、覆盖率和预算点，并标注计算口径。

### C7：实现手绘轨迹匹配

流程：

1. 用户在地图上绘制至少 2 个点；
2. 前端发送 `POST /api/trajectory-match`；
3. 显示 Top-K、相似度、Frechet 分量、方向分量和解释；
4. 点击结果高亮对应真实轨迹并定位；
5. 支持清除、重画和筛选条件继承；
6. 少于 2 点显示 422 提示，不发送无效请求。

## 4. 需要明确保留的限制

以下不是 C 的 bug，必须在界面中诚实展示：

- ERA5 能力不是每场都相同：8 dynamic、4 static、4 none；
- 影响格网仅覆盖 5/16 经典案例；
- 台湾人口统计日期为 2024-12-01；
- 道路服务区是静态估算，不代表实时交通；
- EM-DAT 是报告灾损，TCE-DAT 是模型暴露，不能混成同一指标；
- `impact_score` 是排序分，不是真实灾损；
- fixture 模式中的数值只能用于演示，顶部必须显示夹具警告。

## 5. 启动、验证和集成命令

### 5.1 启动正式数据模式

终端一：

```powershell
cd "D:\大二\信息可视化\期末\项目"
$env:CYCLONESCOPE_DATA_ROOT="D:\大二\信息可视化\期末\CycloneScope-data-delivery-v2.1.7z"
$env:CYCLONESCOPE_DATA_MODE="processed"
.\scripts\start-backend.ps1
```

终端二：

```powershell
cd "D:\大二\信息可视化\期末\项目\frontend"
Remove-Item Env:VITE_C_DATA_MODE -ErrorAction SilentlyContinue
npm.cmd run dev
```

验证：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
Invoke-RestMethod "http://127.0.0.1:8000/api/storms?classic=true"
Invoke-RestMethod "http://127.0.0.1:8000/api/storms/{storm_id}/track"
Invoke-RestMethod "http://127.0.0.1:8000/api/storms/{storm_id}/wind/manifest"
Invoke-RestMethod "http://127.0.0.1:8000/api/taiwan/facilities?type=medical"
```

实际运行时将 `{storm_id}` 替换为 API 返回的真实 ID，不使用旧的 `demo-morakot-2009`，除非处于 fixture 模式。

### 5.2 自动验证

```powershell
cd "D:\大二\信息可视化\期末\项目"
.\.venv\Scripts\python.exe -m pytest backend/tests -q
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1
cd frontend
npm.cmd run build
```

### 5.3 C 专项验收

- [ ] 选择真实事件后能显示真实轨迹线和当前点；
- [ ] 时间轴播放时轨迹、风场和指标同步；
- [ ] dynamic/static/none 三种风场能力显示正确；
- [ ] 粒子方向与 A 的真实 `u/v` 帧一致；
- [ ] 台湾模式能放大到台湾本岛，区划和设施清楚可见；
- [ ] 影响格网颜色、图例、阈值和点击详情正确；
- [ ] 手绘匹配结果能高亮真实轨迹；
- [ ] 设施增删拖动和评估结果闭环；
- [ ] `null`、404、无影响格网、无风场均有明确界面状态；
- [ ] Chrome 1920×1080 下无横向溢出，控制台无错误；
- [ ] 连续播放 30 秒没有持续卡顿或重复请求。

## 6. C 的提交边界

C 可以修改：

- `frontend/src/components/` 中的地图、粒子、图表和交互组件；
- `frontend/src/api.ts` 中的 API provider；
- `frontend/src/state/` 中与 C 功能直接相关的共享状态；
- `frontend/src/style.css` 中的可视化样式；
- `backend/app/algorithms/` 和对应测试；
- C 专项文档和验证脚本。

C 不应直接修改：

- A 的原始数据、处理脚本和字段口径；
- `backend/app/schemas/` 的契约模型；
- `schemas/generated/` 和生成的前端 API 类型；
- B 的 SQLite 表结构、通用错误处理中间件和基础路由；
- 未经确认的大型 `processed` 数据包。

如发现字段或 API 不足，先在本文件记录“接口缺口”，再与 B 确认；不要在前端偷偷改字段名或把缺失值填成 0。

## 7. 推荐实现顺序

```text
API provider
  → 真实轨迹 + 时间轴
  → MapLibre 缩放/台湾定位
  → zones/facilities/impact GeoJSON 图层
  → ERA5 manifest/frame 粒子
  → 手绘匹配
  → 设施情景评估
  → ECharts/指标协同视图
  → 性能、空状态和答辩视觉打磨
```

完成每一步后先运行构建和专项测试，再进入下一步。最终演示必须使用 `processed` 模式，并在页面中同时展示数据来源、能力状态和已知覆盖限制。

## 8. P0 联通与台湾地图进展（2026-07-20）

- B 在风场 manifest API 中从 `era5/qa/era5-capability-matrix.json` 注入可选 `capability`，正式数据实测为 8 dynamic、4 static、4 none；A 原始 manifest 不改写。
- processed 模式的 `/api/trajectory-match` 已接入 A7 `features/global-since1980/features-64.json`，不再返回 `fixture-stub`。
- C 默认案例库请求 `classic=true`，避免将 4,943 条完整研究目录同时渲染进页面；正式案例库为 16 场。
- 台湾情景使用 `maxZoom=10`，进入模式后自动定位到 `119.0–122.5E、21.5–25.5N`，并接入 `/api/taiwan/zones` 与 `/api/taiwan/facilities`。
- 台湾图层已包含人口区划、影响格网、真实设施聚合点、真实轨迹上下文和当前观测点；设施服务区仍按 404/有数据分别处理，不假定 7,204 个设施全部有服务区。

## 9. P1–P3 可视化进展（2026-07-20）

- P1：案例切换后由真实轨迹首尾观测时间初始化统一时间窗；时间轴同步驱动已发生轨迹段、当前位置、右侧真实观测指标和风场最近帧。切换案例会停止播放并清理旧时间状态，所有相关请求都支持 `AbortSignal`。
- P2：影响图层支持危险度、最大风速、累计降水、人口、暴露人口和有数据时的报告灾损切换；图例、单位和“未提供”状态随指标更新。当前危险度色阶为红—黄—绿，并保留最终视觉评审入口。
- P2：台湾真实设施改为中性卡通符号（避难所房屋、医疗箱、救援圈、仓储），类型主要由形状而非颜色区分。7,204 个设施中有 5,953 个避难所，名称含学校关键词的避难所为 2,508 个（42.1%）；它们来自官方避难场所数据，学校礼堂、教室或操场被用作收容地点，并非学校被误分类成医疗或救援设施。
- P3：ERA5 前端严格读取 manifest/frame，按 north-to-south row-major 网格做双线性插值和经纬度推进；dynamic 绘制真实粒子，static 只绘制真实矢量箭头，none 明确显示“风场不可用”，无伪造回退。
- P3 换帧优化：风场 frame 请求与粒子动画生命周期拆分，frame 切换只更新缓存中的 `u/v` 并在 550ms 内平滑混合，粒子位置、Canvas 和动画循环不再重建。
- P3 全球概览：接入 `/api/wind/periods/global-demo/manifest`；processed 数据当前只有 2023-02-18 的一个 180×91、2°全球帧，因此可展示 Earth 风格连续粒子，但不能伪装成全球时间序列。粒子使用高密度示踪点、短时积分和受控衰减尾迹；它表达风矢量流动，不代表独立台风实体。
- 影响表达：有影响数据的案例使用台湾行政区边界填色；全球概览暂不绘制规则 ERA5 网格的“影响度”，因为仓库尚未提供全球行政区边界，避免把海洋和大陆误染成一整球颜色。接入全球边界 GeoJSON 后再按区域中心/面内采样恢复全球影响层。
- 设施情景：台湾地图同时读取静态设施 GeoJSON 和当前情景中的模拟设施；新增设施会立即以独立卡通图标和服务半径范围显示，点击图标可读取服务区数量、可达人口和模型状态。
- 影响表达更新：原始格网仍作为计算来源，但前端不再直接绘制矩形单元；改为按台湾 22 个行政区中心点采样对应格网值，再沿真实县市边界贴图填色。MORAKOT 当前覆盖 20/22 个行政区，金门、连江因不在格网覆盖内保持未着色；弹窗明确展示采样格网、时间窗、状态和来源。
- 运行态抽查：MORAKOT=`dynamic`、ALLEN=`static`、GILBERT=`none`；`scripts/verify.ps1` 通过 31 项后端/契约测试和前端类型检查、生产构建。
- P4 及以后尚未进入本轮开发；设施服务区和情景增删拖动仍属于 P5。
