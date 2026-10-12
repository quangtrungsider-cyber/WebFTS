import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { airportProceduresApi } from '../services/airportProceduresApi';
import { proceduresIndexApi, ProceduresIndex, ProcedureType } from '../services/proceduresIndexApi';
import { AirportRoutes } from '../types/models';
import { useI18n } from '../i18n';
import ScenarioDataTabs from '../components/ScenarioDataTabs';
import OfflineMapView, { MapLine, MapMarker, GeoJsonOverlay } from '../components/OfflineMapView';

type SimKind = 'sid' | 'star' | 'iap' | 'holding';
const PROC_TYPES: ProcedureType[] = ['SID', 'STAR', 'IAP', 'HOLDING'];
const PROC_TYPE_LABEL: Record<ProcedureType, string> = { SID: 'SID (cất cánh)', STAR: 'STAR (hạ cánh)', IAP: 'IAP (tiếp cận)', HOLDING: 'Holding' };
const SIM_KIND_TO_PROC_TYPE: Record<SimKind, ProcedureType> = { sid: 'SID', star: 'STAR', iap: 'IAP', holding: 'HOLDING' };

const RoutesAirwaysPage = () => {
  const { t } = useI18n();
  // Lets Airports link straight into a specific airport's procedure list
  // (e.g. /scenarios/routes?icao=VVBM) instead of dumping the user back on
  // whatever airport happened to be first alphabetically.
  const [searchParams] = useSearchParams();
  const requestedIcao = searchParams.get('icao');

  const [simIcaos, setSimIcaos] = useState<string[]>([]);
  const [procIndex, setProcIndex] = useState<ProceduresIndex>({});
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Sim-enabled detail (structured waypoint sequences, unchanged from before)
  const [routes, setRoutes] = useState<AirportRoutes | null>(null);
  const [simKind, setSimKind] = useState<SimKind>('sid');
  const [simTransition, setSimTransition] = useState('');

  // Generic (raw nominal-track) detail for every other airport
  const [procType, setProcType] = useState<ProcedureType>('SID');
  const [rawTransition, setRawTransition] = useState('');
  const [rawTrack, setRawTrack] = useState<GeoJSON.FeatureCollection | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      airportProceduresApi.listAirports().catch(() => [] as string[]),
      proceduresIndexApi.getIndex().catch(() => ({} as ProceduresIndex)),
    ])
      .then(([sim, index]) => {
        setSimIcaos(sim);
        setProcIndex(index);
        const all = Array.from(new Set([...sim, ...Object.keys(index)])).sort();
        if (requestedIcao && all.includes(requestedIcao)) setSelected(requestedIcao);
        else if (all.length > 0) setSelected(all[0]);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const icaos = useMemo(
    () => Array.from(new Set([...simIcaos, ...Object.keys(procIndex)])).sort(),
    [simIcaos, procIndex]
  );

  const isSim = (icao: string) => simIcaos.includes(icao);

  useEffect(() => {
    if (!selected) return;
    setRoutes(null); setRawTrack(null); setError('');

    if (isSim(selected)) {
      airportProceduresApi.getRoutes(selected)
        .then(data => {
          setRoutes(data);
          setSimKind('sid');
          setSimTransition(Object.keys(data.sidRoutes)[0] ?? '');
        })
        .catch(e => setError(e.message));
      return;
    }

    const availableTypes = PROC_TYPES.filter(pt => (procIndex[selected]?.[pt] ? Object.keys(procIndex[selected]![pt]!).length > 0 : false));
    const firstType = availableTypes[0] ?? 'SID';
    setProcType(firstType);
    const firstName = proceduresIndexApi.transitionNamesFor(procIndex, selected, firstType)[0] ?? '';
    setRawTransition(firstName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // The airport's structured SID/STAR data (routes) has no IAP/Holding
  // equivalent -- those only exist as raw geometry in procIndex. So even for
  // a "SIM" airport (structured SID/STAR), IAP/Holding still has to be
  // fetched from the raw index whenever that sub-tab is active.
  const activeRawType: ProcedureType | null = isSim(selected)
    ? (simKind === 'iap' || simKind === 'holding' ? SIM_KIND_TO_PROC_TYPE[simKind] : null)
    : procType;

  useEffect(() => {
    if (!selected || !activeRawType || !rawTransition) { setRawTrack(null); return; }
    setDetailLoading(true);
    proceduresIndexApi.getTransitionTrack(procIndex, selected, activeRawType, rawTransition)
      .then(setRawTrack)
      .catch(e => setError(e.message))
      .finally(() => setDetailLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, activeRawType, rawTransition]);

  // Which of IAP/Holding actually have raw track data for this sim airport
  // (VVNB/VVGB have IAP but no transcribed Holding; VVPQ has both).
  const simExtraKinds = useMemo(
    () => (['iap', 'holding'] as SimKind[]).filter(
      k => proceduresIndexApi.transitionNamesFor(procIndex, selected, SIM_KIND_TO_PROC_TYPE[k]).length > 0
    ),
    [procIndex, selected]
  );

  const simTransitionNames = useMemo(() => {
    if (!routes) return [];
    return Object.keys(simKind === 'sid' ? routes.sidRoutes : routes.starRoutes);
  }, [routes, simKind]);

  const simRoute = useMemo(() => {
    if (!routes || !simTransition) return [];
    return (simKind === 'sid' ? routes.sidRoutes : routes.starRoutes)[simTransition] ?? [];
  }, [routes, simKind, simTransition]);

  const simMarkers: MapMarker[] = simRoute.map((wp, i) => ({
    id: `${wp.name}-${i}`, lat: wp.lat, lon: wp.lon,
    label: `${wp.name}${wp.altFt ? ` · ${wp.altFt}ft` : ''}${wp.spdKt ? ` · ${wp.spdKt}kt` : ''}`,
  }));
  const simLines: MapLine[] = simRoute.length > 1
    ? [{ id: 'route', points: simRoute.map(wp => [wp.lon, wp.lat] as [number, number]), color: simKind === 'sid' ? '#16a34a' : '#dc2626' }]
    : [];

  const switchSimKind = (k: SimKind) => {
    setSimKind(k);
    if (k === 'iap' || k === 'holding') {
      const names = proceduresIndexApi.transitionNamesFor(procIndex, selected, SIM_KIND_TO_PROC_TYPE[k]);
      setRawTransition(names[0] ?? '');
      return;
    }
    if (!routes) return;
    const names = Object.keys(k === 'sid' ? routes.sidRoutes : routes.starRoutes);
    setSimTransition(names[0] ?? '');
  };

  const isSimRawKind = simKind === 'iap' || simKind === 'holding';
  const simPanelTransitionNames = isSimRawKind
    ? proceduresIndexApi.transitionNamesFor(procIndex, selected, SIM_KIND_TO_PROC_TYPE[simKind])
    : simTransitionNames;

  const rawTypesAvailable = useMemo(
    () => PROC_TYPES.filter(pt => proceduresIndexApi.transitionNamesFor(procIndex, selected, pt).length > 0),
    [procIndex, selected]
  );
  const rawTransitionNames = useMemo(
    () => proceduresIndexApi.transitionNamesFor(procIndex, selected, procType),
    [procIndex, selected, procType]
  );
  const switchProcType = (pt: ProcedureType) => {
    setProcType(pt);
    setRawTransition(proceduresIndexApi.transitionNamesFor(procIndex, selected, pt)[0] ?? '');
  };
  const rawOverlays: GeoJsonOverlay[] = rawTrack && activeRawType
    ? [{ id: `raw-${activeRawType}`, data: rawTrack, color: proceduresIndexApi.procedureColor(activeRawType), lineWidth: 2.5, circleRadius: 4 }]
    : [];

  return (
    <div>
      <ScenarioDataTabs />
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>Routes / Airways</h1>
          </div>
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            style={{ padding: '10px 14px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none', fontWeight: 600 }}
          >
            {icaos.map(icao => <option key={icao} value={icao}>{icao}{isSim(icao) ? ' (SIM)' : ''}</option>)}
          </select>
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '16px' }}>{error}</div>}
        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</div>
        ) : isSim(selected) && routes ? (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px' }}>
            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
                {(['sid', 'star', ...simExtraKinds] as SimKind[]).map(k => {
                  const label = k === 'sid' ? 'SID (cất cánh)' : k === 'star' ? 'STAR (hạ cánh)' : PROC_TYPE_LABEL[SIM_KIND_TO_PROC_TYPE[k]];
                  const color = k === 'sid' || k === 'star' ? 'var(--primary)' : proceduresIndexApi.procedureColor(SIM_KIND_TO_PROC_TYPE[k]);
                  return (
                    <button
                      key={k}
                      onClick={() => switchSimKind(k)}
                      style={{
                        flex: 1, minWidth: '90px', padding: '12px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                        background: simKind === k ? 'var(--primary-light)' : 'transparent',
                        color: simKind === k ? color : 'var(--text-muted)',
                        borderBottom: simKind === k ? `2px solid ${color}` : '2px solid transparent',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {simPanelTransitionNames.map(name => (
                <div
                  key={name}
                  onClick={() => (isSimRawKind ? setRawTransition(name) : setSimTransition(name))}
                  style={{
                    padding: '12px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '13.5px',
                    color: (isSimRawKind ? rawTransition : simTransition) === name ? 'var(--primary)' : 'var(--text)',
                    backgroundColor: (isSimRawKind ? rawTransition : simTransition) === name ? 'var(--primary-light)' : 'transparent',
                    borderLeft: (isSimRawKind ? rawTransition : simTransition) === name ? '3px solid var(--primary)' : '3px solid transparent',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {name}
                </div>
              ))}
              {simPanelTransitionNames.length === 0 && (
                <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '13px' }}>{t('common.noData')}</div>
              )}
            </div>

            {isSimRawKind ? (
              <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: '20px' }}>
                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '18px 20px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                    <strong style={{ color: proceduresIndexApi.procedureColor(SIM_KIND_TO_PROC_TYPE[simKind]) }}>{PROC_TYPE_LABEL[SIM_KIND_TO_PROC_TYPE[simKind]]}</strong>
                    {rawTransition && <> — <strong>{rawTransition}</strong></>}
                    {rawTrack && <span style={{ color: 'var(--text-muted)' }}> · {rawTrack.features.length} đoạn track thật</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Dữ liệu thô từ KMZ AIP — chỉ có hình học track, chưa có bảng waypoint/độ cao/tốc độ theo thứ tự.
                  </div>
                </div>
                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '16px' }}>
                  {detailLoading ? (
                    <div style={{ color: 'var(--text-muted)', padding: '20px' }}>{t('common.loading')}</div>
                  ) : (
                    <OfflineMapView key={`sim-raw-${selected}-${simKind}-${rawTransition}`} overlays={rawOverlays} height="480px" />
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: '20px' }}>
                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-surface)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>#</th>
                        <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Waypoint</th>
                        <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Lat / Lon</th>
                        <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Altitude</th>
                        <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Speed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simRoute.map((wp, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ padding: '9px 16px', fontWeight: 600, color: 'var(--text)' }}>{wp.name}</td>
                          <td style={{ padding: '9px 16px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{wp.lat.toFixed(4)}, {wp.lon.toFixed(4)}</td>
                          <td style={{ padding: '9px 16px', color: 'var(--text)' }}>{wp.altFt ? `${wp.altFt.toLocaleString()} ft` : '—'}</td>
                          <td style={{ padding: '9px 16px', color: 'var(--text)' }}>{wp.spdKt ? `${wp.spdKt} kt` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '16px' }}>
                  <OfflineMapView key={`sim-${selected}`} markers={simMarkers} lines={simLines} height="420px" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px' }}>
            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
                {rawTypesAvailable.map(pt => (
                  <button
                    key={pt}
                    onClick={() => switchProcType(pt)}
                    style={{
                      flex: 1, minWidth: '70px', padding: '10px 6px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '12.5px',
                      background: procType === pt ? 'var(--primary-light)' : 'transparent',
                      color: procType === pt ? proceduresIndexApi.procedureColor(pt) : 'var(--text-muted)',
                      borderBottom: procType === pt ? `2px solid ${proceduresIndexApi.procedureColor(pt)}` : '2px solid transparent',
                    }}
                  >
                    {pt}
                  </button>
                ))}
              </div>
              <div style={{ maxHeight: '560px', overflowY: 'auto' }}>
                {rawTransitionNames.map(name => (
                  <div
                    key={name}
                    onClick={() => setRawTransition(name)}
                    style={{
                      padding: '12px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '13.5px',
                      color: rawTransition === name ? 'var(--primary)' : 'var(--text)',
                      backgroundColor: rawTransition === name ? 'var(--primary-light)' : 'transparent',
                      borderLeft: rawTransition === name ? '3px solid var(--primary)' : '3px solid transparent',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {name}
                  </div>
                ))}
                {rawTransitionNames.length === 0 && (
                  <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '13px' }}>{t('common.noData')}</div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: '20px' }}>
              <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '18px 20px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                  <strong style={{ color: proceduresIndexApi.procedureColor(procType) }}>{PROC_TYPE_LABEL[procType]}</strong>
                  {rawTransition && <> — <strong>{rawTransition}</strong></>}
                  {rawTrack && <span style={{ color: 'var(--text-muted)' }}> · {rawTrack.features.length} đoạn track thật</span>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Dữ liệu thô từ KMZ AIP — chưa có bảng waypoint/độ cao/tốc độ theo thứ tự như VVNB/VVGB, chỉ có hình học track.
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '16px' }}>
                {detailLoading ? (
                  <div style={{ color: 'var(--text-muted)', padding: '20px' }}>{t('common.loading')}</div>
                ) : (
                  <OfflineMapView key={`raw-${selected}-${procType}-${rawTransition}`} overlays={rawOverlays} height="480px" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoutesAirwaysPage;
