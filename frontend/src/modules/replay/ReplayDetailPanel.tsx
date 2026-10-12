import React, { useState } from 'react';
import {
  ReplayRecordingSummary,
  ReplayAircraftFrame,
  ReplayEvent,
  ReplayCommand,
  ReplayConflict
} from '../../types/replay';

interface ReplayDetailPanelProps {
  metadata: ReplayRecordingSummary | null;
  currentFrames: ReplayAircraftFrame[];
  events: ReplayEvent[];
  commands: ReplayCommand[];
  conflicts: ReplayConflict[];
  currentT: number;
  selectedCallsign: string | null;
  onSelectCallsign: (callsign: string | null) => void;
}

export const ReplayDetailPanel: React.FC<ReplayDetailPanelProps> = ({
  metadata,
  currentFrames,
  events,
  commands,
  conflicts,
  currentT,
  selectedCallsign,
  onSelectCallsign
}) => {
  const [activeTab, setActiveTab] = useState<'metadata' | 'aircraft' | 'events' | 'commands' | 'conflicts'>('metadata');

  // Format time t in seconds to HH:MM:SS
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return 'N/A';
    try {
      return new Date(isoStr).toLocaleString();
    } catch {
      return isoStr;
    }
  };

  const tabStyle = (tab: typeof activeTab) => ({
    padding: '8px 12px',
    backgroundColor: activeTab === tab ? '#1b1b1b' : 'transparent',
    color: activeTab === tab ? '#64b5f6' : '#888',
    border: 'none',
    borderBottom: activeTab === tab ? '2px solid #64b5f6' : '2px solid transparent',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '12px',
    transition: 'all 0.2s',
  });

  const getRowHighlightStyle = (t: number) => {
    const diff = Math.abs(t - currentT);
    if (diff <= 5) {
      return { backgroundColor: 'rgba(0, 255, 204, 0.08)', transition: 'background-color 0.2s' };
    }
    return {};
  };

  return (
    <div style={{
      backgroundColor: '#1b1b1b',
      border: '1px solid #333',
      borderRadius: '8px',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Navigation tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #333',
        backgroundColor: '#111',
        overflowX: 'auto',
        whiteSpace: 'nowrap'
      }}>
        <button style={tabStyle('metadata')} onClick={() => setActiveTab('metadata')}>
          <i className="fa-solid fa-circle-info"></i> Metadata
        </button>
        <button style={tabStyle('aircraft')} onClick={() => setActiveTab('aircraft')}>
          <i className="fa-solid fa-plane"></i> Aircraft ({currentFrames.length})
        </button>
        <button style={tabStyle('events')} onClick={() => setActiveTab('events')}>
          <i className="fa-solid fa-list"></i> Events ({events.length})
        </button>
        <button style={tabStyle('commands')} onClick={() => setActiveTab('commands')}>
          <i className="fa-solid fa-terminal"></i> Commands ({commands.length})
        </button>
        <button style={tabStyle('conflicts')} onClick={() => setActiveTab('conflicts')}>
          <i className="fa-solid fa-triangle-exclamation"></i> Conflicts ({conflicts.length})
        </button>
      </div>

      {/* Tab content area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
        
        {/* Tab 1: Metadata */}
        {activeTab === 'metadata' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {!metadata ? (
              <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                No recording selected or metadata is unavailable.
              </div>
            ) : (
              <>
                {/* General metadata card */}
                <div style={{ borderBottom: '1px solid #333', paddingBottom: '12px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#64b5f6', fontSize: '14px' }}>General Summary</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#ccc' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '4px 0', color: '#888', width: '130px' }}>Recording ID:</td>
                        <td style={{ padding: '4px 0', fontFamily: 'monospace' }}>{metadata.recordingId}</td>
                      </tr>
                      {metadata.runId && (
                        <tr>
                          <td style={{ padding: '4px 0', color: '#888' }}>Run ID:</td>
                          <td style={{ padding: '4px 0', fontFamily: 'monospace' }}>{metadata.runId}</td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ padding: '4px 0', color: '#888' }}>Scenario Name:</td>
                        <td style={{ padding: '4px 0', fontWeight: 'bold' }}>{metadata.scenarioName || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 0', color: '#888' }}>Scenario File:</td>
                        <td style={{ padding: '4px 0', fontFamily: 'monospace' }}>{metadata.scenarioFileName || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 0', color: '#888' }}>Scenario Base Name:</td>
                        <td style={{ padding: '4px 0', fontFamily: 'monospace', color: '#fff' }}>{metadata.scenarioBaseName || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 0', color: '#888' }}>IC Command:</td>
                        <td style={{ padding: '4px 0', fontFamily: 'monospace', color: '#00ffcc', fontWeight: 'bold' }}>{metadata.icCommand || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 0', color: '#888' }}>Status:</td>
                        <td style={{ padding: '4px 0' }}>
                          <span style={{
                            backgroundColor: metadata.status === 'stopped' ? 'rgba(76,175,80,0.2)' : 'rgba(255,152,0,0.2)',
                            color: metadata.status === 'stopped' ? '#4caf50' : '#ff9800',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold'
                          }}>
                            {metadata.status || 'recording'}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 0', color: '#888' }}>Started At:</td>
                        <td style={{ padding: '4px 0' }}>{formatDate(metadata.startedAt)}</td>
                      </tr>
                      {metadata.stoppedAt && (
                        <tr>
                          <td style={{ padding: '4px 0', color: '#888' }}>Stopped At:</td>
                          <td style={{ padding: '4px 0' }}>{formatDate(metadata.stoppedAt)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Limitations and Watermark info */}
                <div>
                  <h4 style={{ margin: '0 0 10px 0', color: '#ffb74d', fontSize: '14px' }}>Limitations & Legal Disclaimers</h4>
                  <div style={{
                    backgroundColor: 'rgba(255,183,77,0.05)',
                    border: '1px solid rgba(255,183,77,0.2)',
                    borderRadius: '4px',
                    padding: '12px',
                    fontSize: '11px',
                    color: '#ffb74d',
                    lineHeight: '1.5'
                  }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-triangle-exclamation"></i> Non-Operational / Decision Support
                    </div>
                    {metadata.limitations && metadata.limitations.length > 0 ? (
                      <ul style={{ margin: '0', paddingLeft: '15px' }}>
                        {metadata.limitations.map((lim, idx) => (
                          <li key={idx} style={{ marginBottom: '4px' }}>{lim}</li>
                        ))}
                      </ul>
                    ) : (
                      <span>This fast-time simulation replay data is for analysis and decision-support only. It is not an operational display and is not for pilot/controller licensing or individual evaluation.</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Aircraft */}
        {activeTab === 'aircraft' && (
          <div>
            {currentFrames.length === 0 ? (
              <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                No active aircraft at this time. Play or seek the slider to see traffic.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', color: '#ccc' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', color: '#888', textAlign: 'left' }}>
                    <th style={{ padding: '8px 4px' }}>Callsign</th>
                    <th style={{ padding: '8px 4px' }}>Altitude (ft)</th>
                    <th style={{ padding: '8px 4px' }}>Speed (kt)</th>
                    <th style={{ padding: '8px 4px' }}>Heading (°)</th>
                    <th style={{ padding: '8px 4px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentFrames.map(f => {
                    const isSelected = selectedCallsign === f.callsign;
                    const isConflict = f.conflictStatus === 'conflict' || f.conflictStatus === 'stca';
                    return (
                      <tr
                        key={f.callsign}
                        onClick={() => onSelectCallsign(isSelected ? null : f.callsign)}
                        style={{
                          borderBottom: '1px solid #222',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'rgba(100, 181, 246, 0.1)' : 'transparent',
                          transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <td style={{ padding: '8px 4px', fontWeight: 'bold', color: isConflict ? '#ff3333' : (isSelected ? '#64b5f6' : '#fff') }}>
                          {f.callsign} {isConflict && <i className="fa-solid fa-triangle-exclamation" title="Conflict Alert!"></i>}
                        </td>
                        <td style={{ padding: '8px 4px', fontFamily: 'monospace' }}>
                          {f.altitudeFt !== undefined && f.altitudeFt !== null ? Math.round(f.altitudeFt).toLocaleString() : 'N/A'}
                        </td>
                        <td style={{ padding: '8px 4px', fontFamily: 'monospace' }}>
                          {f.speedKt !== undefined && f.speedKt !== null ? Math.round(f.speedKt) : 'N/A'}
                        </td>
                        <td style={{ padding: '8px 4px', fontFamily: 'monospace' }}>
                          {f.headingDeg !== undefined && f.headingDeg !== null ? Math.round(f.headingDeg) : 'N/A'}
                        </td>
                        <td style={{ padding: '8px 4px', fontSize: '11px', textTransform: 'capitalize', color: f.status === 'airborne' ? '#81c784' : '#e57373' }}>
                          {f.status || 'active'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 3: Events */}
        {activeTab === 'events' && (
          <div>
            {events.length === 0 ? (
              <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                No events recorded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {events.map((e, idx) => (
                  <div
                    key={e.id || idx}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: '1px solid #333',
                      fontSize: '12px',
                      ...getRowHighlightStyle(e.t)
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '10px', marginBottom: '4px' }}>
                      <span style={{ fontFamily: 'monospace', color: '#ffb74d' }}>Time: {formatTime(e.t)} ({e.wallClock ? e.wallClock.substring(11, 19) : ''})</span>
                      <span style={{ textTransform: 'uppercase', fontWeight: 'bold', color: '#64b5f6' }}>{e.type}</span>
                    </div>
                    <div style={{ color: '#fff', lineHeight: '1.4' }}>{e.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Commands */}
        {activeTab === 'commands' && (
          <div>
            {commands.length === 0 ? (
              <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                No commands recorded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {commands.map((c, idx) => {
                  const isIc = c.command.toUpperCase().startsWith('IC');
                  return (
                    <div
                      key={c.id || idx}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #333',
                        fontSize: '12px',
                        ...getRowHighlightStyle(c.t)
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '10px', marginBottom: '4px' }}>
                        <span style={{ fontFamily: 'monospace', color: '#ffb74d' }}>Time: {formatTime(c.t)}</span>
                        <span style={{ color: c.sent ? '#81c784' : '#e57373' }}>{c.source || 'console'}</span>
                      </div>
                      <div style={{ fontFamily: 'monospace', color: isIc ? '#00ffcc' : '#fff', fontWeight: 'bold' }}>
                        {c.command}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Conflicts */}
        {activeTab === 'conflicts' && (
          <div>
            {conflicts.length === 0 ? (
              <div style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>
                No conflicts recorded for this run. Outstanding performance!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {conflicts.map((c, idx) => (
                  <div
                    key={c.id || idx}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '4px',
                      border: '1px solid rgba(255, 51, 51, 0.3)',
                      backgroundColor: 'rgba(255, 51, 51, 0.02)',
                      fontSize: '12px',
                      ...getRowHighlightStyle(c.t)
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ff8888', fontSize: '10px', marginBottom: '4px', fontWeight: 'bold' }}>
                      <span>TIME: {formatTime(c.t)}</span>
                      <span>SEVERITY: {c.severity || 'STCA'}</span>
                    </div>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
                      <span style={{ color: '#ff3333' }}>{c.callsign1}</span> vs <span style={{ color: '#ff3333' }}>{c.callsign2}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '15px', color: '#aaa', fontSize: '11px' }}>
                      <span>Sep Horiz: <strong style={{ color: '#fff' }}>{c.horizontalNm !== undefined && c.horizontalNm !== null ? c.horizontalNm.toFixed(2) : 'N/A'} NM</strong></span>
                      <span>Sep Vert: <strong style={{ color: '#fff' }}>{c.verticalFt !== undefined && c.verticalFt !== null ? Math.round(c.verticalFt) : 'N/A'} FT</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
