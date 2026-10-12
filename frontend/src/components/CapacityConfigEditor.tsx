import React, { useEffect, useState } from 'react';
import { airportProceduresApi } from '../services/airportProceduresApi';
import { constraintPresetsApi, ConstraintPreset } from '../services/constraintPresetsApi';
import { AirportProcedures, CapacityScenarioConfig } from '../types/models';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', backgroundColor: 'var(--input-bg)',
  border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '6px', outline: 'none',
};
const labelStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' };

function defaultConfig(procs: AirportProcedures): CapacityScenarioConfig {
  return {
    sidMix: { ...procs.defaultSidMix },
    starMix: { ...procs.defaultStarMix },
    hours: 1,
    seed: 20260727,
    asasOn: false,
    minArrArrGapSec: 180,
    depAfterArrGapSec: 30,
    minRunwayGapSec: 60,
  };
}

interface Props {
  airport: string;
  value?: CapacityScenarioConfig;
  onChange: (config: CapacityScenarioConfig) => void;
}

/** Real SID/STAR-mix capacity scenario editor -- the "form đơn giản" stand-in
 * for TAAM's IDIS/GTOOL: lets a study author set movements/hour per real
 * published SID/STAR transition, separation minima, and a few run
 * parameters, without touching capacity_scenario_engine.py's Python code. */
const CapacityConfigEditor: React.FC<Props> = ({ airport, value, onChange }) => {
  const [procs, setProcs] = useState<AirportProcedures | null>(null);
  const [presets, setPresets] = useState<ConstraintPreset[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    constraintPresetsApi.list().then(setPresets).catch(() => setPresets([]));
  }, []);

  useEffect(() => {
    if (!airport) return;
    setLoading(true);
    setError('');
    airportProceduresApi.getProcedures(airport)
      .then(p => {
        setProcs(p);
        if (!value || Object.keys(value.sidMix || {}).length === 0) {
          onChange(defaultConfig(p));
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airport]);

  if (loading) return <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Đang tải dữ liệu thủ tục…</div>;
  if (error) return <div style={{ fontSize: '13px', color: 'var(--danger)' }}>{error}</div>;
  if (!procs || !value) return null;

  const setMix = (kind: 'sidMix' | 'starMix', name: string, count: number) => {
    onChange({ ...value, [kind]: { ...value[kind], [name]: Math.max(0, count) } });
  };

  const depPerHour = Object.values(value.sidMix).reduce((a, b) => a + b, 0);
  const arrPerHour = Object.values(value.starMix).reduce((a, b) => a + b, 0);

  const renderMixTable = (kind: 'sidMix' | 'starMix', names: string[], label: string, total: number) => (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{label}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tổng: {total}/giờ</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: '6px 12px', maxHeight: '180px', overflowY: 'auto' }}>
        {names.map(name => (
          <React.Fragment key={name}>
            <label style={{ fontSize: '13px', color: 'var(--text)', alignSelf: 'center' }}>{name}</label>
            <input
              type="number" min={0}
              value={value[kind][name] ?? 0}
              onChange={e => setMix(kind, name, parseInt(e.target.value) || 0)}
              style={{ ...inputStyle, padding: '4px 8px' }}
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ border: '1px dashed var(--border)', borderRadius: '10px', padding: '16px', marginTop: '4px' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
        {procs.icao}: cất cánh RWY{procs.depRunway} · hạ cánh RWY{procs.arrRunway} — số lượng theo từng hướng SID/STAR thật, dựa trên dữ liệu thủ tục đã nạp.
      </div>

      {renderMixTable('sidMix', procs.sidTransitions, 'SID (cất cánh)', depPerHour)}
      {renderMixTable('starMix', procs.starTransitions, 'STAR (hạ cánh)', arrPerHour)}

      {presets.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Áp dụng preset phân cách có sẵn</label>
          <select
            defaultValue=""
            onChange={e => {
              const preset = presets.find(p => p.id === e.target.value);
              if (preset) {
                onChange({
                  ...value,
                  minArrArrGapSec: preset.minArrArrGapSec,
                  depAfterArrGapSec: preset.depAfterArrGapSec,
                  minRunwayGapSec: preset.minRunwayGapSec,
                });
              }
            }}
            style={inputStyle}
          >
            <option value="">— Chọn preset —</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
        <div>
          <label style={labelStyle}>Phân cách đến-đến tối thiểu (giây)</label>
          <input type="number" min={0} value={value.minArrArrGapSec}
            onChange={e => onChange({ ...value, minArrArrGapSec: parseInt(e.target.value) || 0 })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Cất cánh sau hạ cánh (giây)</label>
          <input type="number" min={0} value={value.depAfterArrGapSec}
            onChange={e => onChange({ ...value, depAfterArrGapSec: parseInt(e.target.value) || 0 })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Giãn cách runway chung (giây)</label>
          <input type="number" min={0} value={value.minRunwayGapSec}
            onChange={e => onChange({ ...value, minRunwayGapSec: parseInt(e.target.value) || 0 })} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', alignItems: 'end' }}>
        <div>
          <label style={labelStyle}>Số giờ mô phỏng</label>
          <input type="number" min={1} max={24} value={value.hours}
            onChange={e => onChange({ ...value, hours: parseInt(e.target.value) || 1 })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Seed ngẫu nhiên</label>
          <input type="number" value={value.seed}
            onChange={e => onChange({ ...value, seed: parseInt(e.target.value) || 0 })} style={inputStyle} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text)', paddingBottom: '6px' }}>
          <input type="checkbox" checked={value.asasOn}
            onChange={e => onChange({ ...value, asasOn: e.target.checked })} />
          ASAS tự động tránh xung đột
        </label>
      </div>
    </div>
  );
};

export default CapacityConfigEditor;
