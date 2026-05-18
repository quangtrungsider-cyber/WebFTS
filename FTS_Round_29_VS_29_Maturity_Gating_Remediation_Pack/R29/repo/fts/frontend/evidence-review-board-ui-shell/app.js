const LEGACY_R28_KEYS='assurance telemetry humanFactors conflict retention siem fatSat';
const DATA_URL='../../artifacts/evidence-review-board-ui-shell/R29-VS-29/ui_shell_state.json';
let lang='vi'; let state;
const $=id=>document.getElementById(id);
function t(k){return (state.labels?.[lang]?.[k])||k}
function esc(v){return String(v??'').replace(/[&<>]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))}
function pill(text,kind='warn'){return `<span class="badge ${kind}">${esc(text)}</span>`}
function list(items){return `<ul>${(items||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`}
function card(title,body,kind=''){return `<article class="card ${kind}" tabindex="0"><h3>${esc(title)}</h3>${body}</article>`}
function render(){
  document.querySelectorAll('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));
  $('langToggle').textContent=lang==='vi'?'EN':'VI';
  $('claimGuard').textContent=t('not_ready')+' — '+state.watermark;
  $('inventory').innerHTML=card('Integrity status',pill(state.package_inventory_gate.integrity_status,'danger')+pill('independent audit=false','danger')+list(state.package_inventory_gate.required_files),'danger')+state.package_inventory_gate.inventory_protocol.map(s=>card(s.step,`<p>${esc(s.expected_output)}</p>`)).join('');
  $('mandatory').innerHTML=state.mandatory_pre_signature_conditions.map(c=>card(`${c.id} · ${c.name}`,`${pill(c.status,'danger')}<p><strong>Owner:</strong> ${esc(c.owner)}</p><p>${esc(c.defeasor)}</p>`,'danger')).join('');
  $('maturity').innerHTML=card('Current ceiling',`${pill(state.maturity_gating_dashboard.current_ceiling,'warn')}<p>${esc(state.maturity_gating_dashboard.composite_verdict)}</p>${list(state.maturity_gating_dashboard.cannot_exceed_without)}`)+state.maturity_gating_dashboard.gates.map(g=>card(g.framework,`${pill(g.estimated_level,'warn')}<p>${esc(g.next_gate)}</p>`)).join('');
  $('dseep').innerHTML=state.dseep_trace_matrix_workbench.steps.map(s=>card(`Step ${s.step} · ${s.name}`,`${pill(s.status,s.status.includes('blocker')?'danger':'warn')}<p>${esc(s.artifact)}</p>`)).join('')+card('Cross-vendor RTI',`${pill(state.dseep_trace_matrix_workbench.cross_vendor_rti_test.status,'danger')}${list(state.dseep_trace_matrix_workbench.cross_vendor_rti_test.examples)}`,'danger');
  $('safety').innerHTML=card('SSA gate',`${pill('SSA required when operational-feed scope','danger')}<p>${esc(state.safety_and_assurance_gate.ssa_required_when)}</p>${list(state.safety_and_assurance_gate.required_safety_artifacts)}`,'danger')+card('DO-278A/ED-109A',`${pill('must derive from FHA','danger')}<p>${esc(state.safety_and_assurance_gate.do278a_al_policy.offline_procedure_design_typical)} / ${esc(state.safety_and_assurance_gate.do278a_al_policy.operational_decision_support_typical)}</p>`)+card('Vietnam scenarios',list(state.safety_and_assurance_gate.vietnam_context_scenarios));
  $('procurement').innerHTML=card('Procurement status',`${pill(state.procurement_readiness_pack.status,'warn')}<p>${esc(state.procurement_readiness_pack.method_recommendation)}</p>${list(state.procurement_readiness_pack.must_have_artifacts)}`)+card('Vietnam law mapping',list(state.procurement_readiness_pack.vietnam_law_mapping))+card('Data sovereignty',list(state.procurement_readiness_pack.data_sovereignty_controls));
  $('roundHistory').innerHTML=card('Decision rule',`${pill('NO-GO if criteria drift > 30%','danger')}<p>${esc(state.round_history_rca_analyzer.decision_rule)}</p>${list(state.round_history_rca_analyzer.classification_columns)}`,'danger')+state.round_history_rca_analyzer.patterns.map(p=>card(p.pattern,`${pill(p.signal,p.signal==='negative'?'danger':'warn')}<p>${esc(p.indicator)}</p>`)).join('');
  $('benchmarks').innerHTML=state.benchmark_and_market_fit.products.map(p=>card(p.name,`${pill(p.fit,p.fit==='Low'?'danger':p.fit==='High'?'ok':'warn')}<p>${esc(p.note)}</p>`)).join('')+card('ANSP practices',list(state.benchmark_and_market_fit.ansp_practices));
  $('risks').innerHTML=state.risk_register_top12.map(r=>card(`${r.id} · ${r.risk}`,`${pill('L='+r.likelihood,'warn')} ${pill('I='+r.impact,r.impact==='Critical'?'danger':'warn')}<p>${esc(r.mitigation)}</p>`)).join('');
  $('exports').innerHTML=card('Draft export only',`${pill(state.compliance_evidence_export_pack.mode,'warn')} ${pill('certificate=false','danger')}${list(state.compliance_evidence_export_pack.folders)}`)+card('Blocked outputs',list(state.compliance_evidence_export_pack.exports_blocked),'danger');
  $('guard').innerHTML=card('Readiness blocked',`${state.claim_guard.blocking_reasons.map(x=>pill(x,'danger')).join(' ')}<p><strong>State hash:</strong> <code>${esc(state.state_hash_sha256)}</code></p>`,'danger');
}
document.addEventListener('click',e=>{if(e.target.id==='langToggle'){lang=lang==='vi'?'en':'vi';render()} if(e.target.id==='exportBtn'||e.target.id==='importBtn'){$('claimGuard').textContent=t('not_ready')+' — local verification protocol only — '+state.watermark}});
fetch(DATA_URL).then(r=>r.json()).then(d=>{state=d;render();document.dispatchEvent(new CustomEvent('fts-state-loaded',{detail:state}));});
