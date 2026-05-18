import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STATE=json.loads((ROOT/'artifacts/evidence-review-board-ui-shell/R29-VS-29/ui_shell_state.json').read_text(encoding='utf-8'))
W='Decision-support / Non-operational'

def test_round29_watermark_and_claim_guard_blocks_readiness():
    assert STATE['round']=='R29-VS-29'
    assert STATE['watermark']==W
    cg=STATE['claim_guard']
    assert cg['readiness_claim_allowed'] is False
    assert cg['production_readiness_claim'] is False
    assert cg['operational_readiness_claim'] is False
    assert cg['verdict_default']=='DEFER'
    assert 'missing signed manifest' in cg['no_go_triggers']
    assert len(STATE['state_hash_sha256'])==64

def test_round29_inventory_gate_requires_external_verify():
    gate=STATE['package_inventory_gate']
    assert gate['mode']=='local-verification-protocol-only'
    assert gate['can_replace_independent_audit'] is False
    assert gate['integrity_status']=='pending-external-verify'
    assert 'MANIFEST.xml' in gate['required_files']
    assert 'signatures/*.sig' in gate['required_files']

def test_round29_five_mandatory_conditions_are_blocking():
    conditions=STATE['mandatory_pre_signature_conditions']
    assert len(conditions)==5
    assert {c['id'] for c in conditions}=={'C1','C2','C3','C4','C5'}
    assert all(c['status']=='BLOCKING' for c in conditions)
    assert any('DO-278A' in c['name'] for c in conditions)

def test_round29_maturity_ceiling_and_gate_mapping():
    m=STATE['maturity_gating_dashboard']
    assert 'TRL 5-6' in m['current_ceiling']
    assert len(m['gates'])==3
    assert any(g['framework']=='SESAR E-OCVM v3.0' for g in m['gates'])
    assert 'shadow-mode trial at operational unit' in m['cannot_exceed_without']

def test_round29_dseep_trace_matrix_is_hard_gate():
    d=STATE['dseep_trace_matrix_workbench']
    assert d['hard_gate'] is True
    assert len(d['steps'])==7
    assert any(s['status']=='hard-blocker-until-validated' for s in d['steps'])
    assert d['cross_vendor_rti_test']['required'] is True
    assert 'AIXM 5.1.1' in d['data_exchange_mapping']

def test_round29_safety_and_do278a_gate():
    s=STATE['safety_and_assurance_gate']
    assert 'operational decision-support' in s['ssa_required_when']
    assert s['do278a_al_policy']['must_derive_from_fha'] is True
    assert 'Long Thanh VVLT phase-1 scenario' in s['vietnam_context_scenarios']
    assert 'Hazard_Log.xlsx' in s['required_safety_artifacts']

def test_round29_procurement_pack_and_data_sovereignty():
    p=STATE['procurement_readiness_pack']
    assert p['status']=='CONDITIONAL-PASS-ONLY'
    assert 'technical weight 70-80%' in p['method_recommendation']
    assert 'Luật Đấu thầu 22/2023/QH15' in p['vietnam_law_mapping']
    assert 'TCO_10y.xlsx' in p['must_have_artifacts']
    assert any('export prohibited' in c for c in p['data_sovereignty_controls'])

def test_round29_round_history_rca_rules():
    r=STATE['round_history_rca_analyzer']
    assert r['input']=='ROUND_HISTORY.csv'
    assert 'gate_criteria_changed' in r['classification_columns']
    assert 'above 30%' in r['decision_rule']
    assert any(p['pattern']=='gate criteria drift' and p['signal']=='negative' for p in r['patterns'])

def test_round29_risks_and_export_pack_do_not_issue_certificates():
    assert len(STATE['risk_register_top12'])==12
    exp=STATE['compliance_evidence_export_pack']
    assert exp['mode']=='draft-export-only'
    assert exp['can_issue_certificate'] is False
    assert 'operational readiness certificate' in exp['exports_blocked']
    assert exp['watermark']==W

def test_round29_frontend_targets_r29_and_accessibility():
    html=(ROOT/'frontend/evidence-review-board-ui-shell/index.html').read_text(encoding='utf-8')
    js=(ROOT/'frontend/evidence-review-board-ui-shell/app.js').read_text(encoding='utf-8')
    css=(ROOT/'frontend/evidence-review-board-ui-shell/styles.css').read_text(encoding='utf-8')
    assert 'R29 / VS-29' in html
    assert 'R29-VS-29/ui_shell_state.json' in js
    for key in ['inventory','mandatory','maturity','dseep','safety','procurement','roundHistory','risks']:
        assert key in html or key in js
    assert 'aria-live' in html
    assert 'prefers-reduced-motion' in css
    assert W in html
