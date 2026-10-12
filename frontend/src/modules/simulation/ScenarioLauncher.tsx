import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactDOM from 'react-dom';
import { scenarioFileApi, ScenarioFile } from '../../services/scenarioFileApi';
import { recordingApi } from '../../services/recordingApi';
import { AircraftTrackSample, SimulationEvent, CommandLogEntry, ConflictLogEntry, RecordingStatus } from '../../types/models';
import PlaybackTimeline from '../../ui/PlaybackTimeline';
import { useAuth } from '../../auth/AuthProvider';

const ScenarioLauncher: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialFile = searchParams.get('scenarioFile');
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission('scenarios.write');

  const [files, setFiles] = useState<ScenarioFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Visibility states
  const [isLauncherOpen, setIsLauncherOpen] = useState(false); // Closed by default -- only opens when the "Scenario Launcher" sidebar button is clicked, same as Recorder/Replay below
  const [isRecorderOpen, setIsRecorderOpen] = useState(false); // Closed by default
  const [isTimelineOpen, setIsTimelineOpen] = useState(false); // Closed by default

  const [sidebarContainer, setSidebarContainer] = useState<HTMLDivElement | null>(null);
  const [showScnModal, setShowScnModal] = useState(false);
  const [scnContent, setScnContent] = useState('');
  const [scnEditContent, setScnEditContent] = useState('');
  const [scnSaving, setScnSaving] = useState(false);
  const [scnSaveError, setScnSaveError] = useState('');
  const [showRunConfirm, setShowRunConfirm] = useState(false);
  const [pendingRunCmd, setPendingRunCmd] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Simulation Recording States
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);

  // Refs for high performance buffering
  const samplesRef = useRef<AircraftTrackSample[]>([]);
  const eventsRef = useRef<SimulationEvent[]>([]);
  const commandsRef = useRef<CommandLogEntry[]>([]);
  const conflictsRef = useRef<ConflictLogEntry[]>([]);

  const recordingStatusRef = useRef<RecordingStatus>('idle');
  const recordingIdRef = useRef<string | null>(null);
  const lastFlushTimeRef = useRef<number>(0);
  const activeConflictsRef = useRef<Set<string>>(new Set());

  // Keep refs in sync with state
  useEffect(() => {
    recordingStatusRef.current = recordingStatus;
  }, [recordingStatus]);

  useEffect(() => {
    recordingIdRef.current = currentRecordingId;
  }, [currentRecordingId]);

  // Auto-open recorder panel when simulation recording starts!
  useEffect(() => {
    if (recordingStatus === 'recording') {
      setIsRecorderOpen(true);
    }
  }, [recordingStatus]);

  // Clean up sendCommand monkeypatch on unmount
  useEffect(() => {
    return () => {
      const appInstance = (window as any).app;
      if (appInstance && (window as any)._originalSendCommand) {
        appInstance.sendCommand = (window as any)._originalSendCommand;
        delete (window as any)._originalSendCommand;
      }
    };
  }, []);

  // Format recording elapsed time
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0')
    ].join(':');
  };

  // Flush buffers function
  const flushBuffers = async () => {
    const recId = recordingIdRef.current;
    if (!recId) return;

    const samplesToFlush = [...samplesRef.current];
    const eventsToFlush = [...eventsRef.current];
    const commandsToFlush = [...commandsRef.current];
    const conflictsToFlush = [...conflictsRef.current];

    // Clear local buffers immediately to prevent double sends
    samplesRef.current = [];
    eventsRef.current = [];
    commandsRef.current = [];
    conflictsRef.current = [];

    try {
      if (samplesToFlush.length > 0) {
        await recordingApi.appendSamples(recId, samplesToFlush);
      }
      if (eventsToFlush.length > 0) {
        await recordingApi.appendEvents(recId, eventsToFlush);
      }
      if (commandsToFlush.length > 0) {
        await recordingApi.appendCommands(recId, commandsToFlush);
      }
      if (conflictsToFlush.length > 0) {
        await recordingApi.appendConflicts(recId, conflictsToFlush);
      }
    } catch (err: any) {
      console.error("Failed to flush telemetry buffers:", err);
    }
  };

  // Start simulation recording
  const startRecording = async () => {
    try {
      const selectedFile = files.find(f => f.fileName === selectedFileName);
      const payload = {
        scenarioFileName: selectedFile ? selectedFile.fileName : undefined,
        scenarioBaseName: selectedFile ? selectedFile.baseName || selectedFile.fileName.replace(/\.scn$/i, '') : undefined,
        icCommand: selectedFile ? selectedFile.icCommand.replace(/\.scn$/i, '') : undefined,
        route: "/simulations/live"
      };

      if (!selectedFile) {
        alert("Warning: No scenario selected. Recording will be saved without scenario binding.");
      }

      setRecordingStatus('recording');
      setRecordingDuration(0);
      setSampleCount(0);
      setEventCount(0);

      // Clear refs
      samplesRef.current = [];
      eventsRef.current = [];
      commandsRef.current = [];
      conflictsRef.current = [];
      activeConflictsRef.current.clear();
      lastFlushTimeRef.current = Date.now();

      const res = await recordingApi.createRecording(payload);
      setCurrentRecordingId(res.recordingId);

      const simTime = (window as any).app?.getStateManager()?.getSimulationTime() || 0;
      const startEvent: SimulationEvent = {
        type: "recording_started",
        wallClock: new Date().toISOString(),
        t: simTime,
        message: "Recording started",
        data: payload
      };
      eventsRef.current.push(startEvent);
      setEventCount(1);

      // Monkeypatch sendCommand on global window.app
      const appInstance = (window as any).app;
      if (appInstance) {
        const originalSendCommand = appInstance.sendCommand;
        (window as any)._originalSendCommand = originalSendCommand;
        appInstance.sendCommand = (command: string) => {
          if (recordingIdRef.current) {
            const currentTime = appInstance.getStateManager()?.getSimulationTime() || 0;
            
            const newCmd: CommandLogEntry = {
              t: currentTime,
              wallClock: new Date().toISOString(),
              command: command,
              source: "command_console",
              sent: true
            };
            commandsRef.current.push(newCmd);

            const newEvent: SimulationEvent = {
              type: "command_sent",
              wallClock: new Date().toISOString(),
              t: currentTime,
              message: `Command sent: ${command}`,
              data: { command }
            };
            eventsRef.current.push(newEvent);
            setEventCount(prev => prev + 1);
          }
          return originalSendCommand.call(appInstance, command);
        };
      }
    } catch (err: any) {
      setRecordingStatus('failed');
      alert(`Failed to start recording: ${err.message}`);
    }
  };

  // Stop simulation recording
  const stopRecording = async () => {
    const recId = currentRecordingId;
    if (!recId) return;

    try {
      const simTime = (window as any).app?.getStateManager()?.getSimulationTime() || 0;
      const stopEvent: SimulationEvent = {
        type: "recording_stopped",
        wallClock: new Date().toISOString(),
        t: simTime,
        message: "Recording stopped"
      };
      eventsRef.current.push(stopEvent);

      // Restore sendCommand
      const appInstance = (window as any).app;
      if (appInstance && (window as any)._originalSendCommand) {
        appInstance.sendCommand = (window as any)._originalSendCommand;
        delete (window as any)._originalSendCommand;
      }

      await flushBuffers();
      await recordingApi.stopRecording(recId);
      setRecordingStatus('stopped');
    } catch (err: any) {
      setRecordingStatus('failed');
      alert(`Failed to stop recording: ${err.message}`);
    }
  };

  // Timer effect for elapsed duration and track position sampling
  useEffect(() => {
    let interval: any = null;
    if (recordingStatus === 'recording') {
      interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);

        const appInstance = (window as any).app;
        if (appInstance) {
          const state = appInstance.getState();
          const ac = state?.aircraftData;
          const simTime = appInstance.getStateManager()?.getSimulationTime() || 0;

          if (ac && ac.id && ac.id.length > 0) {
            const newSamples: AircraftTrackSample[] = [];
            for (let i = 0; i < ac.id.length; i++) {
              const callsign = ac.id[i];
              if (!callsign || callsign.trim() === '') continue;

              const isConflict = ac.inconf ? ac.inconf[i] : false;

              // Capture conflict states
              if (isConflict) {
                if (!activeConflictsRef.current.has(callsign)) {
                  activeConflictsRef.current.add(callsign);

                  const conflictEvent: SimulationEvent = {
                    type: "conflict",
                    wallClock: new Date().toISOString(),
                    t: simTime,
                    message: `Separation warning: Aircraft ${callsign} in conflict`,
                    data: { callsign }
                  };
                  eventsRef.current.push(conflictEvent);
                  setEventCount(prev => prev + 1);

                  const conflictLog: ConflictLogEntry = {
                    t: simTime,
                    wallClock: new Date().toISOString(),
                    callsign1: callsign,
                    callsign2: "UNKNOWN",
                    horizontalNm: 3.0,
                    verticalFt: 1000,
                    severity: "warning",
                    status: "active"
                  };
                  conflictsRef.current.push(conflictLog);
                }
              } else {
                activeConflictsRef.current.delete(callsign);
              }

              newSamples.push({
                t: simTime,
                wallClock: new Date().toISOString(),
                callsign,
                lat: ac.lat[i],
                lon: ac.lon[i],
                altitudeFt: ac.alt ? ac.alt[i] : null,
                speedKt: ac.tas ? ac.tas[i] : null,
                headingDeg: ac.trk ? ac.trk[i] : null,
                verticalSpeedFpm: ac.vs ? ac.vs[i] : null,
                status: 'active',
                conflictStatus: isConflict ? 'conflict' : 'normal',
                source: 'live_simulation'
              });
            }

            if (newSamples.length > 0) {
              samplesRef.current.push(...newSamples);
              setSampleCount(samplesRef.current.length);
            }
          }
        }

        // Periodic flush check
        const nowTime = Date.now();
        if (nowTime - lastFlushTimeRef.current >= 5000 || samplesRef.current.length >= 500) {
          flushBuffers();
          lastFlushTimeRef.current = nowTime;
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recordingStatus]);

  // Dragging states for Launcher Panel
  const [launcherPos, setLauncherPos] = useState({ x: 265, y: 15 });
  const [isLauncherDragging, setIsLauncherDragging] = useState(false);
  const [launcherDragStart, setLauncherDragStart] = useState({ x: 0, y: 0 });

  // Dragging states for Recorder Panel
  const [recorderPos, setRecorderPos] = useState({ x: 265, y: 395 });
  const [isRecorderDragging, setIsRecorderDragging] = useState(false);
  const [recorderDragStart, setRecorderDragStart] = useState({ x: 0, y: 0 });

  // Dragging handler for Launcher Panel
  const handleLauncherMouseDown = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).tagName === 'BUTTON' ||
      (e.target as HTMLElement).tagName === 'INPUT' ||
      (e.target as HTMLElement).closest('button')
    ) {
      return;
    }
    setIsLauncherDragging(true);
    setLauncherDragStart({
      x: e.clientX - launcherPos.x,
      y: e.clientY - launcherPos.y
    });
  };

  // Dragging handler for Recorder Panel
  const handleRecorderMouseDown = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).tagName === 'BUTTON' ||
      (e.target as HTMLElement).closest('button')
    ) {
      return;
    }
    setIsRecorderDragging(true);
    setRecorderDragStart({
      x: e.clientX - recorderPos.x,
      y: e.clientY - recorderPos.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isLauncherDragging) {
        setLauncherPos({
          x: e.clientX - launcherDragStart.x,
          y: e.clientY - launcherDragStart.y
        });
      }
      if (isRecorderDragging) {
        setRecorderPos({
          x: e.clientX - recorderDragStart.x,
          y: e.clientY - recorderDragStart.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsLauncherDragging(false);
      setIsRecorderDragging(false);
    };

    if (isLauncherDragging || isRecorderDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isLauncherDragging, launcherDragStart, isRecorderDragging, recorderDragStart]);

  // Inject trigger button into legacy left sidebar (.left-panel)
  useEffect(() => {
    const injectBtn = () => {
      const leftPanel = document.querySelector('.left-panel');
      if (leftPanel) {
        if (document.getElementById('simulation-launcher-sidebar-btns-container')) return;

        const container = document.createElement('div');
        container.id = 'simulation-launcher-sidebar-btns-container';
        container.style.width = '100%';
        container.style.padding = '0';
        container.style.margin = '0';
        leftPanel.insertBefore(container, leftPanel.firstChild);
        setSidebarContainer(container);
      }
    };

    injectBtn();
    const timer = setTimeout(injectBtn, 100);

    return () => {
      clearTimeout(timer);
      const container = document.getElementById('simulation-launcher-sidebar-btns-container');
      if (container) {
        container.remove();
      }
    };
  }, []);

  useEffect(() => {
    loadFiles();
  }, []);

  // Sync selectedFileName with initialFile parameter (handles both .scn and bare stem name)
  useEffect(() => {
    if (initialFile && files.length > 0) {
      const cleanParam = initialFile.toLowerCase().endsWith('.scn') ? initialFile.slice(0, -4) : initialFile;
      const matched = files.find(f => {
        const cleanFile = f.fileName.toLowerCase().endsWith('.scn') ? f.fileName.slice(0, -4) : f.fileName;
        return cleanFile === cleanParam;
      });
      if (matched) {
        setSelectedFileName(matched.fileName);
      }
    }
  }, [initialFile, files]);

  const loadFiles = () => {
    setLoading(true);
    scenarioFileApi.getScenarioFiles()
      .then(data => setFiles(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  const selectedFile = files.find(f => f.fileName === selectedFileName);

  const filteredFiles = files.filter(f => f.fileName.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleViewScn = () => {
    if (!selectedFileName) return;
    scenarioFileApi.getScenarioFileContent(selectedFileName)
      .then(data => {
        setScnContent(data.scnContent);
        setScnEditContent(data.scnContent);
        setScnSaveError('');
        setShowScnModal(true);
      })
      .catch(err => alert(err.message));
  };

  const handleSaveScn = async () => {
    if (!selectedFileName) return;
    setScnSaving(true);
    setScnSaveError('');
    try {
      await scenarioFileApi.updateScenarioFileContent(selectedFileName, scnEditContent);
      setScnContent(scnEditContent);
    } catch (e) {
      setScnSaveError((e as Error).message);
    } finally {
      setScnSaving(false);
    }
  };

  const handleDeleteScn = async () => {
    if (!selectedFileName) return;
    if (!window.confirm(`Xóa kịch bản "${selectedFileName}"? Hành động này không thể hoàn tác.`)) return;
    try {
      await scenarioFileApi.deleteScenarioFile(selectedFileName);
      setSelectedFileName(null);
      loadFiles();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => alert(`Copied: ${text}`))
      .catch(() => alert('Failed to copy'));
  };

  const getCommandInput = (): HTMLInputElement | null => {
    return document.getElementById('console-input') as HTMLInputElement;
  };

  const formatFileDate = (isoString: string): string => {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const mo = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${hh}:${mm} ${dd}/${mo}/${yyyy}`;
  };

  const handleImportScenarioClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportScenarioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.scn')) {
      alert('Chỉ chấp nhận file .scn');
      return;
    }

    const existing = files.find(f => f.fileName.toLowerCase() === file.name.toLowerCase());
    if (existing && !window.confirm(`Đã tồn tại kịch bản "${file.name}" trên server. Ghi đè?`)) {
      return;
    }

    setUploading(true);
    try {
      const result = await scenarioFileApi.uploadScenarioFile(file);
      loadFiles();
      setSelectedFileName(result.file.fileName);
    } catch (err) {
      alert(`Import kịch bản thất bại: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const doRunIC = async (cleanCmd: string) => {
    const input = getCommandInput();
    if (input) {
      // Populate the console input for a visual record, but send the
      // command ourselves below so we can surface a clear error if the
      // simulation engine isn't actually there to receive it.
      input.value = cleanCmd;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    try {
      const response = await fetch('/api/simulation/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cleanCmd })
      });
      const result = await response.json();
      if (!result.success) {
        alert(
          `Failed to run scenario "${cleanCmd}":\n\n${result.error || 'Command failed'}\n\n` +
          `If this persists, check that the simulation engine (Vatm-Engine) is still running -- ` +
          `it may have crashed. Restarting the application usually resolves this.`
        );
        return;
      }
    } catch (err: any) {
      alert(`Failed to run scenario "${cleanCmd}": ${err.message}`);
      return;
    }

    if (recordingStatusRef.current === 'recording') {
      const simTime = (window as any).app?.getStateManager()?.getSimulationTime() || 0;
      const cmdLog: CommandLogEntry = {
        t: simTime,
        wallClock: new Date().toISOString(),
        command: cleanCmd,
        source: "scenario_launcher",
        sent: true
      };
      commandsRef.current.push(cmdLog);

      const runEvent: SimulationEvent = {
        type: "ic_command_sent",
        wallClock: new Date().toISOString(),
        t: simTime,
        message: `IC command executed: ${cleanCmd}`,
        data: { command: cleanCmd }
      };
      eventsRef.current.push(runEvent);
      setEventCount(prev => prev + 1);
    }
  };

  const handleRunIC = () => {
    if (!selectedFile) return;
    const cleanCmd = selectedFile.icCommand.replace(/\.scn$/i, '');
    setPendingRunCmd(cleanCmd);
    setShowRunConfirm(true);
  };

  // Render trigger buttons inside legacy sidebar via Portal
  const sidebarBtnsPortal = sidebarContainer ? ReactDOM.createPortal(
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '8px', padding: '12px 0 4px 0', boxSizing: 'border-box' }}>
      
      {/* Styles for premium sidebar buttons */}
      <style dangerouslySetInnerHTML={{__html: `
        .premium-sidebar-btn {
          width: calc(100% - 24px);
          margin: 0 12px;
          padding: 10px 14px;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.06);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: bold;
          font-size: 11px;
          letter-spacing: 0.3px;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          outline: none;
        }

        .btn-launcher-theme {
          background: linear-gradient(135deg, rgba(20, 30, 45, 0.95), rgba(10, 15, 25, 0.98));
          color: #e2e8f0;
          border-left: 3px solid #00ccff;
        }
        .btn-launcher-theme:hover {
          background: linear-gradient(135deg, rgba(0, 204, 255, 0.1), rgba(10, 15, 25, 0.98));
          border-left: 3px solid #00e5ff;
          box-shadow: 0 0 12px rgba(0, 204, 255, 0.25);
          transform: translateY(-1px);
        }
        .btn-launcher-theme.active {
          background: linear-gradient(135deg, rgba(0, 204, 255, 0.18), rgba(10, 15, 25, 0.98));
          box-shadow: 0 0 15px rgba(0, 204, 255, 0.35);
          border-left: 3px solid #00ccff;
        }

        .btn-recorder-theme {
          background: linear-gradient(135deg, rgba(20, 30, 45, 0.95), rgba(10, 15, 25, 0.98));
          color: #e2e8f0;
          border-left: 3px solid #ff4d4d;
        }
        .btn-recorder-theme:hover {
          background: linear-gradient(135deg, rgba(255, 77, 77, 0.1), rgba(10, 15, 25, 0.98));
          border-left: 3px solid #ff6666;
          box-shadow: 0 0 12px rgba(255, 77, 77, 0.25);
          transform: translateY(-1px);
        }
        .btn-recorder-theme.active {
          background: linear-gradient(135deg, rgba(255, 77, 77, 0.18), rgba(10, 15, 25, 0.98));
          box-shadow: 0 0 15px rgba(255, 77, 77, 0.35);
          border-left: 3px solid #ff4d4d;
        }

        .btn-replay-theme {
          background: linear-gradient(135deg, rgba(20, 30, 45, 0.95), rgba(10, 15, 25, 0.98));
          color: #e2e8f0;
          border-left: 3px solid #ffb900;
        }
        .btn-replay-theme:hover {
          background: linear-gradient(135deg, rgba(255, 185, 0, 0.1), rgba(10, 15, 25, 0.98));
          border-left: 3px solid #ffd000;
          box-shadow: 0 0 12px rgba(255, 185, 0, 0.25);
          transform: translateY(-1px);
        }
        .btn-replay-theme.active {
          background: linear-gradient(135deg, rgba(255, 185, 0, 0.18), rgba(10, 15, 25, 0.98));
          box-shadow: 0 0 15px rgba(255, 185, 0, 0.35);
          border-left: 3px solid #ffb900;
        }

        .pulsing-dot-sidebar {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: #ff4d4d;
          box-shadow: 0 0 8px #ff4d4d;
          animation: pulse-dot-sidebar-key 1s infinite alternate;
        }
        @keyframes pulse-dot-sidebar-key {
          from { transform: scale(0.9); opacity: 0.6; }
          to { transform: scale(1.2); opacity: 1; box-shadow: 0 0 12px #ff4d4d; }
        }
      `}} />

      {/* Button 1: Scenario Launcher */}
      <button
        onClick={() => setIsLauncherOpen(prev => !prev)}
        className={`premium-sidebar-btn btn-launcher-theme ${isLauncherOpen ? 'active' : ''}`}
      >
        <span style={{ fontSize: '14px', filter: 'drop-shadow(0 0 4px #00ccff)' }}>📁</span>
        <span style={{ flex: 1 }}>Scenario Launcher</span>
        <i className={`fa-solid ${isLauncherOpen ? 'fa-chevron-left' : 'fa-chevron-right'}`} style={{ fontSize: '10px', opacity: 0.6 }}></i>
      </button>

      {/* Button 2: Simulation Recorder */}
      <button
        onClick={() => setIsRecorderOpen(prev => !prev)}
        className={`premium-sidebar-btn btn-recorder-theme ${isRecorderOpen ? 'active' : ''}`}
      >
        {recordingStatus === 'recording' ? (
          <div className="pulsing-dot-sidebar" style={{ marginRight: '2px' }} />
        ) : (
          <span style={{ fontSize: '14px', filter: 'drop-shadow(0 0 4px #ff4d4d)' }}>🔴</span>
        )}
        <span style={{ flex: 1 }}>Simulation Recorder</span>
        {recordingStatus === 'recording' && (
          <span style={{ fontSize: '9px', backgroundColor: 'rgba(255,77,77,0.2)', color: '#ff4d4d', padding: '1px 5px', borderRadius: '4px', marginRight: '4px' }}>REC</span>
        )}
        <i className={`fa-solid ${isRecorderOpen ? 'fa-chevron-left' : 'fa-chevron-right'}`} style={{ fontSize: '10px', opacity: 0.6 }}></i>
      </button>

      {/* Button 3: Simulation Replay (Playback Timeline) */}
      <button
        onClick={() => setIsTimelineOpen(prev => !prev)}
        className={`premium-sidebar-btn btn-replay-theme ${isTimelineOpen ? 'active' : ''}`}
      >
        <span style={{ fontSize: '14px', filter: 'drop-shadow(0 0 4px #ffb900)' }}>⏱</span>
        <span style={{ flex: 1 }}>Simulation Replay</span>
        <i className={`fa-solid ${isTimelineOpen ? 'fa-chevron-down' : 'fa-chevron-up'}`} style={{ fontSize: '10px', opacity: 0.6 }}></i>
      </button>

    </div>,
    sidebarContainer
  ) : null;

  return (
    <>
      {/* Sidebar buttons rendered via portal */}
      {sidebarBtnsPortal}

      {/* Playback Timeline – fixed bar at bottom of screen */}
      {isTimelineOpen && <PlaybackTimeline onClose={() => setIsTimelineOpen(false)} />}

      {/* Panel 1: Floating Draggable Scenario Launcher */}
      {isLauncherOpen && (
        <div style={{
          position: 'absolute',
          top: `${launcherPos.y}px`,
          left: `${launcherPos.x}px`,
          zIndex: 1000,
          width: '400px',
          backgroundColor: 'rgba(20, 20, 20, 0.95)',
          border: '1px solid rgba(0, 204, 255, 0.25)',
          borderRadius: '8px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 120px)',
          backdropFilter: 'blur(10px)',
          userSelect: isLauncherDragging ? 'none' : 'auto'
        }}>
          {/* Header */}
          <div
            onMouseDown={handleLauncherMouseDown}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 18px',
              borderBottom: '1px solid rgba(0, 204, 255, 0.15)',
              backgroundColor: 'rgba(30, 30, 30, 0.8)',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
              cursor: 'move'
            }}
          >
            <h3 style={{ margin: 0, fontSize: '13px', color: '#00ccff', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              <span>📁</span> Scenario Launcher
            </h3>
            <button
              onClick={() => setIsLauncherOpen(false)}
              style={{
                backgroundColor: 'transparent',
                color: '#ff4d4d',
                border: 'none',
                cursor: 'pointer',
                fontSize: '22px',
                fontWeight: 'bold',
                padding: '0 5px',
                lineHeight: '1',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ff1a1a'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#ff4d4d'}
              title="Close"
            >
              &times;
            </button>
          </div>

          {/* Search & List */}
          <div style={{ padding: '15px' }}>
            <input
              placeholder="Search scenarios..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', backgroundColor: '#111', color: 'white',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', marginBottom: '12px',
                boxSizing: 'border-box', outline: 'none', fontSize: '12px', transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = '#00ccff'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
            />

            <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #333', borderRadius: '6px', backgroundColor: '#141414' }}>
              {loading ? <div style={{ padding: '12px', color: '#888', fontSize: '12px' }}>Loading...</div> : null}
              {error ? <div style={{ padding: '12px', color: '#f44336', fontSize: '12px' }}>{error}</div> : null}
              {!loading && !error && filteredFiles.length === 0 ? (
                <div style={{ padding: '12px', color: '#888', fontSize: '12px' }}>No scenario files found. Export .scn from Scenario Builder.</div>
              ) : null}
              {filteredFiles.map(f => (
                <div
                  key={f.fileName}
                  onClick={() => setSelectedFileName(f.fileName)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '10px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #222',
                    backgroundColor: selectedFileName === f.fileName ? 'rgba(0, 204, 255, 0.15)' : 'transparent',
                    color: selectedFileName === f.fileName ? '#00ccff' : '#ccc',
                    fontWeight: selectedFileName === f.fileName ? 'bold' : 'normal',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedFileName !== f.fileName) {
                      e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)';
                      e.currentTarget.style.color = '#fff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedFileName !== f.fileName) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#ccc';
                    }
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fileName}</span>
                  <span style={{ flexShrink: 0, fontSize: '10px', color: '#777', fontFamily: 'monospace' }}>
                    {formatFileDate(f.updatedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Details & Actions */}
          {selectedFile && (
            <div style={{ padding: '0 15px 15px 15px', borderTop: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.01)', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '6px', fontSize: '12px', color: '#aaa', margin: '12px 0 8px 0' }}>
                <span style={{ fontWeight: 'bold' }}>Selected file:</span>
                <span style={{ color: '#fff', fontFamily: 'monospace' }}>{selectedFile.fileName}</span>
                <span style={{ fontWeight: 'bold' }}>Base name:</span>
                <span style={{ color: '#fff', fontFamily: 'monospace' }}>{selectedFile.baseName || selectedFile.fileName.replace(/\.scn$/i, '')}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#888', margin: '10px 0 6px 0', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Command:</div>
              <div style={{
                backgroundColor: '#050505', color: '#00ffcc', fontFamily: 'monospace', padding: '10px 14px',
                borderRadius: '6px', fontSize: '13px', marginBottom: '15px', border: '1px solid rgba(0, 255, 204, 0.15)',
                userSelect: 'all', wordBreak: 'break-all'
              }}>
                {selectedFile.icCommand.replace(/\.scn$/i, '')}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  onClick={handleViewScn}
                  style={{
                    padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.05)', color: '#eee',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '11px', fontWeight: 'bold', transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  }}
                >
                  {isAdmin ? 'View / Edit .scn' : 'View .scn'}
                </button>

                {isAdmin ? (
                  <button
                    onClick={handleDeleteScn}
                    style={{
                      padding: '8px 12px', backgroundColor: 'rgba(244,67,54,0.12)', color: '#ef5350',
                      border: '1px solid rgba(244,67,54,0.3)', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '11px', fontWeight: 'bold', transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(244,67,54,0.22)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(244,67,54,0.12)';
                    }}
                  >
                    Xóa kịch bản
                  </button>
                ) : (
                  <button
                    onClick={() => copyToClipboard(selectedFile.icCommand.replace(/\.scn$/i, ''))}
                    style={{
                      padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.05)', color: '#eee',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '11px', fontWeight: 'bold', transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    }}
                  >
                    Copy Command
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".scn"
                  style={{ display: 'none' }}
                  onChange={handleImportScenarioFile}
                />
                <button
                  onClick={handleImportScenarioClick}
                  disabled={uploading}
                  style={{
                    padding: '8px 12px', backgroundColor: uploading ? '#0d3a5c' : '#1976d2', color: 'white',
                    border: 'none', borderRadius: '6px', cursor: uploading ? 'default' : 'pointer',
                    fontSize: '11px', fontWeight: 'bold', transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.backgroundColor = '#1565c0'; }}
                  onMouseLeave={(e) => { if (!uploading) e.currentTarget.style.backgroundColor = '#1976d2'; }}
                >
                  {uploading ? 'Đang import...' : 'Import kịch bản'}
                </button>
                <button
                  onClick={handleRunIC}
                  style={{
                    padding: '8px 12px', backgroundColor: '#2e7d32', color: 'white',
                    border: 'none', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '11px', fontWeight: 'bold', transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1b5e20'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2e7d32'}
                >
                  Run IC
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Panel 2: Floating Draggable Simulation Recorder */}
      {isRecorderOpen && (
        <div style={{
          position: 'absolute',
          top: `${recorderPos.y}px`,
          left: `${recorderPos.x}px`,
          zIndex: 1000,
          width: '400px',
          backgroundColor: 'rgba(20, 20, 20, 0.95)',
          border: '1px solid rgba(255, 77, 77, 0.25)',
          borderRadius: '8px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          backdropFilter: 'blur(10px)',
          userSelect: isRecorderDragging ? 'none' : 'auto'
        }}>
          {/* Styles for recorder pulsing effects */}
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes pulse-rec-key {
              0% { opacity: 0.4; }
              50% { opacity: 1; }
              100% { opacity: 0.4; }
            }
            .rec-pulsing-effect {
              animation: pulse-rec-key 1.5s infinite;
            }
          `}} />

          {/* Header */}
          <div
            onMouseDown={handleRecorderMouseDown}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 18px',
              borderBottom: '1px solid rgba(255, 77, 77, 0.15)',
              backgroundColor: 'rgba(30, 30, 30, 0.8)',
              borderTopLeftRadius: '8px',
              borderTopRightRadius: '8px',
              cursor: 'move'
            }}
          >
            <h3 style={{ margin: 0, fontSize: '13px', color: '#ff4d4d', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              <span className={recordingStatus === 'recording' ? 'rec-pulsing-effect' : ''}>🔴</span> Simulation Recorder
            </h3>
            <button
              onClick={() => setIsRecorderOpen(false)}
              style={{
                backgroundColor: 'transparent',
                color: '#ff4d4d',
                border: 'none',
                cursor: 'pointer',
                fontSize: '22px',
                fontWeight: 'bold',
                padding: '0 5px',
                lineHeight: '1',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ff1a1a'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#ff4d4d'}
              title="Close"
            >
              &times;
            </button>
          </div>

          {/* Content Body */}
          <div style={{ padding: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff' }}>Status</span>
              <span style={{
                fontSize: '11px',
                fontWeight: 'bold',
                padding: '2px 8px',
                borderRadius: '12px',
                textTransform: 'uppercase',
                backgroundColor: 
                  recordingStatus === 'recording' ? 'rgba(255, 77, 77, 0.15)' :
                  recordingStatus === 'stopped' ? 'rgba(255, 165, 0, 0.15)' :
                  recordingStatus === 'failed' ? 'rgba(244, 67, 54, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                color:
                  recordingStatus === 'recording' ? '#ff4d4d' :
                  recordingStatus === 'stopped' ? '#ffa500' :
                  recordingStatus === 'failed' ? '#f44336' : '#888'
              }}>
                {recordingStatus}
              </span>
            </div>

            {/* Statistics */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              backgroundColor: 'rgba(0,0,0,0.3)',
              padding: '10px',
              borderRadius: '6px',
              marginBottom: '12px',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <div>
                <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', fontWeight: '500' }}>Duration</div>
                <div style={{ fontSize: '16px', fontFamily: 'monospace', fontWeight: 'bold', color: '#00ffcc' }}>
                  {formatDuration(recordingDuration)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', fontWeight: '500' }}>Telemetry Samples</div>
                <div style={{ fontSize: '16px', fontFamily: 'monospace', fontWeight: 'bold', color: '#fff' }}>
                  {sampleCount} <span style={{ fontSize: '10px', color: '#888', fontWeight: 'normal' }}>({eventCount} evts)</span>
                </div>
              </div>
            </div>

            {currentRecordingId && (
              <div style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#888',
                backgroundColor: 'rgba(0,0,0,0.2)',
                padding: '6px 8px',
                borderRadius: '4px',
                marginBottom: '12px',
                wordBreak: 'break-all',
                border: '1px solid rgba(255,255,255,0.02)'
              }}>
                ID: {currentRecordingId}
              </div>
            )}

            {/* Record buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <button
                onClick={startRecording}
                disabled={recordingStatus === 'recording'}
                style={{
                  padding: '8px 6px',
                  backgroundColor: recordingStatus === 'recording' ? '#1a1a1a' : 'rgba(255, 77, 77, 0.15)',
                  color: recordingStatus === 'recording' ? '#444' : '#ff4d4d',
                  border: '1px solid ' + (recordingStatus === 'recording' ? '#222' : 'rgba(255, 77, 77, 0.3)'),
                  borderRadius: '6px',
                  cursor: recordingStatus === 'recording' ? 'default' : 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                Record
              </button>
              
              <button
                onClick={stopRecording}
                disabled={recordingStatus !== 'recording'}
                style={{
                  padding: '8px 6px',
                  backgroundColor: recordingStatus !== 'recording' ? '#1a1a1a' : 'rgba(255, 165, 0, 0.15)',
                  color: recordingStatus !== 'recording' ? '#444' : '#ffa500',
                  border: '1px solid ' + (recordingStatus !== 'recording' ? '#222' : 'rgba(255, 165, 0, 0.3)'),
                  borderRadius: '6px',
                  cursor: recordingStatus !== 'recording' ? 'default' : 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                Stop
              </button>

              <button
                onClick={() => window.open('/replay', '_blank')}
                style={{
                  padding: '8px 6px',
                  backgroundColor: 'rgba(0, 204, 255, 0.12)',
                  color: '#00ccff',
                  border: '1px solid rgba(0, 204, 255, 0.25)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                Replays
              </button>
            </div>

            {recordingStatus === 'stopped' && currentRecordingId && (
              <button
                onClick={() => window.open(`/replay?recordingId=${currentRecordingId}`, '_blank')}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(76, 175, 80, 0.2)',
                  color: '#4caf50',
                  border: '1px solid rgba(76, 175, 80, 0.4)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  marginBottom: '12px',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(76, 175, 80, 0.3)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(76, 175, 80, 0.2)'}
              >
                <i className="fa-solid fa-circle-play"></i> Open Replay
              </button>
            )}

            {/* Strict Watermark Messages */}
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.05)',
              paddingTop: '8px',
              fontSize: '9px',
              color: '#555',
              lineHeight: '1.4',
              textAlign: 'center'
            }}>
              <div>⚠️ Fast-time simulation recording for decision-support only.</div>
              <div>Not an operational ATC tool. Not for controller performance assessment.</div>
            </div>

          </div>
        </div>
      )}

      {/* Fullscreen Scn View / Edit Modal */}
      {showScnModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
          <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '8px', border: '1px solid #444', width: '80%', maxWidth: '900px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, color: '#64b5f6', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {selectedFileName}
                {isAdmin && <span style={{ fontSize: '11px', color: '#ffa726', fontWeight: 400 }}>(Admin — có thể chỉnh sửa)</span>}
              </h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {isAdmin && (
                  <button
                    onClick={handleSaveScn}
                    disabled={scnSaving || scnEditContent === scnContent}
                    style={{
                      padding: '6px 16px', fontSize: '12px', fontWeight: 'bold', borderRadius: '6px',
                      border: 'none', cursor: scnSaving || scnEditContent === scnContent ? 'default' : 'pointer',
                      backgroundColor: scnEditContent === scnContent ? '#333' : '#2e7d32',
                      color: scnEditContent === scnContent ? '#666' : 'white',
                    }}
                  >
                    {scnSaving ? 'Đang lưu…' : 'Lưu'}
                  </button>
                )}
                <button
                  onClick={() => setShowScnModal(false)}
                  style={{ backgroundColor: 'transparent', color: '#ff4d4d', border: 'none', cursor: 'pointer', fontSize: '24px', lineHeight: '1' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ff1a1a'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#ff4d4d'}
                >
                  &times;
                </button>
              </div>
            </div>
            {scnSaveError && (
              <div style={{ color: '#f44336', fontSize: '12px', marginBottom: '8px', padding: '6px 10px', backgroundColor: 'rgba(244,67,54,0.1)', borderRadius: '4px' }}>{scnSaveError}</div>
            )}
            {isAdmin ? (
              <textarea
                value={scnEditContent}
                onChange={e => setScnEditContent(e.target.value)}
                spellCheck={false}
                style={{
                  flex: 1, resize: 'none', backgroundColor: '#000', padding: '15px', borderRadius: '6px',
                  color: '#00ffcc', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #555',
                  outline: 'none', lineHeight: '1.5', minHeight: '400px',
                }}
              />
            ) : (
              <pre style={{ flex: 1, overflowY: 'auto', backgroundColor: '#000', padding: '15px', borderRadius: '6px', color: '#00ffcc', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #333', margin: 0 }}>
                {scnContent}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Run Scenario Confirmation Modal */}
      {showRunConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(3px)',
        }}>
          <div style={{
            width: '420px',
            backgroundColor: '#161616',
            border: '1px solid rgba(0,204,255,0.3)',
            borderRadius: '12px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '14px 16px',
              backgroundColor: '#1a1a2e',
              borderBottom: '1px solid rgba(0,204,255,0.15)',
            }}>
              <i className="fas fa-play-circle" style={{ color: '#00ccff', fontSize: '16px' }}></i>
              <span style={{ color: '#00ccff', fontWeight: 600, fontSize: '15px' }}>Chạy kịch bản</span>
            </div>
            {/* Body */}
            <div style={{ padding: '20px 20px 16px', color: '#e0e0e0', fontSize: '13px', lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 10px' }}>Bạn có muốn chạy kịch bản:</p>
              <div style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(0,204,255,0.07)',
                border: '1px solid rgba(0,204,255,0.2)',
                borderRadius: '6px',
                fontFamily: 'monospace',
                fontSize: '13px',
                color: '#00ccff',
                wordBreak: 'break-all',
              }}>
                {pendingRunCmd}
              </div>
            </div>
            {/* Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              padding: '12px 16px',
              backgroundColor: '#1a1a1a',
              borderTop: '1px solid #2a2a2a',
            }}>
              <button
                onClick={() => setShowRunConfirm(false)}
                style={{
                  padding: '7px 16px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: '1px solid #444',
                  backgroundColor: 'transparent',
                  color: '#aaa',
                  cursor: 'pointer',
                }}
              >
                Hủy
              </button>
              <button
                onClick={() => { setShowRunConfirm(false); doRunIC(pendingRunCmd); }}
                style={{
                  padding: '7px 16px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#00ccff',
                  color: '#000',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Chạy
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ScenarioLauncher;
