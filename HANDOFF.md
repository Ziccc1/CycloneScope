# CycloneScope 新窗口交接 README

> 更新时间：2026-07-19（Asia/Shanghai）
>
> 项目目录：`D:\大二\信息可视化\期末\项目`
>
> GitHub：<https://github.com/Ziccc1/CycloneScope>
>
> 基线提交：`d688954 chore: initialize CycloneScope project`

## 0. 新窗口先做什么

打开新窗口后不要从头重新设计，也不要把当前联调页当成最终页面。依次执行：

```powershell
cd "D:\大二\信息可视化\期末\项目"
git status -sb
git log -1 --oneline
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

然后阅读：

1. 本文件；
2. [`docs/system-design.md`](docs/system-design.md)；
3. [`docs/team-plan.md`](docs/team-plan.md)；
4. [`docs/architecture.md`](docs/architecture.md)；
5. [`schemas/README.md`](schemas/README.md)。

当前最优先的开发任务是：**由 A 牵头，用 Morakot 2009 打通 IBTrACS → ERA5 → Pydantic Schema → FastAPI → 地图/粒子验收的第一条真实数据链路。**

## 1. 项目目标

项目名称为“风迹 CycloneScope”，目标是做一个全球高影响热带气旋多尺度可视分析与台湾防灾设施情景系统。

最终形态是单页面、地图常驻的可视分析系统，不是当前的大标题和卡片页面。最终演示应包含：

- 全球历史气旋轨迹、聚合和筛选；
- 12–20 场高影响经典气旋案例库；
- ERA5 `u10/v10` 真实风场粒子和风速标量层；
- 单场气旋轨迹、风速、气压和时间联动；
- 动态危险度/人口暴露影响图层；
- 全球用户手绘轨迹与历史路径匹配；
- 台湾避难、医疗、救援、仓储设施情景；
- 建设前后覆盖、盲区、容量和预算点比较；
- MapLibre、粒子 Canvas/WebGL 和 ECharts 协同交互。

最终页面参考 earth.nullschool.net 的“地图 + 浮动面板 + 底部时间轴”结构，不使用多个页面跳转。

## 2. 已经完成的内容

### 2.1 Git 和工程基线

- Git 仓库已初始化；
- 远程为 `origin https://github.com/Ziccc1/CycloneScope.git`；
- `main` 已跟踪 `origin/main`；
- 初始提交 `d688954` 已推送；
- `.gitignore` 已排除虚拟环境、Node 依赖、数据库和大体积气象/地理文件；
- Git 可能需要当前 Windows 用户保留以下安全目录配置：

  ```powershell
  git config --global --add safe.directory "D:/大二/信息可视化/期末/项目"
  ```

编写本交接文件会产生新的本地文档修改；新窗口应先运行 `git status -sb`，不要假定工作区一定干净。

### 2.2 后端骨架

已经实现：

- FastAPI；
- SQLAlchemy 2；
- SQLite 情景数据库；
- CORS；
- Swagger/ReDoc；
- 气旋、轨迹、影响摘要和风场夹具接口；
- 情景创建、设施新增和简化评估闭环；
- API、SQLite 和 Schema 自动测试。

当前接口：

```text
GET  /api/health
GET  /api/data-sources
GET  /api/storms
GET  /api/storms/{storm_id}
GET  /api/storms/{storm_id}/track
GET  /api/storms/{storm_id}/impact/summary
GET  /api/storms/{storm_id}/wind/manifest
GET  /api/storms/{storm_id}/wind/sample-frame

POST /api/scenarios
GET  /api/scenarios
POST /api/scenarios/{scenario_id}/facilities
POST /api/scenarios/{scenario_id}/evaluate
```

入口文件：[`backend/app/main.py`](backend/app/main.py)。

### 2.3 完整可执行 Schema

已经建立完整的数据契约链：

```text
backend/app/schemas/*.py（唯一手工维护源）
                  ↓ scripts/export_contracts.py
schemas/generated/*.schema.json + openapi.json
                  ↓ openapi-typescript
frontend/src/types/api.generated.ts
                  ↓ readable aliases
frontend/src/types/contracts.ts
```

Schema 已覆盖：

- 数据来源与健康响应；
- 气旋目录、详情、轨迹和影响摘要；
- 风场 manifest 和 frame；
- 影响 GeoJSON 格网；
- 台湾统计区和设施 GeoJSON；
- 标准化轨迹特征；
- 手绘匹配请求和结果；
- SQLite 情景、设施和评估结果。

已实现的关键约束包括：未知字段拒绝、真实数据来源必填、轨迹时间唯一有序、风场数组长度、网格范围/分辨率一致、NaN/Infinity 拒绝、GeoJSON 多边形闭合、人口暴露不超过人口、设施类型和容量单位匹配、手绘至少两个不同点、匹配分数权重一致等。

修改 Schema 后必须运行：

```powershell
.\scripts\generate-contracts.ps1
```

禁止分别手工修改 JSON Schema 和生成的 TypeScript 类型。

### 2.4 前端骨架

当前技术栈：

- React 19；
- TypeScript；
- Vite；
- OpenAPI 自动生成类型。

当前页面仅是 API 联调页，用来证明：

- React 能连接 FastAPI；
- `/api/health` 正常；
- 气旋目录能读取；
- 数据来源能读取；
- Schema 迁移后的 `season/impact_score` 字段可被前端消费。

当前页面显示 3 个 `synthetic_fixture` 气旋：Haiyan、Katrina、Morakot。它不是最终 UI，后续需要整体替换为 MapLibre 全屏地图和浮动面板。

尚未安装或实现：

- MapLibre；
- ECharts；
- Zustand/Context 全局状态方案；
- 地图图层系统；
- Canvas/WebGL 粒子引擎；
- 手绘交互；
- 影响图层；
- 台湾设施地图；
- 最终视觉设计。

### 2.5 当前数据

仓库里只有开发夹具：

- `backend/data/samples/storms.json`：3 场合成气旋；
- `backend/data/samples/wind-demo.json`：1 帧 5×5 合成风场；
- `backend/data/samples/data-sources.json`：10 个已登记来源。

没有正式下载或处理：

- IBTrACS 全球轨迹；
- ERA5 全球或区域风场；
- WorldPop；
- EM-DAT；
- 台湾人口、边界和真实设施；
- OSM 台湾路网。

任何 `synthetic_fixture` 数值都不能作为答辩结论。

### 2.6 文档

已经建立：

- [`README.md`](README.md)：项目启动和 API；
- [`docs/system-design.md`](docs/system-design.md)：最终页面、功能、交互、配色、架构、性能和验收；
- [`docs/team-plan.md`](docs/team-plan.md)：A/B/C 56 小时分工、字段契约、交付、替代路径和个人验证；
- [`docs/data-sources.md`](docs/data-sources.md)：数据来源链接；
- [`docs/architecture.md`](docs/architecture.md)：技术架构和契约链；
- [`docs/verification-template.md`](docs/verification-template.md)：每个工作包提交前的验证记录模板；
- [`schemas/README.md`](schemas/README.md)：可执行契约说明。

## 3. 已锁定的设计决策

以下内容不要在新窗口无理由推翻：

1. 前端使用 React + TypeScript + Vite，不改回纯 HTML/JS，也不切 Vue。
2. 最终是单页面地图系统，不使用页面切换承载主要模式。
3. MapLibre 负责地图；粒子使用独立 Canvas/WebGL，不通过 React 逐粒子更新。
4. FastAPI 提供数据和分析接口；SQLite 只存情景、模拟设施和轻量结果。
5. NetCDF、GeoTIFF、风场大文件不进入 SQLite，也不提交 GitHub。
6. 全球历史轨迹和全球手绘匹配保留；设施情景重点区域为台湾。
7. 真实风场必须来自 ERA5 `u10/v10`，不能用围绕轨迹旋转的模拟线代替。
8. earth.nullschool.net 中与风向一致的蓝绿底色是风速标量场；本项目允许低透明度风速标量层，但要避免遮住影响图层。
9. 影响层严格区分危险度、估算人口暴露和报告灾损。
10. 设施成本暂用 1–5 的相对 `budget_points`，不称为实际工程造价。
11. P0 使用空间服务半径 + 容量分配；道路可达性和自动选址属于 P1/P2。
12. Docker 不是 P0；答辩设备为自己的 Windows + Chrome。

## 4. 三人分工

详细小时表以 [`docs/team-plan.md`](docs/team-plan.md) 为准。

### A：数据与空间分析

负责：IBTrACS、ERA5、经典案例、影响格网、台湾人口/设施、轨迹特征、数据 QA。

每个数据包必须交付：

- 数据文件；
- 可重跑脚本；
- 字段和口径说明；
- Schema 验证；
- QA 报告和抽查证据。

### B：产品框架、服务集成与答辩保障

负责：

- Pydantic/共享 TS 类型维护；
- FastAPI 数据接口和 repository；
- AppShell、共享状态和 API provider；
- 基础筛选、图层控制、案例列表和简单对比图；
- SQLite 情景 CRUD；
- 将 C 的纯算法包装为 API；
- loading/error/empty/stale、响应式、离线和答辩预设；
- 全项目验证和集成。

B 不重新实现 C 的算法。

### C：核心算法与交互可视化

负责：

- MapLibre 分析图层；
- ERA5 真实风场粒子；
- 手绘轨迹匹配算法与交互；
- 动态影响可视分析；
- 设施覆盖算法和反事实交互；
- 强度曲线、多事件分析等协同图表；
- 算法正确性和可视化性能测试。

C 的 Python 算法应是无 HTTP、无数据库依赖的纯函数；B 再负责 API 包装。

## 5. 接下来按什么顺序做

### P0-1：三人环境与分支建立

每人先完成：

```powershell
.\scripts\bootstrap.ps1
cd frontend
npm.cmd install
cd ..
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

建议从 `main` 建立：

```text
develop
feat/data-pipeline         A
feat/app-integration       B
feat/visual-algorithms     C
```

如果团队决定不用 `develop`，也必须使用个人 feature 分支 + PR，不能三个人直接同时修改 `main`。

### P0-2：A 打通 Morakot 2009 第一场真实链路

不要直接批量下载 20 场。先交付：

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

A 需要确认：

- CDS API 认证和 ERA5 下载可用；
- `u10/v10` 变量、单位和纬度顺序；
- 经度从 `0–360` 转为 `-180–180`；
- 轨迹与帧时间能够连接；
- manifest/frame 通过 Schema；
- 至少 3 个连续真实时间帧；
- Python quiver 图与原值方向一致；
- 没有南北翻转、日期线横跨或数组顺序错误。

第一场通过 B API 和 C 地图/粒子共同验收后，A 再扩展其他案例。

### P0-3：B 建立最终单页框架和正式数据适配

B 可以在等待 A 数据时并行完成：

- 选择并安装 MapLibre 依赖所需的基础包；
- 建立 AppShell、左右浮动面板和底部时间轴插槽；
- 建立唯一全局 store/API provider；
- 将案例列表、基础筛选、图层控制和数据状态迁入面板；
- 为 `processed/` 正式文件建立 repository，保持 fixture/real 可切换；
- 完成 loading、error、empty 和 stale 状态；
- 保持当前 API 测试和 Schema 生成链通过。

不要继续美化当前纵向联调页；应直接建立最终地图布局骨架。

### P0-4：C 建立地图、粒子和算法最小闭环

C 可以在等待真实数据时使用固定 fixture：

- MapLibre 初始化、轨迹图层和固定图层顺序；
- 5×5/20×20 风场 fixture 的双线性插值；
- `u>0,v=0` 粒子向东、`u=0,v>0` 粒子向北的单元验证；
- 粒子生命周期、时间换帧和性能自适应；
- 手绘 64 点重采样、Fréchet/方向分量和 Top K 测试；
- 设施容量/服务半径/重叠去重测试；
- 组件通过 B 的 props/store 插槽接入，不自建第二套全局状态。

### P0-5：首次端到端集成

首场真实链路完成标准：

- A 的正式轨迹、manifest 和 frame 通过 Schema；
- B 的 API 返回 `reanalysis/observed` 和真实 `source_ids`，不再返回 fixture 状态；
- C 地图正确显示轨迹和真实粒子；
- 连续至少 3 帧播放；
- 时间轴、气旋位置和粒子同步；
- Chrome 控制台无错误；
- 三人分别提交验证记录。

## 6. 尚未确定、必须尽快决策

以下属于真正的开放项：

1. MapLibre 底图来源，以及断网时使用在线瓦片还是本地 Natural Earth/PMTiles 降级；
2. 是否引入 Zustand，或使用 React Context + reducer；
3. 全球风场演示的具体日期范围；
4. 12–20 场经典气旋最终名单；
5. 哪 8 场以上优先制作区域真实风场；
6. 动态影响 P0 是否只做风危险度 + 人口暴露；
7. 台湾人口采用最小统计区、乡镇还是较粗行政层级作为答辩默认；
8. 台湾真实设施容量缺失率是否允许支撑容量比较；
9. EM-DAT 的访问和再分发条件；
10. P1 道路可达性是否有时间实现。

建议在 Day 1 用 30–45 分钟冻结这些选择，记录到 `docs/system-design.md`，不要让三个人各自假设。

## 7. 当前已知限制和风险

1. 当前所有气旋/风场均为 `synthetic_fixture`，不能用于结论。
2. 当前风场只有一帧 5×5 数组，不代表真实粒子效果。
3. 当前前端是 API 联调页，不是最终展示页面。
4. 尚未实现 MapLibre、ECharts、粒子、影响层、手绘和台湾地图。
5. 当前 `evaluation.py` 只把 `shelter + people` 容量相加，不包含空间相交、人口栅格、道路或多类型覆盖。
6. 尚未实现轨迹匹配和设施覆盖纯算法模块。
7. 未测试真实 GeoJSON/风场数据规模下的浏览器性能。
8. 未确定离线底图方案，答辩断网仍有风险。
9. Pytest 有一个 Starlette/httpx 弃用警告，目前不阻塞测试；不要为消除警告贸然升级整套依赖。
10. 以前 pytest 固定临时目录出现过 Windows ACL 问题；现脚本使用每次随机 `.test-runs/<GUID>` 并禁用缓存，不要改回固定目录。

## 8. 开发与验证命令

### 初始化

```powershell
.\scripts\bootstrap.ps1
cd frontend
npm.cmd install
```

### 启动

终端 1：

```powershell
.\scripts\start-backend.ps1
```

终端 2：

```powershell
cd frontend
npm.cmd run dev
```

地址：

- 前端：<http://127.0.0.1:5173>
- 健康检查：<http://127.0.0.1:8000/api/health>
- Swagger：<http://127.0.0.1:8000/docs>

### 完整验证

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

基线预期：

```text
Contract schemas are current
15 passed
CycloneScope local verification passed
```

### 生成契约

```powershell
.\scripts\generate-contracts.ps1
```

### 验证数据

```powershell
.\.venv\Scripts\python.exe .\scripts\validate_contract.py storm-detail-list <storms.json>
.\.venv\Scripts\python.exe .\scripts\validate_contract.py wind-manifest <manifest.json>
.\.venv\Scripts\python.exe .\scripts\validate_contract.py wind-frame <frame.json或frame.json.gz>
```

### 提交前

```powershell
git status --short
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify.ps1
git add <本工作包文件>
git diff --cached --check
git diff --cached --stat
git diff --cached --name-only
```

## 9. Git 与文件规则

- 不提交 `.env`、Token、CDS 凭证；
- 不提交 `.venv`、`node_modules`、数据库；
- 不提交 NetCDF、GRIB、GeoTIFF、PMTiles/MBTiles 等大数据；
- 不手改 `schemas/generated/` 和 `frontend/src/types/api.generated.ts`；
- 不覆盖其他成员未合并的工作；
- 每个 PR 只解决一个明确工作包；
- PR 写明输入、输出、命令、预期/实际结果、截图或 QA 证据和限制；
- 对应消费者必须 review：A 的契约变更由 B/C 看，B 的 API/store 由 C 看，C 的算法签名由 B 看。

## 10. 不要在新窗口重复做的事情

- 不要重新讨论 React 与 Vue，React 已确认；
- 不要重新创建仓库，仓库和远程均已存在；
- 不要再创建另一套 Schema；
- 不要把当前联调页当最终视觉稿继续精修；
- 不要用随机旋转线替代 ERA5 真实风场；
- 不要把模型危险格网称为实际经济损失；
- 不要让 A 独自承担 FastAPI 和前端端到端实现；A 负责数据链，B/C 分别接入验收；
- 不要让 B 和 C 分别维护两套全局状态或 ECharts 主题；
- 不要在首场真实链路失败时直接批量下载全部案例。

## 11. 可直接复制给新 Codex 窗口的提示

```text
请接手 D:\大二\信息可视化\期末\项目 中的 CycloneScope 项目。

先完整阅读：
1. HANDOFF.md
2. docs/system-design.md
3. docs/team-plan.md
4. docs/architecture.md
5. schemas/README.md

不要重新设计主题或技术栈，也不要把当前 API 联调页当成最终页面。先运行 git status -sb、git log -1 --oneline 和 scripts/verify.ps1，确认基线状态。

当前优先级最高的是 A 牵头的 Morakot 2009 真实数据链：IBTrACS → ERA5 u10/v10 → Pydantic Schema → FastAPI → MapLibre/粒子验收。若我指定了 A/B/C 中的某个角色，请严格按 docs/team-plan.md 的责任、交付格式和本地验证门禁执行。修改 Schema 时只改 backend/app/schemas，并运行 scripts/generate-contracts.ps1；不要提交密钥和大数据。

开始工作前先向我简要报告：当前 Git 状态、验证结果、你将处理的角色/工作包、输入、输出、验收方式和不会触碰的其他成员范围。
```

## 12. 交接时的最终状态说明

- 基线代码已提交并推送到 `origin/main`；
- 本交接文件及 README 链接是基线后的新文档修改，需要在新窗口确认后提交；
- 当前应继续开发，不需要再次搭建仓库；
- 第一开发目标不是完整 UI，而是“首场真实数据 + API + 最小地图/粒子”的端到端证据；
- 任何功能只有通过角色专项验证、全项目 `verify.ps1` 和暂存文件审查后才算完成。
