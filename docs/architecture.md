# CycloneScope 第一阶段架构

## 分层

```text
React / JSX / TypeScript / MapLibre（下一阶段）
            ↓ HTTP/JSON
FastAPI 路由与分析服务
            ↓
SQLite 情景数据 + 文件型气旋/风场/栅格数据
```

SQLite 只保存用户设施情景和轻量分析结果。ERA5、GeoTIFF、PMTiles 和二进制风场不写入 SQLite，也不提交 GitHub。

## 数据层级

1. 全球全部 IBTrACS 气旋：轨迹、筛选、统计和手绘匹配；
2. 12—20 场高影响经典气旋：完整影响专题；
3. 经典气旋真实风场：ERA5 区域裁剪、0.5°、3 小时；
4. 台湾：统计区人口、避难所、救援、医疗和设施情景。

## 颜色语义

- 风速足迹：固定风速阈值；
- 人口暴露：人口与危险权重叠加；
- 报告灾损：只显示在数据支持的事件/行政单元层级；
- 不将模型估算栅格标注为实际经济损失。

## 当前边界

仓库当前只验证 API、SQLite、测试和前端代理联通。真实数据下载、MapLibre 地图、粒子风场和空间评估尚未实现。

## 前端实现约定

- React 负责面板、筛选器、时间轴和跨组件状态；
- MapLibre 实例通过 `useRef` 保存，并在 `useEffect` 中初始化和销毁；
- 风场粒子使用独立 Canvas/WebGL 渲染循环，不通过 React 逐粒子更新；
- ECharts 延续课堂练习的封装思路，在 React 组件中通过 `useRef/useEffect` 管理实例；
- 项目使用 `.tsx` 和构建时编译，不使用浏览器运行时 `text/babel`。

## 数据契约链

```text
backend/app/schemas/*.py（Pydantic，唯一手工维护源）
                  ↓ scripts/export_contracts.py
schemas/generated/*.schema.json + openapi.json
                  ↓ openapi-typescript
frontend/src/types/api.generated.ts
                  ↓ readable aliases
frontend/src/types/contracts.ts
```

- B 修改 Pydantic 模型后运行 `scripts/generate-contracts.ps1`，并提交源模型和生成产物。
- A 在交付 JSON/JSON.gz 前运行 `scripts/validate_contract.py`；验证失败的数据不得交付。
- C 只从 `frontend/src/types/contracts.ts` 或 `api.generated.ts` 导入类型，不手写重复接口。
- `scripts/verify.ps1` 会检查生成契约是否过期，再运行 API/契约测试和前端构建。
- 所有模型默认拒绝未知字段；时间、坐标、单位、数组长度和跨字段关系在模型中执行验证。
