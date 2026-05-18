import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STATE=json.loads((ROOT/'artifacts/evidence-review-board-ui-shell/R24-VS-24/ui_shell_state.json').read_text(encoding='utf-8'))
W='Decision-support / Non-operational'

def test_round24_claim_guard_and_adapter_remain_non_operational():
    assert STATE['watermark']==W
    assert STATE['claim_guard']['readiness_claim_allowed'] is False
    assert STATE['claim_guard']['production_readiness_claim'] is False
    assert STATE['claim_guard']['operational_readiness_claim'] is False
    assert STATE['mock_api_adapter']['operational_writeback'] is False
    assert 'POST /operational/writeback' in STATE['mock_api_adapter']['blocked_methods']

def test_round24_evidence_diff_and_drilldowns_are_read_only():
    assert len(STATE['evidence_diff_viewer']['diff_pairs']) >= 2
    assert all(d['readiness_effect'] in {'BLOCKS_READINESS','NO_CLAIM_ALLOWED'} for d in STATE['evidence_diff_viewer']['diff_pairs'])
    assert all(o['can_mutate_source'] is False for o in STATE['object_manifest_drilldown'])
    assert len(STATE['audit_drilldown_links']) >= 3

def test_round24_sod_engine_blocks_invalid_assignment():
    assignments=STATE['sod_reviewer_assignment_engine']['assignments']
    assert any(a['sod_status']=='PASS' for a in assignments)
    assert any(a['sod_status']=='FAIL' and a['scope_valid'] is False for a in assignments)
    assert 'production_readiness_certificate' in STATE['sod_reviewer_assignment_engine']['blocked_exports']

def test_round24_sla_heatmap_and_offline_packet():
    buckets=STATE['case_timeline_sla_heatmap']['buckets']
    assert any(b['heat']=='HIGH' for b in buckets)
    packet=STATE['offline_signed_reviewer_packet']
    assert packet['watermark']==W
    assert packet['can_import_signed_packet'] is True
    assert packet['can_claim_readiness'] is False
    assert 'live_writeback_payload' in packet['disabled_exports']

def test_round24_a11y_and_v25_backlog():
    assert all(c['status']=='PASS' for c in STATE['accessibility_checks'])
    assert len(STATE['v25_candidate_backlog']) >= 6
