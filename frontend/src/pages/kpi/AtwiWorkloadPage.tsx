import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AtwiTaskDefinition,
  AtwiWorkloadModel,
  AtwiCalculationResult,
  AtwiTaskInstance,
  AtwiModelStatus,
  AtwiBand,
  AtwiPosition
} from '../../types/atwi';
import { atwiApi } from '../../services/atwiApi';
import { recordingApi } from '../../services/recordingApi';
import { scenarioFileApi } from '../../services/scenarioFileApi';
import {
  buildDefaultContextFactors,
  formatAtwiPercent,
  formatSeconds,
  getBandLabel,
  getBandDescription,
  isModelApprovedForKpi,
  getModelStatusWarning,
  buildSampleVvts52TaskInstances,
  validateAtwiModelClientSide
} from '../../utils/atwi';
import { useI18n } from '../../i18n';

const AtwiWorkloadPage: React.FC = () => {
  const { t } = useI18n();
  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Recording Analysis Tab States
  const [recordings, setRecordings] = useState<any[]>([]);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string>('');
  const [recordingWindowDuration, setRecordingWindowDuration] = useState<number>(300);
  const [recordingAnalysisResult, setRecordingAnalysisResult] = useState<any | null>(null);
  const [hoveredWindow, setHoveredWindow] = useState<any | null>(null);
  const [analyzingRecording, setAnalyzingRecording] = useState<boolean>(false);

  // Scenario Evaluation Tab States
  const [scenarioFiles, setScenarioFiles] = useState<any[]>([]);
  const [selectedScenarioFileName, setSelectedScenarioFileName] = useState<string>('');
  const [scenarioWindowDuration, setScenarioWindowDuration] = useState<number>(300);
  const [scenarioAnalysisResult, setScenarioAnalysisResult] = useState<any | null>(null);
  const [evaluatingScenario, setEvaluatingScenario] = useState<boolean>(false);

  // Core Data State
  const [models, setModels] = useState<AtwiWorkloadModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [currentModel, setCurrentModel] = useState<AtwiWorkloadModel | null>(null);
  const [taskIndex, setTaskIndex] = useState<AtwiTaskDefinition[]>([]);


  // Calculator State
  const [studyId, setStudyId] = useState<string>('study-vvts-25lr-capacity');
  const [scenarioId, setScenarioId] = useState<string>('scenario-vvts52v3nm');
  const [recordingId, setRecordingId] = useState<string>('');
  const [timeWindowStart, setTimeWindowStart] = useState<string>('00:00:00');
  const [timeWindowEnd, setTimeWindowEnd] = useState<string>('01:00:00');
  const [calculatorInputs, setCalculatorInputs] = useState<AtwiTaskInstance[]>([]);
  const [baselineScenarioCounts, setBaselineScenarioCounts] = useState<Record<string, number>>({});
  const [calculationResult, setCalculationResult] = useState<AtwiCalculationResult | null>(null);
  const [calculatorScenarioFile, setCalculatorScenarioFile] = useState<string>('');
  const [loadingScenarioCounts, setLoadingScenarioCounts] = useState<boolean>(false);
  const [calculationMode] = useState<string>('Combined workload calculation');
  const [controllerPositionId] = useState<string>('COMBINED_TMA');

  // Evaluation flow (merged Recording / Scenario File) state
  const [evalSource, setEvalSource] = useState<'recording' | 'scenario'>('recording');

  // Controller Positions admin tab state
  const [positionsList, setPositionsList] = useState<AtwiPosition[]>([]);
  const [positionIcaoFilter, setPositionIcaoFilter] = useState<string>('');
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
  const [positionForm, setPositionForm] = useState<Partial<AtwiPosition>>({
    icao: '', name: '', nameEn: '', description: '', taskCodes: [], atcoCount: 1
  });

  // Task Index Editor State
  const [editingTasks, setEditingTasks] = useState<AtwiTaskDefinition[]>([]);
  const [newTask, setNewTask] = useState<Partial<AtwiTaskDefinition>>({
    code: '',
    name: '',
    category: 'surveillance',
    baseEffortSec: 5,
    description: '',
    evidenceLevel: 'assumed',
    source: 'manual',
    notes: ''
  });

  // Parameters Edit State
  const [editModelName, setEditModelName] = useState<string>('');
  const [editModelDesc, setEditModelDesc] = useState<string>('');
  const [editAtcoCount, setEditAtcoCount] = useState<number>(1);
  const [editAvailableSec, setEditAvailableSec] = useState<number>(3600);
  const [editCoeffs, setEditCoeffs] = useState<Record<string, number>>({});
  const [editThresholds, setEditThresholds] = useState<Record<string, number>>({});
  const [editVersion, setEditVersion] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');

  // Import State
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [importFileName, setImportFileName] = useState<string>('ATWI_AI_Draft.json');
  const [importCreator, setImportCreator] = useState<string>('VATM FTS Team');
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);

  // Review & Approval Action State
  const [reviewUser, setReviewUser] = useState<string>('VATM FTS Team');
  const [reviewNotes, setReviewNotes] = useState<string>('');

  // UI Notification State
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Load baseline models and tasks
  const loadInitialData = async () => {
    try {
      setLoading(true);
      const fetchedTasks = await atwiApi.getAtwiTaskIndex();
      setTaskIndex(fetchedTasks);
      setEditingTasks(fetchedTasks);

      const fetchedModels = await atwiApi.getAtwiModels();
      setModels(fetchedModels);

      if (fetchedModels.length > 0) {
        // Prefer draft Vietnam model, fallback to first
        const defaultModel = fetchedModels.find(m => m.id === 'atwi-model-vietnam-default-draft') || fetchedModels[0];
        setSelectedModelId(defaultModel.id);
        await loadModelDetails(defaultModel.id, fetchedTasks);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to initialize ATWI data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadRecordings = async () => {
    try {
      setLoading(true);
      const list = await recordingApi.getRecordings();
      setRecordings(list);
    } catch (err: any) {
      triggerError(err.message || 'Failed to load recordings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'evaluate' && evalSource === 'recording') {
      loadRecordings();
    }
  }, [activeTab, evalSource]);

  const loadScenarioFiles = async () => {
    try {
      setLoading(true);
      const list = await scenarioFileApi.getScenarioFiles();
      setScenarioFiles(list);
    } catch (err: any) {
      triggerError(err.message || 'Failed to load scenario files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if ((activeTab === 'evaluate' && evalSource === 'scenario') || activeTab === 'calculator') {
      loadScenarioFiles();
    }
  }, [activeTab, evalSource]);

  const loadPositions = async (icao?: string) => {
    try {
      setLoading(true);
      const list = await atwiApi.getPositions(icao || undefined);
      setPositionsList(list);
    } catch (err: any) {
      triggerError(err.message || 'Failed to load controller positions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'positions') {
      loadPositions(positionIcaoFilter || undefined);
    }
  }, [activeTab, positionIcaoFilter]);

  // Human-readable recording label: "<scenario name> — <local date/time>", falling back
  // gracefully when scenario binding is missing (e.g. recordings started without selecting
  // a scenario file first).
  const formatRecordingLabel = (r: any): string => {
    const scenarioLabel = r.scenarioBaseName || r.scenarioFileName || r.scenarioName || 'Chưa gắn kịch bản';
    const dateLabel = r.startedAt ? new Date(r.startedAt).toLocaleString() : '';
    return dateLabel ? `${scenarioLabel} — ${dateLabel}` : scenarioLabel;
  };

  const handleRecordingSelectionChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const recId = e.target.value;
    setSelectedRecordingId(recId);
    setRecordingAnalysisResult(null);
    if (recId) {
      try {
        const existing = await atwiApi.getRecordingAtwiResult(recId);
        if (existing && existing.modelId === selectedModelId) {
          setRecordingAnalysisResult(existing);
        }
      } catch (err) {
        // Safe to ignore if not analyzed yet
      }
    }
  };

  const handleAnalyzeRecording = async () => {
    if (!selectedRecordingId) {
      triggerError('Please select a recording.');
      return;
    }
    if (!selectedModelId) {
      triggerError('Please select an active workload model.');
      return;
    }
    try {
      setAnalyzingRecording(true);
      setRecordingAnalysisResult(null);
      const res = await atwiApi.analyzeRecordingAtwi(
        selectedRecordingId,
        selectedModelId,
        recordingWindowDuration
      );
      setRecordingAnalysisResult(res);
      triggerSuccess('Simulation recording analyzed successfully!');
    } catch (err: any) {
      triggerError(err.message || 'Recording analysis failed');
    } finally {
      setAnalyzingRecording(false);
    }
  };


  const loadModelDetails = async (id: string, tasksContext?: AtwiTaskDefinition[]) => {
    try {
      const detailedModel = await atwiApi.getAtwiModel(id);
      setCurrentModel(detailedModel);

      // Populate Parameters Edit State
      setEditModelName(detailedModel.name);
      setEditModelDesc(detailedModel.description);
      setEditAtcoCount(detailedModel.atcoOnPosition);
      setEditAvailableSec(detailedModel.availableSecondsPerAtcoPerHour);
      setEditCoeffs({ ...detailedModel.coefficients } as any);
      setEditThresholds({ ...detailedModel.thresholds } as any);
      setEditVersion(detailedModel.metadata.version);
      setEditNotes(detailedModel.metadata.notes || '');

      // Initialize Calculator Inputs with zero counts
      const definitions = detailedModel.taskDefinitions.length > 0 
        ? detailedModel.taskDefinitions 
        : (tasksContext || taskIndex);

      const initialInputs = definitions.map(task => ({
        id: `calc-${task.id}`,
        taskDefinitionId: task.id,
        count: 0,
        contextFactors: buildDefaultContextFactors()
      }));
      setCalculatorInputs(initialInputs);
      setCalculationResult(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load model details');
    }
  };

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedModelId(id);
    if (id) {
      await loadModelDetails(id);
    } else {
      setCurrentModel(null);
    }
  };

  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 7000);
  };

  const handleEvaluateScenario = async () => {
    if (!selectedScenarioFileName) {
      triggerError('Please select a scenario file.');
      return;
    }
    if (!selectedModelId) {
      triggerError('Please select an active workload model.');
      return;
    }
    try {
      setEvaluatingScenario(true);
      setScenarioAnalysisResult(null);
      const res = await atwiApi.evaluateScenarioAtwi(
        selectedScenarioFileName,
        selectedModelId,
        scenarioWindowDuration
      );
      setScenarioAnalysisResult(res);
      triggerSuccess('Scenario evaluated offline successfully!');
    } catch (err: any) {
      triggerError(err.message || 'Scenario evaluation failed');
    } finally {
      setEvaluatingScenario(false);
    }
  };

  // Per-controller-position workload -- the primary output of the merged
  // Evaluate tab. `result.positions` is populated server-side (see
  // WebATM/server/atwi_analyzer.py analyze_recording_atwi /
  // WebATM/server/atwi_api.py evaluate_scenario_file) only when a real
  // airport was detected AND positions are defined for it; otherwise we
  // show the honest reason instead of fabricating a number.
  const renderPositionBreakdown = (result: any) => {
    const positions: any[] = result?.positions || [];
    const bandStyle = (band: string) => {
      switch (band) {
        case 'normal': return { bg: '#1b5e20', text: '#81c784', label: 'Normal' };
        case 'watch': return { bg: '#e65100', text: '#ffb74d', label: 'Watch' };
        case 'high': return { bg: '#b71c1c', text: '#e57373', label: 'High' };
        case 'critical': return { bg: '#4a0000', text: '#ff1744', label: 'CRITICAL' };
        default: return { bg: '#333', text: '#aaa', label: 'Unknown' };
      }
    };

    if (!positions || positions.length === 0) {
      return (
        <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#fff' }}>👤 Per-Controller-Position Workload</h3>
          <div style={{ backgroundColor: 'rgba(255, 152, 0, 0.08)', border: '1px solid #ff9800', borderRadius: '6px', padding: '14px 18px', fontSize: '13px', color: '#ffb74d', lineHeight: '1.6' }}>
            ⚠️ No per-position breakdown available{result?.scenarioIcao ? ` for detected airport ${result.scenarioIcao}` : ''}.
            {result?.scenarioIcao
              ? ' Define controller positions for this airport in the Controller Positions tab.'
              : " Couldn't detect this recording/scenario's airport (no 'airport' metadata field or ICAO prefix in its name)."}
          </div>
        </div>
      );
    }

    return (
      <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '24px' }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', color: '#fff' }}>👤 Per-Controller-Position Workload — {result.scenarioIcao}</h3>
        <p style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#888' }}>
          Each position's own ATCO count and task mapping, not a slice of the combined figure below.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#2a2a2a', color: '#aaa', textAlign: 'left' }}>
                <th style={{ padding: '10px' }}>Position</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>ATCO</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Overall ATWI</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Peak ATWI</th>
                <th style={{ padding: '10px' }}>Band</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p: any) => (
                <tr key={p.positionId} style={{ borderBottom: '1px solid #333' }}>
                  <td style={{ padding: '10px' }}>
                    <strong style={{ color: '#fff' }}>{p.positionName}</strong>
                    <div style={{ color: '#888', fontSize: '11px' }}>{p.positionNameEn}</div>
                    {!p.hasMappedTasks && (
                      <div style={{ color: '#ff9800', fontSize: '10.5px', marginTop: '2px' }}>⚠️ no tasks mapped yet — workload shown as 0</div>
                    )}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center', color: '#aaa' }}>{p.atcoCount}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: bandStyle(p.overallBand).text, fontWeight: 'bold' }}>
                    {p.overallAtwiPercent}%
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#aaa' }}>
                    {p.peakAtwiPercent}% {p.peakTimeLabel ? `(${p.peakTimeLabel})` : ''}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <span style={{
                      backgroundColor: bandStyle(p.overallBand).bg, color: bandStyle(p.overallBand).text,
                      padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase'
                    }}>
                      {bandStyle(p.overallBand).label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Controller Positions admin tab: CRUD over /api/atwi/positions
  const renderPositionsAdmin = () => {
    const AIRPORTS = ['VVDN', 'VVCR', 'VVTS', 'VVNB', 'VVPQ'];
    const availableTaskCodes = taskIndex.map(t => t.code);

    const resetForm = () => {
      setEditingPositionId(null);
      setPositionForm({ icao: '', name: '', nameEn: '', description: '', taskCodes: [], atcoCount: 1 });
    };

    const startEdit = (p: AtwiPosition) => {
      setEditingPositionId(p.id);
      setPositionForm({ ...p });
    };

    const toggleTaskCode = (code: string) => {
      const current = positionForm.taskCodes || [];
      setPositionForm({
        ...positionForm,
        taskCodes: current.includes(code) ? current.filter(c => c !== code) : [...current, code]
      });
    };

    const handleSavePosition = async () => {
      if (!positionForm.icao || !positionForm.name) {
        triggerError('ICAO and Name are required.');
        return;
      }
      try {
        setLoading(true);
        if (editingPositionId) {
          await atwiApi.updatePosition(editingPositionId, positionForm);
          triggerSuccess(`Position '${positionForm.name}' updated.`);
        } else {
          await atwiApi.createPosition(positionForm);
          triggerSuccess(`Position '${positionForm.name}' created.`);
        }
        resetForm();
        await loadPositions(positionIcaoFilter || undefined);
      } catch (err: any) {
        triggerError(err.message || 'Failed to save position');
      } finally {
        setLoading(false);
      }
    };

    const handleDeletePosition = async (p: AtwiPosition) => {
      try {
        setLoading(true);
        await atwiApi.deletePosition(p.id);
        triggerSuccess(`Position '${p.name}' deleted.`);
        if (editingPositionId === p.id) resetForm();
        await loadPositions(positionIcaoFilter || undefined);
      } catch (err: any) {
        triggerError(err.message || 'Failed to delete position');
      } finally {
        setLoading(false);
      }
    };

    return (
      <>
        <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>📋 Defined Positions</h3>
            <select
              value={positionIcaoFilter}
              onChange={e => setPositionIcaoFilter(e.target.value)}
              style={{ backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer' }}
            >
              <option value="">All airports</option>
              {AIRPORTS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#2a2a2a', color: '#aaa', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>ICAO</th>
                  <th style={{ padding: '8px' }}>Position</th>
                  <th style={{ padding: '8px' }}>Mapped Tasks</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>ATCO</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {positionsList.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #333' }}>
                    <td style={{ padding: '8px', color: '#aaa' }}>{p.icao}</td>
                    <td style={{ padding: '8px' }}>
                      <strong style={{ color: '#fff' }}>{p.name}</strong>
                      <div style={{ color: '#888', fontSize: '11px' }}>{p.nameEn}</div>
                    </td>
                    <td style={{ padding: '8px', color: p.taskCodes.length ? '#81c784' : '#ff9800', fontSize: '12px' }}>
                      {p.taskCodes.length ? p.taskCodes.join(', ') : 'none mapped yet'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center', color: '#aaa' }}>{p.atcoCount}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      <button onClick={() => startEdit(p)} style={{ backgroundColor: '#444', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', marginRight: '6px', fontSize: '12px' }}>✏️ Edit</button>
                      <button onClick={() => handleDeletePosition(p)} style={{ backgroundColor: '#7f1d1d', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>🗑️ Delete</button>
                    </td>
                  </tr>
                ))}
                {positionsList.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No positions defined for this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#fff' }}>{editingPositionId ? '✏️ Edit Position' : '➕ New Position'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '15px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>ICAO Airport:</label>
              <input type="text" value={positionForm.icao || ''} onChange={e => setPositionForm({ ...positionForm, icao: e.target.value.toUpperCase() })}
                placeholder="e.g. VVDN" maxLength={4}
                style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Name (Vietnamese):</label>
              <input type="text" value={positionForm.name || ''} onChange={e => setPositionForm({ ...positionForm, name: e.target.value })}
                style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Name (English / abbrev.):</label>
              <input type="text" value={positionForm.nameEn || ''} onChange={e => setPositionForm({ ...positionForm, nameEn: e.target.value })}
                placeholder="e.g. APP Executive Controller (EC)"
                style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>ATCO Count:</label>
              <input type="number" min={1} value={positionForm.atcoCount ?? 1} onChange={e => setPositionForm({ ...positionForm, atcoCount: Math.max(1, parseInt(e.target.value) || 1) })}
                style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Description / Source:</label>
            <textarea value={positionForm.description || ''} onChange={e => setPositionForm({ ...positionForm, description: e.target.value })}
              rows={3}
              style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>Mapped Task Codes (from Task Index Definition):</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {availableTaskCodes.map(code => {
                const active = (positionForm.taskCodes || []).includes(code);
                return (
                  <button key={code} onClick={() => toggleTaskCode(code)} type="button" style={{
                    padding: '5px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer',
                    border: active ? '1px solid #1976d2' : '1px solid #444',
                    backgroundColor: active ? 'rgba(25, 118, 210, 0.2)' : '#2a2a2a',
                    color: active ? '#90caf9' : '#888'
                  }}>
                    {code}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleSavePosition} style={{ backgroundColor: '#2e7d32', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
              {editingPositionId ? '💾 Save Changes' : '➕ Create Position'}
            </button>
            {editingPositionId && (
              <button onClick={resetForm} style={{ backgroundColor: '#444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </>
    );
  };

  const renderResultDetails = (result: any) => {
    if (!result) return null;
    return (
      <>
        {/* KPI Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
          {/* ATWI Load Card */}
          <div style={{ 
            backgroundColor: '#1e1e1e', 
            border: '1px solid #333', 
            borderRadius: '8px', 
            padding: '20px', 
            textAlign: 'center',
            boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
          }}>
            <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '8px' }}>
              Overall ATWI Workload
            </div>
            <div style={{ 
              fontSize: '36px', 
              fontWeight: 'bold', 
              color: getBandBadgeClass(result.overallBand).text,
              marginBottom: '8px'
            }}>
              {result.overallAtwiPercent}%
            </div>
            <span style={{ 
              backgroundColor: getBandBadgeClass(result.overallBand).bg, 
              color: getBandBadgeClass(result.overallBand).text, 
              padding: '4px 12px', 
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              border: `1px solid ${getBandBadgeClass(result.overallBand).text}`
            }}>
              {getBandBadgeClass(result.overallBand).label}
            </span>
          </div>

          {/* Total Duration Card */}
          <div style={{ 
            backgroundColor: '#1e1e1e', 
            border: '1px solid #333', 
            borderRadius: '8px', 
            padding: '20px', 
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '8px' }}>
              Simulation Duration
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>
              {formatSeconds(result.simulationDurationSec)}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Binned in {result.windowDurationSec}s windows
            </div>
          </div>

          {/* Controller Capacity Card */}
          <div style={{ 
            backgroundColor: '#1e1e1e', 
            border: '1px solid #333', 
            borderRadius: '8px', 
            padding: '20px', 
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '8px' }}>
              Capacity Normalized
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#81c784', marginBottom: '8px' }}>
              {formatSeconds(result.availableCapacitySec)}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Total available budget time
            </div>
          </div>

          {/* Active Load Card */}
          <div style={{ 
            backgroundColor: '#1e1e1e', 
            border: '1px solid #333', 
            borderRadius: '8px', 
            padding: '20px', 
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '8px' }}>
              Total Controller Load
            </div>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#64b5f6', marginBottom: '8px' }}>
              {formatSeconds(result.totalLocalizedLoadSec)}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              Sum of all derived tasks
            </div>
          </div>
        </div>

        {/* Gorgeous SVG Timeline Chart */}
        <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#fff' }}>📈 Workload Timeline Chart</h3>
          
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap-reverse' }}>
            {/* The actual SVG Chart */}
            <div style={{ flex: 3, minWidth: '300px' }}>
              <svg viewBox="0 0 1000 350" style={{ width: '100%', height: 'auto', backgroundColor: '#141414', borderRadius: '6px', border: '1px solid #222' }}>
                {/* Grid Lines */}
                <line x1="50" y1="50" x2="950" y2="50" stroke="#222" strokeDasharray="4 4" />
                <line x1="50" y1="125" x2="950" y2="125" stroke="#222" strokeDasharray="4 4" />
                <line x1="50" y1="200" x2="950" y2="200" stroke="#222" strokeDasharray="4 4" />
                <line x1="50" y1="275" x2="950" y2="275" stroke="#222" strokeDasharray="4 4" />
                <line x1="50" y1="300" x2="950" y2="300" stroke="#444" />
                <line x1="50" y1="50" x2="50" y2="300" stroke="#444" />

                {/* Y-Axis Labels */}
                <text x="40" y="55" fill="#666" fontSize="11" textAnchor="end">120%</text>
                <text x="40" y="125" fill="#666" fontSize="11" textAnchor="end">85%</text>
                <text x="40" y="200" fill="#666" fontSize="11" textAnchor="end">50%</text>
                <text x="40" y="275" fill="#666" fontSize="11" textAnchor="end">15%</text>

                {/* Dynamic Bins Rendering */}
                {result.timeseries.map((bin: any, index: number, arr: any[]) => {
                  const totalBins = arr.length;
                  const colWidth = 900 / totalBins;
                  const barWidth = Math.max(12, colWidth * 0.7);
                  const x = 50 + index * colWidth + (colWidth - barWidth) / 2;
                  
                  const scaledAtwi = Math.min(120, bin.atwiPercent);
                  const barHeight = (scaledAtwi / 120) * 250;
                  const y = 300 - barHeight;

                  const colors = getBandBadgeClass(bin.band);

                  return (
                    <g 
                      key={index}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredWindow(bin)}
                      onMouseLeave={() => setHoveredWindow(null)}
                    >
                      {/* Hover highlight bar */}
                      <rect
                        x={50 + index * colWidth}
                        y="30"
                        width={colWidth}
                        height="270"
                        fill={hoveredWindow?.windowIndex === bin.windowIndex ? 'rgba(255,255,255,0.03)' : 'transparent'}
                      />
                      
                      {/* Workload Bar */}
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        fill={colors.text}
                        opacity={hoveredWindow?.windowIndex === bin.windowIndex ? 1 : 0.85}
                        rx="3"
                      />

                      {/* Label */}
                      <text
                        x={50 + index * colWidth + colWidth/2}
                        y="320"
                        fill="#888"
                        fontSize="11"
                        textAnchor="middle"
                      >
                        {bin.timestampLabel}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '12px', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', backgroundColor: '#81c784', borderRadius: '2px' }}></div> Normal (&lt;60%)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', backgroundColor: '#ffb74d', borderRadius: '2px' }}></div> Watch (60%-75%)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', backgroundColor: '#e57373', borderRadius: '2px' }}></div> High (75%-90%)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', backgroundColor: '#ff1744', borderRadius: '2px' }}></div> Critical (&ge;90%)</div>
              </div>
            </div>

            {/* Interactive Details Sidebar */}
            <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ 
                backgroundColor: '#141414', 
                border: '1px solid #222', 
                borderRadius: '6px', 
                padding: '16px', 
                height: '100%', 
                boxSizing: 'border-box' 
              }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', borderBottom: '1px solid #222', paddingBottom: '6px', color: '#ff9800' }}>
                  ℹ️ Bin Details
                </h4>
                {hoveredWindow ? (
                  <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div><strong>Time:</strong> <span style={{ color: '#fff' }}>{hoveredWindow.timestampLabel} ({hoveredWindow.startTime}s - {hoveredWindow.endTime}s)</span></div>
                    <div><strong>Workload:</strong> <span style={{ color: getBandBadgeClass(hoveredWindow.band).text, fontWeight: 'bold' }}>{hoveredWindow.atwiPercent}%</span></div>
                    <div><strong>Aircraft in window:</strong> <span style={{ color: '#fff' }}>{hoveredWindow.activeAircraftCount} callsigns</span></div>
                    <div><strong>Total derived load:</strong> <span style={{ color: '#fff' }}>{formatSeconds(hoveredWindow.totalLocalizedLoadSec)}</span></div>
                    <div style={{ marginTop: '8px', borderTop: '1px dashed #222', paddingTop: '8px' }}>
                      <strong style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#aaa', textTransform: 'uppercase' }}>Top derived counts:</strong>
                      {hoveredWindow.taskResults.filter((t: any) => t.count > 0).slice(0, 4).map((t: any) => (
                        <div key={t.taskDefinitionId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#aaa' }}>
                          <span>{t.taskCode}:</span>
                          <span style={{ color: '#fff', fontWeight: 'bold' }}>{t.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>
                    Hover over any timeline bar on the left chart to view specific window details!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Task Breakdown list */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
          {/* Left: Task Index Weights & Contributions */}
          <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#fff' }}>📋 Aggregated Task Contributions</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {result.taskResults.map((tr: any) => (
                <div key={tr.taskDefinitionId} style={{ fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#aaa' }}>
                    <div>
                      <strong style={{ color: '#fff' }}>{tr.taskCode}</strong> - {tr.taskName}
                    </div>
                    <div>
                      <span style={{ color: '#ff9800', fontWeight: 'bold' }}>{tr.count} counts</span> ({tr.workloadSharePercent}%)
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ width: '100%', height: '6px', backgroundColor: '#222', borderRadius: '3px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${tr.workloadSharePercent}%`, 
                        height: '100%', 
                        backgroundColor: tr.category === 'surveillance' ? '#2196f3' : tr.category === 'conflict_monitoring' ? '#f44336' : '#ff9800', 
                        borderRadius: '3px' 
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Validation & Analysis Warnings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Warnings Card */}
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '24px' }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#fff' }}>⚠️ System Warnings & Fallbacks</h3>
              {result.warnings && result.warnings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {result.warnings.map((w: string, idx: number) => (
                    <div key={idx} style={{ 
                      backgroundColor: 'rgba(255, 152, 0, 0.1)', 
                      border: '1px solid #ff9800', 
                      borderRadius: '4px', 
                      padding: '8px 12px', 
                      color: '#ffb74d', 
                      fontSize: '12px' 
                    }}>
                      🔸 {w}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#81c784', fontSize: '13px' }}>
                  ✅ Analysis complete with 0 warnings. All primary track, event, conflict, and command log files parsed correctly.
                </div>
              )}
            </div>

            {/* Governance compliance info */}
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '24px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#fff' }}>🛡️ Governance Compliance</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '8px 0', color: '#888' }}>Model Name:</td>
                    <td style={{ padding: '8px 0', color: '#fff', fontWeight: 'bold' }}>{result.modelName}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '8px 0', color: '#888' }}>Version:</td>
                    <td style={{ padding: '8px 0', color: '#ff9800', fontWeight: 'bold' }}>{result.modelVersion}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '8px 0', color: '#888' }}>Status / Phase:</td>
                    <td style={{ padding: '8px 0' }}>
                      <span style={{ 
                        backgroundColor: getStatusBadge(result.modelStatus).color + '22', 
                        color: getStatusBadge(result.modelStatus).color, 
                        border: `1px solid ${getStatusBadge(result.modelStatus).color}`,
                        padding: '2px 6px', 
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase'
                      }}>
                        {getStatusBadge(result.modelStatus).label}
                      </span>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '8px 0', color: '#888' }}>Approved for Official KPI:</td>
                    <td style={{ padding: '8px 0' }}>
                      {result.approvedForKpi ? (
                        <span style={{ color: '#4caf50', fontWeight: 'bold' }}>✅ Yes (Approved)</span>
                      ) : (
                        <span style={{ color: '#f44336', fontWeight: 'bold' }}>❌ No (Draft/Preview Only)</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0', color: '#888' }}>Generated At:</td>
                    <td style={{ padding: '8px 0', color: '#aaa' }}>{new Date(result.generatedAt).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </>
    );
  };

  // Calculator Actions
  const handleLoadSample = () => {
    if (!currentModel) return;
    const defs = currentModel.taskDefinitions.length > 0 ? currentModel.taskDefinitions : taskIndex;
    const samples = buildSampleVvts52TaskInstances(defs);

    // Save baseline counts (representing 100% COMBINED_TMA counts)
    const baseline: Record<string, number> = {};
    samples.forEach(s => {
      const taskDef = defs.find(d => d.id === s.taskDefinitionId);
      if (taskDef) {
        baseline[taskDef.code.toUpperCase()] = s.count;
      }
    });
    setBaselineScenarioCounts(baseline);
    setCalculatorInputs(samples);
    triggerSuccess('Loaded VVTS 52 Movements Sample counts!');
  };

  const handleLoadFromScenarioFile = async () => {
    if (!calculatorScenarioFile) return;
    if (!selectedModelId) {
      triggerError('Please select an active workload model at the top right.');
      return;
    }
    try {
      setLoadingScenarioCounts(true);
      const res = await atwiApi.evaluateScenarioAtwi(
        calculatorScenarioFile,
        selectedModelId,
        300
      );

      if (res && res.taskResults) {
        const defs = (currentModel && currentModel.taskDefinitions && currentModel.taskDefinitions.length > 0) ? currentModel.taskDefinitions : taskIndex;

        // Save baseline counts (representing 100% COMBINED_TMA counts)
        const baseline: Record<string, number> = {};
        res.taskResults.forEach((r: any) => {
          baseline[r.taskCode.toUpperCase()] = r.count;
        });
        setBaselineScenarioCounts(baseline);

        const loadedInputs = defs.map(task => {
          const evalResult = res.taskResults.find((r: any) => r.taskCode.toUpperCase() === task.code.toUpperCase());
          const fullCount = evalResult ? evalResult.count : 0;
          return {
            id: `scenario-calc-${task.id}`,
            taskDefinitionId: task.id,
            count: fullCount,
            contextFactors: buildDefaultContextFactors()
          };
        });

        setCalculatorInputs(loadedInputs);
        const scenarioBase = calculatorScenarioFile.replace(/\.scn$/i, '');
        setStudyId(`study-${scenarioBase}`);
        setScenarioId(scenarioBase);
        
        if (res.simulationDurationSec) {
          const duration = res.simulationDurationSec;
          const hrs = Math.floor(duration / 3600);
          const mins = Math.floor((duration % 3600) / 60);
          const secs = Math.floor(duration % 60);
          const formattedEnd = [
            hrs.toString().padStart(2, '0'),
            mins.toString().padStart(2, '0'),
            secs.toString().padStart(2, '0')
          ].join(':');
          setTimeWindowStart('00:00:00');
          setTimeWindowEnd(formattedEnd);
        }
        triggerSuccess(`Loaded task counts from scenario file: ${calculatorScenarioFile}`);
      } else {
        triggerError('Failed to parse task counts from scenario evaluation.');
      }
    } catch (err: any) {
      triggerError(err.message || 'Failed to load scenario counts.');
    } finally {
      setLoadingScenarioCounts(false);
    }
  };

  const handleResetInputs = () => {
    if (!currentModel) return;
    const defs = currentModel.taskDefinitions.length > 0 ? currentModel.taskDefinitions : taskIndex;
    const reset = defs.map(task => ({
      id: `calc-${task.id}`,
      taskDefinitionId: task.id,
      count: 0,
      contextFactors: buildDefaultContextFactors()
    }));
    setBaselineScenarioCounts({});
    setCalculatorInputs(reset);
    setCalculationResult(null);
  };

  const handleCalculateAtwi = async () => {
    if (!selectedModelId) return;
    try {
      setLoading(true);
      const positionNames: Record<string, string> = {
        TSN_APP_TMA: 'Tân Sơn Nhất Approach TMA',
        LT_APP_TMA: 'Long Thành Approach TMA',
        TSN_ARR: 'Tân Sơn Nhất Arrival',
        COMBINED_TMA: 'Combined TSN & LT TMA'
      };

      const result = await atwiApi.calculateAtwi({
        modelId: selectedModelId,
        studyId,
        scenarioId,
        recordingId: recordingId || undefined,
        timeWindowStart,
        timeWindowEnd,
        taskInstances: calculatorInputs,
        controllerPositionId,
        controllerPositionName: positionNames[controllerPositionId] || controllerPositionId,
        calculationMode
      });
      setCalculationResult(result);
      triggerSuccess('ATWI Workload calculated successfully!');
    } catch (err: any) {
      triggerError(err.message || 'Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  // Task Index Editor Actions
  const handleAddTask = () => {
    if (!newTask.code || !newTask.name) {
      triggerError('Task Code and Name are required.');
      return;
    }
    const codeUpper = newTask.code.toUpperCase().replace(/\s+/g, '_');
    const existing = editingTasks.find(t => t.code === codeUpper);
    if (existing) {
      triggerError(`Task code '${codeUpper}' already exists.`);
      return;
    }

    const created: AtwiTaskDefinition = {
      id: `task-${codeUpper.toLowerCase().replace(/_/g, '-')}`,
      code: codeUpper,
      name: newTask.name,
      category: (newTask.category || 'surveillance') as any,
      baseEffortSec: Number(newTask.baseEffortSec) || 0,
      description: newTask.description || '',
      evidenceLevel: (newTask.evidenceLevel || 'assumed') as any,
      source: newTask.source || 'manual',
      notes: newTask.notes || ''
    };

    const updated = [...editingTasks, created];
    setEditingTasks(updated);

    // Reset add form
    setNewTask({
      code: '',
      name: '',
      category: 'surveillance',
      baseEffortSec: 5,
      description: '',
      evidenceLevel: 'assumed',
      source: 'manual',
      notes: ''
    });
    triggerSuccess(`Added temporary task '${codeUpper}' to index.`);
  };

  const handleUpdateTaskField = (index: number, field: keyof AtwiTaskDefinition, value: any) => {
    const copy = [...editingTasks];
    copy[index] = {
      ...copy[index],
      [field]: field === 'baseEffortSec' ? Number(value) : value
    };
    setEditingTasks(copy);
  };

  const handleDeleteTask = (index: number) => {
    const copy = [...editingTasks];
    const removed = copy.splice(index, 1)[0];
    setEditingTasks(copy);
    triggerSuccess(`Removed task '${removed.code}' from index list.`);
  };

  const handleSaveTaskIndex = async () => {
    try {
      setLoading(true);
      const saved = await atwiApi.updateAtwiTaskIndex(editingTasks);
      setTaskIndex(saved);
      setEditingTasks(saved);
      // Reload current model to pick up changes
      if (selectedModelId) {
        await loadModelDetails(selectedModelId, saved);
      }
      triggerSuccess('ATWI Task Index successfully saved to server!');
    } catch (err: any) {
      triggerError(err.message || 'Failed to save Task Index');
    } finally {
      setLoading(false);
    }
  };

  const handleResetTaskIndex = () => {
    setEditingTasks([...taskIndex]);
    triggerSuccess('Reset changes back to saved Task Index.');
  };

  // Parameters Edit Actions
  const handleSaveModelParams = async () => {
    if (!currentModel) return;
    const clientErrors = validateAtwiModelClientSide({
      name: editModelName,
      atcoOnPosition: editAtcoCount,
      availableSecondsPerAtcoPerHour: editAvailableSec,
      thresholds: editThresholds as any
    });

    if (clientErrors.length > 0) {
      triggerError(clientErrors.join(' '));
      return;
    }

    try {
      setLoading(true);
      const updated = await atwiApi.updateAtwiModel(currentModel.id, {
        name: editModelName,
        description: editModelDesc,
        atcoOnPosition: editAtcoCount,
        availableSecondsPerAtcoPerHour: editAvailableSec,
        coefficients: editCoeffs as any,
        thresholds: editThresholds as any,
        version: editVersion,
        notes: editNotes
      });
      // Refresh local model cache
      const fetchedModels = await atwiApi.getAtwiModels();
      setModels(fetchedModels);
      setCurrentModel(updated);
      triggerSuccess('Model parameters updated successfully!');
    } catch (err: any) {
      triggerError(err.message || 'Failed to save parameters');
    } finally {
      setLoading(false);
    }
  };

  const handleCloneModelParams = async () => {
    if (!currentModel) return;
    try {
      setLoading(true);
      const cloned = await atwiApi.cloneAtwiModel(currentModel.id, {
        name: `Draft Clone of ${currentModel.name}`,
        createdBy: reviewUser
      });
      const fetchedModels = await atwiApi.getAtwiModels();
      setModels(fetchedModels);
      setSelectedModelId(cloned.id);
      await loadModelDetails(cloned.id);
      triggerSuccess(`Cloned successfully! Switched to new model draft: '${cloned.name}'.`);
      setActiveTab('parameters');
    } catch (err: any) {
      triggerError(err.message || 'Failed to clone model');
    } finally {
      setLoading(false);
    }
  };

  // Import / Export Actions
  const handleValidateImport = () => {
    setImportError(null);
    setImportPreview(null);
    try {
      if (!importJsonText.trim()) {
        throw new Error('Please paste model JSON string.');
      }
      const parsed = JSON.parse(importJsonText);
      if (!parsed.name) {
        throw new Error("Missing mandatory field 'name' inside model object.");
      }
      setImportPreview(parsed);
      triggerSuccess('JSON format verified! Review the preview below and click Import.');
    } catch (err: any) {
      setImportError(err.message || 'Invalid JSON format.');
    }
  };

  const handleImportJsonModel = async () => {
    if (!importPreview) return;
    try {
      setLoading(true);
      const imported = await atwiApi.importAtwiModelJson({
        model: importPreview,
        sourceFileName: importFileName,
        createdBy: importCreator
      });
      const fetchedModels = await atwiApi.getAtwiModels();
      setModels(fetchedModels);
      setSelectedModelId(imported.id);
      await loadModelDetails(imported.id);
      setImportJsonText('');
      setImportPreview(null);
      triggerSuccess(`Imported successfully! Switched to model: ${imported.name}`);
      setActiveTab('calculator');
    } catch (err: any) {
      triggerError(err.message || 'Failed to import model');
    } finally {
      setLoading(false);
    }
  };

  // Governance Actions
  const handleUpdateStatus = async (targetStatus: AtwiModelStatus) => {
    if (!currentModel) return;
    try {
      setLoading(true);
      const updated = await atwiApi.updateAtwiModelStatus(currentModel.id, {
        status: targetStatus,
        user: reviewUser,
        notes: reviewNotes
      });
      const fetchedModels = await atwiApi.getAtwiModels();
      setModels(fetchedModels);
      setCurrentModel(updated);
      setReviewNotes('');
      triggerSuccess(`Model governance status successfully transitioned to: ${targetStatus.toUpperCase()}`);
    } catch (err: any) {
      triggerError(err.message || 'Status transition failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveModel = async () => {
    if (!currentModel) return;
    try {
      setLoading(true);
      const updated = await atwiApi.approveAtwiModel(currentModel.id, {
        user: reviewUser,
        notes: reviewNotes
      });
      const fetchedModels = await atwiApi.getAtwiModels();
      setModels(fetchedModels);
      setCurrentModel(updated);
      setReviewNotes('');
      triggerSuccess('Model APPROVED! This model is now approved for official KPI reporting.');
    } catch (err: any) {
      triggerError(err.message || 'Approval failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRetireModel = async () => {
    if (!currentModel) return;
    try {
      setLoading(true);
      const updated = await atwiApi.retireAtwiModel(currentModel.id);
      const fetchedModels = await atwiApi.getAtwiModels();
      setModels(fetchedModels);
      setCurrentModel(updated);
      triggerSuccess('Model RETIRED and removed from approved status.');
    } catch (err: any) {
      triggerError(err.message || 'Retire failed');
    } finally {
      setLoading(false);
    }
  };

  // Styles & Classes
  const getBandBadgeClass = (band: AtwiBand) => {
    switch (band) {
      case 'normal':
        return { bg: '#1b5e20', text: '#81c784', label: 'Normal' };
      case 'watch':
        return { bg: '#e65100', text: '#ffb74d', label: 'Watch' };
      case 'high':
        return { bg: '#b71c1c', text: '#e57373', label: 'High' };
      case 'critical':
        return { bg: '#4a0000', text: '#ff1744', label: 'CRITICAL' };
      default:
        return { bg: '#333', text: '#aaa', label: 'Unknown' };
    }
  };

  const getStatusBadge = (status?: AtwiModelStatus) => {
    switch (status) {
      case 'approved':
        return { label: 'Approved for KPI', color: '#4caf50' };
      case 'draft':
        return { label: 'Draft', color: '#ff9800' };
      case 'imported':
        return { label: 'Imported Draft', color: '#03a9f4' };
      case 'under_review':
        return { label: 'Under Review', color: '#9c27b0' };
      case 'reviewed':
        return { label: 'Reviewed', color: '#00bcd4' };
      case 'retired':
        return { label: 'Retired', color: '#777777' };
      default:
        return { label: 'Unknown', color: '#aaaaaa' };
    }
  };

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--text)' }}>
      
      {/* Disclaimer Box */}
      <div style={{ 
        background: 'rgba(211, 47, 47, 0.1)', 
        border: '1px solid var(--danger)', 
        borderRadius: '8px', 
        padding: '12px 18px', 
        marginBottom: '20px', 
        fontSize: '13px', 
        color: 'var(--danger)',
        lineHeight: '1.6'
      }}>
        <strong>⚠️ DISCLAIMER:</strong> ATWI is a simulation workload indicator for decision-support only. It is not an operational ATC tool, not a training simulator, not a safety approval, and not for individual controller performance assessment.
      </div>

      {/* Header Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ margin: 0, fontSize: '28px', color: 'var(--text)' }}>🧠 ATWI Workload Foundation</h1>
          </div>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>
            Air Traffic Workload Index model management and manual workload calculations.
          </p>
        </div>

        {/* Global Model Selector */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', backgroundColor: '#1e1e1e', padding: '10px 16px', borderRadius: '6px', border: '1px solid #333' }}>
          <label htmlFor="global-model-select" style={{ fontSize: '13px', fontWeight: 'bold', color: '#aaa' }}>Active Workload Model:</label>
          <select 
            id="global-model-select"
            value={selectedModelId} 
            onChange={handleModelChange}
            style={{ 
              backgroundColor: '#2a2a2a', 
              color: 'white', 
              border: '1px solid #444', 
              borderRadius: '4px', 
              padding: '6px 12px',
              fontSize: '13px',
              cursor: 'pointer',
              minWidth: '220px'
            }}
          >
            <option value="">Select model...</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.metadata.version})
              </option>
            ))}
          </select>
          {currentModel && (
            <span style={{ 
              backgroundColor: getStatusBadge(currentModel.metadata.status).color + '22', 
              color: getStatusBadge(currentModel.metadata.status).color, 
              border: `1px solid ${getStatusBadge(currentModel.metadata.status).color}`, 
              fontSize: '11px', 
              padding: '3px 8px', 
              borderRadius: '4px',
              fontWeight: 'bold'
            }}>
              {getStatusBadge(currentModel.metadata.status).label}
            </span>
          )}
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div style={{ backgroundColor: '#1b5e20', color: '#a5d6a7', border: '1px solid #2e7d32', padding: '12px', borderRadius: '6px', marginBottom: '20px' }}>
          ✅ {successMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ backgroundColor: '#c62828', color: '#ef9a9a', border: '1px solid #d32f2f', padding: '12px', borderRadius: '6px', marginBottom: '20px' }}>
          ❌ {errorMsg}
        </div>
      )}

      {/* Model Warnings */}
      {currentModel && getModelStatusWarning(currentModel) && (
        <div style={{ backgroundColor: 'rgba(255, 152, 0, 0.1)', color: '#ffb74d', border: '1px solid #ff9800', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '13px' }}>
          ⚠️ <strong>Calibration Notice:</strong> {getModelStatusWarning(currentModel)}
        </div>
      )}

      {/* Navigation Links back to KPI reports */}
      <div style={{ display: 'flex', gap: '15px', borderBottom: '1px solid #333', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Link
          to={selectedRecordingId ? `/kpi-reports?recordingId=${selectedRecordingId}` : "/kpi-reports"}
          style={{ padding: '10px 15px', textDecoration: 'none', color: '#888', fontSize: '14px', borderBottom: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
        >
          📊 KPI Reports Dashboard
        </Link>
        {([
          { id: 'overview', label: 'Overview' },
          { id: 'evaluate', label: '🎯 Evaluate Workload' },
          { id: 'positions', label: '👤 Controller Positions' },
        ] as { id: string; label: string }[]).map(tabDef => (
          <button
            key={tabDef.id}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tabDef.id ? '3px solid #1976d2' : 'none',
              color: activeTab === tabDef.id ? '#1976d2' : '#aaa',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
            onClick={() => setActiveTab(tabDef.id)}
          >
            {tabDef.label}
          </button>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '10px', paddingLeft: '15px', borderLeft: '1px solid #333' }}>
          <span style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>⚙️ Model Administration:</span>
          {([
            { id: 'calculator', label: 'Manual Calculator' },
            { id: 'task_index', label: 'Task Index Definition' },
            { id: 'parameters', label: 'Model Parameters' },
            { id: 'import_export', label: 'Import / Export JSON' },
            { id: 'review_approval', label: 'Review & Approval' },
          ] as { id: string; label: string }[]).map(tabDef => (
            <button
              key={tabDef.id}
              style={{
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tabDef.id ? '3px solid #757575' : 'none',
                color: activeTab === tabDef.id ? '#ddd' : '#777',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px',
                whiteSpace: 'nowrap'
              }}
              onClick={() => setActiveTab(tabDef.id)}
            >
              {tabDef.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          🌀 Processing... Please wait.
        </div>
      )}

      {/* Tab Panels */}

      {/* TAB 1: OVERVIEW */}
      {!loading && activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#fff' }}>🎯 What is Air Traffic Workload Index (ATWI)?</h3>
            <p style={{ margin: 0, lineHeight: '1.6', color: '#aaa', fontSize: '14.5px' }}>
              ATWI is a simulation workload index used to estimate the work level of an Air Traffic Control Officer (ATCO) within an evaluation time window (typically 1 hour).
              It dynamically aggregates the estimated workload of distinct actions (e.g. communication instructions, sequencing routing, conflict checking) and localizes those values based on simulation complexity factors (complexity, military airspace operations, degraded procedures, airport layouts, weather severity) to assess controllers limits.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            
            {/* Formula Card */}
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
              <h4 style={{ margin: '0 0 12px 0', color: '#1976d2' }}>📊 Core ATWI Formula</h4>
              <div style={{ 
                backgroundColor: '#262626', 
                border: '1px solid #444', 
                borderRadius: '6px', 
                padding: '16px', 
                fontFamily: 'monospace', 
                fontSize: '14px', 
                color: '#81c784',
                textAlign: 'center',
                marginBottom: '15px'
              }}>
                ATWI % = [ Localized_Load_sec / (ATCO_on_position × Available_Seconds_per_Hour) ] × 100
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#aaa', lineHeight: '1.8' }}>
                <li><strong>Localized_Load_sec:</strong> Sum of localized task times.</li>
                <li><strong>ATCO_on_position:</strong> Number of controllers (Default: 1).</li>
                <li><strong>Available_Seconds:</strong> Operational seconds per hour (Default: 3600).</li>
              </ul>
            </div>

            {/* Localizing Task Card */}
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
              <h4 style={{ margin: '0 0 12px 0', color: '#1976d2' }}>⚙️ Localized Task Seconds</h4>
              <div style={{ 
                backgroundColor: '#262626', 
                border: '1px solid #444', 
                borderRadius: '6px', 
                padding: '16px', 
                fontFamily: 'monospace', 
                fontSize: '13.5px', 
                color: '#64b5f6',
                textAlign: 'center',
                marginBottom: '15px'
              }}>
                Localized_Task = Base_Effort × Context_Multiplier × Evidence_Factor
              </div>
              <div style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic', marginBottom: '8px' }}>
                Context_Multiplier = 1 + c_complexity × Complexity + c_weather × Weather + c_military × Military + c_coordination × Coordination + c_airport × Airport + c_degraded × Degraded
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#aaa', lineHeight: '1.8' }}>
                <li><strong>Context Factors:</strong> Input values between 0 (None) and 3 (Critical).</li>
                <li><strong>Evidence Factor:</strong> Calibration factor (0.5 to 2.0).</li>
              </ul>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            
            {/* Classifications */}
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
              <h4 style={{ margin: '0 0 15px 0', color: '#fff' }}>🚦 Workload Classification Bands</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ backgroundColor: '#1b5e20', color: '#81c784', width: '90px', padding: '4px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', borderRadius: '4px' }}>NORMAL</span>
                  <span style={{ fontSize: '13px', color: '#aaa' }}>0% &le; ATWI &lt; 60% — Workload is within comfortable monitoring range.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ backgroundColor: '#e65100', color: '#ffb74d', width: '90px', padding: '4px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', borderRadius: '4px' }}>WATCH</span>
                  <span style={{ fontSize: '13px', color: '#aaa' }}>60% &le; ATWI &lt; 75% — Workload is elevated. Needs focus.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ backgroundColor: '#b71c1c', color: '#e57373', width: '90px', padding: '4px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', borderRadius: '4px' }}>HIGH</span>
                  <span style={{ fontSize: '13px', color: '#aaa' }}>75% &le; ATWI &lt; 90% — Workload is high. Sector splitting or helper suggested.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ backgroundColor: '#4a0000', color: '#ff1744', width: '90px', padding: '4px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', borderRadius: '4px' }}>CRITICAL</span>
                  <span style={{ fontSize: '13px', color: '#aaa' }}>ATWI &ge; 90% — Sector capacity limits breached. Urgent mitigation needed.</span>
                </div>
              </div>
            </div>

            {/* Governance Workflow */}
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
              <h4 style={{ margin: '0 0 15px 0', color: '#fff' }}>🛡️ Model Governance & Workflow Status</h4>
              <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#aaa', lineHeight: '1.6' }}>
                Because ATWI task weights can be imported from AI or entered manually, draft models cannot be used for official report filings.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ border: '1px solid #ff9800', color: '#ff9800', fontSize: '11px', padding: '3px 6px', borderRadius: '4px' }}>1. Draft / Imported</span>
                <span style={{ color: '#888', alignSelf: 'center' }}>&rarr;</span>
                <span style={{ border: '1px solid #9c27b0', color: '#9c27b0', fontSize: '11px', padding: '3px 6px', borderRadius: '4px' }}>2. Under Review</span>
                <span style={{ color: '#888', alignSelf: 'center' }}>&rarr;</span>
                <span style={{ border: '1px solid #00bcd4', color: '#00bcd4', fontSize: '11px', padding: '3px 6px', borderRadius: '4px' }}>3. Reviewed</span>
                <span style={{ color: '#888', alignSelf: 'center' }}>&rarr;</span>
                <span style={{ border: '1px solid #4caf50', color: '#4caf50', fontSize: '11px', padding: '3px 6px', borderRadius: '4px' }}>4. APPROVED</span>
              </div>
              <div style={{ 
                backgroundColor: 'rgba(76, 175, 80, 0.1)', 
                border: '1px solid #4caf50', 
                borderRadius: '6px', 
                padding: '10px 14px', 
                marginTop: '15px', 
                fontSize: '12px', 
                color: '#81c784' 
              }}>
                ℹ️ <strong>Rule:</strong> Only <strong>Approved</strong> models with <code>approvedForKpi = true</code> will be used for calculating official reports in subsequent simulation runs.
              </div>
            </div>
          </div>

          {/* Next Steps preview */}
          <div style={{ background: 'linear-gradient(90deg, #1e3a8a 0%, #1e1e1e 100%)', border: '1px solid #3b82f6', borderRadius: '8px', padding: '20px' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#93c5fd' }}>⏩ Next Step: Simulation Automated Tracking (Step 13)</h4>
            <p style={{ margin: 0, fontSize: '13px', color: '#bfdbfe', lineHeight: '1.6' }}>
              Currently, this step provides the manual sandbox framework and parameters management. Step 13 will automatically read <code>replay_track.jsonl</code>, <code>event_log.jsonl</code>, <code>command_log.jsonl</code>, and <code>conflict_log.jsonl</code> from simulation recordings to auto-compute all ATWI parameters!
            </p>
          </div>
        </div>
      )}

      {/* TAB: EVALUATE WORKLOAD (merged From Recording / From Scenario File) */}
      {!loading && activeTab === 'evaluate' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Controls Panel */}
          <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
              🎯 Evaluate Workload — Real Recording or Offline Scenario File
            </h3>

            {/* Source toggle */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button
                onClick={() => setEvalSource('recording')}
                style={{
                  flex: 1, padding: '10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer',
                  border: evalSource === 'recording' ? '2px solid #1976d2' : '1px solid #444',
                  backgroundColor: evalSource === 'recording' ? 'rgba(25, 118, 210, 0.15)' : '#2a2a2a',
                  color: evalSource === 'recording' ? '#90caf9' : '#aaa'
                }}
              >
                🎥 From Simulation Recording (Recommended)
              </button>
              <button
                onClick={() => setEvalSource('scenario')}
                style={{
                  flex: 1, padding: '10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer',
                  border: evalSource === 'scenario' ? '2px solid #1976d2' : '1px solid #444',
                  backgroundColor: evalSource === 'scenario' ? 'rgba(25, 118, 210, 0.15)' : '#2a2a2a',
                  color: evalSource === 'scenario' ? '#90caf9' : '#aaa'
                }}
              >
                📁 From Offline Scenario File (no run required)
              </button>
            </div>

            {evalSource === 'recording' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#aaa', marginBottom: '8px', fontWeight: 'bold' }}>
                    Choose Simulation Recording:
                  </label>
                  <select
                    value={selectedRecordingId}
                    onChange={handleRecordingSelectionChange}
                    style={{
                      width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444',
                      borderRadius: '6px', padding: '10px', fontSize: '14px', cursor: 'pointer'
                    }}
                  >
                    <option value="">Select a recording...</option>
                    {recordings.map((r: any) => {
                      const recId = r.id || r.recordingId;
                      if (!recId) return null;
                      return (
                        <option key={recId} value={recId}>
                          {formatRecordingLabel(r)}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#aaa', marginBottom: '8px', fontWeight: 'bold' }}>
                    Analysis Interval / Bin Size:
                  </label>
                  <select
                    value={recordingWindowDuration}
                    onChange={e => setRecordingWindowDuration(Number(e.target.value))}
                    style={{
                      width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444',
                      borderRadius: '6px', padding: '10px', fontSize: '14px', cursor: 'pointer'
                    }}
                  >
                    <option value={60}>60 seconds (1 minute)</option>
                    <option value={120}>120 seconds (2 minutes)</option>
                    <option value={300}>300 seconds (5 minutes - Recommended)</option>
                    <option value={600}>600 seconds (10 minutes)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    onClick={handleAnalyzeRecording}
                    disabled={analyzingRecording || !selectedRecordingId || !selectedModelId}
                    style={{
                      width: '100%',
                      backgroundColor: analyzingRecording || !selectedRecordingId || !selectedModelId ? '#444' : '#1976d2',
                      color: 'white', border: 'none', borderRadius: '6px', padding: '12px 20px', fontWeight: 'bold',
                      cursor: analyzingRecording || !selectedRecordingId || !selectedModelId ? 'not-allowed' : 'pointer',
                      fontSize: '14px', transition: 'background-color 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}
                  >
                    {analyzingRecording ? '🌀 Analyzing Recording...' : '📊 Run Workload Analysis'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#aaa', marginBottom: '8px', fontWeight: 'bold' }}>
                    Choose Scenario File (.scn):
                  </label>
                  <select
                    value={selectedScenarioFileName}
                    onChange={e => {
                      setSelectedScenarioFileName(e.target.value);
                      setScenarioAnalysisResult(null);
                    }}
                    style={{
                      width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444',
                      borderRadius: '6px', padding: '10px', fontSize: '14px', cursor: 'pointer'
                    }}
                  >
                    <option value="">Select a scenario file...</option>
                    {scenarioFiles.map((sf: any) => (
                      <option key={sf.fileName} value={sf.fileName}>
                        {sf.displayName} ({sf.fileName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#aaa', marginBottom: '8px', fontWeight: 'bold' }}>
                    Analysis Interval / Bin Size:
                  </label>
                  <select
                    value={scenarioWindowDuration}
                    onChange={e => setScenarioWindowDuration(Number(e.target.value))}
                    style={{
                      width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444',
                      borderRadius: '6px', padding: '10px', fontSize: '14px', cursor: 'pointer'
                    }}
                  >
                    <option value={60}>60 seconds (1 minute)</option>
                    <option value={120}>120 seconds (2 minutes)</option>
                    <option value={300}>300 seconds (5 minutes - Recommended)</option>
                    <option value={600}>600 seconds (10 minutes)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    onClick={handleEvaluateScenario}
                    disabled={evaluatingScenario || !selectedScenarioFileName || !selectedModelId}
                    style={{
                      width: '100%',
                      backgroundColor: evaluatingScenario || !selectedScenarioFileName || !selectedModelId ? '#444' : '#1976d2',
                      color: 'white', border: 'none', borderRadius: '6px', padding: '12px 20px', fontWeight: 'bold',
                      cursor: evaluatingScenario || !selectedScenarioFileName || !selectedModelId ? 'not-allowed' : 'pointer',
                      fontSize: '14px', transition: 'background-color 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}
                  >
                    {evaluatingScenario ? '🌀 Evaluating Scenario...' : '📊 Run Offline Evaluation'}
                  </button>
                </div>
              </div>
            )}

            {/* Selected Recording Summary */}
            {evalSource === 'recording' && selectedRecordingId && (
              (() => {
                const rec = recordings.find(r => (r.id || r.recordingId) === selectedRecordingId);
                if (!rec) return null;
                return (
                  <div style={{
                    backgroundColor: '#121212', borderRadius: '6px', padding: '14px 18px', border: '1px solid #222',
                    fontSize: '13px', color: '#aaa', display: 'flex', flexWrap: 'wrap', gap: '20px'
                  }}>
                    <div><strong>Scenario:</strong> <span style={{ color: '#fff' }}>{rec.scenarioBaseName || rec.scenarioName || 'N/A'}</span></div>
                    <div><strong>Date Run:</strong> <span style={{ color: '#fff' }}>{rec.startTime ? new Date(rec.startTime).toLocaleString() : 'N/A'}</span></div>
                    <div><strong>Duration:</strong> <span style={{ color: '#fff' }}>{rec.durationSec ? `${Math.round(rec.durationSec)} seconds` : 'N/A'}</span></div>
                    <div><strong>Status:</strong> <span style={{
                      color: rec.postRunAnalyticsStatus === 'completed' ? '#4caf50' : '#ff9800',
                      fontWeight: 'bold'
                    }}>{rec.postRunAnalyticsStatus === 'completed' ? 'Analyzed' : 'Pending Analysis'}</span></div>
                  </div>
                );
              })()
            )}

            {/* Selected Scenario Summary */}
            {evalSource === 'scenario' && selectedScenarioFileName && (
              (() => {
                const sf = scenarioFiles.find(f => f.fileName === selectedScenarioFileName);
                if (!sf) return null;
                return (
                  <div style={{
                    backgroundColor: '#121212', borderRadius: '6px', padding: '14px 18px', border: '1px solid #222',
                    fontSize: '13px', color: '#aaa', display: 'flex', flexWrap: 'wrap', gap: '20px'
                  }}>
                    <div><strong>Scenario Name:</strong> <span style={{ color: '#fff' }}>{sf.displayName}</span></div>
                    <div><strong>File Size:</strong> <span style={{ color: '#fff' }}>{Math.round(sf.sizeBytes / 1024 * 10) / 10} KB</span></div>
                    <div><strong>Last Modified:</strong> <span style={{ color: '#fff' }}>{new Date(sf.updatedAt).toLocaleString()}</span></div>
                    <div><strong>Init Command:</strong> <span style={{ color: '#fff' }}><code>{sf.icCommand}</code></span></div>
                  </div>
                );
              })()
            )}
          </div>

          {/* Per-Controller-Position Workload (primary output) */}
          {evalSource === 'recording' && recordingAnalysisResult && renderPositionBreakdown(recordingAnalysisResult)}
          {evalSource === 'scenario' && scenarioAnalysisResult && renderPositionBreakdown(scenarioAnalysisResult)}

          {/* Combined-scenario Results Summary & KPI Cards */}
          {evalSource === 'recording' && recordingAnalysisResult && renderResultDetails(recordingAnalysisResult)}
          {evalSource === 'scenario' && scenarioAnalysisResult && renderResultDetails(scenarioAnalysisResult)}
        </div>
      )}

      {/* TAB: CONTROLLER POSITIONS (admin CRUD) */}
      {!loading && activeTab === 'positions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ backgroundColor: 'rgba(25, 118, 210, 0.08)', border: '1px solid #1976d2', borderRadius: '8px', padding: '16px 20px', fontSize: '13px', color: '#90caf9', lineHeight: '1.6' }}>
            ℹ️ Define real controller positions (EC/PLC/GCU/TWR) per airport so the <strong>Evaluate Workload</strong> tab can show
            per-position workload instead of one combined figure. Positions seeded by the system are an honestly-labeled generic
            template (see each position's description for sourcing) — edit them to match a verified real org chart when available.
          </div>
          {renderPositionsAdmin()}
        </div>
      )}

      {/* TAB 2: MANUAL CALCULATOR */}
      {!loading && activeTab === 'calculator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {!selectedModelId ? (
            <div style={{ backgroundColor: '#222', border: '1px dashed #444', borderRadius: '8px', padding: '40px', textAlign: 'center', color: '#aaa' }}>
              Please select a Workload Model in the top-right header selector to start the calculator.
            </div>
          ) : (
            <>
              {/* Context inputs */}
              <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#fff' }}>🛰️ Scenario Context & Time Parameters</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Study ID:</label>
                    <input 
                      type="text" 
                      value={studyId} 
                      onChange={e => setStudyId(e.target.value)} 
                      style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Scenario ID:</label>
                    <input 
                      type="text" 
                      value={scenarioId} 
                      onChange={e => setScenarioId(e.target.value)} 
                      style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Recording ID (Optional):</label>
                    <input 
                      type="text" 
                      value={recordingId} 
                      placeholder="e.g. recording_20260528_100000"
                      onChange={e => setRecordingId(e.target.value)} 
                      style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Time Start (HH:MM:SS):</label>
                    <input 
                      type="text" 
                      value={timeWindowStart} 
                      onChange={e => setTimeWindowStart(e.target.value)} 
                      style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Time End (HH:MM:SS):</label>
                    <input 
                      type="text" 
                      value={timeWindowEnd} 
                      onChange={e => setTimeWindowEnd(e.target.value)} 
                      style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '15px', backgroundColor: 'rgba(25, 118, 210, 0.1)', border: '1px solid #1976d2', borderRadius: '4px', padding: '10px 15px', fontSize: '13px', color: '#90caf9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ℹ️ This calculator is a generic combined what-if sandbox (not tied to a real controller position). For real per-position workload from an actual recording, use the <strong>Evaluate</strong> tab.
                </div>
                
                {/* Loader utilities */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', marginTop: '20px', borderTop: '1px solid #333', paddingTop: '15px' }}>
                  <button 
                    onClick={handleLoadSample}
                    style={{ backgroundColor: '#1976d2', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', height: '38px' }}
                  >
                    📂 Load VVTS 52 Movements Sample
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid #444', paddingLeft: '15px' }}>
                    <select
                      value={calculatorScenarioFile}
                      onChange={e => setCalculatorScenarioFile(e.target.value)}
                      style={{
                        backgroundColor: '#2a2a2a',
                        color: 'white',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        padding: '6px 10px',
                        fontSize: '13px',
                        cursor: 'pointer',
                        height: '38px',
                        minWidth: '220px'
                      }}
                    >
                      <option value="">-- Load from Scenario File --</option>
                      {scenarioFiles.map((sf: any) => (
                        <option key={sf.fileName} value={sf.fileName}>
                          {sf.displayName}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleLoadFromScenarioFile}
                      disabled={!calculatorScenarioFile || loadingScenarioCounts || !selectedModelId}
                      style={{
                        backgroundColor: !calculatorScenarioFile || loadingScenarioCounts || !selectedModelId ? '#444' : '#ff9800',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        cursor: !calculatorScenarioFile || loadingScenarioCounts || !selectedModelId ? 'not-allowed' : 'pointer',
                        height: '38px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {loadingScenarioCounts ? '🌀 Loading...' : '📥 Load Counts'}
                    </button>
                  </div>

                  <button 
                    onClick={handleResetInputs}
                    style={{ backgroundColor: '#444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', height: '38px' }}
                  >
                    🔄 Reset Inputs
                  </button>

                  <button 
                    onClick={handleCalculateAtwi}
                    style={{ backgroundColor: '#2e7d32', color: 'white', border: 'none', padding: '8px 24px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginLeft: 'auto', height: '38px' }}
                  >
                    🧠 Calculate ATWI Workload
                  </button>
                </div>
              </div>

              {/* Task Inputs Table */}
              <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px', overflowX: 'auto' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#fff' }}>📋 Tasks Counting & Context Settings</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#2a2a2a', color: '#aaa', textAlign: 'left' }}>
                      <th style={{ padding: '10px' }}>Code / Name</th>
                      <th style={{ padding: '10px', width: '80px' }}>Base Effort (s)</th>
                      <th style={{ padding: '10px', width: '100px' }}>Task Count</th>
                      <th style={{ padding: '10px', width: '70px' }}>Complexity</th>
                      <th style={{ padding: '10px', width: '70px' }}>Weather</th>
                      <th style={{ padding: '10px', width: '70px' }}>Military</th>
                      <th style={{ padding: '10px', width: '70px' }}>Coord.</th>
                      <th style={{ padding: '10px', width: '70px' }}>Airport</th>
                      <th style={{ padding: '10px', width: '70px' }}>Degraded</th>
                      <th style={{ padding: '10px', width: '90px' }}>Evidence F.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculatorInputs.map((input, idx) => {
                      const definitions = currentModel?.taskDefinitions.length 
                        ? currentModel.taskDefinitions 
                        : taskIndex;
                      const taskDef = definitions.find(t => t.id === input.taskDefinitionId);
                      if (!taskDef) return null;

                      const updateInstanceField = (field: string, val: number) => {
                        const copy = [...calculatorInputs];
                        if (field === 'count') {
                          const newCount = Math.max(0, val);
                          copy[idx].count = newCount;

                          setBaselineScenarioCounts(prev => ({
                            ...prev,
                            [taskDef.code.toUpperCase()]: newCount
                          }));
                        } else {
                          copy[idx].contextFactors = {
                            ...copy[idx].contextFactors,
                            [field]: val
                          };
                        }
                        setCalculatorInputs(copy);
                      };

                      return (
                        <tr key={input.id} style={{ borderBottom: '1px solid #333' }}>
                          <td style={{ padding: '8px' }}>
                            <strong style={{ color: '#fff' }}>{taskDef.code}</strong>
                            <div style={{ color: '#888', fontSize: '11px' }}>{taskDef.name}</div>
                          </td>
                          <td style={{ padding: '8px', color: '#03a9f4', fontWeight: 'bold' }}>
                            {taskDef.baseEffortSec}s
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input 
                              type="number" 
                              value={input.count}
                              onChange={e => updateInstanceField('count', parseInt(e.target.value) || 0)}
                              style={{ width: '80px', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '4px 8px' }}
                              min="0"
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input 
                              type="number" 
                              value={input.contextFactors.complexity}
                              onChange={e => updateInstanceField('complexity', parseFloat(e.target.value) || 0)}
                              style={{ width: '60px', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '4px 8px' }}
                              min="0" max="3" step="0.5"
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input 
                              type="number" 
                              value={input.contextFactors.weather}
                              onChange={e => updateInstanceField('weather', parseFloat(e.target.value) || 0)}
                              style={{ width: '60px', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '4px 8px' }}
                              min="0" max="3" step="0.5"
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input 
                              type="number" 
                              value={input.contextFactors.military}
                              onChange={e => updateInstanceField('military', parseFloat(e.target.value) || 0)}
                              style={{ width: '60px', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '4px 8px' }}
                              min="0" max="3" step="0.5"
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input 
                              type="number" 
                              value={input.contextFactors.coordination}
                              onChange={e => updateInstanceField('coordination', parseFloat(e.target.value) || 0)}
                              style={{ width: '60px', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '4px 8px' }}
                              min="0" max="3" step="0.5"
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input 
                              type="number" 
                              value={input.contextFactors.airport}
                              onChange={e => updateInstanceField('airport', parseFloat(e.target.value) || 0)}
                              style={{ width: '60px', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '4px 8px' }}
                              min="0" max="3" step="0.5"
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input 
                              type="number" 
                              value={input.contextFactors.degraded}
                              onChange={e => updateInstanceField('degraded', parseFloat(e.target.value) || 0)}
                              style={{ width: '60px', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '4px 8px' }}
                              min="0" max="3" step="0.5"
                            />
                          </td>
                          <td style={{ padding: '8px' }}>
                            <input 
                              type="number" 
                              value={input.contextFactors.evidenceFactor}
                              onChange={e => updateInstanceField('evidenceFactor', parseFloat(e.target.value) || 1.0)}
                              style={{ width: '70px', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '4px 8px' }}
                              min="0.5" max="2.0" step="0.1"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Calculation Result Panel */}
              {calculationResult && (
                <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '24px', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', flexWrap: 'wrap' }}>
                  
                  {/* Gauge indicator */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #333', paddingRight: '20px' }}>
                    <div style={{ fontSize: '13px', color: '#aaa', textTransform: 'uppercase', fontWeight: 'bold' }}>ATWI Score</div>
                    <div style={{ 
                      fontSize: '56px', 
                      fontWeight: 'bold', 
                      color: getBandBadgeClass(calculationResult.band).text, 
                      margin: '10px 0'
                    }}>
                      {formatAtwiPercent(calculationResult.atwiPercent)}
                    </div>
                    <span style={{ 
                      backgroundColor: getBandBadgeClass(calculationResult.band).bg, 
                      color: getBandBadgeClass(calculationResult.band).text, 
                      padding: '6px 16px', 
                      borderRadius: '20px', 
                      fontWeight: 'bold', 
                      fontSize: '14px',
                      textTransform: 'uppercase',
                      border: `1px solid ${getBandBadgeClass(calculationResult.band).text}`
                    }}>
                      {getBandBadgeClass(calculationResult.band).label}
                    </span>
                    <p style={{ textAlign: 'center', fontSize: '12.5px', color: '#888', margin: '15px 0 0 0', lineHeight: '1.5' }}>
                      {getBandDescription(calculationResult.band)}
                    </p>
                  </div>

                  {/* Math Breakdown details */}
                  <div>
                    <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#fff' }}>📊 Localized Effort Breakdown</h3>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                      <div style={{ backgroundColor: '#262626', padding: '12px', borderRadius: '6px', border: '1px solid #333' }}>
                        <span style={{ display: 'block', fontSize: '11px', color: '#888' }}>Total Localized load</span>
                        <strong style={{ fontSize: '18px', color: '#81c784' }}>{formatSeconds(calculationResult.totalLocalizedLoadSec)}</strong>
                      </div>
                      <div style={{ backgroundColor: '#262626', padding: '12px', borderRadius: '6px', border: '1px solid #333' }}>
                        <span style={{ display: 'block', fontSize: '11px', color: '#888' }}>ATCO Capacity</span>
                        <strong style={{ fontSize: '18px', color: '#64b5f6' }}>{formatSeconds(calculationResult.availableCapacitySec)}</strong>
                      </div>
                      <div style={{ backgroundColor: '#262626', padding: '12px', borderRadius: '6px', border: '1px solid #333' }}>
                        <span style={{ display: 'block', fontSize: '11px', color: '#888' }}>Model Status</span>
                        <strong style={{ fontSize: '14px', color: '#ffb74d', textTransform: 'uppercase' }}>{calculationResult.modelStatus}</strong>
                      </div>
                    </div>

                    <div style={{ backgroundColor: '#181818', borderRadius: '6px', border: '1px solid #2d2d2d', padding: '15px', marginBottom: '20px' }}>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>ℹ️ Calculation Details & Scale</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '12.5px', color: '#bbb' }}>
                        <div><strong>Time Window Start:</strong> <span style={{ color: '#fff' }}>{calculationResult.input.timeWindowStart}</span></div>
                        <div><strong>Time Window End:</strong> <span style={{ color: '#fff' }}>{calculationResult.input.timeWindowEnd}</span></div>
                        <div><strong>Duration Sec:</strong> <span style={{ color: '#fff' }}>{calculationResult.durationSec?.toFixed(1) || '0.0'} s</span></div>
                        <div><strong>Duration Min:</strong> <span style={{ color: '#fff' }}>{calculationResult.durationSec ? `${(calculationResult.durationSec / 60).toFixed(2)} min` : '0.0 min'}</span></div>
                        <div><strong>ATCO on Position:</strong> <span style={{ color: '#fff' }}>{currentModel?.atcoOnPosition || 1}</span></div>
                        <div><strong>Available Sec per ATCO per Hour:</strong> <span style={{ color: '#fff' }}>{currentModel?.availableSecondsPerAtcoPerHour || 3600} s</span></div>
                        <div><strong>Available Capacity Sec:</strong> <span style={{ color: '#fff' }}>{calculationResult.availableCapacitySec.toFixed(1)} s</span></div>
                        <div><strong>Total Localized Load Sec:</strong> <span style={{ color: '#fff' }}>{calculationResult.totalLocalizedLoadSec.toFixed(1)} s</span></div>
                        <div><strong>ATWI %:</strong> <span style={{ color: '#fff', fontWeight: 'bold' }}>{formatAtwiPercent(calculationResult.atwiPercent)}</span></div>
                      </div>
                      {calculationResult.durationSec !== 3600 && (
                        <div style={{ fontSize: '12px', color: '#ff9800', fontStyle: 'italic', marginTop: '10px' }}>
                          💡 Capacity is scaled to the selected scenario time window.
                        </div>
                      )}
                      {calculationResult.controllerPositionId === 'COMBINED_TMA' && (
                        <div style={{ marginTop: '10px', backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid #f43f5e', borderRadius: '4px', padding: '8px 12px', fontSize: '12.5px', color: '#fda4af' }}>
                          ⚠️ This result represents combined scenario workload, not a single operational controller position.
                        </div>
                      )}
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #333', color: '#888', textAlign: 'left' }}>
                          <th style={{ padding: '6px' }}>Task</th>
                          <th style={{ padding: '6px', textAlign: 'center' }}>Count</th>
                          <th style={{ padding: '6px', textAlign: 'right' }}>Single (s)</th>
                          <th style={{ padding: '6px', textAlign: 'right' }}>Total (s)</th>
                          <th style={{ padding: '6px', textAlign: 'right' }}>Workload Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calculationResult.taskResults.map(tr => (
                          <tr key={tr.taskDefinitionId} style={{ borderBottom: '1px solid #222' }}>
                            <td style={{ padding: '6px', color: '#fff' }}>{tr.taskCode} <span style={{ color: '#666', fontSize: '10px' }}>({tr.taskName})</span></td>
                            <td style={{ padding: '6px', textAlign: 'center' }}>{tr.count}</td>
                            <td style={{ padding: '6px', textAlign: 'right', color: '#aaa' }}>{tr.localizedSingleTaskSec}s</td>
                            <td style={{ padding: '6px', textAlign: 'right', color: '#81c784', fontWeight: 'bold' }}>{tr.totalSeconds}s</td>
                            <td style={{ padding: '6px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                <div style={{ width: '60px', height: '6px', backgroundColor: '#333', borderRadius: '3px' }}>
                                  <div style={{ width: `${tr.workloadSharePercent}%`, height: '100%', backgroundColor: '#1976d2', borderRadius: '3px' }}></div>
                                </div>
                                <span style={{ width: '35px', textAlign: 'right' }}>{tr.workloadSharePercent}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {calculationResult.warnings.length > 0 && (
                      <div style={{ marginTop: '15px', padding: '10px 14px', border: '1px solid #ff9800', background: 'rgba(255, 152, 0, 0.05)', borderRadius: '4px', fontSize: '11px', color: '#ffb74d' }}>
                        <strong>⚠️ Warnings:</strong>
                        <ul style={{ margin: '4px 0 0 0', paddingLeft: '15px' }}>
                          {calculationResult.warnings.map((w, wi) => <li key={wi}>{w}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 3: TASK INDEX */}
      {!loading && activeTab === 'task_index' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#fff' }}>🛡️ Safety Caution on Task Index Updates</h3>
            <p style={{ margin: 0, color: '#aaa', fontSize: '13px', lineHeight: '1.5' }}>
              Modifying task categories, basic effort times, or validation source criteria affects future ATWI calculations. 
              Always crosscheck assumptions against verified regional expert criteria or previous simulation records before saving.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.5fr', gap: '24px', flexWrap: 'wrap' }}>
            
            {/* Add Task Form */}
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
              <h4 style={{ margin: '0 0 15px 0', color: '#fff', fontSize: '15px' }}>➕ Add New Task Definition</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                <div>
                  <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Task Code (Uppercase, No Spaces):</label>
                  <input 
                    type="text" 
                    placeholder="e.g. EMER_DESCENT"
                    value={newTask.code}
                    onChange={e => setNewTask({ ...newTask, code: e.target.value })}
                    style={{ width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Name / Short Title:</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Emergency Descent procedure"
                    value={newTask.name}
                    onChange={e => setNewTask({ ...newTask, name: e.target.value })}
                    style={{ width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Category:</label>
                  <select 
                    value={newTask.category}
                    onChange={e => setNewTask({ ...newTask, category: e.target.value as any })}
                    style={{ width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '8px' }}
                  >
                    <option value="surveillance">surveillance</option>
                    <option value="conflict_monitoring">conflict_monitoring</option>
                    <option value="communication">communication</option>
                    <option value="coordination">coordination</option>
                    <option value="planning">planning</option>
                    <option value="procedure">procedure</option>
                    <option value="system">system</option>
                    <option value="airport_surface">airport_surface</option>
                    <option value="weather">weather</option>
                    <option value="military_sua">military_sua</option>
                    <option value="other">other</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Base Effort Seconds:</label>
                  <input 
                    type="number" 
                    value={newTask.baseEffortSec}
                    onChange={e => setNewTask({ ...newTask, baseEffortSec: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                    min="0"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Evidence Validation Level:</label>
                  <select 
                    value={newTask.evidenceLevel}
                    onChange={e => setNewTask({ ...newTask, evidenceLevel: e.target.value as any })}
                    style={{ width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '8px' }}
                  >
                    <option value="assumed">assumed</option>
                    <option value="local_expert">local_expert</option>
                    <option value="measured">measured</option>
                    <option value="validated">validated</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Source:</label>
                  <input 
                    type="text" 
                    placeholder="e.g. system_seed or AI generated"
                    value={newTask.source}
                    onChange={e => setNewTask({ ...newTask, source: e.target.value })}
                    style={{ width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Description:</label>
                  <textarea 
                    placeholder="Provide details..."
                    value={newTask.description}
                    onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                    style={{ width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box', height: '60px' }}
                  />
                </div>
                <button 
                  onClick={handleAddTask}
                  style={{ backgroundColor: '#1976d2', color: 'white', border: 'none', padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginTop: '5px' }}
                >
                  ➕ Add to Temporary List
                </button>
              </div>
            </div>

            {/* Editing list */}
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h4 style={{ margin: 0, color: '#fff', fontSize: '15px' }}>📋 Current Task List ({editingTasks.length} tasks)</h4>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={handleResetTaskIndex}
                    style={{ backgroundColor: '#444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Reset List
                  </button>
                  <button 
                    onClick={handleSaveTaskIndex}
                    style={{ backgroundColor: '#2e7d32', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    💾 Save Task Index to Server
                  </button>
                </div>
              </div>

              <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#2a2a2a', color: '#aaa', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Code</th>
                      <th style={{ padding: '8px' }}>Name & Description</th>
                      <th style={{ padding: '8px', width: '120px' }}>Category</th>
                      <th style={{ padding: '8px', width: '70px' }}>Base (s)</th>
                      <th style={{ padding: '8px', width: '100px' }}>Evidence</th>
                      <th style={{ padding: '8px', width: '50px' }}>Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editingTasks.map((task, idx) => (
                      <tr key={task.id} style={{ borderBottom: '1px solid #333' }}>
                        <td style={{ padding: '6px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#ff9800' }}>{task.code}</span>
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input 
                            type="text" 
                            value={task.name} 
                            onChange={e => handleUpdateTaskField(idx, 'name', e.target.value)}
                            style={{ width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '4px 6px', boxSizing: 'border-box', marginBottom: '3px' }}
                          />
                          <input 
                            type="text" 
                            value={task.description} 
                            placeholder="Description"
                            onChange={e => handleUpdateTaskField(idx, 'description', e.target.value)}
                            style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#888', border: '1px dashed #444', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <select 
                            value={task.category} 
                            onChange={e => handleUpdateTaskField(idx, 'category', e.target.value)}
                            style={{ backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '4px', fontSize: '11px' }}
                          >
                            <option value="surveillance">surveillance</option>
                            <option value="conflict_monitoring">conflict_monitoring</option>
                            <option value="communication">communication</option>
                            <option value="coordination">coordination</option>
                            <option value="planning">planning</option>
                            <option value="procedure">procedure</option>
                            <option value="system">system</option>
                            <option value="airport_surface">airport_surface</option>
                            <option value="weather">weather</option>
                            <option value="military_sua">military_sua</option>
                            <option value="other">other</option>
                          </select>
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input 
                            type="number" 
                            value={task.baseEffortSec} 
                            onChange={e => handleUpdateTaskField(idx, 'baseEffortSec', e.target.value)}
                            style={{ width: '50px', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '4px 6px' }}
                            min="0"
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <select 
                            value={task.evidenceLevel} 
                            onChange={e => handleUpdateTaskField(idx, 'evidenceLevel', e.target.value)}
                            style={{ backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '4px', fontSize: '11px' }}
                          >
                            <option value="assumed">assumed</option>
                            <option value="local_expert">local_expert</option>
                            <option value="measured">measured</option>
                            <option value="validated">validated</option>
                          </select>
                        </td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>
                          <button 
                            onClick={() => handleDeleteTask(idx)}
                            style={{ backgroundColor: '#c62828', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MODEL PARAMETERS */}
      {!loading && activeTab === 'parameters' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {!currentModel ? (
            <div style={{ backgroundColor: '#222', border: '1px dashed #444', borderRadius: '8px', padding: '40px', textAlign: 'center', color: '#aaa' }}>
              Please select a Workload Model in the top-right header selector to edit or review parameters.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Lock Alert for approved */}
              {currentModel.metadata.status === 'approved' && (
                <div style={{ backgroundColor: 'rgba(211, 47, 47, 0.1)', border: '1px solid #d32f2f', color: '#ff8a80', padding: '16px', borderRadius: '8px', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🔒 <strong>Approved Model Locked:</strong> Approved parameters are historically preserved for KPI integrity. To change weightings, please clone this model as a draft copy first.</span>
                  <button 
                    onClick={handleCloneModelParams}
                    style={{ backgroundColor: '#1976d2', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Clone as Draft
                  </button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                
                {/* Core Parameters info */}
                <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 15px 0', color: '#fff', fontSize: '15px' }}>ℹ️ Base Metadata & Sizing</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                    <div>
                      <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Model Name:</label>
                      <input 
                        type="text" 
                        value={editModelName}
                        onChange={e => setEditModelName(e.target.value)}
                        disabled={currentModel.metadata.status === 'approved'}
                        style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Description:</label>
                      <textarea 
                        value={editModelDesc}
                        onChange={e => setEditModelDesc(e.target.value)}
                        disabled={currentModel.metadata.status === 'approved'}
                        style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box', height: '60px' }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>ATCO count (on position):</label>
                        <input 
                          type="number" 
                          value={editAtcoCount}
                          onChange={e => setEditAtcoCount(parseInt(e.target.value) || 1)}
                          disabled={currentModel.metadata.status === 'approved'}
                          style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                          min="1"
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Capacity per hour (s):</label>
                        <input 
                          type="number" 
                          value={editAvailableSec}
                          onChange={e => setEditAvailableSec(parseInt(e.target.value) || 3600)}
                          disabled={currentModel.metadata.status === 'approved'}
                          style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                          min="1"
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Model Version:</label>
                        <input 
                          type="text" 
                          value={editVersion}
                          onChange={e => setEditVersion(e.target.value)}
                          disabled={currentModel.metadata.status === 'approved'}
                          style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Notes / Version Log:</label>
                        <input 
                          type="text" 
                          value={editNotes}
                          onChange={e => setEditNotes(e.target.value)}
                          disabled={currentModel.metadata.status === 'approved'}
                          style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coefficients coefficients */}
                <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 15px 0', color: '#fff', fontSize: '15px' }}>📈 Context Multiplier Weightings (Coefficients)</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                    {Object.keys(editCoeffs).map(coeffName => (
                      <div key={coeffName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ color: '#aaa' }}><code>{coeffName}</code>:</label>
                        <input 
                          type="number" 
                          value={editCoeffs[coeffName]}
                          onChange={e => setEditCoeffs({
                            ...editCoeffs,
                            [coeffName]: parseFloat(e.target.value) || 0
                          })}
                          disabled={currentModel.metadata.status === 'approved'}
                          style={{ width: '90px', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '6px 8px', textAlign: 'right' }}
                          min="0" step="0.01"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Thresholds thresholds */}
                <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
                  <h4 style={{ margin: '0 0 15px 0', color: '#fff', fontSize: '15px' }}>🚦 Classification Limit Thresholds (%)</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ color: '#81c784' }}>Normal Max Limit (%):</label>
                      <input 
                        type="number" 
                        value={editThresholds.normalMax}
                        onChange={e => setEditThresholds({
                          ...editThresholds,
                          normalMax: parseFloat(e.target.value) || 0
                        })}
                        disabled={currentModel.metadata.status === 'approved'}
                        style={{ width: '90px', backgroundColor: '#2a2a2a', color: '#81c784', border: '1px solid #444', borderRadius: '4px', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}
                        min="0" max="200"
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ color: '#ffb74d' }}>Watch Max Limit (%):</label>
                      <input 
                        type="number" 
                        value={editThresholds.watchMax}
                        onChange={e => setEditThresholds({
                          ...editThresholds,
                          watchMax: parseFloat(e.target.value) || 0
                        })}
                        disabled={currentModel.metadata.status === 'approved'}
                        style={{ width: '90px', backgroundColor: '#2a2a2a', color: '#ffb74d', border: '1px solid #444', borderRadius: '4px', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}
                        min="0" max="200"
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ color: '#e57373' }}>High Max Limit (%):</label>
                      <input 
                        type="number" 
                        value={editThresholds.highMax}
                        onChange={e => setEditThresholds({
                          ...editThresholds,
                          highMax: parseFloat(e.target.value) || 0
                        })}
                        disabled={currentModel.metadata.status === 'approved'}
                        style={{ width: '90px', backgroundColor: '#2a2a2a', color: '#e57373', border: '1px solid #444', borderRadius: '4px', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}
                        min="0" max="200"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {currentModel.metadata.status !== 'approved' && (
                <div style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end', borderTop: '1px solid #333', paddingTop: '15px', marginTop: '10px' }}>
                  <button 
                    onClick={async () => {
                      await loadModelDetails(currentModel.id);
                      triggerSuccess('Discarded changes back to saved parameters.');
                    }}
                    style={{ backgroundColor: '#444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Reset Changes
                  </button>
                  <button 
                    onClick={handleSaveModelParams}
                    style={{ backgroundColor: '#2e7d32', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    💾 Save Model Parameters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: IMPORT / EXPORT */}
      {!loading && activeTab === 'import_export' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            
            {/* Export Panel */}
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#fff', fontSize: '16px' }}>📤 Export Current Model</h3>
              {!currentModel ? (
                <p style={{ color: '#888', fontSize: '13px' }}>Select an active model from the top selector to export.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <p style={{ margin: 0, color: '#aaa', fontSize: '13px', lineHeight: '1.5' }}>
                    Download the model file as a JSON block. You can import this file into another WebFTS environment or back it up offline.
                  </p>
                  
                  <div style={{ backgroundColor: '#121212', border: '1px solid #333', borderRadius: '4px', padding: '10px', maxHeight: '180px', overflowY: 'auto', fontSize: '11px', fontFamily: 'monospace', color: '#aaa' }}>
                    <pre style={{ margin: 0 }}>{JSON.stringify(currentModel, null, 2)}</pre>
                  </div>

                  <a 
                    href={atwiApi.exportAtwiModelJsonUrl(currentModel.id)}
                    download={`${currentModel.id}_export.json`}
                    style={{ 
                      backgroundColor: '#1976d2', 
                      color: 'white', 
                      textDecoration: 'none', 
                      padding: '10px 20px', 
                      borderRadius: '4px', 
                      fontWeight: 'bold', 
                      cursor: 'pointer',
                      textAlign: 'center',
                      display: 'block'
                    }}
                  >
                    💾 Export & Download JSON
                  </a>
                </div>
              )}
            </div>

            {/* Import Panel */}
            <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#fff', fontSize: '16px' }}>📥 Import Model JSON</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                <p style={{ margin: 0, color: '#aaa', fontSize: '13px', lineHeight: '1.5' }}>
                  Paste a raw ATWI workload model JSON object below to initialize a draft model.
                </p>

                <textarea 
                  value={importJsonText}
                  onChange={e => setImportJsonText(e.target.value)}
                  placeholder='Paste model JSON string here... e.g. {"name": "Test Model", ...}'
                  style={{ width: '100%', backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box', height: '140px', fontFamily: 'monospace', fontSize: '11px' }}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Original Source Filename:</label>
                    <input 
                      type="text" 
                      value={importFileName}
                      onChange={e => setImportFileName(e.target.value)}
                      style={{ width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '6px 8px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Creator / User:</label>
                    <input 
                      type="text" 
                      value={importCreator}
                      onChange={e => setImportCreator(e.target.value)}
                      style={{ width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '6px 8px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                  <button 
                    onClick={handleValidateImport}
                    style={{ backgroundColor: '#444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    🔍 Validate JSON
                  </button>
                  {importPreview && (
                    <button 
                      onClick={handleImportJsonModel}
                      style={{ backgroundColor: '#2e7d32', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginLeft: 'auto' }}
                    >
                      📥 Import as Draft Model
                    </button>
                  )}
                </div>

                {importError && (
                  <div style={{ backgroundColor: 'rgba(211, 47, 47, 0.1)', border: '1px solid #d32f2f', color: '#ff8a80', padding: '10px', borderRadius: '4px', fontSize: '11px', marginTop: '10px' }}>
                    ⚠️ {importError}
                  </div>
                )}

                {importPreview && (
                  <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.1)', border: '1px solid #4caf50', color: '#81c784', padding: '10px', borderRadius: '4px', fontSize: '12px', marginTop: '10px' }}>
                    <strong>✅ Preview validated:</strong>
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: '15px' }}>
                      <li>Name: {importPreview.name}</li>
                      <li>Version: {importPreview.metadata?.version || '1.0'}</li>
                      <li>Tasks Count: {importPreview.taskDefinitions?.length || 0} tasks</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Excel Import Placeholder */}
          <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#aaa', fontSize: '16px' }}>📊 Spreadsheet / Excel Import Pipeline</h4>
            <p style={{ margin: '0 auto 15px auto', color: '#888', fontSize: '13px', maxWidth: '600px', lineHeight: '1.6' }}>
              Excel import will be enabled in future releases after regional ATC sheet columns mapping and specific ATWI weightings are officially standardized.
              For now, extract excel derived weightings into a JSON file format and use the JSON paste importer above.
            </p>
            <span style={{ backgroundColor: '#333', color: '#aaa', padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
              Pipeline Locked (Pending Columns Standardisation)
            </span>
          </div>
        </div>
      )}

      {/* TAB 6: REVIEW & APPROVAL */}
      {!loading && activeTab === 'review_approval' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {!currentModel ? (
            <div style={{ backgroundColor: '#222', border: '1px dashed #444', borderRadius: '8px', padding: '40px', textAlign: 'center', color: '#aaa' }}>
              Please select a Workload Model in the top-right header selector to review governance workflow.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px', flexWrap: 'wrap' }}>
              
              {/* Metadata display */}
              <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#fff', fontSize: '16px' }}>📋 Model Identity & Governance Log</h3>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', lineHeight: '2.0' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ color: '#888', width: '150px' }}>Model ID:</td>
                      <td style={{ color: '#fff', fontFamily: 'monospace' }}>{currentModel.id}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ color: '#888' }}>Model Name:</td>
                      <td style={{ color: '#fff', fontWeight: 'bold' }}>{currentModel.name}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ color: '#888' }}>Version:</td>
                      <td style={{ color: '#ff9800', fontWeight: 'bold' }}>{currentModel.metadata.version}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ color: '#888' }}>Status / Phase:</td>
                      <td>
                        <span style={{ 
                          backgroundColor: getStatusBadge(currentModel.metadata.status).color + '22', 
                          color: getStatusBadge(currentModel.metadata.status).color, 
                          border: `1px solid ${getStatusBadge(currentModel.metadata.status).color}`,
                          padding: '2px 8px', 
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase'
                        }}>
                          {getStatusBadge(currentModel.metadata.status).label}
                        </span>
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ color: '#888' }}>Approved for Official KPI:</td>
                      <td>
                        {currentModel.metadata.approvedForKpi ? (
                          <span style={{ color: '#4caf50', fontWeight: 'bold' }}>✅ Approved (Yes)</span>
                        ) : (
                          <span style={{ color: '#f44336', fontWeight: 'bold' }}>❌ Excluded (No / Draft Only)</span>
                        )}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ color: '#888' }}>Import Source:</td>
                      <td style={{ color: '#aaa', textTransform: 'capitalize' }}>
                        {currentModel.metadata.source.replace('_', ' ')} 
                        {currentModel.metadata.sourceFileName && ` (${currentModel.metadata.sourceFileName})`}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ color: '#888' }}>Created By:</td>
                      <td style={{ color: '#aaa' }}>{currentModel.metadata.createdBy || 'Unknown'} <span style={{ fontSize: '11px', color: '#666' }}>({currentModel.metadata.createdAt})</span></td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ color: '#888' }}>Reviewed By:</td>
                      <td style={{ color: '#aaa' }}>
                        {currentModel.metadata.reviewedBy || 'Not Reviewed Yet'} 
                        {currentModel.metadata.reviewedAt && ` (${currentModel.metadata.reviewedAt})`}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ color: '#888' }}>Approved By:</td>
                      <td style={{ color: '#aaa' }}>
                        {currentModel.metadata.approvedBy || 'Not Approved Yet'} 
                        {currentModel.metadata.approvedAt && ` (${currentModel.metadata.approvedAt})`}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: '#888', verticalAlign: 'top', paddingTop: '5px' }}>Change Notes:</td>
                      <td style={{ color: '#888', fontSize: '12px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: '1.4', paddingTop: '5px' }}>
                        {currentModel.metadata.notes || 'No change logs.'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Actions panel */}
              <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#fff', fontSize: '16px' }}>⚙️ Governance Operations</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', fontSize: '13px' }}>
                  <div>
                    <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Auditor / Reviewer User:</label>
                    <input 
                      type="text" 
                      value={reviewUser}
                      onChange={e => setReviewUser(e.target.value)}
                      style={{ width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#aaa', marginBottom: '4px' }}>Review Audit Notes:</label>
                    <textarea 
                      placeholder="Add review log comments..."
                      value={reviewNotes}
                      onChange={e => setReviewNotes(e.target.value)}
                      style={{ width: '100%', backgroundColor: '#2a2a2a', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '8px', boxSizing: 'border-box', height: '60px' }}
                    />
                  </div>

                  {/* Transition actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid #333', paddingTop: '15px', marginTop: '5px' }}>
                    
                    {/* Draft/Imported -> Under Review */}
                    {(currentModel.metadata.status === 'draft' || currentModel.metadata.status === 'imported') && (
                      <button 
                        onClick={() => handleUpdateStatus('under_review')}
                        style={{ backgroundColor: '#9c27b0', color: 'white', border: 'none', padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        🔍 Submit Model for Review
                      </button>
                    )}

                    {/* Under Review -> Reviewed */}
                    {currentModel.metadata.status === 'under_review' && (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button 
                          onClick={() => handleUpdateStatus('reviewed')}
                          style={{ flex: 2, backgroundColor: '#00bcd4', color: 'white', border: 'none', padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          ✔ Mark as Reviewed
                        </button>
                        <button 
                          onClick={() => handleUpdateStatus('draft')}
                          style={{ flex: 1, backgroundColor: '#444', color: 'white', border: 'none', padding: '10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                        >
                          Reject to Draft
                        </button>
                      </div>
                    )}

                    {/* Reviewed -> Approved */}
                    {currentModel.metadata.status === 'reviewed' && (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button 
                          onClick={handleApproveModel}
                          style={{ flex: 2, backgroundColor: '#2e7d32', color: 'white', border: 'none', padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          🏆 APPROVE FOR OFFICIAL KPI
                        </button>
                        <button 
                          onClick={() => handleUpdateStatus('draft')}
                          style={{ flex: 1, backgroundColor: '#444', color: 'white', border: 'none', padding: '10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                        >
                          Reject to Draft
                        </button>
                      </div>
                    )}

                    {/* Approved -> Retire */}
                    {currentModel.metadata.status === 'approved' && (
                      <button 
                        onClick={handleRetireModel}
                        style={{ backgroundColor: '#d32f2f', color: 'white', border: 'none', padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        📴 Retire Approved Model
                      </button>
                    )}

                    {/* Retired -> Clone to start again */}
                    {currentModel.metadata.status === 'retired' && (
                      <button 
                        onClick={handleCloneModelParams}
                        style={{ backgroundColor: '#1976d2', color: 'white', border: 'none', padding: '10px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        🔄 Clone Retired model as Draft
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AtwiWorkloadPage;
