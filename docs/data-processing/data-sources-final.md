# CycloneScope 最终数据源与处理状态 v2.1

更新时间：2026-07-20  
数据版本：a8-final-2026.07.19  
契约版本：2.1

本文件是初始 `data-sources.md` 的最终修订版。实际交付以本文件、`DATA-PROCESSING-HANDOFF-v2.1.md`、`API-INDEX.json` 和 `DATA-CONTRACTS-v2.1.md` 为准。

## 一、已接入并完成处理

| 数据源 | 地址 | 处理结果 | 最终状态 |
|---|---|---|---|
| NOAA IBTrACS 全球 since1980 | https://www.ncei.noaa.gov/products/international-best-track-archive | 4,943 场、300,007 个轨迹点；生成目录和轨迹 Parquet | 已接入 |
| NOAA IBTrACS WP 子集 | https://www.ncei.noaa.gov/products/international-best-track-archive | 104,304 个轨迹点，用于西北太平洋深入分析 | 已接入 |
| Copernicus ERA5 u10/v10 | https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels | 13 个契约 manifest、665 个压缩 frame；8 动态、4 静态、4 无风场 | 已接入，有能力限制 |
| WorldPop 2025 R2025A | https://data.worldpop.org/ | 2025 情景人口暴露；不代表历史事件当年实际人口 | 已接入，有语义限制 |
| EM-DAT Public Table | https://doc.emdat.be/docs/data-structure-and-content/emdat-public-table/ | 2,159 条报告灾损；经济损失保留原始货币和年份 | 已接入，有语义限制 |
| TCE-DAT | https://doi.org/10.5880/pik.2017.005 | 32,079 条模型暴露；单独作为 historical_exposure | 已接入，有语义限制 |
| 台湾官方统计区人口 | https://data.gov.tw/dataset/18681 | 138,179 条；参考日期为 2024-12-01 | 已接入，有日期限制 |
| 台湾最小统计区边界 | https://data.gov.tw/dataset/25128 | 156,478 个边界；19,754 条代码不匹配保留在 QA | 部分完成 |
| 台湾县市边界 | https://data.gov.tw/dataset/7442 | 22 个行政区契约 GeoJSON | 已接入 |
| 台湾避难收容处所 | https://data.gov.tw/dataset/73242 | 5,953 条位置和容量 | 已接入，无实时状态 |
| 台湾医疗设施 | https://data.gov.tw/dataset/139250 | 464 条 API 分区查询去重结果 | 已接入，但非全国完整清单 |
| 台湾消防、救援与应变单位 | https://data.gov.tw/dataset/5969 | 764 条消防/救援单位 + 23 条应变中心，共 787 条 | 已接入 |
| 台湾道路网络 | https://download.geofabrik.de/asia/taiwan.html | 3,722,291 个节点、7,597,166 条边 | 已接入 |
| 道路服务区 | 台湾 OSM 道路网络处理结果 | 8,747 条 10/20/30 分钟静态服务区记录 | 已接入，有情景限制 |

## 二、保留但明确限制

### 1. 官方统计区人口空间连接
官方人口文件已标准化，但边界版本和人口代码不完全一致。已匹配记录、未匹配记录和版本差异均保留，未按名称强行拼接。官方人口日期必须写为 `2024-12-01`，不能标成 2025。

### 2. EM-DAT 经济损失
当前字段是原始货币、原始年份的名义金额，尚未完成统一通胀调整。因此不能直接制作跨年份公平的经济损失排名。若以后补充，必须另行确定基准年、CPI/平减指数和汇率规则。

### 3. 道路服务时间
部分道路速度来自道路等级默认值，字段已标记 `speed_source=default_by_road_class`。结果可用于设施方案比较和 10/20/30 分钟情景分析，不能称为实时导航或实时交通时间。

### 4. 影响与暴露口径
- EM-DAT：报告灾损；
- TCE-DAT：模型估计的历史暴露；
- WorldPop：人口栅格与危险区域相交得到的情景暴露。

三者不能合并成一个“真实损失”指标。

## 三、后续扩展，不影响本次验收

| 数据源/功能 | 地址 | 当前状态 | 原因 |
|---|---|---|---|
| 台湾避难所动态开放状态 | https://data.gov.tw/dataset/12849 | 后续扩展 | 需要时间化开放状态和事件时间对齐；当前已有位置和容量 |
| Natural Earth 离线底图 | https://www.naturalearthdata.com/downloads/ | 后续扩展 | 在线底图已经满足展示，离线部署时再下载 |
| 洪水、滑坡、地震、热浪等多灾种 | 尚未确定统一来源 | 后续扩展 | 当前项目主题冻结为热带气旋可视分析 |
| 实时交通速度和道路封闭 | 无稳定统一来源 | 后续扩展 | 当前只有静态道路网络和情景速度 |
| 16 场完整影响格网 | 多来源 | 后续扩展 | 当前事件格网覆盖 5/16 场，其他案例正确返回 `impact_available=false` |

## 四、交付入口

- `API-INDEX.json`：数据集和契约路径唯一索引；
- `DATA-PROCESSING-HANDOFF-v2.1.md`：完整处理流程、资源规模、字段和 API 定义；
- `DATA-CONTRACTS-v2.1.md`：冻结字段契约；
- `CONTRACT-AUDIT-v2.1.md`：契约审计结果；
- `source-manifest-v2.json`、`source-manifest-upgrade.json`：来源、许可证、日期和哈希；
- `catalog/storms-summary.json`：严格风暴目录。

前端不直接读取原始 CSV、NetCDF、GeoTIFF、PBF 或分析 Parquet；B 应通过 adapter 输出 API，C 只消费 API、契约 GeoJSON、WindManifest 和 WindFrame。