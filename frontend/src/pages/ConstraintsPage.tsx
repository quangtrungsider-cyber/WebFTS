import React, { useEffect, useState } from 'react';
import { constraintPresetsApi, ConstraintPreset } from '../services/constraintPresetsApi';
import { useI18n } from '../i18n';
import ScenarioDataTabs from '../components/ScenarioDataTabs';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', backgroundColor: 'var(--input-bg)',
  border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '6px', outline: 'none',
};
const labelStyle: React.CSSProperties = { fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block', fontWeight: 600 };

function emptyDraft(): Partial<ConstraintPreset> {
  return { name: '', description: '', minArrArrGapSec: 180, depAfterArrGapSec: 30, minRunwayGapSec: 60 };
}

const ConstraintsPage = () => {
  const { t } = useI18n();
  const [presets, setPresets] = useState<ConstraintPreset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ConstraintPreset>>(emptyDraft());
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    constraintPresetsApi.list()
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
        const created = await constraintPresetsApi.create(draft);
        setIsNew(false);
        setSelected(created.id);
      } else if (selected) {
        await constraintPresetsApi.update(selected, draft);
      }
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await constraintPresetsApi.remove(id);
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
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>Constraints</h1>
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
                  <div style={{ fontWeight: 600, fontSize: '13.5px', color: selected === p.id && !isNew ? 'var(--primary)' : 'var(--text)' }}>{p.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    ARR-ARR {p.minArrArrGapSec}s · DEP sau ARR {p.depAfterArrGapSec}s · RWY {p.minRunwayGapSec}s
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
                      <label style={labelStyle}>Phân cách đến-đến tối thiểu (giây)</label>
                      <input type="number" min={0} value={draft.minArrArrGapSec ?? 0} onChange={e => setDraft({ ...draft, minArrArrGapSec: parseInt(e.target.value) || 0 })} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Cất cánh sau hạ cánh (giây)</label>
                      <input type="number" min={0} value={draft.depAfterArrGapSec ?? 0} onChange={e => setDraft({ ...draft, depAfterArrGapSec: parseInt(e.target.value) || 0 })} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Giãn cách runway chung (giây)</label>
                      <input type="number" min={0} value={draft.minRunwayGapSec ?? 0} onChange={e => setDraft({ ...draft, minRunwayGapSec: parseInt(e.target.value) || 0 })} style={inputStyle} />
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

export default ConstraintsPage;
