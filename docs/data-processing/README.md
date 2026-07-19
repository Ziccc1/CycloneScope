# 数据处理交付入口

当前唯一有效版本：`a8-final-2026.07.19`，契约版本：`2.1`。

请按以下顺序阅读：

1. [DATA-PROCESSING-HANDOFF-v2.1.md](DATA-PROCESSING-HANDOFF-v2.1.md)：A1–A8 全流程、数据资源和 B/C 接口说明；
2. [API-INDEX.json](API-INDEX.json)：数据集和契约路径的唯一索引；
3. [DATA-CONTRACTS-v2.1.md](DATA-CONTRACTS-v2.1.md)：字段、单位、元数据和严格校验规则；
4. [CONTRACT-AUDIT-v2.1.md](CONTRACT-AUDIT-v2.1.md)：契约审计结果；
5. [data-sources-final.md](data-sources-final.md)：来源、许可证、下载和版本清单。

严格风暴目录位于 `catalog/storms-summary.json`。QA 报告位于 `pydantic-contract-validation.json` 以及本地生成目录 `output/qa/`。

原始文件和大型 Parquet、NetCDF、GeoTIFF、PBF 不提交 GitHub。B/C 不应自行扫描文件名；后端必须依据 `API-INDEX.json` 通过 adapter 输出 API，前端只消费 API、契约 GeoJSON、WindManifest 和 WindFrame。

旧版 `HANDOFF-CONTRACT-v1.md`、`DELIVERY-MANIFEST.json` 和 `DATA-QUALITY-ERRATA.md` 已移除，避免与 2.1 契约并行造成歧义。