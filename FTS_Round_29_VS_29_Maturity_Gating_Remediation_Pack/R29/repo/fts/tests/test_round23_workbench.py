import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STATE=json.loads((ROOT/'artifacts/evidence-review-board-ui-shell/R23-VS-23/ui_shell_state.json').read_text(encoding='utf-8'))
W='Decision-support / Non-operational'

def test_round23_claim_guard_remains_non_operational():
    assert STATE['watermark']==W
    cg=STATE['claim_guard']
    assert cg['readiness_claim_allowed'] is False
    assert cg['production_readiness_claim'] is False
    assert cg['operational_readiness_claim'] is False
    assert 'quarantine_clear' in cg['gate_formula']

def test_round23_queue_and_trust_cards_block_readiness():
    assert len(STATE['review_queue']) >= 2
    assert all(item['readiness_badge']=='NOT_READY' for item in STATE['review_queue'])
    assert any(card['status']=='BLOCKS_READINESS' for card in STATE['trust_chain_dashboard_cards'])

def test_round23_quarantine_ledger_and_handoff_packet_are_scoped():
    assert all(row['changes_readiness'] is False for row in STATE['quarantine_action_ledger'])
    packet=STATE['handoff_packet_builder']
    assert packet['status']=='DRAFT_BLOCKED'
    assert 'production_readiness_certificate' in packet['disabled_exports']
    assert packet['watermark']==W

def test_round23_notes_drilldown_manifest_and_a11y():
    assert all(t['required_fields'] for t in STATE['reviewer_note_templates'])
    assert len(STATE['dashboard_to_audit_links']) >= 2
    assert all(p['can_mutate_source'] is False for p in STATE['object_manifest_drilldown_panels'])
    assert all(c['status']=='PASS' for c in STATE['accessibility_checks'])
    assert len(STATE['v24_candidate_backlog']) >= 5
