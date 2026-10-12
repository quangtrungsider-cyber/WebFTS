import React, { useEffect, useMemo, useState } from 'react';
import { sectorsApi } from '../services/sectorsApi';
import { SectorFeature } from '../types/models';
import { useI18n } from '../i18n';
import ScenarioDataTabs from '../components/ScenarioDataTabs';
import OfflineMapView, { MapPolygon } from '../components/OfflineMapView';

const SECTOR_COLORS = ['#1976d2', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#059669'];

const SectorsPage = () => {
  const { t } = useI18n();
  const [sectors, setSectors] = useState<SectorFeature[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    sectorsApi.listSectors()
      .then(setSectors)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const polygons: MapPolygon[] = useMemo(
    () => sectors.map((s, i) => ({
      id: s.name,
      rings: s.rings,
      color: SECTOR_COLORS[i % SECTOR_COLORS.length],
      active: s.name === active,
    })),
    [sectors, active]
  );

  const activeSector = active ? sectors.find(s => s.name === active) : undefined;

  return (
    <div>
      <ScenarioDataTabs />
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>Sectors</h1>
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '16px' }}>{error}</div>}
        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px' }}>
            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'hidden' }}>
              <div style={{ maxHeight: '640px', overflowY: 'auto' }}>
                {sectors.map((s, i) => (
                  <div
                    key={s.name}
                    onClick={() => setActive(active === s.name ? null : s.name)}
                    style={{
                      padding: '12px 16px', cursor: 'pointer',
                      backgroundColor: active === s.name ? 'var(--primary-light)' : 'transparent',
                      borderLeft: `4px solid ${active === s.name ? SECTOR_COLORS[i % SECTOR_COLORS.length] : 'transparent'}`,
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13.5px', color: active === s.name ? 'var(--primary)' : 'var(--text)' }}>{s.name}</span>
                      <span style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        {s.airspaceClass && (
                          <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '999px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Loại {s.airspaceClass}</span>
                        )}
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)' }}>{s.service}</span>
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {[s.unit, s.vertical].filter(Boolean).join(' · ') || 'Ranh giới thật (không có đơn vị/độ cao trong nguồn)'}
                    </div>
                    {s.geometryCaveat && (
                      <div style={{ fontSize: '11px', color: 'var(--warning, #d97706)', marginTop: '4px' }}>⚠ {s.geometryCaveat}</div>
                    )}
                  </div>
                ))}
                {sectors.length === 0 && (
                  <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '13px' }}>{t('common.noData')}</div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateRows: activeSector ? 'auto 1fr' : '1fr', gap: '20px' }}>
              {activeSector && (
                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '18px 20px' }}>
                  <h3 style={{ margin: '0 0 12px 0', color: 'var(--text)', fontSize: '16px' }}>{activeSector.name}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', fontSize: '13px' }}>
                    <div><label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '2px' }}>Đơn vị</label><div style={{ color: 'var(--text)', fontWeight: 600 }}>{activeSector.unit ?? '—'}</div></div>
                    <div><label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '2px' }}>Tần số</label><div style={{ color: 'var(--text)', fontWeight: 600 }}>{activeSector.frequency ?? '—'}</div></div>
                    <div><label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '2px' }}>Giới hạn cao độ</label><div style={{ color: 'var(--text)', fontWeight: 600 }}>{activeSector.vertical ?? '—'}</div></div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '2px' }}>Bán kính</label>
                      <div style={{ color: 'var(--text)', fontWeight: 600 }}>
                        {activeSector.radiusKm != null ? `${activeSector.radiusKm} km (quanh ${activeSector.center})` : 'Đa giác thật (không xấp xỉ theo bán kính)'}
                      </div>
                    </div>
                    <div><label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '2px' }}>Loại vùng trời</label><div style={{ color: 'var(--text)', fontWeight: 600 }}>{activeSector.airspaceClass ?? '—'}</div></div>
                  </div>
                  {activeSector.horizontalNote && (
                    <div style={{ marginTop: '10px', fontSize: '12.5px', color: 'var(--text)' }}><strong>Giới hạn ngang:</strong> {activeSector.horizontalNote}</div>
                  )}
                  {activeSector.verticalNote && (
                    <div style={{ marginTop: '4px', fontSize: '12.5px', color: 'var(--text)' }}><strong>Ghi chú độ cao:</strong> {activeSector.verticalNote}</div>
                  )}
                  {activeSector.geometryCaveat && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--warning, #d97706)', backgroundColor: 'rgba(217,119,6,0.08)', padding: '8px 10px', borderRadius: '8px' }}>
                      ⚠ {activeSector.geometryCaveat}
                    </div>
                  )}
                  <div style={{ marginTop: '10px', fontSize: '11.5px', color: 'var(--text-muted)' }}>Nguồn: {activeSector.source}</div>
                </div>
              )}
              <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '16px' }}>
                <OfflineMapView
                  polygons={polygons}
                  onPolygonClick={id => setActive(active === id ? null : id)}
                  height={activeSector ? '520px' : '640px'}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SectorsPage;
