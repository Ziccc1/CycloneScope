# B 工作包验证记录

## 基本信息

- 工作包：B1–B8 产品框架、服务集成与答辩保障
- 数据模式：`fixture`
- 环境：Windows / Python 3.13 / React 19 / Vite 7

## 自动验证

| 命令 | 实际结果 |
|---|---|
| `.\scripts\test.ps1` | PASS：23 项测试通过 |
| `.\scripts\generate-contracts.ps1` | PASS：25 份 Pydantic/JSON Schema/OpenAPI/TypeScript 契约同步 |
| `.\scripts\verify.ps1` | PASS：契约、Pytest、TS 类型检查和 Vite 构建通过 |

## 专项验证

| 范围 | 预期 |
|---|---|
| fixture/processed | processed 缺文件明确失败，不回退分析夹具 |
| API | 筛选、bbox、时间窗、404、422 正确 |
| SQLite | 情景与设施创建、读取、修改、删除和级联删除正确 |
| 页面 | 四种模式、筛选、图层、比较、来源和情景 UI 可操作 |
| 降级 | API 离线显示错误；fixture 模式持续显示警告 |

## 运行与视觉证据

- HTTP 烟测：`/api/health` 返回 `ok/fixture/synthetic_fixture`；WP 筛选返回 2 场；Vite 首页返回 200。
- Vite 生产构建：34 个模块；JS 约 213 KB（gzip 67 KB）；CSS 约 10 KB（gzip 3 KB）。
- Edge 无头渲染已检查 1920×1080 与窄屏：三栏/纵向布局、fixture 横幅、来源列表、案例列表和时间轴无页面级横向溢出。
- 本机截图保存在忽略目录 `.test-runs/smoke/`，不提交仓库。

## 已知限制

- A/C 尚未交付的部分保持为 fixture 或组件插槽。
- 手工 Chrome 截图、断网走查和备用录屏需在最终答辩设备完成。
