-- FTS Round 20 / VS-20 migration shell
-- Watermark: Decision-support / Non-operational
CREATE TABLE IF NOT EXISTS signed_bundle_intake_contract (
  contract_id TEXT PRIMARY KEY,
  contract_hash_sha256 TEXT NOT NULL,
  watermark TEXT NOT NULL CHECK (watermark = 'Decision-support / Non-operational'),
  production_readiness_claim BOOLEAN NOT NULL DEFAULT FALSE,
  operational_readiness_claim BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS evidence_review_board_case (
  case_id TEXT PRIMARY KEY,
  current_state TEXT NOT NULL,
  case_hash_sha256 TEXT NOT NULL,
  watermark TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trust_chain_dashboard_snapshot (
  dashboard_id TEXT PRIMARY KEY,
  dashboard_hash_sha256 TEXT NOT NULL,
  watermark TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quarantine_queue_item (
  quarantine_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  record_hash_sha256 TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS limited_scope_approval_contract (
  contract_id TEXT PRIMARY KEY,
  contract_hash_sha256 TEXT NOT NULL,
  production_readiness_claim BOOLEAN NOT NULL DEFAULT FALSE,
  operational_readiness_claim BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS round20_audit_event (
  sequence INTEGER PRIMARY KEY,
  event_type TEXT NOT NULL,
  prev_hash_sha256 TEXT NOT NULL,
  event_hash_sha256 TEXT NOT NULL
);
