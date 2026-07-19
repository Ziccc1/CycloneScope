# CycloneScope 最终数据源与处理状态

更新时间：2026-07-19  
数据版本：a8-final-2026.07.19

本文件替代早期测试版 `data-sources.md`，按 A1-A8 实际处理结果重新整理。

状态说明：

- **已处理**：已下载、清洗并生成可交付文件；
- **已处理但有限制**：可以使用，但前端必须展示口径和不确定性；
- **备用**：保留为替代数据源；
- **未接入**：初始清单中存在，但目前没有进入正式处理链路。

## 1. 已接入并完成处理

| 数据源 | 官方地址 | 原始数据/处理后目录 | 状态与说明 |
|---|---|---|---|
| NOAA IBTrACS 全球 since1980 | https://www.ncei.noaa.gov/products/international-best-track-archive | `input/raw/ibtracs/` → `output/processed/ibtracs-global-since1980/` | 已处理；全球比较主数据 |
| NOAA IBTrACS WP | https://www.ncei.noaa.gov/products/international-best-track-archive | `input/raw/ibtracs/` → `output/processed/ibtracs-wp-since1980/` | 已处理；西北太平洋深入分析 |
| Copernicus ERA5 single levels | https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels | `output/processed/era5/downloads/` | 已处理；u10/v10，18 个区域文件和 1 个全球演示窗 |
| EM-DAT Public Table | https://doc.emdat.be/docs/data-structure-and-content/emdat-public-table/ | `input/raw/impact/emdat_public_table.xlsx` → `output/processed/impact/reported/` | 已处理；报告灾损，经济损失保留原始货币年份 |
| TCE-DAT | https://doi.org/10.5880/pik.2017.005 | `input/raw/impact/tce_dat/` → `output/processed/impact/tce-dat/` | 已处理；模型估计暴露，不得与 EM-DAT 合并 |
| WorldPop 2025 R2025A | https://data.worldpop.org/ | `input/raw/worldpop/` → `impact/exposure-2025-r2025a/` | 已处理；2025 情景人口，不是事件当年实测人口 |
| WorldPop 2020 R2025A | https://data.worldpop.org/ | `input/raw/worldpop/` → `impact/exposure-2020-r2025a/` | 已处理；2020/2025 对照 |
| 台湾统计区人口 | https://data.gov.tw/en/datasets/18681 | `input/raw/taiwan/statistical_population/` → `taiwan/population/statistical-zones-population-official.parquet` | 已处理；官方日期为 2024-12-01 |
| 台湾最小统计区边界 | https://data.gov.tw/dataset/25128 | `input/raw/taiwan/statistical_zones/` → `taiwan/population/statistical-zones.geojson` | 已处理；19,754 条边界/人口代码不匹配记录保留 |
| 台湾县市边界 | https://data.gov.tw/dataset/7442 | `input/raw/taiwan/` → `taiwan/zones.geojson` | 已处理；行政区汇总 |
| 台湾避难收容处所 | https://data.gov.tw/dataset/73242 | `input/raw/taiwan/facilities/` → `taiwan/facilities/shelters.parquet` | 已处理；5,953 条，不代表实时开放状态 |
| 台湾医疗机构 | https://data.gov.tw/dataset/139250 | API 分区查询 → `taiwan/facilities/medical/` | 已处理但有限制；464 条去重结果，不是全国完整清单 |
| 台湾 OSM / Geofabrik PBF | https://download.geofabrik.de/asia/taiwan.html | `input/raw/taiwan/roads/taiwan-latest.osm.pbf` → `taiwan/roads/` | 已处理；Osmium 解析通过，SHA-256 已登记 |

## 2. 当前道路网络版本

当前主版本使用已验证的 Geofabrik OSM PBF：

- 3,722,291 个节点；
- 7,597,166 条有向边；
- 8,747 条 10/20/30 分钟服务区记录；
- 服务区使用有向图，保留单行道方向；
- 缺少 OSM `maxspeed` 时使用道路等级默认速度；
- 结果是静态道路网络估算，不是实时导航时间。

台湾官方道路中心线 dataset 73232：

- 地址：https://data.gov.tw/en/datasets/73232
- 文件：`input/raw/taiwan/roads/official-road-centerline.zip`
- 状态：备用数据源，已处理过但不是当前主版本。

## 3. 初始清单中尚未接入

| 数据源/功能 | 地址 | 状态 | 说明 |
|---|---|---|---|
| 台湾避难所动态开放状态 | https://data.gov.tw/dataset/12849 | 未接入 | 当前只有设施位置和容量 |
| 台湾消防、救援与应变单位 | https://data.gov.tw/dataset/5969 | 未接入 | 当前设施层只有避难所和医疗设施 |
| Natural Earth 离线底图 | https://www.naturalearthdata.com/downloads/ | 未接入 | 前端可使用在线底图，离线部署时再下载 |
| 洪水、滑坡、地震、热浪等多灾种数据 | 尚未确定统一来源 | 未接入 | 当前 hazard 只有台风最大风速和影响时间 |
| 实时交通速度和道路封闭 | 无 | 未接入 | 当前道路速度是静态 OSM/default |
| 官方统计区级人口空间连接 | data.gov.tw 18681/25128 | 部分完成 | 已保留匹配与未匹配记录，未强行按名称拼接 |
| 经济损失通胀调整 | EM-DAT | 未完成 | 目前仍是原始货币和原始年份 |

## 4. 不应混用的指标

1. `EM-DAT reported_damage`：报告灾害死亡、受灾人口和经济损失。
2. `TCE-DAT historical_exposure`：模型估计的气旋暴露人口和资产。
3. `WorldPop exposure`：人口格网与危险区域相交得到的估计暴露。
4. `Taiwan official population`：官方统计区人口，参考日期为 2024-12-01。
5. `WorldPop 2025`：2025 情景人口估计，不是历史事件当年实际人口。

## 5. 正式交付文件

- `output/processed/API-INDEX.json`
- `output/processed/HANDOFF-CONTRACT-v1.md`
- `output/processed/taiwan/roads/README.md`
- `output/processed/taiwan/roads/network-qa.json`
- `output/processed/taiwan/roads/service-area-qa.json`
- `output/processed/DATA-QUALITY-ERRATA.md`
- `source-manifest-upgrade.json`
- `source-manifest-v2.json`

完整处理流程：

- `docs/data-processing.md`
- `pipeline/README.md`
- `docs/data-processing/README.md`

## 6. 结论

A1-A8 主数据处理链路已完成并通过最终审计。当前真正未完成的是动态设施状态、消防/救援设施、多灾种扩展、离线底图和前端/API 联调；这些内容不应在项目展示中描述为已经接入。
