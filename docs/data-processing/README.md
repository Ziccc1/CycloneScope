# CycloneScope 数据处理交付说明

版本：a8-final-2026.07.19

## 1. 交付原则

原始数据不提交 GitHub；仓库只提交可重跑脚本、来源清单、字段契约、QA 报告和小型演示 fixture。正式数据通过 `input/raw/` 本地缓存生成，输出写入 `output/processed/`。

所有输出都区分三类语义：

- `reported_impact`：EM-DAT 报告灾损；
- `modeled_exposure`：TCE-DAT/WorldPop 模型估计暴露；
- `hazard_exposure`：危险格网与人口相交后的估计暴露。

三类数据不得合并成同一损失指标。

## 2. A1 来源登记与下载

来源、许可证、下载状态、文件哈希和缓存路径登记在 `source-manifest-v2.json` 与 `source-manifest-upgrade.json`。原始文件放在 `input/raw/`，不直接改写。

主要来源：NOAA IBTrACS、Copernicus ERA5、WorldPop、EM-DAT、TCE-DAT、台湾政府开放资料和台湾官方道路中心线。

## 3. A2 IBTrACS 清洗

处理动作：统一风暴 ID、时间为 UTC、坐标为 WGS84、风速为 m/s；删除重复点；检查坐标范围和时间顺序；派生持续时间、移动速度、ACE 等指标。

结果：全球 1980 年以来 4,943 场，WP 子集 1,515 场。输出 `storms.parquet`、`track-points.parquet` 和 QA。

## 4. A3 经典案例

按 IBTrACS、ERA5 和影响数据交集选择 16 场经典案例，而不是只按知名度选择。16 场全部保留；ERA5 能力由 `era5-capability-matrix.json` 控制。

## 5. A4 ERA5 风场

处理 `u10/v10`，统一时间、范围、方向和单位，生成下载 manifest、NetCDF 帧和能力矩阵。

- 8 场支持动态风场动画；
- 4 场只有静态风场；
- 4 场暂无 ERA5，只能显示轨迹和统计信息。

前端必须根据 `allowed_modes` 决定是否显示动画按钮。

## 6. A5 危险度与人口暴露

主人口层为 WorldPop Global2 R2025A 2025 constrained 100m。危险格网和人口栅格相交，输出最大风速、时间窗暴露和台湾案例暴露。

WorldPop 2025 是情景人口，不代表历史事件当年实际人口。

TCE-DAT 另行保留 2015 固定人口和历史人口两个模型版本，不与 EM-DAT 报告灾损合并。

## 7. A6 台湾人口、边界与设施

官方统计区人口来自 data.gov.tw dataset 18681，参考日期为 2024-12-01，共 138,179 条；边界来自 dataset 25128，共 156,478 个最小统计区。

字段：

- `population_match_status`：`matched_code` / `boundary_version_mismatch`；
- `boundary_vintage`：当前为 2015 统计区边界；
- `population_vintage`：2024-12-01。

由于边界和人口版本不同，19,754 条记录无法直接匹配，未进行名称强行拼接。

设施共 6,417 条：避难所 5,953 条、医疗设施 464 条。医疗设施是 API 分区查询去重结果，不代表全国完整清单。

## 8. 道路网络与服务区

由于 Geofabrik PBF 传输损坏，最终采用台湾官方道路中心线 dataset 73232，生成：

- 540,057 个节点；
- 1,097,864 条有向边；
- 15,699 条设施—行政区服务记录。

旅行时间字段必须同时查看：

- `speed_source`：`osm` / `official_limit` / `default_by_road_class`；
- `travel_time_quality`：`high` / `medium` / `low`。

当前默认道路等级速度标记为 `default_by_road_class` 和 `low`，只能称为道路网络估算时间，不能称为实时交通时间。

服务区阈值为 10、20、30 分钟；人口字段同时保留官方人口和 WorldPop 参考值。

## 9. A7 轨迹特征

轨迹按时间线重采样为 64 点，生成地理相似和形状相似特征。输入点不足的 11 个全球轨迹和 1 个 WP 轨迹不会被虚假插值，保留在 QA 失败清单并排除 Top-K 相似度结果。

## 10. EM-DAT 报告灾损

输出 `reported-impact.parquet` 和经典案例汇总。字段包括死亡、受影响人口、无家可归人数和经济损失。

经济损失字段：

- `damage_usd_nominal`：原始名义金额；
- `damage_currency_year`：EM-DAT 原始年份；
- `damage_usd_2024`：未选择统一通胀指数前保持为空；
- `damage_adjustment_status`：`nominal_unadjusted`。

因此不能直接跨年份制作通胀可比损失排名。

## 11. 交付接口

统一入口：`output/processed/API-INDEX.json`。

主要数据集：

- `tce_dat_exposure`
- `reported_impact`
- `taiwan_official_statistical_population`
- `taiwan_statistical_zones`
- `road_nodes`
- `road_edges`
- `facility_service_area`
- `era5_capability`

完整字段和路径见 `output/processed/HANDOFF-CONTRACT-v1.md`。

## 12. QA 与验收

运行：

```powershell
python pipeline/a8_final_audit.py
python pipeline/upgrade_audit.py
```

A8 验收要求：原始文件存在、哈希一致、轨迹 ID 唯一、时间有序、坐标合法、ERA5 能力可识别、人口和设施字段有明确语义、API 交付路径存在。

当前版本审计结果：`A8 final audit: pass`。

## 13. 前端使用要求

1. 显示 `data_status`、`population_reference` 和 `travel_time_quality`；
2. 对无动态 ERA5 的案例隐藏播放按钮；
3. 不把 TCE-DAT/WorldPop 暴露称为真实灾损；
4. 不把默认道路速度称为实时交通；
5. 统计区 GeoJSON 很大，正式前端应使用简化边界或矢量瓦片，不直接加载原始完整文件。
