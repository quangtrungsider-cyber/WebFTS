import React, { useState, useEffect, useRef, useCallback } from 'react';
import { badaApi, BadaAircraft } from '../services/badaApi';
import {
  monteCarloApi,
  MonteCarloJobSummary,
  MonteCarloJobDetail,
  MonteCarloJobResults,
  MonteCarloJobSummaryStats,
  MonteCarloStatsBlock,
  MonteCarloStudyType,
  ThreeNmSummary,
  ThreeNmTableRow,
  CreateMonteCarloJobPayload,
} from '../services/monteCarloApi';

const POLL_INTERVAL_MS = 2000;
const ACTIVE_STATES = new Set(['queued', 'running']);

const STUDY_TYPE_LABELS: Record<MonteCarloStudyType, string> = {
  p_wake: 'P_wake (nhiễu động, từ ngưỡng RWY)',
  '3nm_der': '3NM/DER (cất cánh liên tục, từ cuối CHC)',
};

const statusBadgeStyle = (status: string): React.CSSProperties => {
  const base: React.CSSProperties = {
    padding: '4px 8px', borderRadius: '4px', fontSize: '11px',
    fontWeight: 'bold', textTransform: 'uppercase', display: 'inline-block',
  };
  switch (status) {
    case 'completed':
      return { ...base, backgroundColor: 'rgba(76, 175, 80, 0.1)', color: '#4caf50', border: '1px solid rgba(76, 175, 80, 0.3)' };
    case 'running':
      return { ...base, backgroundColor: 'rgba(33, 150, 243, 0.1)', color: '#2196f3', border: '1px solid rgba(33, 150, 243, 0.3)' };
    case 'queued':
      return { ...base, backgroundColor: 'rgba(255, 152, 0, 0.1)', color: '#ff9800', border: '1px solid rgba(255, 152, 0, 0.3)' };
    case 'failed':
      return { ...base, backgroundColor: 'rgba(244, 67, 54, 0.1)', color: '#f44336', border: '1px solid rgba(244, 67, 54, 0.3)' };
    default: // cancelled
      return { ...base, backgroundColor: 'rgba(158, 158, 158, 0.1)', color: '#9e9e9e', border: '1px solid rgba(158, 158, 158, 0.3)' };
  }
};

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--card-bg)', border: '1px solid #333', borderRadius: '8px', padding: '20px',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 'bold',
};

const inputStyle: React.CSSProperties = {
  width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text)',
  border: '1px solid var(--input-border, #444)', borderRadius: '4px', padding: '8px', fontSize: '13px',
};

function StatsTable({ markerTimeS, markerAltFt, liftoffTimeS }: {
  markerTimeS: MonteCarloStatsBlock | null;
  markerAltFt: MonteCarloStatsBlock | null;
  liftoffTimeS: MonteCarloStatsBlock | null;
}) {
  const rows: { key: keyof MonteCarloStatsBlock; label: string }[] = [
    { key: 'min', label: 'Min' },
    { key: 'p05', label: 'P05' },
    { key: 'p50', label: 'P50 (trung vị)' },
    { key: 'p95', label: 'P95' },
    { key: 'p99', label: 'P99' },
    { key: 'max', label: 'Max' },
  ];
  const fmt = (v: number | undefined, digits: number) => (v === undefined || v === null ? '—' : v.toFixed(digits));

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)', borderBottom: '1px solid #444' }}>
          <th style={{ textAlign: 'left', padding: '10px' }}>Percentile</th>
          <th style={{ textAlign: 'right', padding: '10px' }}>marker_t_s (giây)</th>
          <th style={{ textAlign: 'right', padding: '10px' }}>marker_alt_ft</th>
          <th style={{ textAlign: 'right', padding: '10px' }}>liftoff_t_s (giây)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key} style={{ borderBottom: '1px solid #2a2a2a' }}>
            <td style={{ padding: '10px', color: 'var(--text)', fontWeight: 'bold' }}>{r.label}</td>
            <td style={{ padding: '10px', textAlign: 'right', color: 'var(--text)' }}>{fmt(markerTimeS?.[r.key], 2)}</td>
            <td style={{ padding: '10px', textAlign: 'right', color: 'var(--text)' }}>{fmt(markerAltFt?.[r.key], 1)}</td>
            <td style={{ padding: '10px', textAlign: 'right', color: 'var(--text)' }}>{fmt(liftoffTimeS?.[r.key], 2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ThreeNmResultsTable({ summary }: { summary: ThreeNmSummary }) {
  const fmt = (v: number | null | undefined, digits: number) => (v === undefined || v === null ? '—' : v.toFixed(digits));
  const isRecommended = (row: ThreeNmTableRow) => {
    const rec = summary.recommended[row.group];
    return !!rec && rec.m_candidate_nm === row.m_candidate_nm;
  };

  return (
    <>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>
        Chiều dài đường CHC (ngưỡng → DER): {summary.runway_len_nm.toFixed(3)} NM. Dòng tô xanh = M_recommended cho nhóm cặp đó.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '900px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)', borderBottom: '1px solid #444' }}>
              <th style={{ textAlign: 'left', padding: '8px' }}>Nhóm cặp</th>
              <th style={{ textAlign: 'right', padding: '8px' }}>M (NM từ DER)</th>
              <th style={{ textAlign: 'right', padding: '8px' }}>N</th>
              <th style={{ textAlign: 'right', padding: '8px' }}>D_start mean (NM)</th>
              <th style={{ textAlign: 'right', padding: '8px' }}>D_start P1 (NM)</th>
              <th style={{ textAlign: 'right', padding: '8px' }}>viol_start (%)</th>
              <th style={{ textAlign: 'right', padding: '8px' }}>D_min mean (NM)</th>
              <th style={{ textAlign: 'right', padding: '8px' }}>D_min P1 (NM)</th>
              <th style={{ textAlign: 'right', padding: '8px' }}>viol_min (%)</th>
            </tr>
          </thead>
          <tbody>
            {summary.table.map((row, i) => (
              <tr key={i} style={{
                borderBottom: '1px solid #2a2a2a',
                backgroundColor: isRecommended(row) ? 'rgba(76, 175, 80, 0.12)' : undefined,
              }}>
                <td style={{ padding: '8px', color: 'var(--text)' }}>{row.group}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text)' }}>{row.m_candidate_nm.toFixed(1)}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text)' }}>{row.n_runs}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text)' }}>{fmt(row.d_start?.mean, 3)}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text)' }}>{fmt(row.d_start?.p1, 3)}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: (row.violation_rate_start_pct ?? 0) > 0.1 ? '#f44336' : 'var(--text)' }}>{fmt(row.violation_rate_start_pct, 2)}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text)' }}>{fmt(row.d_min?.mean, 3)}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text)' }}>{fmt(row.d_min?.p1, 3)}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: (row.violation_rate_min_pct ?? 0) > 0.1 ? '#f44336' : 'var(--text)' }}>{fmt(row.violation_rate_min_pct, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '16px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text)' }}>M_recommended theo nhóm cặp</h4>
        {Object.entries(summary.recommended).map(([group, rec]) => (
          <p key={group} style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0' }}>
            <strong style={{ color: 'var(--text)' }}>{group}:</strong>{' '}
            {rec ? `${rec.m_candidate_nm.toFixed(1)} NM từ DER (leader=${rec.leader_type}, follower=${rec.follower_type})` : 'KHÔNG có M_candidate nào thoả tiêu chí — thử M xa hơn.'}
          </p>
        ))}
      </div>
    </>
  );
}

const MonteCarloPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'new-run' | 'history'>('new-run');
  const [aircraftOptions, setAircraftOptions] = useState<BadaAircraft[]>([]);
  const [jobs, setJobs] = useState<MonteCarloJobSummary[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Launch form state
  const [studyType, setStudyType] = useState<MonteCarloStudyType>('p_wake');
  const [label, setLabel] = useState('HEAVY(B773) -> MEDIUM, VVDN RWY35R');
  const [aircraftType, setAircraftType] = useState('B773');
  const [nRuns, setNRuns] = useState(1000);
  const [nWorkers, setNWorkers] = useState(8);
  const [pWakeNm, setPWakeNm] = useState(6.065);
  const [mCandidatesText, setMCandidatesText] = useState('0.8, 1.2, 1.6');
  const [tDelayMinS, setTDelayMinS] = useState(3.0);
  const [tDelayMaxS, setTDelayMaxS] = useState(8.0);
  const [launching, setLaunching] = useState(false);

  // Tracked job (progress/results view shown under the form, or reached via History "Xem")
  const [trackedJobId, setTrackedJobId] = useState<string | null>(null);
  const [trackedJob, setTrackedJob] = useState<MonteCarloJobDetail | null>(null);
  const [trackedResults, setTrackedResults] = useState<MonteCarloJobResults | null>(null);

  const pollRef = useRef<any>(null);

  const refreshJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const list = await monteCarloApi.listJobs();
      setJobs(list);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    badaApi.listAircraft({ fleetOnly: true }).then(setAircraftOptions).catch(() => setAircraftOptions([]));
    refreshJobs();
  }, [refreshJobs]);

  // Poll the tracked job while it's queued/running; stop and fetch results once it finishes.
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!trackedJobId) return;

    const poll = async () => {
      try {
        const detail = await monteCarloApi.getJob(trackedJobId);
        setTrackedJob(detail);
        if (!ACTIVE_STATES.has(detail.status)) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          refreshJobs();
          if (detail.status === 'completed') {
            const results = await monteCarloApi.getJobResults(trackedJobId);
            setTrackedResults(results);
          }
        }
      } catch (e: any) {
        setErrorMsg(e.message);
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [trackedJobId, refreshJobs]);

  const handleLaunch = async () => {
    setLaunching(true);
    setErrorMsg(null);
    try {
      const payload: CreateMonteCarloJobPayload = studyType === '3nm_der'
        ? {
          label, studyType, nRuns, nWorkers,
          mCandidates: mCandidatesText.split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v)),
          tDelayMinS, tDelayMaxS,
        }
        : { label, studyType, nRuns, nWorkers, aircraftType, pWakeNm };

      const res = await monteCarloApi.createJob(payload);
      setTrackedResults(null);
      setTrackedJob(null);
      setTrackedJobId(res.jobId);
      await refreshJobs();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLaunching(false);
    }
  };

  const viewJob = (jobId: string) => {
    setTrackedResults(null);
    setTrackedJob(null);
    setTrackedJobId(jobId);
    setActiveTab('new-run');
  };

  const handleCancel = async (jobId: string) => {
    try {
      await monteCarloApi.cancelJob(jobId);
      refreshJobs();
      if (jobId === trackedJobId) {
        const detail = await monteCarloApi.getJob(jobId);
        setTrackedJob(detail);
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  const handleDelete = async (jobId: string) => {
    try {
      await monteCarloApi.deleteJob(jobId);
      if (jobId === trackedJobId) {
        setTrackedJobId(null);
        setTrackedJob(null);
        setTrackedResults(null);
      }
      refreshJobs();
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  };

  const hasActiveJob = jobs.some(j => ACTIVE_STATES.has(j.status));
  // p_wake: ~3.94s/run/worker (measured: 1000 runs / 8 workers = 492s wall-clock, 1 profile sim/run).
  // 3nm_der: ~22.53s/run/worker (measured: 1000 runs / 10 workers = 2253s wall-clock, 4 profile sims/run).
  const estSeconds = Math.round((nRuns / Math.max(1, nWorkers)) * (studyType === '3nm_der' ? 22.53 : 3.94));
  const estMinutes = Math.max(1, Math.round(estSeconds / 60));

  const isThreeNmResults = (r: MonteCarloJobResults): r is MonteCarloJobResults & { summary: ThreeNmSummary } =>
    r.studyType === '3nm_der';

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid var(--border)', paddingBottom: '24px', marginBottom: '24px',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>
            🎲 Monte Carlo Analysis
          </h1>
        </div>
      </div>

      {errorMsg && (
        <div style={{
          backgroundColor: 'rgba(248, 113, 113, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)',
          padding: '16px 20px', borderRadius: '12px', marginBottom: '24px', fontSize: '14px', fontWeight: 600,
        }}>
          ❌ {errorMsg}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, gap: '24px', overflow: 'hidden' }}>
        <div style={{ width: '200px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
          {[
            { id: 'new-run' as const, label: 'Chạy mới' },
            { id: 'history' as const, label: 'Lịch sử' },
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
                fontWeight: 600, fontSize: '14px', cursor: 'pointer', textAlign: 'left',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
          {activeTab === 'new-run' && (
            <>
              <div style={{ ...cardStyle, marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--text)' }}>Cấu hình lần chạy mới</h3>
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Loại nghiên cứu</label>
                  <select style={inputStyle} value={studyType} onChange={e => setStudyType(e.target.value as MonteCarloStudyType)}>
                    {(Object.keys(STUDY_TYPE_LABELS) as MonteCarloStudyType[]).map(t => (
                      <option key={t} value={t}>{STUDY_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Nhãn (label)</label>
                    <input style={inputStyle} value={label} onChange={e => setLabel(e.target.value)} />
                  </div>

                  {studyType === 'p_wake' ? (
                    <>
                      <div>
                        <label style={labelStyle}>Loại tàu bay (BADA)</label>
                        <select style={inputStyle} value={aircraftType} onChange={e => setAircraftType(e.target.value)}>
                          {aircraftOptions.length === 0 && <option value={aircraftType}>{aircraftType}</option>}
                          {aircraftOptions.map(a => (
                            <option key={a.code} value={a.code}>{a.code} — {a.manufacturerModel}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Khoảng cách marker P_wake (NM)</label>
                        <input style={inputStyle} type="number" step="0.001" value={pWakeNm}
                          onChange={e => setPWakeNm(parseFloat(e.target.value) || 0)} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label style={labelStyle}>M_candidates (NM từ DER, phân cách bởi dấu phẩy)</label>
                        <input style={inputStyle} value={mCandidatesText} onChange={e => setMCandidatesText(e.target.value)} placeholder="0.8, 1.2, 1.6" />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <label style={labelStyle}>T_delay min (giây)</label>
                          <input style={inputStyle} type="number" step="0.5" value={tDelayMinS}
                            onChange={e => setTDelayMinS(parseFloat(e.target.value) || 0)} />
                        </div>
                        <div>
                          <label style={labelStyle}>T_delay max (giây)</label>
                          <input style={inputStyle} type="number" step="0.5" value={tDelayMaxS}
                            onChange={e => setTDelayMaxS(parseFloat(e.target.value) || 0)} />
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label style={labelStyle}>Số lần chạy (N runs)</label>
                    <input style={inputStyle} type="number" min={10} max={5000} value={nRuns}
                      onChange={e => setNRuns(parseInt(e.target.value, 10) || 10)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Số luồng song song (N workers)</label>
                    <input style={inputStyle} type="number" min={1} max={16} value={nWorkers}
                      onChange={e => setNWorkers(parseInt(e.target.value, 10) || 1)} />
                  </div>
                </div>
                {studyType === '3nm_der' && (
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
                    ⚠️ T_delay (độ trễ cấp huấn lệnh → chạy đà) hiện là <strong>giả định</strong>, chưa có số liệu ATC thật của VVDN — xem báo cáo VVDN-3NM-ConsecutiveDeparture-Phase1.docx mục 2.
                  </p>
                )}
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
                  ⏱️ Ước tính ~{estMinutes} phút cho {nRuns} lần chạy trên {nWorkers} luồng.
                  {hasActiveJob && ' Đang có job khác chạy/xếp hàng — job mới sẽ vào hàng đợi và tự chạy khi job trước xong.'}
                </p>
                <button
                  onClick={handleLaunch}
                  disabled={launching || (studyType === 'p_wake' && !aircraftType)}
                  style={{
                    backgroundColor: launching ? 'var(--input-border)' : '#1976d2',
                    color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px',
                    fontSize: '13px', fontWeight: 600, cursor: launching ? 'default' : 'pointer',
                  }}
                >
                  {launching ? 'Đang tạo job...' : '▶ Chạy'}
                </button>
              </div>

              {trackedJobId && trackedJob && (
                <div style={{ ...cardStyle, marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text)' }}>
                      Job: {trackedJob.config?.label || trackedJobId}
                    </h3>
                    <span style={statusBadgeStyle(trackedJob.status)}>{trackedJob.status}</span>
                  </div>
                  {trackedJob.status === 'queued' && (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      Đang xếp hàng {trackedJob.queuePosition ? `(vị trí #${trackedJob.queuePosition})` : ''} — sẽ tự chạy khi job trước xong.
                    </p>
                  )}
                  {trackedJob.status === 'running' && (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      Tiến độ: {trackedJob.progress.done} / {trackedJob.progress.total} lần chạy.
                    </p>
                  )}
                  {trackedJob.status === 'failed' && (
                    <p style={{ fontSize: '13px', color: 'var(--danger)' }}>Lỗi: {trackedJob.error}</p>
                  )}
                  {ACTIVE_STATES.has(trackedJob.status) && (
                    <button
                      onClick={() => handleCancel(trackedJobId)}
                      style={{ backgroundColor: 'var(--input-bg)', color: '#f44336', border: '1px solid #444', borderRadius: '4px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Huỷ job
                    </button>
                  )}
                </div>
              )}

              {trackedResults && (
                <div style={cardStyle}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: 'var(--text)' }}>Kết quả</h3>
                  {isThreeNmResults(trackedResults) ? (
                    <ThreeNmResultsTable summary={trackedResults.summary} />
                  ) : (
                    <>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
                        {(() => {
                          const s = trackedResults.summary as MonteCarloJobSummaryStats;
                          return `n_valid=${s.nValid} / n_total=${s.nTotal} (lỗi: ${s.nError}, xoá sớm: ${s.nDeletedEarly}, không đạt marker: ${s.nNoMarkerReached})`;
                        })()}
                      </p>
                      <StatsTable
                        markerTimeS={(trackedResults.summary as MonteCarloJobSummaryStats).markerTimeS}
                        markerAltFt={(trackedResults.summary as MonteCarloJobSummaryStats).markerAltFt}
                        liftoffTimeS={(trackedResults.summary as MonteCarloJobSummaryStats).liftoffTimeS}
                      />
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text)' }}>Lịch sử các lần chạy</h3>
                <button onClick={refreshJobs} style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px' }}>
                  🔄 Làm mới
                </button>
              </div>
              {loadingJobs && jobs.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Đang tải...</p>
              ) : jobs.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Chưa có lần chạy nào.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)', borderBottom: '1px solid #444' }}>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Nhãn</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Loại nghiên cứu</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Tham số</th>
                      <th style={{ textAlign: 'right', padding: '10px' }}>N runs</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Trạng thái</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Tạo lúc</th>
                      <th style={{ textAlign: 'right', padding: '10px' }}>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map(j => (
                      <tr key={j.jobId} style={{ borderBottom: '1px solid #2a2a2a' }}>
                        <td style={{ padding: '10px', color: 'var(--text)' }}>{j.label}</td>
                        <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{STUDY_TYPE_LABELS[j.studyType] || j.studyType}</td>
                        <td style={{ padding: '10px', color: 'var(--text)' }}>
                          {j.studyType === '3nm_der' ? (j.mCandidates || []).map(m => m.toFixed(1)).join(', ') + ' NM' : j.aircraftType}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', color: 'var(--text)' }}>{j.nRuns}</td>
                        <td style={{ padding: '10px' }}><span style={statusBadgeStyle(j.status)}>{j.status}</span></td>
                        <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{j.createdAt ? new Date(j.createdAt).toLocaleString() : '—'}</td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          <button onClick={() => viewJob(j.jobId)} style={{ backgroundColor: 'transparent', color: 'var(--primary)', border: 'none', cursor: 'pointer', fontSize: '12px', marginRight: '8px' }}>
                            Xem
                          </button>
                          {ACTIVE_STATES.has(j.status) ? (
                            <button onClick={() => handleCancel(j.jobId)} style={{ backgroundColor: 'transparent', color: '#f44336', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                              Huỷ
                            </button>
                          ) : (
                            <button onClick={() => handleDelete(j.jobId)} style={{ backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                              Xoá
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MonteCarloPage;
