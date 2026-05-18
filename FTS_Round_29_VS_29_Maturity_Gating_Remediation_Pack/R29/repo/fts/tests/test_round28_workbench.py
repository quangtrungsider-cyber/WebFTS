import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STATE=json.loads((ROOT/'artifacts/evidence-review-board-ui-shell/R28-VS-28/ui_shell_state.json').read_text(encoding='utf-8'))
W='Decision-support / Non-operational'

def test_round28_claim_guard_watermark_and_hash():
    assert STATE['round']=='R28-VS-28'
    assert STATE['watermark']==W
    cg=STATE['claim_guard']
    assert cg['readiness_claim_allowed'] is False
    assert cg['production_readiness_claim'] is False
    assert cg['operational_readiness_claim'] is False
    assert 'FAT/SAT rehearsal does not constitute production acceptance' in cg['blocking_reasons']
    assert len(STATE['state_hash_sha256']) == 64

def test_round28_assurance_case_builder_blocks_readiness():
    ac=STATE['assurance_case_builder']
    assert ac['mode']=='builder-only'
    assert ac['readiness_claim_allowed'] is False
    assert len(ac['claims']) >= 3
    assert any(c['status']=='supported-with-gaps' and c['open_gaps'] for c in ac['claims'])
    assert any(n['type']=='rebuttal' for n in ac['argument_nodes'])

def test_round28_controlled_pilot_telemetry_is_non_operational():
    tel=STATE['controlled_pilot_telemetry_ingestion']
    assert tel['operational_writeback'] is False
    assert any(l['status']=='rejected' for l in tel['ingestion_lanes'])
    assert 'no raw personal data' in tel['privacy_controls']
    assert all('validation' in l and l['validation'] for l in tel['ingestion_lanes'])

def test_round28_human_factors_review_room_is_advisory():
    hf=STATE['human_factors_review_room']
    assert 'cannot approve evidence' in hf['guardrail']
    assert len(hf['rooms']) >= 3
    assert any(r['focus']=='fatigue/risk balancing' for r in hf['rooms'])

def test_round28_domain_conflict_resolution_has_blocked_actions():
    wb=STATE['domain_conflict_resolution_workbench']
    assert len(wb['conflicts']) >= 3
    assert 'force approve' in wb['blocked_actions']
    assert any(c['resolution_state']=='blocked_from_approval' for c in wb['conflicts'])

def test_round28_retention_policy_authoring_is_draft_only():
    ret=STATE['retention_policy_authoring_ui']
    assert ret['status']=='draft-not-effective'
    assert 'cannot shorten' in ret['must_not']
    assert any(r['disposition']=='WORM archive' for r in ret['rules'])
    assert all(r['legal_hold_supported'] is True for r in ret['rules'])

def test_round28_siem_connector_simulator_blocks_live_enforcement():
    siem=STATE['siem_evidence_connector_simulator']
    assert siem['mode']=='simulator-only'
    assert len(siem['connectors']) >= 3
    assert 'live SIEM credentials' in siem['blocked']
    assert 'automatic enforcement' in siem['blocked']

def test_round28_fat_sat_rehearsal_is_not_go_live():
    pack=STATE['fat_sat_rehearsal_pack']
    assert pack['status']=='rehearsal-only'
    assert len(pack['scripts']) >= 4
    assert 'No script outcome is a production go-live decision.' == pack['acceptance_note']

def test_round28_frontend_shell_targets_r28_and_a11y():
    html=(ROOT/'frontend/evidence-review-board-ui-shell/index.html').read_text(encoding='utf-8')
    js=(ROOT/'frontend/evidence-review-board-ui-shell/app.js').read_text(encoding='utf-8')
    css=(ROOT/'frontend/evidence-review-board-ui-shell/styles.css').read_text(encoding='utf-8')
    assert ('R28 / VS-28' in html) or ('R29 / VS-29' in html)
    assert ('R28-VS-28/ui_shell_state.json' in js) or ('R29-VS-29/ui_shell_state.json' in js)
    for key in ['assurance','telemetry','humanFactors','conflict','retention','siem','fatSat']:
        assert key in html or key in js
    assert 'aria-live' in html
    assert 'prefers-reduced-motion' in css
    assert 'Decision-support / Non-operational' in html
    assert len(STATE['v29_candidate_backlog']) >= 6
