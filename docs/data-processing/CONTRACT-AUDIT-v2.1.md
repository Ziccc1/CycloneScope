# 冻结数据契约 2.1 实际数据审计

审计时间：2026-07-20  
数据版本：`a8-final-2026.07.19`  
审计依据：`backend/app/schemas/`、`DATA-CONTRACTS-v2.1.md`、A1–A8 处理记录。

## 结论

当前契约校验结果为：**32 项机器检查通过，0 项失败**。Pydantic 严格校验通过：严格风暴目录、台湾区、台湾设施、13 个 WindManifest、665 个 WindFrame 和 5 个 ImpactGrid 全部通过。

状态为 `pass_with_known_coverage_limits`，不是所有功能数据都完整覆盖。以下是已知范围限制，不属于字段清洗错误：

- 16 个经典案例中 8 个支持动态风场、4 个仅静态风场、4 个没有 ERA5；
- 影响格网当前覆盖 5/16 个经典案例，其他案例必须返回 `impact_available=false`；
- 官方统计区有 19,754 条边界/人口代码版本不匹配，未强行按名称连接；
- 医疗设施 464 条为 API 分区查询去重结果，不代表全国完整清单；
- 道路速度部分使用道路等级默认值，服务区是静态情景估算；
- 官方统计人口参考日期为 2024-12-01；
- EM-DAT 经济损失仍为原始年份名义金额，未完成统一通胀调整；
- TCE-DAT 是模型估计暴露，不能与 EM-DAT 报告灾损合并。

## 契约检查项

| 模块 | 检查结果 | 说明 |
|---|---|---|
| StormSummary | 通过 | `catalog/storms-summary.json`，4,943 项，严格字段和根元数据完整 |
| TrackPoint | 通过 | 全球/WP/WP 轨迹字段、UTC、坐标范围、排序和可空 landfall 已检查 |
| WindManifest | 通过 | 13 个 manifest，frames 使用 `time/url/byte_size/sha256` |
| WindFrame | 通过 | 665 个 JSON.GZ，数组长度满足 `width*height` |
| TaiwanZone | 通过 | `zones.geojson` 满足严格属性集合 |
| Facility | 通过 | shelter/medical/rescue 共 7,204 条，类型枚举合法 |
| ImpactGrid | 通过 | 5 个事件格网，空人口/灾损字段保持 null |
| Similarity | 通过 | 严格失败记录不进入 Top-K |

## 交付责任

A 负责生成和 QA；B 负责 adapter、API envelope 和 OpenAPI/TypeScript 生成；C 只消费 API、契约 GeoJSON、WindManifest 和 WindFrame。C 不应直接读取 Parquet、NetCDF、GeoTIFF 或原始 CSV。

旧版 `HANDOFF-CONTRACT-v1.md`、`DELIVERY-MANIFEST.json` 和 `DATA-QUALITY-ERRATA.md` 已废止，不再作为交付依据。