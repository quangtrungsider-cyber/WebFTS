import React, { useEffect, useState } from 'react';
import { weatherPresetsApi, WeatherPreset } from '../services/weatherPresetsApi';
import { WeatherConfig } from '../types/models';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', backgroundColor: 'var(--input-bg)',
  border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '6px', outline: 'none',
};
const labelStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' };

interface Props {
  value?: WeatherConfig;
  onChange: (config: WeatherConfig) => void;
}

/** Weather config editor for the scenario form. Wind direction/speed become
 * a real `WIND` stack command in the exported .scn (scn_generator.py's
 * _weather_lines) -- visibility/ceiling have no equivalent BlueSky command,
 * so they're kept as reference-only fields (labeled as such below) rather
 * than pretending they affect the simulation. */
const WeatherConfigEditor: React.FC<Props> = ({ value, onChange }) => {
  const [presets, setPresets] = useState<WeatherPreset[]>([]);

  useEffect(() => {
    weatherPresetsApi.list().then(setPresets).catch(() => setPresets([]));
  }, []);

  const cfg: WeatherConfig = value ?? { mode: 'none' };
  const set = (patch: Partial<WeatherConfig>) => onChange({ ...cfg, ...patch });

  const applyPreset = (id: string) => {
    const preset = presets.find(p => p.id === id);
    if (!preset) return;
    set({
      mode: preset.mode,
      description: preset.description,
      windDirection: preset.windDirection ?? undefined,
      windSpeedKt: preset.windSpeedKt ?? undefined,
      visibilityM: preset.visibilityM ?? undefined,
      ceilingFt: preset.ceilingFt ?? undefined,
    });
  };

  return (
    <div>
      {presets.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Áp dụng preset có sẵn</label>
          <select defaultValue="" onChange={e => e.target.value && applyPreset(e.target.value)} style={inputStyle}>
            <option value="">— Chọn preset —</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Mode</label>
        <select value={cfg.mode} onChange={e => set({ mode: e.target.value as WeatherConfig['mode'] })} style={inputStyle}>
          <option value="none">Không mô hình hoá (none)</option>
          <option value="vfr">VFR</option>
          <option value="ifr">IFR</option>
          <option value="cb_ts">CB / Dông (cb_ts)</option>
          <option value="low_visibility">Tầm nhìn thấp</option>
          <option value="custom">Tùy chỉnh</option>
        </select>
      </div>

      {cfg.mode !== 'none' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Hướng gió (độ) — sinh lệnh WIND thật</label>
              <input type="number" min={0} max={359} value={cfg.windDirection ?? ''}
                onChange={e => set({ windDirection: e.target.value === '' ? undefined : Number(e.target.value) })}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Tốc độ gió (kt) — sinh lệnh WIND thật</label>
              <input type="number" min={0} value={cfg.windSpeedKt ?? ''}
                onChange={e => set({ windSpeedKt: e.target.value === '' ? undefined : Number(e.target.value) })}
                style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Tầm nhìn (m) — chỉ tham khảo, chưa ảnh hưởng mô phỏng</label>
              <input type="number" min={0} value={cfg.visibilityM ?? ''}
                onChange={e => set({ visibilityM: e.target.value === '' ? undefined : Number(e.target.value) })}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Trần mây (ft) — chỉ tham khảo, chưa ảnh hưởng mô phỏng</label>
              <input type="number" min={0} value={cfg.ceilingFt ?? ''}
                onChange={e => set({ ceilingFt: e.target.value === '' ? undefined : Number(e.target.value) })}
                style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Ghi chú</label>
            <input value={cfg.description ?? ''} onChange={e => set({ description: e.target.value })} style={inputStyle} />
          </div>
        </>
      )}
    </div>
  );
};

export default WeatherConfigEditor;
