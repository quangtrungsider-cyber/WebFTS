# Round 21 / VS-21 — Evidence Review Board UI Shell, Quarantine Operations & Scoped Approval Handoff

## Goal
Move from API/contract shell to a frontend-facing UI shell with review queue, trust-chain dashboard cards, quarantine operations, limited-scope approval handoff, reviewer notes, bilingual VI/EN labels, dashboard-to-audit drilldown, and object manifest drilldown.

## Required Guardrails
- Watermark: Decision-support / Non-operational
- No live ATC/ATFM operational integration.
- No production/operational readiness claim unless valid evidence, trust-chain and scope exist.
- No raw L3/L4 payload export.

## Suggested commands
```text
make doctor PROFILE=core
make docs-validate
make guardrails-scan
make limited-scope-review-board-validate PROFILE=data-dev
make evidence-pack RELEASE=R21-VS-21 PROFILE=data-dev
```
