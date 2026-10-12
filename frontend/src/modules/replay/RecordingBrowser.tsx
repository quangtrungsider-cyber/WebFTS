import React, { useState, useEffect } from 'react';
import { ReplayRecordingSummary } from '../../types/replay';
import { replayApi } from '../../services/replayApi';
import { logger } from '../../utils/Logger';

interface RecordingBrowserProps {
  selectedId: string | null;
  onSelect: (recordingId: string) => void;
  onLoad: (recordingId: string) => void;
}

export const RecordingBrowser: React.FC<RecordingBrowserProps> = ({
  selectedId,
  onSelect,
  onLoad
}) => {
  const [recordings, setRecordings] = useState<ReplayRecordingSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'scenario'>('newest');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    replayApi.getRecordings()
      .then(data => {
        setRecordings(data);
        setError(null);
      })
      .catch(err => {
        logger.error('RecordingBrowser', 'Error fetching recordings', err);
        setError('Could not load simulation recordings list.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Filter recordings
  const filtered = recordings.filter(r => {
    const q = searchQuery.toLowerCase();
    return (
      r.recordingId.toLowerCase().includes(q) ||
      (r.scenarioName || '').toLowerCase().includes(q) ||
      (r.scenarioFileName || '').toLowerCase().includes(q) ||
      (r.scenarioBaseName || '').toLowerCase().includes(q)
    );
  });

  // Sort recordings
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime();
    } else if (sortBy === 'oldest') {
      return new Date(a.startedAt || 0).getTime() - new Date(b.startedAt || 0).getTime();
    } else {
      return (a.scenarioName || '').localeCompare(b.scenarioName || '');
    }
  });

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return 'N/A';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString();
    } catch {
      return isoStr;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '15px' }}>
      {/* Search & Sort controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <input
          type="text"
          placeholder="Search recordings..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            backgroundColor: '#151515',
            border: '1px solid #333',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '13px'
          }}
        />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#888' }}>Sort:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            style={{
              flex: 1,
              padding: '4px 8px',
              backgroundColor: '#151515',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '12px'
            }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="scenario">Scenario Name</option>
          </select>
        </div>
      </div>

      {/* Recording list container */}
      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #333', borderRadius: '4px', backgroundColor: '#151515', minHeight: '200px' }}>
        {loading && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#ffb74d' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }}></i> Loading recordings...
          </div>
        )}
        
        {error && (
          <div style={{ padding: '15px', color: '#e57373', fontSize: '13px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {!loading && !error && sorted.length === 0 && (
          <div style={{ padding: '30px 15px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
            No simulation recordings found. Start a recording from Live Simulation Console first.
          </div>
        )}

        {!loading && !error && sorted.map(r => {
          const isSelected = selectedId === r.recordingId;
          return (
            <div
              key={r.recordingId}
              onClick={() => onSelect(r.recordingId)}
              style={{
                padding: '12px',
                borderBottom: '1px solid #222',
                cursor: 'pointer',
                backgroundColor: isSelected ? 'rgba(100, 181, 246, 0.08)' : 'transparent',
                borderLeft: isSelected ? '4px solid #64b5f6' : '4px solid transparent',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={e => {
                if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
              }}
              onMouseLeave={e => {
                if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div style={{ fontWeight: 'bold', color: isSelected ? '#64b5f6' : '#fff', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '170px' }}>
                  {r.scenarioName || 'Unnamed Scenario'}
                </span>
                <span style={{
                  fontSize: '10px',
                  backgroundColor: r.status === 'stopped' ? 'rgba(76,175,80,0.2)' : 'rgba(255,152,0,0.2)',
                  color: r.status === 'stopped' ? '#4caf50' : '#ff9800',
                  padding: '1px 6px',
                  borderRadius: '3px'
                }}>
                  {r.status || 'recording'}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px', fontFamily: 'monospace' }}>
                ID: {r.recordingId}
              </div>
              <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                Start: {formatDate(r.startedAt)}
              </div>
              
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px', fontSize: '10px', color: '#64b5f6' }}>
                <span><i className="fa-solid fa-plane"></i> {r.sampleCount ?? 0} samples</span>
                <span><i className="fa-solid fa-triangle-exclamation"></i> {r.conflictCount ?? 0} conflicts</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action button */}
      <button
        disabled={!selectedId}
        onClick={() => selectedId && onLoad(selectedId)}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: selectedId ? '#388e3c' : '#2e2e2e',
          color: selectedId ? '#fff' : '#888',
          border: 'none',
          borderRadius: '4px',
          cursor: selectedId ? 'pointer' : 'not-allowed',
          fontWeight: 'bold',
          fontSize: '13px',
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={e => {
          if (selectedId) e.currentTarget.style.backgroundColor = '#2e7d32';
        }}
        onMouseLeave={e => {
          if (selectedId) e.currentTarget.style.backgroundColor = '#388e3c';
        }}
      >
        <i className="fa-solid fa-circle-play" style={{ marginRight: '6px' }}></i> Load Replay
      </button>
    </div>
  );
};
