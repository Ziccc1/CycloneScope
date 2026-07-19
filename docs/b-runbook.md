# CycloneScope B 运行与答辩手册

## 1. B 版本边界

当前版本完成产品框架、共享状态、数据 API、SQLite 情景 CRUD、基础比较、错误状态和离线演示。MapLibre、ERA5 粒子、手绘匹配算法与真实设施覆盖算法仍由 C 接入；正式数据由 A 写入 `backend/data/processed/`。

页面和 API 默认使用 `fixture`，顶部会持续显示夹具警告。夹具数值不可用于研究结论。

## 2. 首次初始化

```powershell
.\scripts\bootstrap.ps1
.\scripts\bootstrap-frontend.ps1
```

若 pip 报代理错误，先检查 `git config --global --get http.proxy` 和当前网络；若 npm 不存在，安装 Node.js LTS 后重新打开 PowerShell。

## 3. 启动

终端一：

```powershell
.\scripts\start-backend.ps1
```

终端二：

```powershell
.\scripts\start-frontend.ps1
```

打开：

- 工作台：<http://127.0.0.1:5173>
- Swagger：<http://127.0.0.1:8000/docs>
- 健康检查：<http://127.0.0.1:8000/api/health>

## 4. fixture / processed 切换

默认：

```powershell
$env:CYCLONESCOPE_DATA_MODE="fixture"
.\scripts\start-backend.ps1
```

A 交付正式产物并通过 Schema 后：

```powershell
$env:CYCLONESCOPE_DATA_MODE="processed"
.\scripts\start-backend.ps1
```

`processed` 不会回退到气旋、风场、影响或台湾 fixture。缺文件时 API 返回明确 404。正式目录至少需要：

```text
backend/data/processed/
├─ catalog/storms-summary.json
├─ catalog/details/{storm_id}.json
├─ wind/global/{period_id}/manifest.json
├─ wind/storms/{storm_id}/manifest.json
├─ wind/storms/{storm_id}/frames/*.json.gz
├─ impact/storms/{storm_id}/grid.geojson
├─ impact/windows/{window_id}/grid.geojson
└─ taiwan/zones.geojson + facilities.geojson
```

## 5. API 烟测

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
Invoke-RestMethod "http://127.0.0.1:8000/api/storms?basin=WP&season_from=2000&min_wind_ms=30"
Invoke-RestMethod "http://127.0.0.1:8000/api/impact/grid?hazard_threshold=0.8"
Invoke-RestMethod "http://127.0.0.1:8000/api/taiwan/facilities?type=medical"
```

SQLite 情景闭环：

```powershell
$scenario = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/scenarios `
  -ContentType "application/json" -Body '{"name":"B smoke"}'

$facility = Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:8000/api/scenarios/$($scenario.id)/facilities" `
  -ContentType "application/json" `
  -Body '{"type":"shelter","lon":121.5,"lat":24.0}'

Invoke-RestMethod -Method Patch `
  -Uri "http://127.0.0.1:8000/api/scenarios/$($scenario.id)/facilities/$($facility.id)" `
  -ContentType "application/json" -Body '{"lon":121.6}'

Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:8000/api/scenarios/$($scenario.id)/evaluate" `
  -ContentType "application/json" -Body '{"at_risk_population":1000}'
```

## 6. 完整验证与答辩检查

```powershell
.\scripts\verify.ps1
```

答辩前确认：

- Chrome 1920×1080 和窄屏无横向溢出；
- 控制台无红色错误，Network 无无限请求；
- fixture 横幅持续存在，正式模式显示正确来源；
- “加载演示预设”能选择 Morakot 并创建/恢复答辩情景；
- API、SQLite 和全部处理数据均可在断网状态运行；
- 保存数据库备份和 1–2 分钟备用录屏。

## 7. 已知限制

- 中央视图是 C 的显式组件插槽，不是假地图。
- `/api/trajectory-match` 当前只返回稳定联调排名，说明文字明确标为 fixture。
- 设施评估只计算 `people` 单位避难所容量，不包含人口格网、路网和服务区相交。
- fixture 影响格网和台湾区域/设施为接口夹具，不代表真实风险或设施分布。
