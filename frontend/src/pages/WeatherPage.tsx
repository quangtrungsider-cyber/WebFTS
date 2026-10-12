import React, { useEffect, useState } from 'react';
import { weatherPresetsApi, WeatherPreset } from '../services/weatherPresetsApi';
import { useI18n } from '../i18n';
import ScenarioDataTabs from '../components/ScenarioDataTabs';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', backgroundColor: 'var(--input-bg)',
  border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '6px', outline: 'none',
};
const labelStyle: React.CSSProperties = { fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block', fontWeight: 600 };

const MODE_LABEL: Record<string, string> = {
  none: 'Không mô hình hoá', vfr: 'VFR', ifr: 'IFR', cb_ts: 'CB / Dông', low_visibility: 'Tầm nhìn thấp', custom: 'Tùy chỉnh',
};

function emptyDraft(): Partial<WeatherPreset> {
  return { name: '', description: '', mode: 'vfr', windDirection: 0, windSpeedKt: 0, visibilityM: null, ceilingFt: null };
}

const WeatherPage = () => {
  const { t } = useI18n();
  const [presets, setPresets] = useState<WeatherPreset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<WeatherPreset>>(emptyDraft());
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    weatherPresetsApi.list()
      .then(list => { setPresets(list); if (!selected && list.length > 0) setSelected(list[0].id); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isNew) return;
    const preset = presets.find(p => p.id === selected);
    if (preset) setDraft(preset);
  }, [selected, presets, isNew]);

  const startNew = () => { setIsNew(true); setSelected(null); setDraft(emptyDraft()); };

  const handleSave = async () => {
    try {
      if (isNew) {
        const created = await weatherPresetsApi.create(draft);
        setIsNew(false);
        setSelected(created.id);
      } else if (selected) {
        await weatherPresetsApi.update(selected, draft);
      }
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await weatherPresetsApi.remove(id);
      if (selected === id) setSelected(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div>
      <ScenarioDataTabs />
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>Weather</h1>
          </div>
          <button onClick={startNew} style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
            + Preset mới
          </button>
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '16px' }}>{error}</div>}
        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'hidden' }}>
              {presets.map(p => (
                <div
                  key={p.id}
                  onClick={() => { setIsNew(false); setSelected(p.id); }}
                  style={{
                    padding: '14px 16px', cursor: 'pointer',
                    backgroundColor: selected === p.id && !isNew ? 'var(--primary-light)' : 'transparent',
                    borderLeft: selected === p.id && !isNew ? '3px solid var(--primary)' : '3px solid transparent',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: '13.5px', color: selected === p.id && !isNew ? 'var(--primary)' : 'var(--text)' }}>{p.name}</span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)' }}>{MODE_LABEL[p.mode] ?? p.mode}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {p.windDirection != null && p.windSpeedKt != null ? `Gió ${p.windDirection}°/${p.windSpeedKt}kt` : 'Không gió'}
                  </div>
                </div>
              ))}
              {presets.length === 0 && (
                <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '13px' }}>{t('common.noData')}</div>
              )}
            </div>

            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '24px' }}>
              {(selected || isNew) ? (
                <>
                  <h3 style={{ margin: '0 0 20px 0', color: 'var(--primary)', fontSize: '18px' }}>{isNew ? 'Preset mới' : draft.name}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={labelStyle}>Tên preset *</label>
                      <input value={draft.name ?? ''} onChange={e => setDraft({ ...draft, name: e.target.value })} style={inputStyle} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={labelStyle}>Mô tả</label>
                      <input value={draft.description ?? ''} onChange={e => setDraft({ ...draft, description: e.target.value })} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Mode</label>
                      <select value={draft.mode ?? 'vfr'} onChange={e => setDraft({ ...draft, mode: e.target.value as WeatherPreset['mode'] })} style={inputStyle}>
                        {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div />
                    <div>
                      <label style={labelStyle}>Hướng gió (độ)</label>
                      <input type="number" min={0} max={359} value={draft.windDirection ?? ''} onChange={e => setDraft({ ...draft, windDirection: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Tốc độ gió (kt)</label>
                      <input type="number" min={0} value={draft.windSpeedKt ?? ''} onChange={e => setDraft({ ...draft, windSpeedKt: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Tầm nhìn (m)</label>
                      <input type="number" min={0} value={draft.visibilityM ?? ''} onChange={e => setDraft({ ...draft, visibilityM: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Trần mây (ft)</label>
                      <input type="number" min={0} value={draft.ceilingFt ?? ''} onChange={e => setDraft({ ...draft, ceilingFt: e.target.value === '' ? null : Number(e.target.value) })} style={inputStyle} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '28px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                    <button onClick={handleSave} style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>{t('common.save')}</button>
                    {!isNew && selected && (
                      <button onClick={() => handleDelete(selected)} style={{ backgroundColor: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Xoá</button>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>Chọn một preset để xem/sửa, hoặc tạo mới.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WeatherPage;
