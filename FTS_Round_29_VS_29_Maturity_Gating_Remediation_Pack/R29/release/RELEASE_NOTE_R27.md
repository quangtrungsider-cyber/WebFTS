# Release Note — FTS Round 27 / VS-27

VS-27 upgrades the Evidence Review Board Workbench from offline packet and policy simulation support toward cross-domain assurance management. The release remains a frontend-facing, non-operational decision-support shell. It does not replace authoritative ANS/AIM/ATFM systems, does not write back to operational systems, and does not claim production or operational readiness.

Validation performed:
- `make frontend-ui-shell-validate`: PASS
- `pytest`: 30/30 PASS
- `tools/guardrails/scan.py`: PASS, 0 findings

Primary artifact:
- `repo/fts/artifacts/evidence-review-board-ui-shell/R27-VS-27/ui_shell_state.json`

Frontend entry point:
- `repo/fts/frontend/evidence-review-board-ui-shell/index.html`
