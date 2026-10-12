import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { replayApi } from '../services/replayApi';
import { replayEngine } from '../utils/replayEngine';
import {
  ReplayRecordingSummary,
  ReplayDataset,
  ReplayAircraftFrame
} from '../types/replay';
import { RecordingBrowser } from '../modules/replay/RecordingBrowser';
import { ReplayMapViewer } from '../modules/replay/ReplayMapViewer';
import { ReplayTimelineControls } from '../modules/replay/ReplayTimelineControls';
import { ReplayDetailPanel } from '../modules/replay/ReplayDetailPanel';
import { logger } from '../utils/Logger';
import { useI18n } from '../i18n';

const ReplayPage: React.FC = () => {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  // Selected Recording State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dataset, setDataset] = useState<ReplayDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Playback States
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentT, setCurrentT] = useState(0);
  const [startT, setStartT] = useState(0);
  const [endT, setEndT] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [selectedCallsign, setSelectedCallsign] = useState<string | null>(null);

  // Interval Ref
  const timerRef = useRef<any>(null);

  // Parse query string on mount and location changes
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const recordingId = params.get('recordingId');
    if (recordingId) {
      setSelectedId(recordingId);
      loadDataset(recordingId);
    }
  }, [location.search]);

  // Load the full replay dataset from backend API
  const loadDataset = async (recordingId: string) => {
    setLoading(true);
    setError(null);
    setIsPlaying(false);
    setSelectedCallsign(null);
    setDataset(null);

    try {
      logger.info('ReplayPage', `Loading dataset for recording ID: ${recordingId}`);
      const data = await replayApi.getReplayDataset(recordingId);
      
      if (!data.trackSamples || data.trackSamples.length === 0) {
        logger.warn('ReplayPage', 'Recording track file is missing or empty.');
      }

      setDataset(data);

      // Determine starting time t range
      const { startT: minTime, endT: maxTime } = replayEngine.getReplayTimeRange(
        data.trackSamples,
        data.events,
        data.commands,
        data.conflicts
      );

      setStartT(minTime);
      setEndT(maxTime);
      setCurrentT(minTime);
      
      logger.info('ReplayPage', `Replay loaded. Time range: ${minTime}s to ${maxTime}s.`);
    } catch (err: any) {
      logger.error('ReplayPage', 'Error loading recording dataset', err);
      setError(err.message || 'Could not load replay dataset.');
    } finally {
      setLoading(false);
    }
  };

  // Group track samples by callsign for linear interpolation
  const groupedSamples = useMemo(() => {
    if (!dataset || !dataset.trackSamples) return {};
    return replayEngine.groupSamplesByCallsign(dataset.trackSamples);
  }, [dataset]);

  // Interpolated aircraft frames for the current time t
  const currentFrames = useMemo(() => {
    if (!dataset) return [];
    return replayEngine.buildCurrentFrames(groupedSamples, currentT);
  }, [groupedSamples, currentT, dataset]);

  // Playback timer engine logic
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = 100; // Tick every 100ms for high-performance updates
      const deltaSec = intervalMs / 1000;

      timerRef.current = setInterval(() => {
        setCurrentT(prev => {
          const next = prev + deltaSec * playbackRate;
          if (next >= endT) {
            setIsPlaying(false);
            return endT;
          }
          return next;
        });
      }, intervalMs);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPlaying, playbackRate, endT]);

  // Handlers for Timeline controls
  const handlePlayPause = () => {
    if (currentT >= endT) {
      setCurrentT(startT);
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (t: number) => {
    const bounded = Math.max(startT, Math.min(endT, t));
    setCurrentT(bounded);
  };

  const handleStepForward = () => {
    handleSeek(currentT + 5);
  };

  const handleStepBackward = () => {
    handleSeek(currentT - 5);
  };

  const handleReset = () => {
    setCurrentT(startT);
    setIsPlaying(false);
  };

  const handleSelectRecording = (recordingId: string) => {
    setSelectedId(recordingId);
  };

  const handleLoadRecording = (recordingId: string) => {
    // Navigate to query string to trigger loading
    navigate(`/replay?recordingId=${recordingId}`);
  };

  // Large dataset warning
  const isLargeDataset = dataset && dataset.trackSamples && dataset.trackSamples.length > 100000;

  return (
    <div style={{
      height: 'calc(100vh - 65px)',
      display: 'flex',
      backgroundColor: '#0a0a0c',
      color: '#e2e8f0',
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      
      {/* 1. Left Panel: Recording Browser */}
      <div style={{
        width: '320px',
        borderRight: '1px solid #333',
        backgroundColor: '#111115',
        display: 'flex',
        flexDirection: 'column',
        padding: '15px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
          <i className="fa-solid fa-folder-open" style={{ color: '#64b5f6', fontSize: '18px' }}></i>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: 'var(--text)' }}>Recording Browser</h3>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <RecordingBrowser
            selectedId={selectedId}
            onSelect={handleSelectRecording}
            onLoad={handleLoadRecording}
          />
        </div>
      </div>

      {/* 2. Center & Right Main container */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        backgroundColor: '#08080a',
        padding: '15px',
        gap: '15px'
      }}>
        
        {/* Header Metadata Display / Legal disclaimer bar */}
        <div style={{
          backgroundColor: '#111115',
          border: '1px solid #333',
          borderRadius: '8px',
          padding: '12px 15px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: 'var(--text)' }}>
                {dataset?.metadata.scenarioName || 'ATC Replay Terminal'}
              </h2>
              <span style={{
                fontSize: '10px',
                backgroundColor: 'rgba(239, 83, 80, 0.1)',
                border: '1px solid rgba(239, 83, 80, 0.3)',
                color: '#ef5350',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 'bold',
                textTransform: 'uppercase'
              }}>
                Non-Operational
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              This system is generated from fast-time simulation recording logs. Analytical decision-support only. Not an operational display.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {dataset && (
              <>
                <span>Samples: <strong>{dataset.trackSamples.length}</strong></span>
                <span>•</span>
                <span>Conflicts: <strong>{dataset.conflicts.length}</strong></span>
              </>
            )}
            {selectedId && (
              <button
                onClick={() => navigate(`/kpi-reports?recordingId=${selectedId}`)}
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'var(--text)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  transition: 'background-color 0.2s',
                  marginLeft: '15px',
                  fontFamily: 'sans-serif'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary-light)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--primary)')}
              >
                📊 Open KPI Reports
              </button>
            )}
          </div>
        </div>

        {/* Mid Area: Map & Tabbed details panel */}
        <div style={{ flex: 1, display: 'flex', gap: '15px', minHeight: 0 }}>
          
          {/* Map Viewer */}
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
            
            {loading && (
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(10, 10, 12, 0.95)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                zIndex: 10,
                gap: '12px'
              }}>
                <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '32px', color: '#64b5f6' }}></i>
                <div style={{ fontSize: '13px', color: '#64b5f6', fontWeight: 'bold' }}>Loading saved recording streams...</div>
              </div>
            )}

            {error && (
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(10, 10, 12, 0.95)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                zIndex: 10,
                padding: '20px',
                textAlign: 'center',
                gap: '12px'
              }}>
                <i className="fa-solid fa-circle-exclamation" style={{ fontSize: '36px', color: '#ef5350' }}></i>
                <div style={{ fontSize: '14px', color: '#ef5350', fontWeight: 'bold' }}>{error}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Please check connection or verify simulation recording ID exists.</div>
              </div>
            )}

            {!dataset && !loading && !error && (
              <div style={{
                flex: 1,
                border: '1px dashed #444',
                borderRadius: '8px',
                backgroundColor: '#111115',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '15px'
              }}>
                <i className="fa-solid fa-plane-slash" style={{ fontSize: '48px', color: 'var(--input-border)' }}></i>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-muted)', fontSize: '14px' }}>No Replay Active</div>
                  <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>Select a simulation run from the left panel to initialize.</div>
                </div>
              </div>
            )}

            {dataset && !loading && !error && (
              <>
                {/* Large dataset alert */}
                {isLargeDataset && (
                  <div style={{
                    position: 'absolute',
                    top: '60px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'rgba(255, 183, 77, 0.1)',
                    border: '1px solid rgba(255, 183, 77, 0.3)',
                    color: '#ffb74d',
                    padding: '4px 12px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    pointerEvents: 'none',
                    zIndex: 5,
                    backdropFilter: 'blur(3px)'
                  }}>
                    <i className="fa-solid fa-triangle-exclamation"></i> Large dataset ({dataset.trackSamples.length} lines). Performance is optimized.
                  </div>
                )}

                {/* Empty tracks warning */}
                {dataset.trackSamples.length === 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '15px',
                    left: '15px',
                    right: '15px',
                    backgroundColor: 'rgba(239, 83, 80, 0.1)',
                    border: '1px solid rgba(239, 83, 80, 0.3)',
                    color: '#ef5350',
                    padding: '8px 15px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    zIndex: 5,
                    pointerEvents: 'none'
                  }}>
                    <i className="fa-solid fa-circle-exclamation"></i> <strong>Replay track is empty:</strong> No aircraft flight logs were captured during this recording. Check recording setup.
                  </div>
                )}

                <ReplayMapViewer
                  currentFrames={currentFrames}
                  trackSamples={dataset.trackSamples}
                  selectedCallsign={selectedCallsign}
                  onSelectAircraft={setSelectedCallsign}
                />
              </>
            )}
          </div>

          {/* Details & Logs tabbed panel */}
          <div style={{ width: '350px', flexShrink: 0 }}>
            <ReplayDetailPanel
              metadata={dataset?.metadata || null}
              currentFrames={currentFrames}
              events={dataset?.events || []}
              commands={dataset?.commands || []}
              conflicts={dataset?.conflicts || []}
              currentT={currentT}
              selectedCallsign={selectedCallsign}
              onSelectCallsign={setSelectedCallsign}
            />
          </div>
        </div>

        {/* Timeline Control bar */}
        {dataset && !loading && !error && (
          <ReplayTimelineControls
            currentT={currentT}
            startT={startT}
            endT={endT}
            isPlaying={isPlaying}
            playbackRate={playbackRate}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onStepForward={handleStepForward}
            onStepBackward={handleStepBackward}
            onRateChange={setPlaybackRate}
            onReset={handleReset}
          />
        )}

      </div>
    </div>
  );
};

export default ReplayPage;
