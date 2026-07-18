# CycloneScope executable contracts

`backend/app/schemas/` is the only hand-edited source of truth. Files under
`schemas/generated/` are generated JSON Schema/OpenAPI artifacts and must not be
edited manually.

Export and check:

```powershell
.\.venv\Scripts\python.exe .\scripts\export_contracts.py
.\.venv\Scripts\python.exe .\scripts\export_contracts.py --check
```

Validate a processed JSON or `.json.gz` file before handoff:

```powershell
.\.venv\Scripts\python.exe .\scripts\validate_contract.py storm-detail-list .\backend\data\samples\storms.json
.\.venv\Scripts\python.exe .\scripts\validate_contract.py wind-frame .\backend\data\samples\wind-demo.json
```

Contract ownership and change procedure are defined in `docs/team-plan.md`.
