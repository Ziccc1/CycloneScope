# QA 目录说明

旧版 A1–A8 快照报告已移除，避免与当前 v2.1 数据契约混用。

当前 QA 入口：

- 本地生成：`output/qa/frozen-contract-2.1-validation.json`
- 本地生成：`output/qa/pydantic-contract-validation.json`
- 文档摘要：[`../data-processing/CONTRACT-AUDIT-v2.1.md`](../data-processing/CONTRACT-AUDIT-v2.1.md)

运行 `python pipeline/validate_frozen_contract.py` 重新生成机器审计结果。旧报告中的道路数量、设施数量和 v1 API 路径不再具有参考意义。