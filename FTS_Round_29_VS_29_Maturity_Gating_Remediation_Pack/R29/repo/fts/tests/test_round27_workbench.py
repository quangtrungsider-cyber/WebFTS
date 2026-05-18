import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STATE=json.loads((ROOT/'artifacts/evidence-review-board-ui-shell/R27-VS-27/ui_shell_state.json').read_text(encoding='utf-8'))
W='Decision-support / Non-operational'

def test_round27_global_claim_guard_and_watermark():
    assert STATE['round']=='R27-VS-27'
    assert STATE['watermark']==W
    cg=STATE['claim_guard']
    assert cg['readiness_claim_allowed'] is False
    assert cg['production_readiness_claim'] is False
    assert cg['operational_readiness_claim'] is False
    assert 'quarantine clear' in ' '.join(cg['required_before_claim'])

def test_round27_cross_domain_federation_readonly_and_gapped():
    fed=STATE['cross_domain_evidence_federation']
    assert fed['mode']=='read_only_federation_index'
    assert fed['operational_writeback'] is False
    assert len(fed['domains']) >= 4
    assert any(d['status']=='PARTIAL' for d in fed['domains'])
    assert 'claim_cross_domain_readiness' in fed['forbidden_actions']

def test_round27_reviewer_workload_forecasting_is_decision_support_only():
    wf=STATE['reviewer_workload_forecasting']
    assert wf['decision_support_only'] is True
    assert any(r['fatigue_risk']=='HIGH' and r['assignment_recommendation'].startswith('BLOCK') for r in wf['reviewers'])
    assert 'does_not_change_roster' in wf['guardrails']

def test_round27_audit_replay_distinguishes_immutable_and_streaming():
    replay=STATE['advanced_audit_replay_timeline']
    classes={c['class']:c for c in replay['replay_classes']}
    assert classes['post_event_replay']['source']=='immutable_evidence_index'
    assert classes['near_real_time_review']['warning']=='pending immutability commit'
    assert replay['can_mutate_events'] is False
    assert len(replay['timeline_events']) >= 4

def test_round27_policy_promotion_pipeline_blocks_unsigned_shortcuts():
    pipeline=STATE['signed_policy_bundle_promotion_pipeline']
    assert pipeline['current_stage']=='SHADOW_REPLAY'
    assert pipeline['next_stage_allowed'] is False
    assert 'direct_to_operational' in pipeline['forbidden_promotions']
    assert len(pipeline['required_signatures']) >= 3

def test_round27_provenance_graph_analytics_blocks_readiness():
    graph=STATE['evidence_provenance_graph_analytics']
    assert len(graph['nodes']) >= 5
    assert len(graph['edges']) >= 4
    assert all(e['hash_checked'] is True for e in graph['edges'])
    assert any(a['readiness_effect']=='BLOCKS_READINESS' and a['value'] > 0 for a in graph['analytics'])
    assert graph['can_mutate_source'] is False

def test_round27_gating_simulator_and_archive_are_not_operational_approval():
    gate=STATE['operational_readiness_gating_simulator']
    archive=STATE['immutable_export_notarization_archive_retention']
    assert gate['simulation_only'] is True
    assert gate['claim_output']=='NOT_READY'
    assert gate['operational_gate_open'] is False
    assert any(g['status']=='FAIL' for g in gate['gates'])
    assert 'operational_readiness_certificate' in gate['blocked_outputs']
    assert archive['can_replace_authoritative_record'] is False
    assert archive['legal_hold_supported'] is True

def test_round27_frontend_and_v28_backlog():
    html=(ROOT/'frontend/evidence-review-board-ui-shell/index.html').read_text(encoding='utf-8')
    js=(ROOT/'frontend/evidence-review-board-ui-shell/app.js').read_text(encoding='utf-8')
    # Current frontend may point to the latest round; preserve R27 state invariants separately.
    assert 'Decision-support / Non-operational' in html
    assert 'fetch(DATA_URL)' in js
    assert all(c['status']=='PASS' for c in STATE['accessibility_checks'])
    assert len(STATE['v28_candidate_backlog']) >= 7
