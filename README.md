# 风迹 CycloneScope

全球高影响热带气旋多尺度可视分析与防灾设施情景系统。

GitHub description（288 characters）：

> CycloneScope is an interactive visual analytics platform for exploring global tropical cyclones through historical tracks, real wind-field animation, multiscale impact footprints, population exposure, and high-impact event comparisons, with disaster-response facility planning for certain regions.

当前仓库是第一阶段的本地可运行骨架，包含：

- FastAPI API；
- SQLite 情景数据库；
- 高影响气旋样例接口；
- 数据来源接口；
- 设施情景新增与简化评估接口；
- React/JSX＋TypeScript＋Vite 联调页；
- 模块化 Pydantic 数据契约及自动生成的 JSON Schema/OpenAPI/TypeScript 类型；
- Pytest API 与契约测试。

## 项目文档

- [系统设计文档](docs/system-design.md)：最终成果、可视化模块、交互、技术架构、数据范围、配色和验收标准。
- [三人分工与交付文档](docs/team-plan.md)：A/B/C 的字段级数据契约、每日工作、交接产物、并行策略和无正式数据时的替代方案。
- [工作包验证模板](docs/verification-template.md)：每个人提交前记录命令、预期/实际结果、证据和已知限制。
- [数据来源](docs/data-sources.md)：正式数据来源和下载入口。
- [第一阶段架构](docs/architecture.md)：当前 React/FastAPI/SQLite 骨架说明。
- [B 运行与答辩手册](docs/b-runbook.md)：环境、启动、数据模式、API 烟测与离线检查。
- [B 验证记录](docs/b-verification.md)：B1–B8 的自动与专项验证范围。

## 可执行数据契约

- 唯一手工维护源：[backend/app/schemas](backend/app/schemas)
- A 验证数据使用：[schemas/generated](schemas/generated)
- C 导入的生成类型：[frontend/src/types/api.generated.ts](frontend/src/types/api.generated.ts)
- 可读类型别名：[frontend/src/types/contracts.ts](frontend/src/types/contracts.ts)

修改 Pydantic 契约后运行：

```powershell
.\scripts\generate-contracts.ps1
```

验证 A 的交付文件：

```powershell
.\.venv\Scripts\python.exe .\scripts\validate_contract.py storm-detail-list .\backend\data\samples\storms.json
.\.venv\Scripts\python.exe .\scripts\validate_contract.py wind-frame .\backend\data\samples\wind-demo.json
```

生成文件不能手工修改。`verify.ps1` 会检查 JSON Schema/OpenAPI 是否与 Pydantic 源一致，并在构建前重新生成前端类型。

> `backend/data/samples` 中的气旋影响数值和风场网格是接口测试夹具，不是研究结论。最终版本必须由 IBTrACS、ERA5、EM-DAT、TCE-DAT、WorldPop 和台湾政府开放数据处理结果替换。

## 本机启动

### 1. 初始化 Python 环境

在 PowerShell 中运行：

```powershell
.\scripts\bootstrap.ps1
```

### 2. 启动后端

```powershell
.\scripts\start-backend.ps1
```

打开：

- API 健康检查：<http://127.0.0.1:8000/api/health>
- Swagger：<http://127.0.0.1:8000/docs>
- ReDoc：<http://127.0.0.1:8000/redoc>

### 3. 启动前端

打开另一个 PowerShell：

```powershell
.\scripts\bootstrap-frontend.ps1
.\scripts\start-frontend.ps1
```

浏览器打开 <http://127.0.0.1:5173>。

### 4. 运行测试

```powershell
.\scripts\verify.ps1
```

该脚本会依次执行 FastAPI/SQLite 测试、React TypeScript 类型检查和 Vite 生产构建。只运行后端测试时可以使用 `.\scripts\test.ps1`。

## 当前 API

```text
GET  /api/health
GET  /api/data-sources
GET  /api/storms
GET  /api/storms/{storm_id}
GET  /api/storms/{storm_id}/track
GET  /api/storms/{storm_id}/impact/summary
GET  /api/storms/{storm_id}/wind/manifest
GET  /api/storms/{storm_id}/wind/sample-frame
GET  /api/wind/periods/{period_id}/manifest
GET  /api/impact/grid
GET  /api/taiwan/zones
GET  /api/taiwan/facilities
POST /api/trajectory-match

POST /api/scenarios
GET  /api/scenarios
GET/PATCH/DELETE /api/scenarios/{scenario_id}
POST /api/scenarios/{scenario_id}/facilities
GET  /api/scenarios/{scenario_id}/facilities
PATCH/DELETE /api/scenarios/{scenario_id}/facilities/{facility_id}
POST /api/scenarios/{scenario_id}/evaluate
```

## 当前 B 版本边界

默认 `CYCLONESCOPE_DATA_MODE=fixture`，页面会持续显示夹具警告。正式数据由 A 放入 `backend/data/processed/` 后显式切换到 `processed`；MapLibre、真实粒子、手绘匹配算法和设施空间算法由 C 通过现有插槽与 service 接口接入。

正式数据也可以保留在 A 的交付包中，并通过
`CYCLONESCOPE_DATA_ROOT` 指向包含 `output/processed` 的目录。B 会直接适配
A v2.1 的 Parquet 轨迹、ERA5 manifest/frame、影响 GeoJSON、台湾图层与
道路服务区，不要求复制或改名为另一套目录。


## 数据处理交付

完整的数据处理流程、来源、字段口径、质量限制和交付接口见 [`docs/data-processing/README.md`](docs/data-processing/README.md)。该目录只包含可重跑脚本、来源清单、QA 和接口契约；原始大数据文件不提交 Git。
