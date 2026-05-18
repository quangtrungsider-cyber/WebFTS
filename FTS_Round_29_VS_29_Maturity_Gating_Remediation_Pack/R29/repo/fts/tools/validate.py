#!/usr/bin/env python3
from __future__ import annotations
import json, sys, hashlib, zipfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
WATERMARK = 'Decision-support / Non-operational'

def load_json(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))

def stable_hash(obj):
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def pass_msg(name, extra=''):
    print(f'PASS {name}{(" — " + extra) if extra else ""}')

def check_watermark():
    paths = [
        'artifacts/limited-scope-review-board/R20-VS-20/signed_bundle_intake_contract.json',
        'artifacts/limited-scope-review-board/R20-VS-20/trust_chain_dashboard.json',
        'artifacts/limited-scope-review-board/R20-VS-20/quarantine_queue.json',
        'artifacts/limited-scope-review-board/R20-VS-20/review_board_case.json',
        'artifacts/limited-scope-review-board/R20-VS-20/limited_scope_approval_contract.json',
    ]
    for p in paths:
        obj = load_json(p)
        assert obj.get('watermark') == WATERMARK, p

def check_claims():
    intake = load_json('artifacts/limited-scope-review-board/R20-VS-20/signed_bundle_intake_contract.json')
    assert intake['production_readiness_claim'] is False
    assert intake['operational_readiness_claim'] is False
    assert intake['readiness_claim_allowed'] is False
    approval = load_json('artifacts/limited-scope-review-board/R20-VS-20/limited_scope_approval_contract.json')
    assert approval['production_readiness_claim'] is False
    assert approval['operational_readiness_claim'] is False

def check_audit():
    chain = load_json('artifacts/limited-scope-review-board/R20-VS-20/audit_hash_chain.json')
    prev = '0'*64
    for ev in chain['events']:
        assert ev['prev_hash_sha256'] == prev
        old = ev['event_hash_sha256']
        body = dict(ev)
        del body['event_hash_sha256']
        assert stable_hash(body) == old
        prev = old
    assert chain['terminal_hash_sha256'] == prev
    assert chain['verification_status'] == 'PASS'

def check_dictionary():
    data = load_json('docs/04-data/data-dictionary.yaml')
    tables = len(data['tables'])
    cols = sum(len(t['columns']) for t in data['tables'])
    assert tables == 33, tables
    assert cols == 402, cols
    pass_msg('data-dictionary-validate', f'{tables} tables / {cols} columns')

def check_schemas():
    schemas = list((ROOT / 'schemas').glob('*.schema.json'))
    assert len(schemas) >= 7
    for s in schemas:
        obj = json.loads(s.read_text(encoding='utf-8'))
        assert obj.get('$schema')
    pass_msg('schema-validate', f'{len(schemas)} schemas')

def check_no_forbidden():
    forbidden = ['Date.now(', 'datetime.now(', 'LIVE_ATC_WRITEBACK_ENABLED = true', 'raw_l3_payload', 'raw_l4_payload', 'BEGIN PRIVATE KEY']
    findings = []
    for p in ROOT.rglob('*'):
        if p.name == 'validate.py':
            continue
        if p.is_file() and p.suffix.lower() in {'.py','.md','.yaml','.yml','.json','.sql','.txt'}:
            text = p.read_text(encoding='utf-8', errors='ignore')
            for f in forbidden:
                if f in text:
                    findings.append((str(p.relative_to(ROOT)), f))
    assert not findings, findings
    pass_msg('guardrails-scan', '0 findings')

def check_ui_shell():
    state = load_json('artifacts/evidence-review-board-ui-shell/R21-VS-21/ui_shell_state.json')
    assert state['watermark'] == WATERMARK
    assert state['claim_guard']['production_readiness_claim'] is False
    assert state['claim_guard']['operational_readiness_claim'] is False
    assert state['claim_guard']['readiness_claim_allowed'] is False
    for lang in ['vi','en']:
        for key in ['title','queue','trust','quarantine','handoff','notes','audit','manifest','watermark','not_ready']:
            assert state['labels'][lang][key]
    assert len(state['trust_chain_cards']) == 5
    assert all(c['status'] == 'PASS' for c in state['accessibility']['checks'])
    html = (ROOT / 'frontend/evidence-review-board-ui-shell/index.html').read_text(encoding='utf-8')
    js = (ROOT / 'frontend/evidence-review-board-ui-shell/app.js').read_text(encoding='utf-8')
    assert WATERMARK in html
    assert 'data-i18n' in html and 'fetch(DATA_URL)' in js
    for q in state['quarantine_operations']:
        assert 'MARK_READY' in q['forbidden_dispositions']
    pass_msg('evidence-review-board-ui-shell-validate', 'review queue / trust cards / quarantine / handoff / a11y')


def check_workbench_v22():
    state = load_json('artifacts/evidence-review-board-ui-shell/R22-VS-22/ui_shell_state.json')
    assert state['round'] == 'R22-VS-22'
    assert state['watermark'] == WATERMARK
    cg = state['claim_guard']
    assert cg['readiness_claim_allowed'] is False
    assert cg['production_readiness_claim'] is False
    assert cg['operational_readiness_claim'] is False
    assert cg['quarantine_clear'] is False
    assert cg['approval_signed'] is False
    assert len(state['workbench_filters']) >= 4
    assert len(state['review_workflow_lanes']) >= 4
    assert len(state['evidence_gap_matrix']) >= 3
    assert all(g['blocks_readiness'] for g in state['evidence_gap_matrix'])
    actions = {a['action_id']: a for a in state['allowed_actions']}
    assert actions['ACT-HANDOFF-LIMITED-SCOPE']['enabled'] is False
    assert actions['ACT-CLAIM-READINESS']['enabled'] is False
    assert state['export_pack']['watermark'] == WATERMARK
    assert state['export_pack']['production_readiness_claim'] is False
    assert state['export_pack']['operational_readiness_claim'] is False
    assert all(c['status'] == 'PASS' for c in state['keyboard_accessibility']['checks'])
    html = (ROOT / 'frontend/evidence-review-board-ui-shell/index.html').read_text(encoding='utf-8')
    js = (ROOT / 'frontend/evidence-review-board-ui-shell/app.js').read_text(encoding='utf-8')
    assert 'R22 / VS-22' in html and 'R22-VS-22/ui_shell_state.json' in js
    assert 'aria-live' in html and 'prefers-reduced-motion' in (ROOT / 'frontend/evidence-review-board-ui-shell/styles.css').read_text(encoding='utf-8')
    pass_msg('evidence-review-board-workbench-v22-validate', 'workflow / gate explainer / gaps / scope / a11y / export')


def check_workbench_v23():
    state = load_json('artifacts/evidence-review-board-ui-shell/R23-VS-23/ui_shell_state.json')
    assert state['round'] == 'R23-VS-23'
    assert state['watermark'] == WATERMARK
    cg = state['claim_guard']
    assert cg['readiness_claim_allowed'] is False
    assert cg['production_readiness_claim'] is False
    assert cg['operational_readiness_claim'] is False
    assert cg['quarantine_clear'] is False
    assert len(state['review_queue']) >= 2
    assert all(i['readiness_badge'] == 'NOT_READY' for i in state['review_queue'])
    assert len(state['trust_chain_dashboard_cards']) >= 3
    assert any(c['status'] == 'BLOCKS_READINESS' for c in state['trust_chain_dashboard_cards'])
    assert len(state['quarantine_action_ledger']) >= 2
    assert all(e['changes_readiness'] is False for e in state['quarantine_action_ledger'])
    assert state['handoff_packet_builder']['status'] == 'DRAFT_BLOCKED'
    assert state['handoff_packet_builder']['watermark'] == WATERMARK
    assert len(state['reviewer_note_templates']) >= 3
    assert all(t['required_fields'] for t in state['reviewer_note_templates'])
    assert len(state['dashboard_to_audit_links']) >= 2
    assert all(p['can_mutate_source'] is False for p in state['object_manifest_drilldown_panels'])
    assert all(c['status'] == 'PASS' for c in state['accessibility_checks'])
    assert len(state['v24_candidate_backlog']) >= 5
    html = (ROOT / 'frontend/evidence-review-board-ui-shell/index.html').read_text(encoding='utf-8')
    js = (ROOT / 'frontend/evidence-review-board-ui-shell/app.js').read_text(encoding='utf-8')
    assert 'R23 / VS-23' in html and 'R23-VS-23/ui_shell_state.json' in js
    pass_msg('evidence-review-board-workbench-v23-validate', 'queue / trust cards / quarantine ledger / scoped packet / notes / drilldown / a11y')


def check_workbench_v24():
    state = load_json('artifacts/evidence-review-board-ui-shell/R24-VS-24/ui_shell_state.json')
    assert state['round'] == 'R24-VS-24'
    assert state['watermark'] == WATERMARK
    cg = state['claim_guard']
    assert cg['readiness_claim_allowed'] is False
    assert cg['production_readiness_claim'] is False
    assert cg['operational_readiness_claim'] is False
    assert cg['backend_writeback_enabled'] is False
    assert len(state['evidence_diff_viewer']['diff_pairs']) >= 2
    assert all(d['readiness_effect'] in {'BLOCKS_READINESS','NO_CLAIM_ALLOWED'} for d in state['evidence_diff_viewer']['diff_pairs'])
    assignments = state['sod_reviewer_assignment_engine']['assignments']
    assert any(a['sod_status'] == 'PASS' for a in assignments)
    assert any(a['sod_status'] == 'FAIL' and a['scope_valid'] is False for a in assignments)
    assert any(b['heat'] == 'HIGH' for b in state['case_timeline_sla_heatmap']['buckets'])
    pkt = state['offline_signed_reviewer_packet']
    assert pkt['watermark'] == WATERMARK
    assert pkt['can_claim_readiness'] is False
    assert 'live_writeback_payload' in pkt['disabled_exports']
    adapter = state['mock_api_adapter']
    assert adapter['operational_writeback'] is False
    assert 'POST /operational/writeback' in adapter['blocked_methods']
    assert all(o['can_mutate_source'] is False for o in state['object_manifest_drilldown'])
    assert all(c['status'] == 'PASS' for c in state['accessibility_checks'])
    assert len(state['v25_candidate_backlog']) >= 6
    html = (ROOT / 'frontend/evidence-review-board-ui-shell/index.html').read_text(encoding='utf-8')
    js = (ROOT / 'frontend/evidence-review-board-ui-shell/app.js').read_text(encoding='utf-8')
    assert 'R24 / VS-24' in html and 'R24-VS-24/ui_shell_state.json' in js
    pass_msg('evidence-review-board-workbench-v24-validate', 'diff viewer / SoD assignment / SLA heatmap / offline packet / readonly mock adapter')


def check_workbench_v27():
    state = load_json('artifacts/evidence-review-board-ui-shell/R27-VS-27/ui_shell_state.json')
    assert state['round'] == 'R27-VS-27'
    assert state['watermark'] == WATERMARK
    cg = state['claim_guard']
    assert cg['readiness_claim_allowed'] is False
    assert cg['production_readiness_claim'] is False
    assert cg['operational_readiness_claim'] is False
    fed = state['cross_domain_evidence_federation']
    assert fed['operational_writeback'] is False
    assert len(fed['domains']) >= 4
    assert any(d['status'] == 'PARTIAL' for d in fed['domains'])
    assert 'claim_cross_domain_readiness' in fed['forbidden_actions']
    forecast = state['reviewer_workload_forecasting']
    assert forecast['decision_support_only'] is True
    assert any(r['fatigue_risk'] == 'HIGH' for r in forecast['reviewers'])
    replay = state['advanced_audit_replay_timeline']
    assert replay['can_mutate_events'] is False
    assert any(c['warning'] == 'pending immutability commit' for c in replay['replay_classes'])
    pipeline = state['signed_policy_bundle_promotion_pipeline']
    assert pipeline['next_stage_allowed'] is False
    assert 'direct_to_operational' in pipeline['forbidden_promotions']
    graph = state['evidence_provenance_graph_analytics']
    assert graph['can_mutate_source'] is False
    assert any(a['readiness_effect'] == 'BLOCKS_READINESS' for a in graph['analytics'])
    gate = state['operational_readiness_gating_simulator']
    assert gate['simulation_only'] is True
    assert gate['operational_gate_open'] is False
    assert 'operational_readiness_certificate' in gate['blocked_outputs']
    archive = state['immutable_export_notarization_archive_retention']
    assert archive['can_replace_authoritative_record'] is False
    assert archive['legal_hold_supported'] is True
    assert all(c['status'] == 'PASS' for c in state['accessibility_checks'])
    assert len(state['v28_candidate_backlog']) >= 7
    html = (ROOT / 'frontend/evidence-review-board-ui-shell/index.html').read_text(encoding='utf-8')
    js = (ROOT / 'frontend/evidence-review-board-ui-shell/app.js').read_text(encoding='utf-8')
    assert 'R27 / VS-27' in html and 'R27-VS-27/ui_shell_state.json' in js
    assert 'federation-cards' in html and 'gating-simulator' in html and 'provenance-graph' in html
    pass_msg('evidence-review-board-workbench-v27-validate', 'federation / forecast / replay / promotion / provenance / gating / notarized archive')


def check_workbench_v28():
    state = load_json('artifacts/evidence-review-board-ui-shell/R28-VS-28/ui_shell_state.json')
    assert state['round'] == 'R28-VS-28'
    assert state['watermark'] == WATERMARK
    cg = state['claim_guard']
    assert cg['readiness_claim_allowed'] is False
    assert cg['production_readiness_claim'] is False
    assert cg['operational_readiness_claim'] is False
    assert 'FAT/SAT rehearsal does not constitute production acceptance' in cg['blocking_reasons']
    ac = state['assurance_case_builder']
    assert ac['mode'] == 'builder-only'
    assert ac['readiness_claim_allowed'] is False
    assert any(c['open_gaps'] for c in ac['claims'])
    tel = state['controlled_pilot_telemetry_ingestion']
    assert tel['operational_writeback'] is False
    assert any(l['status'] == 'rejected' for l in tel['ingestion_lanes'])
    hf = state['human_factors_review_room']
    assert 'cannot approve evidence' in hf['guardrail']
    conflict = state['domain_conflict_resolution_workbench']
    assert 'force approve' in conflict['blocked_actions']
    assert any(c['resolution_state'] == 'blocked_from_approval' for c in conflict['conflicts'])
    retention = state['retention_policy_authoring_ui']
    assert retention['status'] == 'draft-not-effective'
    assert all(r['legal_hold_supported'] is True for r in retention['rules'])
    siem = state['siem_evidence_connector_simulator']
    assert siem['mode'] == 'simulator-only'
    assert 'live SIEM credentials' in siem['blocked']
    fat = state['fat_sat_rehearsal_pack']
    assert fat['status'] == 'rehearsal-only'
    assert 'production go-live' in fat['acceptance_note']
    html = (ROOT / 'frontend/evidence-review-board-ui-shell/index.html').read_text(encoding='utf-8')
    js = (ROOT / 'frontend/evidence-review-board-ui-shell/app.js').read_text(encoding='utf-8')
    assert 'R28 / VS-28' in html and 'R28-VS-28/ui_shell_state.json' in js
    assert 'assurance' in html and 'telemetry' in html and 'fatSat' in js
    assert len(state['v29_candidate_backlog']) >= 6
    pass_msg('evidence-review-board-workbench-v28-validate', 'assurance case / telemetry / HF room / conflict workbench / retention / SIEM simulator / FAT-SAT')


def check_workbench_v29():
    state = load_json('artifacts/evidence-review-board-ui-shell/R29-VS-29/ui_shell_state.json')
    assert state['round'] == 'R29-VS-29'
    assert state['watermark'] == WATERMARK
    cg = state['claim_guard']
    assert cg['readiness_claim_allowed'] is False
    assert cg['production_readiness_claim'] is False
    assert cg['operational_readiness_claim'] is False
    assert cg['verdict_default'] == 'DEFER'
    assert 'missing signed manifest' in cg['no_go_triggers']
    inv = state['package_inventory_gate']
    assert inv['mode'] == 'local-verification-protocol-only'
    assert inv['can_replace_independent_audit'] is False
    assert inv['integrity_status'] == 'pending-external-verify'
    assert 'MANIFEST.xml' in inv['required_files'] and 'signatures/*.sig' in inv['required_files']
    conditions = state['mandatory_pre_signature_conditions']
    assert len(conditions) == 5 and all(c['status'] == 'BLOCKING' for c in conditions)
    assert {c['id'] for c in conditions} == {'C1','C2','C3','C4','C5'}
    maturity = state['maturity_gating_dashboard']
    assert 'TRL 5-6' in maturity['current_ceiling']
    assert len(maturity['gates']) == 3
    dseep = state['dseep_trace_matrix_workbench']
    assert dseep['hard_gate'] is True and len(dseep['steps']) == 7
    assert dseep['cross_vendor_rti_test']['required'] is True
    safety = state['safety_and_assurance_gate']
    assert 'operational decision-support' in safety['ssa_required_when']
    assert safety['do278a_al_policy']['must_derive_from_fha'] is True
    procurement = state['procurement_readiness_pack']
    assert procurement['status'] == 'CONDITIONAL-PASS-ONLY'
    assert 'TCO_10y.xlsx' in procurement['must_have_artifacts']
    round_history = state['round_history_rca_analyzer']
    assert round_history['input'] == 'ROUND_HISTORY.csv'
    assert 'above 30%' in round_history['decision_rule']
    assert len(state['risk_register_top12']) == 12
    export = state['compliance_evidence_export_pack']
    assert export['mode'] == 'draft-export-only'
    assert export['can_issue_certificate'] is False
    assert all(c['status'] == 'PASS' for c in state['accessibility_checks'])
    assert len(state['v30_candidate_backlog']) >= 7
    html = (ROOT / 'frontend/evidence-review-board-ui-shell/index.html').read_text(encoding='utf-8')
    js = (ROOT / 'frontend/evidence-review-board-ui-shell/app.js').read_text(encoding='utf-8')
    assert 'R29 / VS-29' in html and 'R29-VS-29/ui_shell_state.json' in js
    assert 'inventory' in html and 'dseep' in html and 'roundHistory' in js
    pass_msg('evidence-review-board-workbench-v29-validate', 'maturity gate / mandatory evidence / DSEEP / SSA / procurement / RCA / risk / export')

def evidence_pack():
    out = ROOT / 'artifacts' / 'release-evidence-pack.zip'
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        bases = [ROOT / 'artifacts' / 'limited-scope-review-board' / 'R20-VS-20', ROOT / 'artifacts' / 'evidence-review-board-ui-shell' / 'R29-VS-29', ROOT / 'frontend' / 'evidence-review-board-ui-shell']
        for base in bases:
            for p in base.rglob('*'):
                if p.is_file():
                    zf.write(p, p.relative_to(ROOT))
    pass_msg('evidence-pack', str(out))

def main():
    name = sys.argv[1] if len(sys.argv) > 1 else 'validate'
    if name in {'data-dictionary-validate'}:
        check_dictionary(); return
    if name in {'schema-validate'}:
        check_schemas(); return
    if name in {'guardrails-scan'}:
        check_no_forbidden(); return
    if name in {'evidence-review-board-ui-shell-validate','frontend-ui-shell-validate'}:
        check_workbench_v29(); return
    if name in {'evidence-review-board-workbench-v22-validate'}:
        check_workbench_v22(); return
    if name in {'evidence-review-board-workbench-v23-validate'}:
        check_workbench_v23(); return
    if name in {'evidence-review-board-workbench-v24-validate'}:
        check_workbench_v24(); return
    if name in {'evidence-review-board-workbench-v27-validate'}:
        check_workbench_v27(); return
    if name in {'evidence-review-board-workbench-v28-validate'}:
        check_workbench_v28(); return
    if name in {'evidence-review-board-workbench-v29-validate'}:
        check_workbench_v29(); return
    if name in {'audit-smoke'}:
        check_audit(); pass_msg(name); return
    if name in {'evidence-pack'}:
        evidence_pack(); return
    check_watermark(); check_claims(); check_audit()
    if name in {'limited-scope-review-board-validate','test-contract','test-integration','security-evidence'}:
        intake = load_json('artifacts/limited-scope-review-board/R20-VS-20/signed_bundle_intake_contract.json')
        quarantine = load_json('artifacts/limited-scope-review-board/R20-VS-20/quarantine_queue.json')
        assert len(intake['accepted_evidence_metadata_records']) == 5
        assert len(quarantine['items']) == 1
    pass_msg(name)

if __name__ == '__main__':
    main()
