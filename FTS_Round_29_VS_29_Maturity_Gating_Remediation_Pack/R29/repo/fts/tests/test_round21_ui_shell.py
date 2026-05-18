import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STATE=json.loads((ROOT/'artifacts/evidence-review-board-ui-shell/R21-VS-21/ui_shell_state.json').read_text(encoding='utf-8'))
W='Decision-support / Non-operational'

def test_ui_shell_watermark_and_claim_guard():
    assert STATE['watermark']==W
    assert STATE['claim_guard']['production_readiness_claim'] is False
    assert STATE['claim_guard']['operational_readiness_claim'] is False
    assert STATE['claim_guard']['readiness_claim_allowed'] is False

def test_bilingual_labels_complete():
    for lang in ['vi','en']:
        for key in ['title','queue','trust','quarantine','handoff','notes','audit','manifest','watermark','not_ready']:
            assert STATE['labels'][lang][key]

def test_dashboard_to_audit_and_manifest_drilldown():
    anchors={a['audit_anchor'] for a in STATE['audit_drilldown']}
    objects={o['object_id'] for o in STATE['object_manifest_drilldown']}
    assert len(STATE['trust_chain_cards'])==5
    assert any(c['audit_anchor'] in anchors for c in STATE['trust_chain_cards'])
    assert 'obj:trust_chain_dashboard.json' in objects

def test_quarantine_operations_cannot_mark_ready():
    for item in STATE['quarantine_operations']:
        assert 'MARK_READY' in item['forbidden_dispositions']
        assert item['disposition']=='BLOCK_READINESS_ESCALATION'

def test_accessibility_checks_pass():
    assert all(c['status']=='PASS' for c in STATE['accessibility']['checks'])

R22=json.loads((ROOT/'artifacts/evidence-review-board-ui-shell/R22-VS-22/ui_shell_state.json').read_text(encoding='utf-8'))

def test_round22_workbench_gate_blocks_unsubstantiated_readiness():
    assert R22['round']=='R22-VS-22'
    assert R22['watermark']==W
    cg=R22['claim_guard']
    assert cg['readiness_claim_allowed'] is False
    assert cg['production_readiness_claim'] is False
    assert cg['operational_readiness_claim'] is False
    assert cg['quarantine_clear'] is False
    assert cg['approval_signed'] is False
    assert 'evidence_valid AND trust_chain_valid AND scope_valid' in cg['gate_formula']

def test_round22_workflow_and_scope_are_frontend_facing():
    assert len(R22['workbench_filters']) >= 4
    assert len(R22['review_workflow_lanes']) >= 4
    assert all(l['allowed_roles'] and l['exit_criteria'] for l in R22['review_workflow_lanes'])
    assert len(R22['scope_matrix']) >= 4
    assert all('operational' in ' '.join(s['not_allowed']) or 'production' in ' '.join(s['not_allowed']) or 'ready' in ' '.join(s['not_allowed']) for s in R22['scope_matrix'])

def test_round22_evidence_gaps_block_handoff_and_readiness():
    assert len(R22['evidence_gap_matrix']) >= 3
    assert all(g['blocks_readiness'] for g in R22['evidence_gap_matrix'])
    actions={a['action_id']:a for a in R22['allowed_actions']}
    assert actions['ACT-HANDOFF-LIMITED-SCOPE']['enabled'] is False
    assert actions['ACT-CLAIM-READINESS']['enabled'] is False

def test_round22_export_pack_and_a11y_are_bounded():
    ep=R22['export_pack']
    assert ep['watermark']==W
    assert ep['production_readiness_claim'] is False
    assert ep['operational_readiness_claim'] is False
    checks=R22['keyboard_accessibility']['checks']
    assert all(c['status']=='PASS' for c in checks)
    assert 'searchBox' in R22['keyboard_accessibility']['tab_order']

