import React, { useEffect, useState } from 'react';
import { badaApi, BadaAircraftDetail } from '../services/badaApi';

interface Props {
  code: string;
  onClose: () => void;
}

const CONFIG_PHASE_LABEL: Record<string, string> = {
  CR: 'Clean (cruise)',
  IC: 'Initial climb',
  TO: 'Takeoff',
  AP: 'Approach',
  LD: 'Landing',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '20px',
  padding: '16px 18px',
  borderRadius: '10px',
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--card-border)',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  color: 'var(--primary)',
  margin: '0 0 12px 0',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const fieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: '10px 20px',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: '14px', color: 'var(--text)', fontFamily: 'monospace' }}>{value ?? '—'}</div>
    </div>
  );
}

function fmt(n: number | null | undefined, unit = ''): string {
  if (n === null || n === undefined) return '—';
  return `${n}${unit}`;
}

const BadaAircraftDetailModal: React.FC<Props> = ({ code, onClose }) => {
  const [detail, setDetail] = useState<BadaAircraftDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    badaApi.getDetail(code)
      .then(setDetail)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [code]);

  const perf = detail?.performance;
  const grid = detail?.climbCruiseDescentGrid ?? [];

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '16px',
          border: '1px solid var(--card-border)', width: '1100px', maxWidth: '95vw',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '20px', color: 'var(--text)' }}>
              {code}
              {detail?.usedInFleetMix && (
                <span style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 7px', borderRadius: '999px', backgroundColor: 'rgba(16,185,129,0.15)', color: 'var(--success)' }}>fleet</span>
              )}
            </h3>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {detail?.manufacturerModel} — BADA model {detail?.coeffFile}
              {detail?.isEquivalent && ' (tương đương)'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            &times;
          </button>
        </div>

        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        {loading && <div style={{ color: 'var(--text-muted)' }}>Đang tải…</div>}

        {detail && perf && (
          <div style={{ overflowY: 'auto', paddingRight: '4px' }}>
            {/* General */}
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Thông tin chung</div>
              <div style={fieldGridStyle}>
                <Field label="Loại (Type)" value={detail.code} />
                <Field label="Wake Turbulence Category" value={perf.weightCategoryLabel} />
                <Field label="Động cơ" value={`${perf.numEngines}× ${perf.engineType}`} />
                <Field label="Wing Type" value="Fixed Wing" />
                <Field label="Reference Mass" value={fmt(perf.mrefT, ' t')} />
                <Field label="Minimum Mass" value={fmt(perf.mminT, ' t')} />
                <Field label="Maximum Take-off Weight" value={fmt(perf.mtowT, ' t')} />
              </div>
            </div>

            {/* Flight envelope + ground */}
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Giới hạn bay &amp; mặt đất</div>
              <div style={fieldGridStyle}>
                <Field label="VMO" value={fmt(perf.vmoKt, ' kt')} />
                <Field label="MMO" value={`M${perf.mmo}`} />
                <Field label="Trần bay (Max Alt.)" value={fmt(perf.maxAltFt, ' ft')} />
                <Field label="Cự ly cất cánh (TOL)" value={fmt(perf.tolM, ' m')} />
                <Field label="Cự ly hạ cánh (LDL)" value={fmt(perf.ldlM, ' m')} />
                <Field label="Sải cánh × Dài" value={`${perf.wingspanM} × ${perf.lengthM} m`} />
              </div>
            </div>

            {/* Vstall by config */}
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Tốc độ mất lực nâng theo cấu hình (Vstall, KCAS) — dữ liệu BADA gốc</div>
              <div style={fieldGridStyle}>
                {Object.entries(CONFIG_PHASE_LABEL).map(([ph, label]) => (
                  <Field key={ph} label={`${ph} — ${label}`} value={fmt(perf.stallSpeedsKcas[ph], ' kt')} />
                ))}
              </div>
            </div>

            {/* Approach/touchdown (derived) */}
            {detail.approachSpeeds && (
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Tốc độ tiếp cận &amp; tiếp đất (ước tính, không phải số liệu BADA gốc)</div>
                <div style={fieldGridStyle}>
                  <Field label="Normal Speed Final Approach" value={fmt(detail.approachSpeeds.vAppNormalKt, ' kt')} />
                  <Field label="Maximum Speed Final Approach" value={fmt(detail.approachSpeeds.vAppMaxKt, ' kt')} />
                  <Field label="Normal Speed Touchdown" value={fmt(detail.approachSpeeds.vTouchdownNormalKt, ' kt')} />
                  <Field label="Maximum Speed Touchdown" value={fmt(detail.approachSpeeds.vTouchdownMaxKt, ' kt')} />
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '10px' }}>{detail.approachSpeeds.note}</div>
              </div>
            )}

            {/* Climb schedule */}
            {detail.climbSchedule && (
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Lịch trình tốc độ Climb công bố (APF, mức khối lượng trung bình)</div>
                <div style={fieldGridStyle}>
                  <Field label="CAS climb (thấp)" value={fmt(detail.climbSchedule.casCl1Kt, ' kt')} />
                  <Field label="CAS climb (cao)" value={fmt(detail.climbSchedule.casCl2Kt, ' kt')} />
                  <Field label="Mach climb" value={`M${detail.climbSchedule.mCl}`} />
                </div>
              </div>
            )}

            {/* Climb/Cruise/Descent grid */}
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>
                Bảng hiệu năng theo mực bay (Climb 3 mức khối lượng Lo/Nom/Hi · Cruise: TAS không đổi theo khối lượng, chỉ tiêu hao nhiên liệu thay đổi · Descent: chỉ có mức {detail.descentMassTier ?? '—'})
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'monospace' }}>
                  <thead>
                    <tr style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-surface)' }}>
                      <th rowSpan={2} style={thStyle}>FL</th>
                      <th colSpan={3} style={thStyle}>Climb Speed (kt)</th>
                      <th colSpan={3} style={thStyle}>Climb ROC (fpm)</th>
                      <th colSpan={1} style={thStyle}>Cruise Speed</th>
                      <th colSpan={3} style={thStyle}>Cruise Fuel (kg/min)</th>
                      <th colSpan={1} style={thStyle}>Descent Speed</th>
                      <th colSpan={1} style={thStyle}>Descent ROD</th>
                    </tr>
                    <tr style={{ position: 'sticky', top: '25px', backgroundColor: 'var(--bg-surface)' }}>
                      <th style={thSubStyle}>Lo</th><th style={thSubStyle}>Nom</th><th style={thSubStyle}>Hi</th>
                      <th style={thSubStyle}>Lo</th><th style={thSubStyle}>Nom</th><th style={thSubStyle}>Hi</th>
                      <th style={thSubStyle}>kt</th>
                      <th style={thSubStyle}>Lo</th><th style={thSubStyle}>Nom</th><th style={thSubStyle}>Hi</th>
                      <th style={thSubStyle}>kt</th>
                      <th style={thSubStyle}>fpm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grid.map(row => (
                      <tr key={row.fl} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{row.fl}</td>
                        <td style={tdStyle}>{fmt(row.climbSpeedLoKt)}</td>
                        <td style={tdStyle}>{fmt(row.climbSpeedNomKt)}</td>
                        <td style={tdStyle}>{fmt(row.climbSpeedHiKt)}</td>
                        <td style={tdStyle}>{fmt(row.climbRocLoFpm)}</td>
                        <td style={tdStyle}>{fmt(row.climbRocNomFpm)}</td>
                        <td style={tdStyle}>{fmt(row.climbRocHiFpm)}</td>
                        <td style={tdStyle}>{fmt(row.cruiseSpeedKt)}</td>
                        <td style={tdStyle}>{fmt(row.cruiseFuelLoKgMin)}</td>
                        <td style={tdStyle}>{fmt(row.cruiseFuelNomKgMin)}</td>
                        <td style={tdStyle}>{fmt(row.cruiseFuelHiKgMin)}</td>
                        <td style={tdStyle}>{fmt(row.descentSpeedKt)}</td>
                        <td style={tdStyle}>{fmt(row.descentRodFpm)}</td>
                      </tr>
                    ))}
                    {grid.length === 0 && (
                      <tr><td colSpan={13} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>Không có dữ liệu .PTD/.PTF cho loại này</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const thStyle: React.CSSProperties = { padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', borderBottom: '1px solid var(--border)' };
const thSubStyle: React.CSSProperties = { padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'center', borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '5px 8px', color: 'var(--text)', textAlign: 'center' };

export default BadaAircraftDetailModal;
