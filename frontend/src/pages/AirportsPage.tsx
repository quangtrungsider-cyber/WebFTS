import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { airportProceduresApi } from '../services/airportProceduresApi';
import { aerodromeLayoutApi, AerodromeLayoutAirport } from '../services/aerodromeLayoutApi';
import { proceduresIndexApi, ProceduresIndex, ProcedureType } from '../services/proceduresIndexApi';
import { AirportProcedures, AirportWaypoint } from '../types/models';
import { useI18n } from '../i18n';
import ScenarioDataTabs from '../components/ScenarioDataTabs';
import OfflineMapView, { MapMarker, GeoJsonOverlay } from '../components/OfflineMapView';

const PROC_TYPES: ProcedureType[] = ['SID', 'STAR', 'IAP', 'HOLDING'];
const PROC_TYPE_LABEL: Record<ProcedureType, string> = { SID: 'SID', STAR: 'STAR', IAP: 'IAP', HOLDING: 'Holding' };

const AirportsPage = () => {
  const { t } = useI18n();
  const navigate = useNavigate();

  // Overview data -- loaded once, merged from 3 independent real sources.
  const [simIcaos, setSimIcaos] = useState<string[]>([]);
  const [procIndex, setProcIndex] = useState<ProceduresIndex>({});
  const [layoutAirports, setLayoutAirports] = useState<AerodromeLayoutAirport[]>([]);
  const [runwayIndex, setRunwayIndex] = useState<Record<string, { runways: Record<string, string> }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState('');

  // Detail state for the 2 sim-enabled airports (structured SID/STAR mix editor source)
  const [procs, setProcs] = useState<AirportProcedures | null>(null);
  const [waypoints, setWaypoints] = useState<AirportWaypoint[]>([]);

  // Detail state for every other airport (ground layout only -- procedure
  // track geometry is Routes/Airways' job, see the "Xem chi tiết" link below;
  // this page used to also draw every SID/STAR/IAP/Holding track overlaid on
  // one map, which just duplicated that page under a different name).
  const [layoutOverlays, setLayoutOverlays] = useState<GeoJsonOverlay[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    Promise.all([
      airportProceduresApi.listAirports().catch(() => [] as string[]),
      proceduresIndexApi.getIndex().catch(() => ({} as ProceduresIndex)),
      aerodromeLayoutApi.listAirports().catch(() => [] as AerodromeLayoutAirport[]),
      proceduresIndexApi.getRunwayIndex().catch(() => ({} as Record<string, { runways: Record<string, string> }>)),
    ])
      .then(([sim, index, layout, runways]) => {
        setSimIcaos(sim);
        setProcIndex(index);
        setLayoutAirports(layout);
        setRunwayIndex(runways);
        const all = Array.from(new Set([...sim, ...Object.keys(index), ...layout.map(a => a.icao)])).sort();
        if (all.length > 0) setSelected(all[0]);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const allIcaos = useMemo(
    () => Array.from(new Set([...simIcaos, ...Object.keys(procIndex), ...layoutAirports.map(a => a.icao)])).sort(),
    [simIcaos, procIndex, layoutAirports]
  );

  const isSim = (icao: string) => simIcaos.includes(icao);
  const layoutMetaFor = (icao: string) => layoutAirports.find(a => a.icao === icao);
  const layoutMeta = layoutMetaFor(selected);

  useEffect(() => {
    if (!selected) return;
    setProcs(null); setWaypoints([]); setLayoutOverlays([]); setDetailError('');

    if (isSim(selected)) {
      airportProceduresApi.getProcedures(selected).then(setProcs).catch(e => setDetailError(e.message));
      airportProceduresApi.getWaypoints(selected).then(setWaypoints).catch(e => setDetailError(e.message));
      return;
    }

    setDetailLoading(true);
    const tasks: Promise<unknown>[] = [];

    if (layoutMetaFor(selected)) {
      tasks.push(
        aerodromeLayoutApi.getLayers(selected)
          .then(({ layers }) => {
            setLayoutOverlays(
              [
                { id: 'layout-pavements', data: layers.pavements, color: '#94a3b8', fillOpacity: 0.35, lineWidth: 1 },
                { id: 'layout-runways', data: layers.runways, color: '#334155', fillOpacity: 0.6, lineWidth: 4 },
                { id: 'layout-taxiways', data: layers.taxiway_centerlines, color: '#a855f7', lineWidth: 1.5 },
                { id: 'layout-gates', data: layers.gates, color: '#ec4899', circleRadius: 4 },
              ].filter(o => o.data && o.data.features && o.data.features.length > 0)
            );
          })
          .catch(e => setDetailError(e.message))
      );
    }

    Promise.all(tasks).finally(() => setDetailLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const simMarkers: MapMarker[] = waypoints.map(w => ({ id: w.name, lat: w.lat, lon: w.lon, label: w.name }));
  const procCounts = procIndex[selected] ? proceduresIndexApi.countsFor(procIndex, selected) : null;
  const runwayFallback = !layoutMeta ? runwayIndex[selected]?.runways : undefined;

  return (
    <div>
      <ScenarioDataTabs />
      <div style={{ maxWidth: '1500px', margin: '0 auto' }}>
        <div style={{ marginBottom: '16px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>Airports</h1>
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '16px' }}>{error}</div>}
        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</div>
        ) : allIcaos.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('common.noData')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px' }}>
            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'hidden', height: 'fit-content', maxHeight: '760px', overflowY: 'auto' }}>
              {allIcaos.map(icao => (
                <div
                  key={icao}
                  onClick={() => setSelected(icao)}
                  style={{
                    padding: '12px 20px', cursor: 'pointer', fontWeight: 600,
                    color: selected === icao ? 'var(--primary)' : 'var(--text)',
                    backgroundColor: selected === icao ? 'var(--primary-light)' : 'transparent',
                    borderLeft: selected === icao ? '4px solid var(--primary)' : '4px solid transparent',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                  }}
                >
                  <span>{icao}</span>
                  <span style={{ display: 'flex', gap: '4px' }}>
                    {isSim(icao) && (
                      <span title="Có thể sinh scenario" style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px', backgroundColor: 'rgba(16,185,129,0.15)', color: '#10b981' }}>SIM</span>
                    )}
                    {procIndex[icao] && (
                      <span title="Có dữ liệu phương thức bay" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16a34a', alignSelf: 'center' }} />
                    )}
                    {layoutMetaFor(icao) && (
                      <span title="Có dữ liệu layout mặt đất" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563eb', alignSelf: 'center' }} />
                    )}
                  </span>
                </div>
              ))}
            </div>

            {isSim(selected) && procs ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '24px' }}>
                  <h3 style={{ margin: '0 0 20px 0', color: 'var(--primary)', fontSize: '20px' }}>{procs.icao}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Departure Runway</label>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>RWY {procs.depRunway}</div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Arrival Runway</label>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>RWY {procs.arrRunway}</div>
                    </div>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 14px 0', color: 'var(--text)', fontSize: '15px' }}>SID Transitions ({procs.sidTransitions.length})</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {procs.sidTransitions.map(name => (
                        <span key={name} style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '12.5px', backgroundColor: 'var(--bg-surface-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                          {name} <span style={{ color: 'var(--text-muted)' }}>· {procs.defaultSidMix[name] ?? 0}/h</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ backgroundColor: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 14px 0', color: 'var(--text)', fontSize: '15px' }}>STAR Transitions ({procs.starTransitions.length})</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {procs.starTransitions.map(name => (
                        <span key={name} style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '12.5px', backgroundColor: 'var(--bg-surface-elevated)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                          {name} <span style={{ color: 'var(--text-muted)' }}>· {procs.defaultStarMix[name] ?? 0}/h</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 8px', color: 'var(--text)', fontSize: '15px' }}>Waypoints thật ({waypoints.length})</h4>
                  <OfflineMapView key={`sim-${selected}`} markers={simMarkers} height="620px" />
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '24px' }}>
                  <h3 style={{ margin: '0 0 6px 0', color: 'var(--primary)', fontSize: '20px' }}>{selected}</h3>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                    Chưa cấu trúc hoá cho scenario -- chỉ hiển thị dữ liệu thật để tham khảo.
                  </div>

                  {detailError && <div style={{ color: 'var(--danger)', marginBottom: '16px', fontSize: '13px' }}>{detailError}</div>}

                  <div style={{ backgroundColor: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 14px 0', color: 'var(--text)', fontSize: '15px' }}>Phương thức bay (nominal tracks)</h4>
                    {procCounts ? (
                      <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                          {PROC_TYPES.map(pt => (
                            <span key={pt} style={{
                              padding: '4px 10px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600,
                              backgroundColor: `${proceduresIndexApi.procedureColor(pt)}22`, color: proceduresIndexApi.procedureColor(pt),
                            }}>
                              {PROC_TYPE_LABEL[pt]} · {procCounts[pt]}
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => navigate(`/scenarios/routes?icao=${selected}`)}
                          style={{
                            padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                            backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px',
                          }}
                        >
                          Xem chi tiết từng thủ tục →
                        </button>
                      </>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Không có dữ liệu phương thức cho sân bay này.</div>
                    )}
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 14px 0', color: 'var(--text)', fontSize: '15px' }}>Layout mặt đất</h4>
                    {layoutMeta ? (
                      <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                        <div><strong style={{ color: 'var(--text)' }}>{layoutMeta.features.runways}</strong> <span style={{ color: 'var(--text-muted)' }}>runway</span></div>
                        <div><strong style={{ color: 'var(--text)' }}>{layoutMeta.features.aprons}</strong> <span style={{ color: 'var(--text-muted)' }}>apron</span></div>
                        <div><strong style={{ color: 'var(--text)' }}>{layoutMeta.features.taxiways}</strong> <span style={{ color: 'var(--text-muted)' }}>taxiway centerline</span></div>
                      </div>
                    ) : runwayFallback ? (
                      <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                        Runway: {Object.keys(runwayFallback).join(', ')}
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>(chỉ có tên đường CHC, không có hình học layout)</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Không có dữ liệu layout cho sân bay này.</div>
                    )}
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 8px 12px 8px' }}>
                    <h4 style={{ margin: 0, color: 'var(--text)', fontSize: '15px' }}>Layout mặt đất (bản đồ thật)</h4>
                    {layoutOverlays.length > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#334155' }} />
                        Runway/Taxiway/Gate
                      </span>
                    )}
                  </div>
                  {detailLoading ? (
                    <div style={{ color: 'var(--text-muted)', padding: '20px' }}>{t('common.loading')}</div>
                  ) : layoutOverlays.length > 0 ? (
                    <OfflineMapView key={`layout-${selected}`} overlays={layoutOverlays} height="620px" />
                  ) : (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      Không có layout mặt đất cho sân bay này.
                      {procCounts && (
                        <>
                          <br />Xem hình học từng thủ tục bay tại{' '}
                          <button
                            onClick={() => navigate(`/scenarios/routes?icao=${selected}`)}
                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: '13px' }}
                          >
                            Routes / Airways
                          </button>.
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AirportsPage;
