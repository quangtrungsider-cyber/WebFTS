import React, { useEffect, useMemo, useState } from 'react';
import { airportProceduresApi } from '../services/airportProceduresApi';
import { AirportWaypoint } from '../types/models';
import { useI18n } from '../i18n';
import ScenarioDataTabs from '../components/ScenarioDataTabs';
import OfflineMapView, { MapMarker } from '../components/OfflineMapView';

const WaypointsPage = () => {
  const { t } = useI18n();
  const [icaos, setIcaos] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [waypoints, setWaypoints] = useState<AirportWaypoint[]>([]);
  const [search, setSearch] = useState('');
  const [activeWp, setActiveWp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    airportProceduresApi.listAirports()
      .then(list => {
        setIcaos(list);
        if (list.length > 0) setSelected(list[0]);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setActiveWp(null);
    airportProceduresApi.getWaypoints(selected).then(setWaypoints).catch(e => setError(e.message));
  }, [selected]);

  const filtered = useMemo(
    () => waypoints.filter(w => w.name.toLowerCase().includes(search.toLowerCase())),
    [waypoints, search]
  );

  const markers: MapMarker[] = filtered.map(w => ({
    id: w.name, lat: w.lat, lon: w.lon, label: w.name, active: w.name === activeWp,
  }));
  const activeCoords = activeWp ? waypoints.find(w => w.name === activeWp) : undefined;

  return (
    <div>
      <ScenarioDataTabs />
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>Waypoints</h1>
          </div>
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            style={{ padding: '10px 14px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none', fontWeight: 600 }}
          >
            {icaos.map(icao => <option key={icao} value={icao}>{icao}</option>)}
          </select>
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '16px' }}>{error}</div>}
        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Tìm waypoint theo tên..."
                  style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '6px', outline: 'none' }}
                />
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Tổng cộng {filtered.length}/{waypoints.length} waypoint
                </div>
              </div>
              <div style={{ maxHeight: '560px', overflowY: 'auto' }}>
                {filtered.map(w => (
                  <div
                    key={w.name}
                    onClick={() => setActiveWp(w.name)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', padding: '10px 16px', cursor: 'pointer',
                      backgroundColor: activeWp === w.name ? 'var(--primary-light)' : 'transparent',
                      borderLeft: activeWp === w.name ? '3px solid var(--primary)' : '3px solid transparent',
                      borderBottom: '1px solid var(--border)', fontSize: '13.5px',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: activeWp === w.name ? 'var(--primary)' : 'var(--text)' }}>{w.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '12px' }}>
                      {w.lat.toFixed(4)}, {w.lon.toFixed(4)}
                    </span>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '13px' }}>Không tìm thấy waypoint.</div>
                )}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '16px' }}>
              <OfflineMapView
                markers={markers}
                center={activeCoords ? [activeCoords.lon, activeCoords.lat] : undefined}
                zoom={activeCoords ? 10 : undefined}
                onMarkerClick={setActiveWp}
                height="620px"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WaypointsPage;
