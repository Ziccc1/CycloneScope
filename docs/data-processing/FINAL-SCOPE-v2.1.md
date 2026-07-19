# CycloneScope 最终范围冻结说明 v2.1

更新时间：2026-07-19  
数据版本：`a8-final-2026.07.19`  
契约版本：`2.1`

## 1. 本次作业正式纳入的主线

项目主题冻结为“热带气旋轨迹—风场—影响—应急设施联动可视分析”。所有前端功能都围绕热带气旋，不扩展成泛灾害平台。

| 模块 | 正式数据 | 可实现的交互 |
|---|---|---|
| 轨迹 | 全球 IBTrACS since1980、WP 子集、16 场经典案例 | 全球/WP 筛选、轨迹时间轴、案例比较、64 点相似度 |
| 风场 | ERA5 u10/v10；13 个 manifest、JSON.GZ frame | 全球演示、动态风场、静态风场、无风场状态分流 |
| 人口暴露 | WorldPop Global2 R2025A 2025；2020 对照 | 风速阈值、暴露人口、情景年份比较 |
| 报告灾损 | EM-DAT | 报告死亡/受灾/名义经济损失；不与模型暴露合并 |
| 历史暴露 | TCE-DAT | 国家/事件级模型暴露比较；单独标记 modeled |
| 台湾应急设施 | 避难所、医疗、消防救援单位、灾害应变中心 | 设施筛选、网络服务区、覆盖人口、设施类型比较 |
| 台湾人口 | 官方统计区人口（参考日期 2024-12-01）+ WorldPop 2025 | 官方人口与情景人口对照；未匹配记录透明展示 |

消防/救援 dataset 5969 已接入 787 条记录：764 个消防/救援单位、23 个灾害应变中心。它们统一为冻结 FacilityFeature 的 `type="rescue"`；容量未知使用 `null`，10 km 服务半径是情景显示值，不是实时导航时间。

## 2. 明确不纳入本次验收

以下内容不进入当前主接口，也不应在演示中暗示已经支持：

- 洪水、滑坡、地震、热浪等多灾种危险度；
- 实时交通速度、道路封闭和实时导航 ETA；
- Natural Earth 离线底图；在线底图足够时不新增离线资产；
- EM-DAT 经济损失的统一通胀调整排名；原始货币年份必须同时显示；
- 全国完整医疗设施清单（当前 464 条是 API 分区查询去重结果）；
- 16 场经典案例全部动态风场（只有有 manifest 的案例显示播放）；
- 官方统计区人口 100% 空间匹配（19,754 条边界/人口代码差异保留在 QA）；
- 避难所实时开放状态主表。

## 3. 可选后续扩展

### P1：避难所开放状态快照

来源为 dataset 12849，字段 `shelterCode/shelterId/openstatus/peopleno/lat/lon`。它是时间快照，不得覆盖正式设施主表的静态位置与容量。接入后独立输出：

`output/processed/taiwan/facilities/shelter-status-snapshot.parquet`

建议新增字段：`status_time_utc`、`open_status`、`reported_capacity`、`source_ids`、`data_status="reported"`。

### P2：更多影响格网

当前已为 5 场台湾相关风暴生成契约化 `impact/storms/{storm_id}/grid.geojson`；其余经典案例只有轨迹/统计或无对应危险格网时，API 返回 `impact_available=false`。

## 4. B/C 使用规则

1. 先读取 `API-INDEX.json`、`DATA-CONTRACTS-v2.1.md` 和本文件；
2. C 只消费 API、契约化 GeoJSON 和 ERA5 JSON.GZ frame，不读取 Parquet、NetCDF 或原始 CSV；
3. `EM-DAT reported_damage`、`TCE-DAT exposed_population`、`WorldPop exposed_population` 必须分开显示；
4. 所有缺失值使用 `null`；不能用 0 代替未知；
5. 设施 `type` 只能是 `shelter|medical|rescue|warehouse`；当前 warehouse 数量为 0；
6. 任何动态按钮必须先检查数据能力矩阵，不能为无风场案例显示可播放状态；
7. 服务区必须展示 `coverage_method`、`population_reference`、`speed_source` 和 `travel_time_quality`。

## 5. 验收证据

- 冻结契约机器审计：`output/qa/frozen-contract-2.1-validation.json`；
- 人工/范围审计：`output/processed/CONTRACT-AUDIT-v2.1.md`；
- 数据来源和哈希：`source-manifest-v2.json`；
- 消防救援 QA：`output/processed/taiwan/facilities/rescue-5969-qa.json`；
- 当前 API 入口：`output/processed/API-INDEX.json`。

