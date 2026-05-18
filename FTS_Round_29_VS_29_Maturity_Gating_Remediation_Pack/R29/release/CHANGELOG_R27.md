# CHANGELOG — Round 27 / VS-27

## Added
- Cross-domain evidence federation read-only index across AIS/AIM, ATFM, training/competency, and security/audit evidence domains.
- Reviewer workload forecasting dashboard with fatigue/risk balancing guardrails; decision-support only and no roster/HR automation.
- Advanced audit replay timeline distinguishing immutable post-event replay from near-real-time review pending immutability commit.
- Signed policy bundle promotion pipeline with DRAFT → SHADOW_REPLAY → LIMITED_SCOPE_PILOT → APPROVED_FOR_NON_OPERATIONAL_DECISION_SUPPORT → ARCHIVED gates.
- Evidence provenance graph analytics for orphan nodes, untrusted leaves and cross-domain conflicts.
- Operational-readiness gating simulator that can explain why readiness is blocked but cannot issue operational/production claims.
- Immutable export notarization and long-term archive retention pack with hot/warm/cold-WORM retention classes.

## Guardrails retained
- Watermark: Decision-support / Non-operational.
- No operational write-back.
- No readiness claim without evidence chain, trust-chain, valid scope, clear quarantine and promoted signed policy bundle.
