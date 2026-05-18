import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def load(name):
    return json.loads((ROOT / 'artifacts' / 'limited-scope-review-board' / 'R20-VS-20' / name).read_text())

def test_no_readiness_claims():
    obj = load('signed_bundle_intake_contract.json')
    assert obj['production_readiness_claim'] is False
    assert obj['operational_readiness_claim'] is False
    assert obj['readiness_claim_allowed'] is False

def test_dashboard_has_five_dependency_families():
    dash = load('trust_chain_dashboard.json')
    assert len(dash['cards']) == 5

def test_quarantine_blocks_invalid_evidence():
    q = load('quarantine_queue.json')
    assert q['items'][0]['disposition'] == 'BLOCK_READINESS_ESCALATION'

def test_watermark_present():
    for f in ['signed_bundle_intake_contract.json','trust_chain_dashboard.json','review_board_case.json','limited_scope_approval_contract.json']:
        assert load(f)['watermark'] == 'Decision-support / Non-operational'
