import React, { useEffect, useMemo, useState } from 'react';
import { airwaysApi } from '../services/airwaysApi';
import { AirwaySummary, StructuredAirway, AirwayLegacyParam } from '../types/models';
import { useI18n } from '../i18n';
import ScenarioDataTabs from '../components/ScenarioDataTabs';
import OfflineMapView, { GeoJsonOverlay, MapLine, MapMarker } from '../components/OfflineMapView';

const DRAFT_COLOR = '#f59e0b';
const OFFICIAL_COLOR = '#0ea5e9';

const th: React.CSSProperties = { padding: '9px 12px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 12px', color: 'var(--text)' };

const fmtVertical = (v: { value: number; unit: string } | null) => (v ? `${v.unit}${v.value}` : '—');
const fmtLateral = (v: { valueNm: number; valueKm: number } | null | undefined) => (v ? `${v.valueNm}NM (${v.valueKm}km)` : null);
const fmtLevels = (v: 'odd' | 'even' | null) => (v === 'odd' ? 'Lẻ' : v === 'even' ? 'Chẵn' : '—');
const SOURCE_LABEL: Record<StructuredAirway['sourceKind'], string> = {
  rnav2Draft: 'Dự thảo RNAV2 (Word 16.9.2026)',
  enr31Legacy: 'AIP ENR 3.1 chính thức (AMDT 01/23)',
};

const AirwaysPage = () => {
  const { t } = useI18n();
  const [summaries, setSummaries] = useState<AirwaySummary[]>([]);
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detail, setDetail] = useState<{
    structured: StructuredAirway | null;
    legacyParams: AirwayLegacyParam[];
    features: GeoJSON.Feature[];
    source: string | null;
    status: string | null;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    airwaysApi.listAirways()
      .then(list => {
        setSummaries(list);
        if (list.length > 0) setSelected(list[0].code);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDetailLoading(true);
    airwaysApi.getAirwayDetail(selected)
      .then(setDetail)
      .catch(e => setError(e.message))
      .finally(() => setDetailLoading(false));
  }, [selected]);

  const filtered = useMemo(
    () => summaries.filter(s => s.code.toLowerCase().includes(search.toLowerCase())),
    [summaries, search]
  );

  const draftCount = summaries.filter(s => s.isDraft).length;
  const structuredCount = summaries.filter(s => s.hasStructuredData).length;

  const activeSummary = summaries.find(s => s.code === selected);
  const color = activeSummary?.isDraft ? DRAFT_COLOR : OFFICIAL_COLOR;

  const structured = detail?.structured ?? null;

  const markers: MapMarker[] = structured
    ? structured.waypoints.map(w => ({ id: `${w.name}-${w.seq}`, lat: w.lat, lon: w.lon, label: w.name, color }))
    : [];
  const lines: MapLine[] = structured && structured.waypoints.length > 1
    ? [{ id: structured.code, points: structured.waypoints.map(w => [w.lon, w.lat] as [number, number]), color }]
    : [];
  const overlays: GeoJsonOverlay[] = !structured && detail
    ? [{ id: `raw-${selected}`, data: { type: 'FeatureCollection', features: detail.features } as GeoJSON.FeatureCollection, color, lineWidth: 2.5 }]
    : [];

  return (
    <div>
      <ScenarioDataTabs />
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>Airways</h1>
          {draftCount > 0 && (
            <div style={{ marginTop: '10px', display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: OFFICIAL_COLOR, marginRight: 6 }} />Đường bay AIP chính thức</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: DRAFT_COLOR, marginRight: 6 }} />Dự thảo RNAV2 — chưa công bố AIP</span>
            </div>
          )}
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '16px' }}>{error}</div>}
        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>
            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm đường bay theo mã..."
                  style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '6px', outline: 'none' }}
                />
              </div>
              <div style={{ maxHeight: '640px', overflowY: 'auto' }}>
                {filtered.map(s => (
                  <div
                    key={s.code}
                    onClick={() => setSelected(s.code)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', cursor: 'pointer',
                      backgroundColor: selected === s.code ? 'var(--primary-light)' : 'transparent',
                      borderLeft: `3px solid ${selected === s.code ? (s.isDraft ? DRAFT_COLOR : OFFICIAL_COLOR) : 'transparent'}`,
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '13.5px', color: selected === s.code ? 'var(--primary)' : 'var(--text)' }}>{s.code}</span>
                    <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {s.isDraft && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', backgroundColor: 'rgba(245,158,11,0.15)', color: DRAFT_COLOR, fontWeight: 700 }}>DRAFT</span>}
                      {s.hasStructuredData && <span title="Có chuỗi waypoint đã cấu trúc hoá" style={{ fontSize: '11px', color: 'var(--success, #16a34a)' }}>●</span>}
                    </span>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '13px' }}>Không tìm thấy đường bay.</div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: '16px', minWidth: 0 }}>
              <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>{selected}</h2>
                  {activeSummary?.navigationSpec && (
                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '999px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', fontWeight: 600 }}>{activeSummary.navigationSpec}</span>
                  )}
                  {activeSummary?.isDraft && (
                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '999px', backgroundColor: 'rgba(245,158,11,0.15)', color: DRAFT_COLOR, fontWeight: 700 }}>DỰ THẢO — CHƯA CÔNG BỐ AIP</span>
                  )}
                  {structured && (
                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '999px', backgroundColor: 'rgba(22,163,74,0.12)', color: '#16a34a', fontWeight: 600 }}>
                      {SOURCE_LABEL[structured.sourceKind]}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  {detail?.status && <div>Trạng thái: {detail.status}</div>}
                  {detail?.source && <div style={{ marginTop: 2 }}>Nguồn: {detail.source}</div>}
                  {!structured && (
                    <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
                      Dữ liệu thô từ KMZ AIP — {activeSummary?.segmentFeatureCount ?? 0} đoạn hình học, chưa có chuỗi waypoint có tên/ràng buộc theo thứ tự.
                    </div>
                  )}
                </div>
              </div>

              {detailLoading ? (
                <div style={{ color: 'var(--text-muted)', padding: '20px' }}>{t('common.loading')}</div>
              ) : structured ? (
                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'auto', maxHeight: '420px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-surface)', textAlign: 'left', position: 'sticky', top: 0 }}>
                        <th style={th}>#</th>
                        <th style={th}>Từ</th>
                        <th style={th}>Đến</th>
                        <th style={th}>Hướng (°M)</th>
                        <th style={th}>Cự ly (km)</th>
                        <th style={th}>Giới hạn FL trên/dưới</th>
                        <th style={th}>Độ cao an toàn tối thiểu</th>
                        <th style={th}>Giới hạn ngang / Bề rộng</th>
                        <th style={th}>Class</th>
                        <th style={th}>RNP</th>
                        <th style={th}>Mực bay</th>
                        <th style={{ ...th, minWidth: 260 }}>Điều kiện sử dụng / Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {structured.segments.map(seg => (
                        <tr key={seg.seq} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={td}>{seg.seq}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{seg.fromWaypoint}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{seg.toWaypoint}</td>
                          <td style={td}>
                            {seg.magneticTrackDeg ?? '—'}
                            {seg.reverseMagneticTrackDeg != null && ` / ${seg.reverseMagneticTrackDeg}`}
                          </td>
                          <td style={td}>{seg.distanceKm ?? '—'}</td>
                          <td style={td}>{fmtVertical(seg.upperLimit)} / {fmtVertical(seg.lowerLimit)}</td>
                          <td style={td}>{seg.minSafeAltitudeM != null ? `${seg.minSafeAltitudeM} m` : '—'}</td>
                          <td style={td}>{fmtLateral(seg.lateralLimit) ?? (seg.widthKm != null ? `${seg.widthKm} km` : '—')}</td>
                          <td style={td}>{seg.airspaceClass ?? '—'}</td>
                          <td style={td}>{seg.navAccuracy ?? '—'}</td>
                          <td style={td}>{fmtLevels(seg.cruisingLevels)}</td>
                          <td style={{ ...td, color: 'var(--text-muted)', fontSize: '12px' }}>{seg.usageConditions ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'auto', maxHeight: '420px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-surface)', textAlign: 'left', position: 'sticky', top: 0 }}>
                        <th style={th}>#</th>
                        <th style={th}>Giới hạn FL trên/dưới</th>
                        <th style={th}>Độ cao an toàn tối thiểu</th>
                        <th style={th}>Bề rộng (km)</th>
                        <th style={th}>RNP</th>
                        <th style={th}>Hướng / Hướng ngược</th>
                        <th style={th}>Cự ly (km)</th>
                        <th style={th}>Loại đường</th>
                        <th style={th}>Class</th>
                        <th style={th}>Dom/Intl</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail?.legacyParams ?? []).map((p, i) => (
                        <tr key={p.featureId} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={td}>{i + 1}</td>
                          <td style={td}>{fmtVertical(p.upperLimit)} / {fmtVertical(p.lowerLimit)}</td>
                          <td style={td}>{p.minSafeAltitudeM != null ? `${p.minSafeAltitudeM} m` : '—'}</td>
                          <td style={td}>{p.widthKm ?? '—'}</td>
                          <td style={td}>{p.rnp ?? '—'}</td>
                          <td style={td}>{p.magneticTrackDeg ?? '—'} / {p.reverseMagneticTrackDeg ?? '—'}</td>
                          <td style={td}>{p.lengthKm ?? '—'}</td>
                          <td style={td}>{p.routeType || '—'}</td>
                          <td style={td}>{p.airspaceClass || '—'}</td>
                          <td style={td}>{p.domIntl || '—'}</td>
                        </tr>
                      ))}
                      {(detail?.legacyParams ?? []).length === 0 && (
                        <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)' }}>{t('common.noData')}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '16px' }}>
                <OfflineMapView key={`airway-${selected}`} markers={markers} lines={lines} overlays={overlays} height="380px" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AirwaysPage;
