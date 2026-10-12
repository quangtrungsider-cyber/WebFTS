import React, { useState, useEffect } from 'react';

interface Dataset {
  id: string;
  name: string;
  status: string;
  airportCount: number;
  vietnamAirportCount: number;
  featureCounts: any;
  warnings: string[];
  updatedAt: string;
}

export const AerodromeLayoutTab = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [datasetName, setDatasetName] = useState('Vietnam X-Plane Aerodrome Layout');
  const [airports, setAirports] = useState<any[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);

  const fetchDatasets = async () => {
    try {
      const res = await fetch('/api/aerodrome-layout/datasets');
      if (res.ok) setDatasets(await res.json());
      
      const activeRes = await fetch('/api/aerodrome-layout/active');
      if (activeRes.ok) {
        const active = await activeRes.json();
        setActiveDatasetId(active.activeDatasetId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDatasets();
  }, []);

  const handleDiscover = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/aerodrome-layout/discover');
      if (res.ok) {
        const data = await res.json();
        setDiscoverResult(data);
        if (data.selectedPath) setSelectedPath(data.selectedPath);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedPath) return;
    setImporting(true);
    try {
      const res = await fetch('/api/aerodrome-layout/import-xplane', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath: selectedPath, datasetName })
      });
      if (res.ok) {
        alert("Import started in background. Refresh datasets later.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setImporting(false);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      const res = await fetch(`/api/aerodrome-layout/datasets/${id}/activate`, { method: 'POST' });
      if (res.ok) {
        fetchDatasets();
        alert("Dataset activated for Live Simulation");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadAirports = async (id: string) => {
    try {
      const res = await fetch(`/api/aerodrome-layout/datasets/${id}/airports`);
      if (res.ok) {
        setAirports(await res.json());
        setSelectedDataset(id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600 }}>Quản lý sơ đồ mặt đất sân bay (Aerodrome Layout)</h3>
      
      {/* Discovery Panel */}
      <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#020617', borderRadius: '8px', border: '1px solid #1e293b' }}>
        <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc' }}>Source Discovery</h4>
        <button 
          onClick={handleDiscover} disabled={loading}
          style={{ padding: '8px 16px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', marginBottom: '12px' }}
        >
          {loading ? 'Scanning...' : 'Discover X-Plane Data'}
        </button>

        {discoverResult && (
          <div style={{ marginTop: '12px' }}>
            {discoverResult.candidatePaths.length > 0 ? (
              <div>
                <p style={{ color: '#94a3b8', fontSize: '13px' }}>Found candidate paths:</p>
                <select 
                  value={selectedPath} onChange={e => setSelectedPath(e.target.value)}
                  style={{ width: '100%', padding: '8px', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '4px', marginBottom: '12px' }}
                >
                  {discoverResult.candidatePaths.map((p: any) => (
                    <option key={p.path} value={p.path}>{p.path} ({Math.round(p.confidence*100)}% match)</option>
                  ))}
                </select>
                <input 
                  type="text" value={datasetName} onChange={e => setDatasetName(e.target.value)}
                  placeholder="Dataset Name"
                  style={{ width: '100%', padding: '8px', background: '#0f172a', color: 'white', border: '1px solid #334155', borderRadius: '4px', marginBottom: '12px', boxSizing: 'border-box' }}
                />
                <button 
                  onClick={handleImport} disabled={importing}
                  style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {importing ? 'Importing...' : 'Import Vietnam Airports'}
                </button>
              </div>
            ) : (
              <p style={{ color: '#ef4444', fontSize: '13px' }}>No paths found. Please check your data directory.</p>
            )}
          </div>
        )}
      </div>

      {/* Dataset List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, color: '#f8fafc' }}>Extracted Datasets</h4>
          <button onClick={fetchDatasets} style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '13px' }}>🔄 Refresh</button>
        </div>
        
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
              <th style={{ padding: '8px' }}>Name</th>
              <th style={{ padding: '8px' }}>Airports</th>
              <th style={{ padding: '8px' }}>Features</th>
              <th style={{ padding: '8px' }}>Status</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {datasets.map(ds => (
              <tr key={ds.id} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={{ padding: '8px' }}>
                  <div style={{ fontWeight: 600 }}>{ds.name}</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>{new Date(ds.updatedAt).toLocaleString()}</div>
                </td>
                <td style={{ padding: '8px' }}>{ds.vietnamAirportCount}</td>
                <td style={{ padding: '8px', fontSize: '12px', color: '#94a3b8' }}>
                  RWY: {ds.featureCounts?.runways || 0} | TWY: {ds.featureCounts?.taxiways || 0}
                </td>
                <td style={{ padding: '8px' }}>
                  {activeDatasetId === ds.id ? (
                    <span style={{ color: '#10b981', fontWeight: 600 }}>ACTIVE</span>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>{ds.status.toUpperCase()}</span>
                  )}
                </td>
                <td style={{ padding: '8px', textAlign: 'right' }}>
                  <button onClick={() => loadAirports(ds.id)} style={{ marginRight: '8px', padding: '4px 8px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '4px', cursor: 'pointer' }}>View Airports</button>
                  {activeDatasetId !== ds.id && (
                    <button onClick={() => handleActivate(ds.id)} style={{ padding: '4px 8px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Activate</button>
                  )}
                </td>
              </tr>
            ))}
            {datasets.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>No datasets found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Airports List */}
      {selectedDataset && (
        <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#020617', borderRadius: '8px', border: '1px solid #1e293b' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#f8fafc' }}>Airports in Dataset</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
            {airports.map(apt => (
              <div key={apt.icao} style={{ padding: '8px', border: '1px solid #334155', borderRadius: '4px', backgroundColor: '#0f172a' }}>
                <div style={{ fontWeight: 600, color: '#facc15' }}>{apt.icao}</div>
                <div style={{ fontSize: '11px', color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{apt.name}</div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                  R: {apt.features?.runways} | A: {apt.features?.aprons} | T: {apt.features?.taxiways}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
