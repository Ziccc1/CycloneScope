# 冻结数据契约 2.1 实际数据审计

审计时间：2026-07-19  
数据版本：a8-final-2026.07.19  
审计依据：`backend/app/schemas/` 与《DATA-CONTRACTS-v2.1.md》

## 结论

A1-A8 的数据处理结果通过数据质量审计，但尚未全部直接符合冻结契约 2.1 的 API 形状。原因是 A 交付的是分析存储格式，B 还必须完成 adapter 层，把 Parquet/NetCDF/原始 GeoJSON 映射为冻结 API。以下差异已经明确记录，不得让 C 直接读取原始分析文件。

## 差异清单

| 编号 | 模块 | 当前实际情况 | 处理责任 | 状态 |
|---|---|---|---|---|
| C-01 | 轨迹点 | `track-points.parquet` 缺少契约要求的 `is_landfall`；多了内部字段 `lon_unwrapped` | A/B | B adapter 补 `null`，地图不暴露 `lon_unwrapped` |
| C-02 | 风暴目录 | Parquet nullable/object 列需要转换为 Pydantic 的 number/null；根级元数据不在表行中 | B | 必须适配 |
| C-03 | 经典案例 | `classic-storms.json` 根 `data_status` 使用了扩展值 `observed_ibtracs_plus_era5` | A/B | 改为允许枚举 `mixed` |
| C-04 | 风场 | 已生成 13 个契约化 WindManifest 与 JSON.GZ frames；原始 NetCDF 仍仅供 A pipeline 使用 | A/B | 已通过；C 不读 NetCDF |
| C-05 | 影响格网 | 已生成 5 场台湾相关风暴的事件级 `storms/{id}/grid.geojson`；其余案例仍无格网 | A/B | 部分通过；缺失案例返回 `impact_available=false` |
| C-06 | 台湾 zone | `taiwan/zones.geojson` 已生成契约化字段；高分辨率统计区边界仍单独保留 | A | 已通过（统计区连接差异仍见 QA） |
| C-07 | 台湾设施 | `taiwan/facilities.geojson` 已统一 shelter/medical/rescue；10 km 服务半径为情景默认值 | A/B | 已通过（不表示实时导航） |
| C-08 | 服务区 | 当前是分析表，人口参考为 WorldPop ADM1；不能包装成官方统计区人口或实时导航 | B/C | 需保留口径字段 |
| C-09 | 简化轨迹 | 当前没有 `tracks/simplified/{storm_id}.geojson` | A/B | 可选补充，不阻塞目录/轨迹 API |
| C-10 | 元数据 | 多数 Parquet 没有行级 `schema_version/data_status/source_ids/generated_at` | B | 根 API envelope 补齐，不建议重复写入每行 |

## 已通过项目

- WGS84/EPSG:4326 坐标范围和 UTC 时间；
- 风速 m/s、气压 hPa、距离 km 的单位约定；
- 缺失值保持 null 的规则；
- IBTrACS SID、轨迹时间排序和重复检查；
- 64 点特征和严格质量失败排除 Top-K；
- ERA5 u/v 网格数组规则（对外 frame 仍待生成）；
- OSM PBF Osmium 解析、路网节点/边 QA 和有向服务区；
- EM-DAT 报告灾损与 TCE-DAT/WorldPop 模型暴露分离。

## B/C 使用顺序

1. 读取 `DATA-CONTRACTS-v2.1.md`；
2. 读取 `API-INDEX.json` 和 `HANDOFF-CONTRACT-v1.md`；
3. B 只在 adapter 层完成字段映射和 root envelope；
4. 运行 Pydantic/JSON Schema/OpenAPI 校验；
5. C 只消费 API、冻结 GeoJSON 和风场 frame，不直接读 Parquet/NetCDF/CSV；
6. 所有不满足契约的记录返回 null 或 `data_status`/`impact_available` 状态，不静默丢弃或填 0。

## 不能宣称已经完成的功能

- 所有经典案例动态风场；
- 全部案例完整影响格网；
- 全国完整医疗设施清单；
- 官方统计区人口 100% 空间匹配；
- 实时交通时间；
- 经济损失统一到 2024 价格；
- 洪水、滑坡、地震和热浪多灾种分析。
