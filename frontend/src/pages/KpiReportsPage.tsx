import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { kpiApi, KpiCatalogueEntry, KpiSummaryData } from '../services/kpiApi';
import { recordingApi } from '../services/recordingApi';
import { complianceApi } from '../services/complianceApi';
import { SimulationRecording, KpiRecordingAnalysisResult, KpiComparisonResult, KpiValue, ComplianceResult, ComplianceAirportInfo } from '../types/models';
import { useI18n } from '../i18n';

const KpiReportsPage: React.FC = () => {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Visible tabs: overview, export (export also renders the merged former
  // 'from-recording' content). catalogue/atwi-workload/comparison are hidden from nav.
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Recordings & Core States
  const [recordings, setRecordings] = useState<SimulationRecording[]>([]);
  const [loadingRecordings, setLoadingRecordings] = useState<boolean>(false);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string>('');
  const [recordingSummary, setRecordingSummary] = useState<KpiSummaryData | null>(null);
  const [deletingRecording, setDeletingRecording] = useState<boolean>(false);
  
  // KPI Options Checklist
  const [includeAtwi, setIncludeAtwi] = useState<boolean>(true);
  const [includeTraffic, setIncludeTraffic] = useState<boolean>(true);
  const [includeConflict, setIncludeConflict] = useState<boolean>(true);
  const [includeCommands, setIncludeCommands] = useState<boolean>(true);
  const [includeDataQuality, setIncludeDataQuality] = useState<boolean>(true);
  const [saveResult, setSaveResult] = useState<boolean>(true);

  // Analysis State
  const [analyzingKpi, setAnalyzingKpi] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<KpiRecordingAnalysisResult | null>(null);
  const [kpiFilterCategory, setKpiFilterCategory] = useState<string>('all');
  const [kpiFilterStatus, setKpiFilterStatus] = useState<string>('all');

  // Catalogue State
  const [kpiCatalogue, setKpiCatalogue] = useState<KpiCatalogueEntry[]>([]);
  const [catalogueSearch, setCatalogueSearch] = useState<string>('');
  const [catalogueCategory, setCatalogueCategory] = useState<string>('all');

  // Comparison State
  const [baselineId, setBaselineId] = useState<string>('');
  const [alternativeId, setAlternativeId] = useState<string>('');
  const [comparing, setComparing] = useState<boolean>(false);
  const [comparisonResult, setComparisonResult] = useState<KpiComparisonResult | null>(null);

  // Compliance / Export State
  const [supportedAirports, setSupportedAirports] = useState<ComplianceAirportInfo[]>([]);
  const [evaluatingCompliance, setEvaluatingCompliance] = useState<boolean>(false);
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
  const [downloadingComplianceFormat, setDownloadingComplianceFormat] = useState<'json' | 'docx' | null>(null);

  // Error States
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load recordings and catalogue on mount
  useEffect(() => {
    fetchRecordings();
    fetchCatalogue();
    complianceApi.getSupportedAirports().then(setSupportedAirports).catch(() => setSupportedAirports([]));
  }, []);

  // Parse Query Parameters
  useEffect(() => {
    const qRecordingId = searchParams.get('recordingId');
    const qTab = searchParams.get('tab');
    const qBaseline = searchParams.get('baseline');
    const qAlternative = searchParams.get('alternative');

    if (qRecordingId) {
      setActiveTab('export'); // 'from-recording' content now lives inside the 'export' tab
      setSelectedRecordingId(qRecordingId);
      fetchRecordingSummary(qRecordingId);
    } else if (qTab === 'comparison') {
      setActiveTab('comparison');
      if (qBaseline) setBaselineId(qBaseline);
      if (qAlternative) setAlternativeId(qAlternative);
    } else if (qTab) {
      setActiveTab(qTab);
    }
  }, [searchParams, recordings]);

  const fetchRecordings = async () => {
    setLoadingRecordings(true);
    try {
      const data = await recordingApi.getRecordings();
      setRecordings(data);
    } catch (e: any) {
      setErrorMsg('Failed to load simulation recordings.');
    } finally {
      setLoadingRecordings(false);
    }
  };

  const fetchCatalogue = async () => {
    try {
      const data = await kpiApi.getKpiCatalogue();
      setKpiCatalogue(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRecordingSummary = async (recId: string) => {
    setErrorMsg(null);
    setAnalysisResult(null);
    try {
      const summary = await kpiApi.getKpiRecordingSummary(recId);
      setRecordingSummary(summary);
      if (summary.hasKpiResult) {
        // Automatically load existing results
        const existingResult = await kpiApi.getKpiRecordingResult(recId);
        setAnalysisResult(existingResult);
      }
    } catch (e: any) {
      setErrorMsg(`Failed to load metadata summary for recording ${recId}.`);
    }
  };

  const handleRecordingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const recId = e.target.value;
    setSelectedRecordingId(recId);
    setRecordingSummary(null);
    setAnalysisResult(null);
    if (recId) {
      fetchRecordingSummary(recId);
    }
  };

  const handleDeleteRecording = async (recId: string) => {
    const label = formatRecordingLabel(recordings.find((r: any) => (r.id || r.recordingId) === recId) || {});
    if (!window.confirm(`Xoá bản ghi mô phỏng này?\n\n${label}\n\nDữ liệu (track, event, command, conflict log) sẽ bị xoá vĩnh viễn, không thể khôi phục.`)) {
      return;
    }
    setDeletingRecording(true);
    setErrorMsg(null);
    try {
      await recordingApi.deleteRecording(recId);
      if (selectedRecordingId === recId) {
        setSelectedRecordingId('');
        setRecordingSummary(null);
        setAnalysisResult(null);
      }
      await fetchRecordings();
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to delete recording.');
    } finally {
      setDeletingRecording(false);
    }
  };

  const handleAnalyzeKpi = async () => {
    if (!selectedRecordingId) return;
    setAnalyzingKpi(true);
    setErrorMsg(null);
    try {
      const result = await kpiApi.analyzeKpiRecording(selectedRecordingId, {
        options: {
          includeAtwi,
          includeTraffic,
          includeConflict,
          includeCommands,
          includeDataQuality,
          saveResult
        }
      });
      setAnalysisResult(result);
      // Refresh summary to reflect generated result
      const summary = await kpiApi.getKpiRecordingSummary(selectedRecordingId);
      setRecordingSummary(summary);
    } catch (e: any) {
      setErrorMsg(e.message || 'KPI calculation failed.');
    } finally {
      setAnalyzingKpi(false);
    }
  };

  const handleDeleteKpi = async () => {
    if (!selectedRecordingId) return;
    if (!window.confirm('Are you sure you want to delete the calculated KPI result files? This will not affect the raw flight tracks.')) return;
    try {
      await kpiApi.deleteKpiRecordingResult(selectedRecordingId);
      setAnalysisResult(null);
      const summary = await kpiApi.getKpiRecordingSummary(selectedRecordingId);
      setRecordingSummary(summary);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to delete KPI result files.');
    }
  };

  const handleEvaluateCompliance = async () => {
    if (!selectedRecordingId) return;
    setEvaluatingCompliance(true);
    setErrorMsg(null);
    try {
      const result = await complianceApi.evaluateCompliance(selectedRecordingId, { saveResult: true });
      setComplianceResult(result);
    } catch (e: any) {
      setErrorMsg(e.message || 'Compliance evaluation failed.');
    } finally {
      setEvaluatingCompliance(false);
    }
  };

  const handleDownloadCompliance = async (format: 'json' | 'docx') => {
    if (!selectedRecordingId) return;
    setDownloadingComplianceFormat(format);
    setErrorMsg(null);
    try {
      await complianceApi.downloadComplianceExport(selectedRecordingId, format);
    } catch (e: any) {
      setErrorMsg(e.message || `Failed to download compliance ${format.toUpperCase()} export.`);
    } finally {
      setDownloadingComplianceFormat(null);
    }
  };

  const handleDeleteCompliance = async () => {
    if (!selectedRecordingId) return;
    if (!window.confirm('Are you sure you want to delete the calculated compliance result? This will not affect the raw flight tracks.')) return;
    try {
      await complianceApi.deleteComplianceResult(selectedRecordingId);
      setComplianceResult(null);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to delete compliance result.');
    }
  };

  const handleCompare = async () => {
    if (!baselineId || !alternativeId) return;
    if (baselineId === alternativeId) {
      alert('Baseline and Alternative configurations must be different simulation runs.');
      return;
    }
    setComparing(true);
    setErrorMsg(null);
    try {
      const res = await kpiApi.compareKpiRecordings({
        baselineRecordingId: baselineId,
        alternativeRecordingId: alternativeId
      });
      setComparisonResult(res);
    } catch (e: any) {
      setErrorMsg(e.message || 'Comparison analysis failed.');
    } finally {
      setComparing(false);
    }
  };

  // Human-readable recording label: "<scenario name> — <local date/time>", falling back
  // gracefully when scenario binding is missing (e.g. recordings started without selecting
  // a scenario file first).
  const formatRecordingLabel = (r: any): string => {
    const scenarioLabel = r.scenarioBaseName || r.scenarioFileName || r.scenarioName || 'Chưa gắn kịch bản';
    const dateLabel = r.startedAt ? new Date(r.startedAt).toLocaleString() : '';
    return dateLabel ? `${scenarioLabel} — ${dateLabel}` : scenarioLabel;
  };

  // KPI Status Colors
  const getStatusBadgeStyle = (status: string) => {
    const base = {
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 'bold',
      textTransform: 'uppercase' as const,
      display: 'inline-block'
    };

    switch (status.toLowerCase()) {
      case 'normal':
      case 'ok':
      case 'pass':
        return { ...base, backgroundColor: 'rgba(76, 175, 80, 0.1)', color: '#4caf50', border: '1px solid rgba(76, 175, 80, 0.3)' };
      case 'watch':
      case 'info':
        return { ...base, backgroundColor: 'rgba(33, 150, 243, 0.1)', color: '#2196f3', border: '1px solid rgba(33, 150, 243, 0.3)' };
      case 'high':
      case 'warning':
      case 'incomplete':
        return { ...base, backgroundColor: 'rgba(255, 152, 0, 0.1)', color: '#ff9800', border: '1px solid rgba(255, 152, 0, 0.3)' };
      case 'critical':
      case 'error':
      case 'violation':
      case 'fail':
        return { ...base, backgroundColor: 'rgba(244, 67, 54, 0.1)', color: '#f44336', border: '1px solid rgba(244, 67, 54, 0.3)' };
      case 'unavailable':
      case 'not_evaluated':
      case 'not_applicable':
      case 'unsupported_ruleset':
      default:
        return { ...base, backgroundColor: 'rgba(158, 158, 158, 0.1)', color: '#9e9e9e', border: '1px solid rgba(158, 158, 158, 0.3)' };
    }
  };

  // Filter KPI vectors
  const filteredKpis = analysisResult?.kpiVector.filter(k => {
    const matchesCat = kpiFilterCategory === 'all' || k.category === kpiFilterCategory;
    const matchesStatus = kpiFilterStatus === 'all' || k.status === kpiFilterStatus;
    return matchesCat && matchesStatus;
  }) || [];

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Top Header Legal Block */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        paddingBottom: '24px',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            📊 KPI Reports & Analytics
          </h1>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={fetchRecordings}
            style={{ 
              backgroundColor: 'var(--bg-surface)', 
              color: 'var(--text)', 
              border: '1px solid var(--border)', 
              borderRadius: '8px', 
              padding: '10px 16px', 
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            🔄 Refresh Logs
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMsg && (
        <div style={{
          backgroundColor: 'rgba(248, 113, 113, 0.1)',
          border: '1px solid var(--danger)',
          color: 'var(--danger)',
          padding: '16px 20px',
          borderRadius: '12px',
          marginBottom: '24px',
          fontSize: '14px',
          fontWeight: 600
        }}>
          ❌ Error: {errorMsg}
        </div>
      )}

      {/* Main Layout Area */}
      <div style={{ display: 'flex', flex: 1, gap: '24px', overflow: 'hidden' }}>
        
        {/* Left Sidebar (Tabs) */}
        <div style={{ width: '240px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0, overflowY: 'auto' }}>
          {[
            { id: 'overview', icon: 'fa-solid fa-house', label: 'Overview' },
            // Hidden from nav for now (kept in code/state below, not removed): low presentation
            // value / off-topic for the compliance-report demo narrative. Re-add the entry below
            // to bring a tab back.
            // { id: 'from-recording', icon: 'fa-solid fa-video', label: 'From Recording' }, -- merged into 'export' below
            // { id: 'catalogue', icon: 'fa-solid fa-book', label: 'KPI Catalogue' },
            // { id: 'atwi-workload', icon: 'fa-solid fa-brain', label: 'ATWI Workload' },
            // { id: 'comparison', icon: 'fa-solid fa-scale-balanced', label: 'Comparison' },
            { id: 'export', icon: 'fa-solid fa-box-archive', label: 'Export / Evidence Prep' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '12px 16px',
                backgroundColor: activeTab === t.id ? 'var(--bg-surface)' : 'transparent',
                color: activeTab === t.id ? 'var(--primary)' : 'var(--text-muted)',
                border: 'none',
                borderLeft: activeTab === t.id ? '3px solid var(--primary)' : '3px solid transparent',
                borderRadius: '0 8px 8px 0',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                textAlign: 'left'
              }}
            >
              <i className={t.icon} style={{ fontSize: '14px', width: '20px', textAlign: 'center' }}></i>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '12px' }}>

      {/* ======================================================== */}
      {/* 1. OVERVIEW TAB */}
      {/* ======================================================== */}
      {activeTab === 'overview' && (
        <div>
          {/* Workflow progress card */}
          <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #333', borderRadius: '8px', padding: '20px', marginBottom: '25px' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: 'var(--text)' }}>🔄 Fast-Time Simulation Decision-Support Workflow</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
              {[
                { step: '1', title: 'Scenario Build', desc: 'Create .scn commands', icon: '🛠️' },
                { step: '2', title: 'Sim Record', desc: 'Execute on Vatm-Engine', icon: '📹' },
                { step: '3', title: 'Replay Validate', desc: 'Review spatial tracks', icon: '👀' },
                { step: '4', title: 'Workload (ATWI)', desc: 'Process task profiles', icon: '🧠' },
                { step: '5', title: 'KPI Analytics', desc: 'Verify safety proxies', icon: '📊', active: true },
                { step: '6', title: 'Evidence Pack', desc: 'Consolidate for Handoff', icon: '📦' }
              ].map(s => (
                <div key={s.step} style={{ 
                  flex: 1, 
                  minWidth: '130px', 
                  backgroundColor: s.active ? 'rgba(25, 118, 210, 0.1)' : 'var(--bg-surface)', 
                  border: s.active ? '1px solid #1976d2' : '1px solid #222',
                  padding: '15px', 
                  borderRadius: '6px', 
                  textAlign: 'center' 
                }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>{s.icon}</div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: s.active ? '#64b5f6' : 'var(--text)', marginBottom: '4px' }}>
                    {s.step}. {s.title}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Grid of KPI Categories */}
          <h3 style={{ color: 'var(--text)', fontSize: '16px', margin: '0 0 15px 0' }}>📂 Core KPI Evaluation Categories</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            {[
              { cat: 'Workload & ATWI', desc: 'Controller cognitive task counts, average workload bins, peak overload intervals, and binned safety limits.', icon: '🧠', bg: 'linear-gradient(135deg, #1b5e20 0%, #121212 100%)' },
              { cat: 'Traffic & Throughput', desc: 'Unique aircraft counts, trajectory updates density, runtime duration, and airspace traffic concurrent peaks.', icon: '✈️', bg: 'linear-gradient(135deg, #0d47a1 0%, #121212 100%)' },
              { cat: 'Conflict & Safety Proxy', desc: 'Separation standard violations, stca warnings, horizontal NM proximity indices, and vertical ft gaps.', icon: '🛡️', bg: 'linear-gradient(135deg, #b71c1c 0%, #121212 100%)' },
              { cat: 'Command & Intervention', desc: 'Tactical controller instructions count, heading vectors, altitude changes, and speed restricts commands.', icon: '🎙️', bg: 'linear-gradient(135deg, #e65100 0%, #121212 100%)' },
              { cat: 'Data Quality Index', desc: 'Integrity validations of raw logging databases, parse errors auditing, and files availability indices.', icon: '💾', bg: 'linear-gradient(135deg, #311b92 0%, #121212 100%)' },
              { cat: 'Replay Availability', desc: 'Compatibility criteria evaluations, trajectory updates timestamps, and coordinate ranges loadable flags.', icon: '🎞️', bg: 'linear-gradient(135deg, #004d40 0%, #121212 100%)' }
            ].map(c => (
              <div key={c.cat} style={{ 
                background: c.bg, 
                border: '1px solid #333', 
                borderRadius: '8px', 
                padding: '20px',
                boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '20px' }}>{c.icon}</span>
                  <h4 style={{ margin: 0, color: 'var(--text)', fontSize: '15px' }}>{c.cat}</h4>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>{c.desc}</p>
              </div>
            ))}
          </div>

          {/* Quick link warn alerts */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '15px'
          }}>
            <span style={{ fontSize: '28px' }}>📜</span>
            <div>
              <h4 style={{ margin: '0 0 4px 0', color: 'var(--text)', fontSize: '14px' }}>Governance Traceability & Handoff Compliance</h4>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                All fast-time simulation reports generated must contain approved workload parameters and validated airspace structures. Official KPI validation requires reviewed ATWI calibration models, complete log sets, and structured handoff packages to support downstream regulatory analysis.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. FROM RECORDING (merged into the Export / Evidence Prep tab below --
          this block now shares the 'export' activeTab guard instead of its own) */}
      {/* ======================================================== */}
      {activeTab === 'export' && (
        <div>
          {/* Configuration panel */}
          <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #333', borderRadius: '8px', padding: '20px', marginBottom: '25px' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              🎥 Select Target Simulation Run & Analytical Scopes
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              {/* Select Recording */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 'bold' }}>
                  Choose Simulation Recording:
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={selectedRecordingId}
                    onChange={handleRecordingChange}
                    style={{
                      flex: 1,
                      width: '100%',
                      backgroundColor: 'var(--input-bg)',
                      color: 'white',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      padding: '8px',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Select a recording...</option>
                    {recordings.map((r: any) => {
                      const recId = r.id || r.recordingId;
                      return (
                        <option key={recId} value={recId}>
                          {formatRecordingLabel(r)}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    onClick={() => selectedRecordingId && handleDeleteRecording(selectedRecordingId)}
                    disabled={!selectedRecordingId || deletingRecording}
                    title={selectedRecordingId ? 'Xoá bản ghi đang chọn' : 'Chọn một bản ghi để xoá'}
                    style={{
                      flexShrink: 0,
                      width: '36px',
                      backgroundColor: 'var(--input-bg)',
                      color: !selectedRecordingId || deletingRecording ? 'var(--text-muted)' : '#f44336',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      fontSize: '14px',
                      cursor: !selectedRecordingId || deletingRecording ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <i className={deletingRecording ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-trash'} />
                  </button>
                </div>
              </div>

              {/* Scope Options */}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 'bold' }}>
                  Analytical Scopes Options:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', padding: '8px 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={includeAtwi} onChange={e => setIncludeAtwi(e.target.checked)} /> Include ATWI Workload
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={includeTraffic} onChange={e => setIncludeTraffic(e.target.checked)} /> Include Traffic
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={includeConflict} onChange={e => setIncludeConflict(e.target.checked)} /> Include Conflicts
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={includeCommands} onChange={e => setIncludeCommands(e.target.checked)} /> Include Commands
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={includeDataQuality} onChange={e => setIncludeDataQuality(e.target.checked)} /> Data Quality audits
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: '#64b5f6' }}>
                    <input type="checkbox" checked={saveResult} onChange={e => setSaveResult(e.target.checked)} /> Save Result files
                  </label>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              <button
                onClick={handleAnalyzeKpi}
                disabled={analyzingKpi || !selectedRecordingId}
                style={{
                  backgroundColor: analyzingKpi || !selectedRecordingId ? 'var(--input-border)' : '#1976d2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '10px 20px',
                  fontWeight: 'bold',
                  cursor: analyzingKpi || !selectedRecordingId ? 'not-allowed' : 'pointer',
                  fontSize: '13px'
                }}
              >
                {analyzingKpi ? '🌀 Processing Calculations...' : '📊 Calculate Simulation KPIs'}
              </button>

              {analysisResult && (
                <button
                  onClick={handleDeleteKpi}
                  style={{
                    backgroundColor: 'rgba(244, 67, 54, 0.15)',
                    color: '#ef5350',
                    border: '1px solid rgba(244, 67, 54, 0.3)',
                    borderRadius: '4px',
                    padding: '10px 20px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  🗑️ Delete KPI Results
                </button>
              )}

              {selectedRecordingId && (
                <>
                  <Link
                    to={`/replay?recordingId=${selectedRecordingId}`}
                    style={{
                      backgroundColor: '#222',
                      color: 'var(--text)',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      padding: '10px 20px',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    🎞️ Open Spatial Replay
                  </Link>
                  <Link
                    to={`/kpi-reports/atwi-workload?tab=from-recording&recordingId=${selectedRecordingId}`}
                    style={{
                      backgroundColor: '#222',
                      color: 'var(--text)',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      padding: '10px 20px',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    🧠 Open ATWI Workload
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Recording metadata and source availability details */}
          {recordingSummary && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '25px' }}>
              {/* Metadata Details Card */}
              <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 15px 0', fontSize: '14px', color: 'var(--text)', borderBottom: '1px solid #222', paddingBottom: '8px' }}>
                  📄 Recording Run Specifications
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '13px' }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Recording ID:</div>
                    <div style={{ color: 'var(--text)', fontWeight: 'bold' }}>{recordingSummary.recordingId}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Scenario File:</div>
                    <div style={{ color: 'var(--text)', fontWeight: 'bold' }}>{recordingSummary.metadata.scenarioFileName || 'N/A'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Initialization Command:</div>
                    <div style={{ color: '#64b5f6', fontWeight: 'bold', fontFamily: 'monospace' }}>{recordingSummary.metadata.icCommand || 'N/A'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Start Time:</div>
                    <div style={{ color: 'var(--text)' }}>{recordingSummary.metadata.startedAt ? new Date(recordingSummary.metadata.startedAt).toLocaleString() : 'N/A'}</div>
                  </div>
                </div>
              </div>

              {/* Data source checklist */}
              <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 15px 0', fontSize: '14px', color: 'var(--text)', borderBottom: '1px solid #222', paddingBottom: '8px' }}>
                  💾 Database Sources Checklist
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                  {Object.entries(recordingSummary.sourcesAvailability).map(([name, exists]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'monospace', color: exists ? 'var(--text)' : '#777' }}>{name}</span>
                      <span style={{ 
                        color: exists ? '#4caf50' : '#ef5350', 
                        fontWeight: 'bold', 
                        fontSize: '11px',
                        textTransform: 'uppercase'
                      }}>
                        {exists ? '✔️ Available' : '❌ Missing'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Results Summary KPI Cards */}
          {analysisResult && (
            <div>
              {/* Grid of summaries metrics cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '25px' }}>
                {[
                  { name: 'Served Air Traffic', val: `${analysisResult.summary.uniqueAircraftCount ?? 0} flights`, desc: 'Unique callsigns tracked', icon: '✈️', color: '#64b5f6' },
                  { name: 'Simulation Span', val: analysisResult.summary.runDurationSec !== undefined ? `${Math.round(analysisResult.summary.runDurationSec / 60)} minutes` : 'N/A', desc: analysisResult.summary.runDurationSec !== undefined ? `${analysisResult.summary.runDurationSec} seconds elapsed` : 'N/A', icon: '⏱️', color: 'var(--text)' },
                  { name: 'Overall ATWI Load', val: analysisResult.summary.wholeRunAtwiPercent !== null && analysisResult.summary.wholeRunAtwiPercent !== undefined ? `${analysisResult.summary.wholeRunAtwiPercent}%` : 'N/A', desc: 'Aggregate workload index', icon: '🧠', color: '#81c784' },
                  { name: 'Peak Overload Bins', val: analysisResult.summary.peakAtwiPercent !== null ? `${analysisResult.summary.peakAtwiPercent}%` : 'N/A', desc: 'Max workload observed', icon: '🔥', color: '#ffb74d' },
                  { name: 'Separation Standards', val: `${analysisResult.summary.conflictEventCount} incidents`, desc: `${analysisResult.summary.criticalConflictCount} critical violations`, icon: '🛡️', color: '#e57373' },
                  { name: 'Tactical Commands', val: `${analysisResult.summary.commandCount} sent`, desc: 'Intervention instructions', icon: '🎙️', color: '#81d4fa' },
                  { name: 'Logging Quality Status', val: analysisResult.summary.dataQualityStatus.toUpperCase(), desc: 'Parse errors & omissions audit', icon: '💾', badge: true, status: analysisResult.summary.dataQualityStatus }
                ].map(card => (
                  <div key={card.name} style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #333', borderRadius: '8px', padding: '15px', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: '12px', right: '12px', fontSize: '20px' }}>{card.icon}</span>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 'bold' }}>{card.name}</div>
                    
                    {card.badge ? (
                      <span style={getStatusBadgeStyle(card.status!)}>{card.val}</span>
                    ) : (
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: card.color, marginBottom: '4px' }}>{card.val}</div>
                    )}
                    
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>{card.desc}</div>
                  </div>
                ))}
              </div>

              {/* KPI Vector Table -- hidden: too technical/confusing for the demo narrative,
                  kept in code (behind `false &&`) so it can be restored by flipping this flag. */}
              {false && (
              <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #333', borderRadius: '8px', padding: '20px', marginBottom: '25px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>📊 Detailed Simulation KPIs Vector</h4>
                  
                  {/* Table Filters */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <select
                      value={kpiFilterCategory}
                      onChange={e => setKpiFilterCategory(e.target.value)}
                      style={{ backgroundColor: 'var(--input-bg)', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      <option value="all">All Categories</option>
                      <option value="workload">Workload / ATWI</option>
                      <option value="traffic">Traffic Density</option>
                      <option value="conflict">Safety Proxy Conflicts</option>
                      <option value="command_intervention">Tactical Interventions</option>
                      <option value="data_quality">Data Quality Index</option>
                      <option value="replay">Replay Availability</option>
                    </select>

                    <select
                      value={kpiFilterStatus}
                      onChange={e => setKpiFilterStatus(e.target.value)}
                      style={{ backgroundColor: 'var(--input-bg)', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '6px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      <option value="all">All Statuses</option>
                      <option value="normal">Normal</option>
                      <option value="watch">Watch</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="unavailable">Unavailable</option>
                    </select>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)', borderBottom: '1px solid #444' }}>
                        <th style={{ padding: '12px' }}>KPI ID</th>
                        <th style={{ padding: '12px' }}>KPI Name</th>
                        <th style={{ padding: '12px' }}>Category</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Calculated Value</th>
                        <th style={{ padding: '12px' }}>Unit</th>
                        <th style={{ padding: '12px' }}>Analytical Status</th>
                        <th style={{ padding: '12px' }}>Derivation Logic</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredKpis.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: '#777' }}>
                            No KPI values matched the active filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredKpis.map(k => (
                          <tr key={k.id} style={{ borderBottom: '1px solid #222', transition: 'background-color 0.1s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#252528'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                            <td style={{ padding: '12px', fontFamily: 'monospace', color: '#90caf9', fontWeight: 'bold' }}>{k.id}</td>
                            <td style={{ padding: '12px', color: 'var(--text)', fontWeight: 'bold' }}>{k.name}</td>
                            <td style={{ padding: '12px', textTransform: 'capitalize', color: 'var(--text-muted)' }}>{k.category.replace('_', ' ')}</td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', color: k.value === null ? '#777' : 'var(--text)' }}>
                              {k.value === null ? 'N/A' : (typeof k.value === 'boolean' ? (k.value ? 'YES' : 'NO') : k.value)}
                            </td>
                            <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{k.unit}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={getStatusBadgeStyle(k.status)}>{k.status}</span>
                            </td>
                            <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={k.method}>
                              {k.method}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

              {/* Warnings and Limitations Sidebars */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px' }}>
                {/* Safety warnings panel */}
                <div style={{ backgroundColor: 'rgba(255, 152, 0, 0.05)', border: '1px solid rgba(255, 152, 0, 0.2)', borderRadius: '8px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#ffb74d', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ⚠️ Calibrations & Quality Audits
                  </h4>
                  {analysisResult.warnings.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#81c784' }}>✔️ Zero trace/compliance warnings. Database files passed standard checks.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#ffb74d', lineHeight: '1.6' }}>
                      {analysisResult.warnings.map((w, idx) => (
                        <li key={idx} style={{ marginBottom: '6px' }}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Limitations panel */}
                <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 15px 0', fontSize: '14px', color: 'var(--text-muted)' }}>
                    📜 Scope Boundaries & Limitations
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    {analysisResult.limitations.map((l, idx) => (
                      <li key={idx} style={{ marginBottom: '4px' }}>{l}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. KPI CATALOGUE TAB */}
      {/* ======================================================== */}
      {activeTab === 'catalogue' && (
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
            <div>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '16px', color: 'var(--text)' }}>📖 Core KPI Definitions Catalogue</h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Official metrics library tracked within the Fast-Time Simulation framework</p>
            </div>

            {/* Filter and Search */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder="Search KPI ID or Name..."
                value={catalogueSearch}
                onChange={e => setCatalogueSearch(e.target.value)}
                style={{ backgroundColor: 'var(--input-bg)', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '8px 12px', fontSize: '12px' }}
              />

              <select
                value={catalogueCategory}
                onChange={e => setCatalogueCategory(e.target.value)}
                style={{ backgroundColor: 'var(--input-bg)', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '8px', fontSize: '12px', cursor: 'pointer' }}
              >
                <option value="all">All Categories</option>
                <option value="workload">Workload / ATWI</option>
                <option value="traffic">Traffic Density</option>
                <option value="conflict">Safety Proxy Conflicts</option>
                <option value="command_intervention">Tactical Interventions</option>
                <option value="data_quality">Data Quality Index</option>
                <option value="replay">Replay Availability</option>
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)', borderBottom: '1px solid #444' }}>
                  <th style={{ padding: '12px' }}>KPI ID</th>
                  <th style={{ padding: '12px' }}>Metric Name</th>
                  <th style={{ padding: '12px' }}>Category</th>
                  <th style={{ padding: '12px' }}>Unit</th>
                  <th style={{ padding: '12px' }}>Formula</th>
                  <th style={{ padding: '12px' }}>Source Database</th>
                  <th style={{ padding: '12px' }}>Methodology Description</th>
                </tr>
              </thead>
              <tbody>
                {kpiCatalogue
                  .filter(k => {
                    const matchesSearch = k.id.toLowerCase().includes(catalogueSearch.toLowerCase()) || k.name.toLowerCase().includes(catalogueSearch.toLowerCase());
                    const matchesCat = catalogueCategory === 'all' || k.category === catalogueCategory;
                    return matchesSearch && matchesCat;
                  })
                  .map(k => (
                    <tr key={k.id} style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ padding: '12px', fontFamily: 'monospace', color: '#90caf9', fontWeight: 'bold' }}>{k.id}</td>
                      <td style={{ padding: '12px', color: 'var(--text)', fontWeight: 'bold' }}>{k.name}</td>
                      <td style={{ padding: '12px', textTransform: 'capitalize', color: 'var(--text-muted)' }}>{k.category.replace('_', ' ')}</td>
                      <td style={{ padding: '12px', color: 'var(--text)' }}>{k.unit}</td>
                      <td style={{ padding: '12px', fontFamily: 'monospace', color: '#a5d6a7', fontSize: '12px' }}>{k.formula}</td>
                      <td style={{ padding: '12px', fontSize: '12px', color: '#ffb74d' }}>{k.sourceFiles.join(', ')}</td>
                      <td style={{ padding: '12px', color: 'var(--text)', fontSize: '12px' }}>{k.description}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
            <span>🔧</span>
            <span>KPI formula calibration and thresholds customizing will be enabled in a later configurations step.</span>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. ATWI WORKLOAD TAB */}
      {/* ======================================================== */}
      {activeTab === 'atwi-workload' && (
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #333', borderRadius: '8px', padding: '30px', textAlign: 'center' }}>
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '15px' }}>🧠</span>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', color: 'var(--text)' }}>Air Traffic Workload Index (ATWI) Models</h3>
          <p style={{ margin: '0 auto 25px auto', fontSize: '13px', color: 'var(--text-muted)', maxWidth: '500px', lineHeight: '1.5' }}>
            Process cognitive controller workloads based on standard sector tasks rules (STCA responses, traffic scans, frequency communications) and approve workload calibration parameters.
          </p>

          <button
            onClick={() => navigate('/kpi-reports/atwi-workload')}
            style={{
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '12px 30px',
              fontWeight: 'bold',
              fontSize: '14px',
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
            }}
          >
            Open ATWI Calibration & Calculator
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. COMPARISON TAB */}
      {/* ======================================================== */}
      {activeTab === 'comparison' && (
        <div>
          {/* Pick baseline and alternative */}
          <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #333', borderRadius: '8px', padding: '20px', marginBottom: '25px' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: 'var(--text)' }}>⚖️ Baseline vs Alternative Airspace Comparison</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              {/* Baseline Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 'bold' }}>
                  Select Baseline Configuration (Scenario A):
                </label>
                <select
                  value={baselineId}
                  onChange={e => setBaselineId(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--input-bg)',
                    color: 'white',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    padding: '10px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">Choose Baseline Recording...</option>
                  {recordings.map((r: any) => {
                    const recId = r.id || r.recordingId;
                    return (
                      <option key={recId} value={recId}>
                        {formatRecordingLabel(r)}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Alternative Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 'bold' }}>
                  Select Alternative Configuration (Scenario B):
                </label>
                <select
                  value={alternativeId}
                  onChange={e => setAlternativeId(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--input-bg)',
                    color: 'white',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    padding: '10px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="">Choose Alternative Recording...</option>
                  {recordings.map((r: any) => {
                    const recId = r.id || r.recordingId;
                    return (
                      <option key={recId} value={recId}>
                        {formatRecordingLabel(r)}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <button
              onClick={handleCompare}
              disabled={comparing || !baselineId || !alternativeId}
              style={{
                backgroundColor: comparing || !baselineId || !alternativeId ? 'var(--input-border)' : '#2e7d32',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '12px 30px',
                fontWeight: 'bold',
                fontSize: '13px',
                cursor: comparing || !baselineId || !alternativeId ? 'not-allowed' : 'pointer'
              }}
            >
              {comparing ? '🌀 Conducting Comparison...' : '⚖️ Compare Simulations KPIs'}
            </button>
          </div>

          {/* Comparison results */}
          {comparisonResult && (
            <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
              <div style={{ borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 5px 0', color: 'var(--text)', fontSize: '15px' }}>📈 Comparison Analysis Results</h4>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Comparing Baseline (A) <strong>{comparisonResult.baselineRecordingId}</strong> vs Alternative (B) <strong>{comparisonResult.alternativeRecordingId}</strong>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)', borderBottom: '1px solid #444' }}>
                      <th style={{ padding: '12px' }}>KPI Name</th>
                      <th style={{ padding: '12px' }}>Category</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Baseline (A)</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Alternative (B)</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Absolute Delta</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Shift (%)</th>
                      <th style={{ padding: '12px' }}>Operational Interpretation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonResult.rows.map(row => {
                      const isNumeric = typeof row.baselineValue === 'number' && typeof row.alternativeValue === 'number';
                      
                      // Custom colors based on whether positive delta represents a safety risk or improvement
                      let deltaColor = 'var(--text)';
                      if (isNumeric && row.delta !== undefined && row.delta !== null && row.delta !== 0) {
                        const higherIsWorse = row.kpiId.includes('CONFLICT') || row.kpiId.includes('ATWI') || row.kpiId.includes('COMMAND');
                        if (higherIsWorse) {
                          deltaColor = row.delta > 0 ? '#e57373' : '#81c784';
                        } else {
                          deltaColor = row.delta > 0 ? '#81c784' : '#e57373';
                        }
                      }

                      return (
                        <tr key={row.kpiId} style={{ borderBottom: '1px solid #222' }}>
                          <td style={{ padding: '12px', color: 'var(--text)', fontWeight: 'bold' }}>{row.name}</td>
                          <td style={{ padding: '12px', textTransform: 'capitalize', color: 'var(--text-muted)' }}>{row.category.replace('_', ' ')}</td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                            {row.baselineValue === null ? 'N/A' : (typeof row.baselineValue === 'boolean' ? (row.baselineValue ? 'YES' : 'NO') : row.baselineValue)} {row.unit}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                            {row.alternativeValue === null ? 'N/A' : (typeof row.alternativeValue === 'boolean' ? (row.alternativeValue ? 'YES' : 'NO') : row.alternativeValue)} {row.unit}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', color: deltaColor, fontWeight: 'bold' }}>
                            {row.delta === null || row.delta === undefined ? '-' : (row.delta > 0 ? `+${row.delta}` : row.delta)}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right', color: deltaColor, fontWeight: 'bold' }}>
                            {row.deltaPercent === null || row.deltaPercent === undefined ? '-' : (row.deltaPercent > 0 ? `+${row.deltaPercent}%` : `${row.deltaPercent}%`)}
                          </td>
                          <td style={{ padding: '12px', color: 'var(--text)', fontSize: '12px' }}>{row.interpretation}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Warning compliance limitations list */}
              <div style={{ marginTop: '20px', backgroundColor: 'rgba(255, 152, 0, 0.05)', border: '1px solid rgba(255, 152, 0, 0.2)', padding: '15px', borderRadius: '6px', fontSize: '12px', color: '#ffb74d' }}>
                ℹ️ <strong>Calibration Disclaimer:</strong> Direct comparisons are analytical models representations. Ensure both scenarios share consistent terminal sector dimensions, traffic distribution patterns, and calibration model assumptions to ensure traceable compliance.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 6. EXPORT / EVIDENCE PREP TAB */}
      {/* ======================================================== */}
      {activeTab === 'export' && (
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #333', borderRadius: '8px', padding: '25px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: 'var(--text)' }}>📦 Pre-packaged Evidence Assets list</h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            Consolidate and review logs database files prepared for downstream packaging in the next Step 15 configuration phase.
          </p>

          <div style={{ border: '1px solid #333', borderRadius: '6px', backgroundColor: 'var(--bg-surface)', padding: '15px', marginBottom: '25px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text)' }}>📋 Target Recording Handoff Checklist</h4>
            
            {selectedRecordingId ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', fontSize: '12px' }}>
                {[
                  { name: 'run_metadata.json', role: 'Recording specifications', status: recordingSummary?.sourcesAvailability['run_metadata.json'] },
                  { name: 'replay_track.jsonl', role: 'Trajectory track logs', status: recordingSummary?.sourcesAvailability['replay_track.jsonl'] },
                  { name: 'event_log.jsonl', role: 'Simulation event triggers', status: recordingSummary?.sourcesAvailability['event_log.jsonl'] },
                  { name: 'command_log.jsonl', role: 'Tactical controller commands', status: recordingSummary?.sourcesAvailability['command_log.jsonl'] },
                  { name: 'conflict_log.jsonl', role: 'Separation violation records', status: recordingSummary?.sourcesAvailability['conflict_log.jsonl'] },
                  { name: 'atwi_result.json', role: 'ATWI workload index outputs', status: recordingSummary?.sourcesAvailability['atwi_result.json'] },
                  { name: 'kpi_result.json', role: 'Calculated safety proxies KPIs', status: recordingSummary?.hasKpiResult },
                  { name: 'kpi_vector.json', role: 'Calculated metrics vector', status: recordingSummary?.hasKpiResult },
                  { name: 'compliance_result.json', role: 'Runway & separation compliance verdict', status: !!complianceResult }
                ].map(asset => (
                  <div key={asset.name} style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #222', borderRadius: '4px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--text)', fontFamily: 'monospace' }}>{asset.name}</span>
                      <span style={{ color: asset.status ? '#4caf50' : '#ef5350', fontSize: '10px', fontWeight: 'bold' }}>
                        {asset.status ? '✔️ READY' : '❌ ABSENT'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{asset.role}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#777', fontStyle: 'italic', fontSize: '13px' }}>Select a simulation recording in the 'From Recording' tab first.</div>
            )}
          </div>

          <div style={{ border: '1px solid #333', borderRadius: '6px', backgroundColor: 'var(--bg-surface)', padding: '15px', marginBottom: '25px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text)' }}>
              ⚖️ Runway & Separation Compliance Evaluation
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Evaluates this recording against the data-driven ruleset configured for its airport
              (supported: {supportedAirports.map(a => `${a.airport} [${a.geometryStatus}]`).join(', ') || 'none configured yet'}).
              Separation/runway-event detection is derived from replay_track.jsonl; rules never default
              to PASS when required data is missing — those report NOT_EVALUATED instead.
            </p>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: complianceResult ? '20px' : 0 }}>
              <button
                onClick={handleEvaluateCompliance}
                disabled={evaluatingCompliance || !selectedRecordingId}
                style={{
                  backgroundColor: evaluatingCompliance || !selectedRecordingId ? 'var(--input-border)' : '#1976d2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '12px 25px',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: evaluatingCompliance || !selectedRecordingId ? 'not-allowed' : 'pointer'
                }}
              >
                {evaluatingCompliance ? '🌀 Evaluating Compliance...' : '⚖️ Evaluate Runway/Separation Compliance'}
              </button>

              {complianceResult && (
                <button
                  onClick={handleDeleteCompliance}
                  style={{
                    backgroundColor: 'rgba(244, 67, 54, 0.15)',
                    color: '#ef5350',
                    border: '1px solid rgba(244, 67, 54, 0.3)',
                    borderRadius: '4px',
                    padding: '10px 20px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  🗑️ Delete Compliance Result
                </button>
              )}
            </div>

            {complianceResult && (
              <div>
                {/* Verdict summary card */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #222', borderRadius: '6px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Overall Verdict</div>
                    <span style={getStatusBadgeStyle(complianceResult.overallVerdict)}>{complianceResult.overallVerdict}</span>
                  </div>
                  <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #222', borderRadius: '6px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Separation</div>
                    <span style={getStatusBadgeStyle(complianceResult.subVerdicts.separation)}>{complianceResult.subVerdicts.separation}</span>
                  </div>
                  <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #222', borderRadius: '6px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Runway Procedure</div>
                    <span style={getStatusBadgeStyle(complianceResult.subVerdicts.runwayProcedure)}>{complianceResult.subVerdicts.runwayProcedure}</span>
                  </div>
                  <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #222', borderRadius: '6px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Capacity/Throughput</div>
                    <span style={getStatusBadgeStyle(complianceResult.subVerdicts.capacityThroughput)}>{complianceResult.subVerdicts.capacityThroughput}</span>
                  </div>
                  <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid #222', borderRadius: '6px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Airport / Geometry</div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text)' }}>
                      {complianceResult.airport || 'Unresolved'} ({complianceResult.geometryStatus})
                    </div>
                  </div>
                </div>

                {/* Full 9-section report preview, matching the exported DOCX structure */}
                {(() => {
                  const report = complianceResult.report || {};
                  const s1 = report.section1Overview || {};
                  const s2 = report.section2OverallOperations || {};
                  const s3 = report.section3ViolationDetail || {};
                  const s4 = report.section4ActivityDistribution || {};
                  const s5 = report.section5CriticalMargin || {};
                  const s6 = report.section6CapabilityAssessment || {};
                  const s7 = report.section7OverallSafety || {};
                  const s8 = report.section8Recommendations || {};
                  const s9 = report.section9Conclusion || {};

                  const renderTable = (headers: string[], rows: any[][], totalsRow?: any[]) => (
                    <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)', borderBottom: '1px solid #444' }}>
                            {headers.map((h, i) => <th key={i} style={{ padding: '8px 10px' }}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr><td colSpan={headers.length} style={{ padding: '14px', textAlign: 'center', color: '#777' }}>Không có dữ liệu.</td></tr>
                          ) : (
                            rows.map((row, ridx) => (
                              <tr key={ridx} style={{ borderBottom: '1px solid #222' }}>
                                {row.map((cell, cidx) => <td key={cidx} style={{ padding: '8px 10px', color: 'var(--text)' }}>{String(cell)}</td>)}
                              </tr>
                            ))
                          )}
                          {totalsRow && (
                            <tr style={{ borderTop: '2px solid #444', fontWeight: 'bold' }}>
                              {totalsRow.map((cell, cidx) => <td key={cidx} style={{ padding: '8px 10px', color: 'var(--text)' }}>{String(cell)}</td>)}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  );

                  const sectionStyle: React.CSSProperties = { marginBottom: '22px', paddingBottom: '18px', borderBottom: '1px solid #222' };
                  const h5Style: React.CSSProperties = { margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, color: 'var(--text)' };
                  const h6Style: React.CSSProperties = { margin: '0 0 8px 0', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' };
                  const pStyle: React.CSSProperties = { margin: '0 0 10px 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 };

                  return (
                    <div>
                      <div style={sectionStyle}>
                        <h5 style={h5Style}>{s1.title}</h5>
                        <ul style={{ margin: '0 0 10px 0', paddingLeft: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          <li>Tên kịch bản: {s1.scenarioName}</li>
                          <li>Sân bay/khu vực mô phỏng: {s1.airport}</li>
                          <li>Thời lượng mô phỏng: {s1.durationLabel}</li>
                          <li>Tổng số tàu bay tham gia: {s1.totalAircraft} tàu bay</li>
                          <li>Số tàu bay cất cánh: {s1.departureCount}</li>
                          <li>Số tàu bay hạ cánh: {s1.arrivalCount}</li>
                          <li>Số tàu bay HEAVY: {s1.heavyCount}</li>
                          <li>Số tàu bay MEDIUM: {s1.mediumCount}</li>
                          <li>Tổng số trường hợp vi phạm phân cách: {s1.totalViolations}</li>
                          <li>Số cặp tàu bay liên quan đến vi phạm: {s1.violatingPairCount}</li>
                        </ul>
                        <h6 style={h6Style}>1.1. Tiêu chuẩn phân cách áp dụng</h6>
                        {s1.separationStandardTable && renderTable(s1.separationStandardTable.headers || [], s1.separationStandardTable.rows || [])}
                        <p style={pStyle}>{s1.note}</p>
                      </div>

                      <div style={sectionStyle}>
                        <h5 style={h5Style}>{s2.title}</h5>
                        <p style={pStyle}>{s2.intro}</p>
                        {s2.table && renderTable(s2.table.headers || [], s2.table.rows || [])}
                      </div>

                      <div style={sectionStyle}>
                        <h5 style={h5Style}>{s3.title}</h5>
                        {!s3.hasViolations ? (
                          <p style={pStyle}>{s3.noViolationText}</p>
                        ) : (
                          <>
                            <p style={pStyle}>{s3.violationIntroText}</p>
                            {s3.table && renderTable(s3.table.headers || [], s3.table.rows || [])}
                            <p style={pStyle}>{s3.formulaNote}</p>
                          </>
                        )}
                      </div>

                      <div style={sectionStyle}>
                        <h5 style={h5Style}>{s4.title}</h5>
                        <p style={pStyle}>{s4.intro}</p>
                        {s4.table && renderTable(s4.table.headers || [], s4.table.rows || [], s4.table.totalsRow)}
                        <p style={pStyle}>{s4.note}</p>
                      </div>

                      <div style={sectionStyle}>
                        <h5 style={h5Style}>{s5.title}</h5>
                        <p style={pStyle}>{s5.intro}</p>
                        {s5.table && renderTable(s5.table.headers || [], s5.table.rows || [])}
                        <p style={pStyle}>{s5.formulaNote}</p>
                      </div>

                      <div style={sectionStyle}>
                        <h5 style={h5Style}>{s6.title}</h5>
                        <h6 style={h6Style}>{s6.subtitle}</h6>
                        {String(s6.text || '').split('\n').map((para: string, i: number) => <p key={i} style={pStyle}>{para}</p>)}
                      </div>

                      <div style={sectionStyle}>
                        <h5 style={h5Style}>{s7.title}</h5>
                        <p style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 700 }}>
                          KẾT QUẢ: <span style={getStatusBadgeStyle(String(s7.resultLabel || '').includes('VI PHẠM') ? 'VIOLATION' : 'PASS')}>{s7.resultLabel}</span>
                        </p>
                        <ul style={{ margin: '0 0 10px 0', paddingLeft: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          {(s7.bullets || []).map((b: string, i: number) => <li key={i}>{b}</li>)}
                        </ul>
                        <p style={pStyle}>{s7.concludingText}</p>
                      </div>

                      <div style={sectionStyle}>
                        <h5 style={h5Style}>{s8.title}</h5>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          {(s8.items || []).map((item: string, i: number) => <li key={i} style={{ marginBottom: '4px' }}>{item}</li>)}
                        </ul>
                      </div>

                      <div style={{ marginBottom: '10px' }}>
                        <h5 style={h5Style}>{s9.title}</h5>
                        <p style={pStyle}>{s9.intro}</p>
                        <p style={pStyle}>{s9.text}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Downloads */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleDownloadCompliance('json')}
                    disabled={downloadingComplianceFormat !== null}
                    style={{
                      backgroundColor: '#222', color: 'var(--text)', border: '1px solid #444', borderRadius: '4px',
                      padding: '10px 20px', fontSize: '13px', fontWeight: 'bold',
                      cursor: downloadingComplianceFormat !== null ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {downloadingComplianceFormat === 'json' ? '🌀 Downloading...' : '⬇️ Download JSON'}
                  </button>
                  <button
                    onClick={() => handleDownloadCompliance('docx')}
                    disabled={downloadingComplianceFormat !== null}
                    style={{
                      backgroundColor: '#1976d2', color: 'white', border: 'none', borderRadius: '4px',
                      padding: '10px 20px', fontSize: '13px', fontWeight: 'bold',
                      cursor: downloadingComplianceFormat !== null ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {downloadingComplianceFormat === 'docx' ? '🌀 Downloading...' : '⬇️ Download DOCX'}
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    📄 PDF export (coming soon)
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

export default KpiReportsPage;
