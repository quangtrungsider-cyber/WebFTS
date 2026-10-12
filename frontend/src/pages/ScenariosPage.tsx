import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { scenarioApi } from '../services/scenarioApi';
import { studyApi } from '../services/studyApi';
import { scenarioScnApi } from '../services/scenarioScnApi';
import { aiScenarioApi } from '../services/aiScenarioApi';
import { Scenario, Study, ScenarioStatus, AIGenerateRequest, AIStatusResponse, CapacityScenarioConfig } from '../types/models';
import { useI18n } from '../i18n';
import CapacityConfigEditor from '../components/CapacityConfigEditor';
import WeatherConfigEditor from '../components/WeatherConfigEditor';
import SimpleScenarioBuilder from '../components/SimpleScenarioBuilder';

const AIRPORTS_WITH_DATA = [
  { icao: 'VVDN', name: 'Đà Nẵng', runways: { arr: ['35L', '17R'], dep: ['35R', '17L'] } },
  { icao: 'VVTS', name: 'Tân Sơn Nhất', runways: { arr: ['25L', '07R'], dep: ['25R', '07L'] } },
  { icao: 'VVNB', name: 'Nội Bài', runways: { arr: ['11L', '29R'], dep: ['11R', '29L'] } },
  { icao: 'VVPQ', name: 'Phú Quốc', runways: { arr: ['10', '28'], dep: ['10', '28'] } },
  { icao: 'VVCR', name: 'Cam Ranh', runways: { arr: ['02', '20'], dep: ['02', '20'] } },
  { icao: 'VVCT', name: 'Cần Thơ', runways: { arr: ['08', '26'], dep: ['08', '26'] } },
];

const PROVIDER_LABELS: Record<string, string> = {
  rule_based: 'Rule-based',
  claude: 'Claude',
  gemini: 'Gemini 2.5',
};

const ScenariosPage = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [studies, setStudies] = useState<Study[]>([]);
  const [selectedStudyId, setSelectedStudyId] = useState<string>('');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Scenario>>({});
  
  const [exportData, setExportData] = useState<any>(null);
  const [showScnModal, setShowScnModal] = useState(false);

  const [showSimpleModal, setShowSimpleModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatusResponse | null>(null);
  const [aiForm, setAiForm] = useState<AIGenerateRequest>({
    studyId: '',
    airport: 'VVDN',
    arrRunway: '35L',
    depRunway: '35R',
    movementCount: 10,
    durationMinutes: 60,
    prompt: '',
    airacCycle: '01/26',
  });
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    studyApi.getStudies().then(data => {
      setStudies(data);
      if (data.length > 0) {
        setSelectedStudyId(data[0].id);
      }
    }).catch(console.error);
    aiScenarioApi.getStatus().then(setAiStatus).catch(() => {});
  }, []);

  const handleAiGenerate = async () => {
    if (!selectedStudyId) return;
    setAiGenerating(true);
    setAiError('');
    try {
      const res = await aiScenarioApi.generate({ ...aiForm, studyId: selectedStudyId });
      setShowAiModal(false);
      fetchScenarios(selectedStudyId);
      setSelectedScenario(res.scenario);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiGenerating(false);
    }
  };

  const openAiModal = () => {
    setAiForm(prev => ({ ...prev, studyId: selectedStudyId }));
    setAiError('');
    setShowAiModal(true);
  };

  const updateAiAirport = (icao: string) => {
    const apt = AIRPORTS_WITH_DATA.find(a => a.icao === icao);
    setAiForm(prev => ({
      ...prev,
      airport: icao,
      arrRunway: apt?.runways.arr[0] ?? '',
      depRunway: apt?.runways.dep[1] ?? apt?.runways.dep[0] ?? '',
    }));
  };

  const fetchScenarios = (studyId: string) => {
    if (!studyId) return;
    setLoading(true);
    scenarioApi.getScenarios({ studyId })
      .then(data => {
        setScenarios(data);
        if (selectedScenario) {
          const updated = data.find(s => s.id === selectedScenario.id);
          setSelectedScenario(updated || null);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchScenarios(selectedStudyId);
    setSelectedScenario(null);
    setIsEditing(false);
    setExportData(null);
  }, [selectedStudyId]);

  const handleSave = () => {
    if (!formData.name || !formData.type) {
      alert('Please fill all required fields');
      return;
    }
    
    if (selectedScenario?.id) {
      scenarioApi.updateScenario(selectedScenario.id, formData)
        .then(() => {
          setIsEditing(false);
          fetchScenarios(selectedStudyId);
        })
        .catch(err => alert(err.message));
    } else {
      scenarioApi.createScenario({ ...formData, studyId: selectedStudyId })
        .then(() => {
          setIsEditing(false);
          fetchScenarios(selectedStudyId);
        })
        .catch(err => alert(err.message));
    }
  };

  const handleClone = (id: string) => {
    scenarioApi.cloneScenario(id)
      .then(() => fetchScenarios(selectedStudyId))
      .catch(err => alert(err.message));
  };

  const handleValidate = (id: string) => {
    scenarioApi.validateScenario(id)
      .then(() => fetchScenarios(selectedStudyId))
      .catch(err => alert(err.message));
  };

  const handleFreeze = (id: string) => {
    if (window.confirm('Are you sure you want to freeze this scenario? It cannot be edited afterwards.')) {
      scenarioApi.freezeScenario(id)
        .then(() => fetchScenarios(selectedStudyId))
        .catch(err => alert(err.message));
    }
  };

  const handleArchive = (id: string) => {
    if (window.confirm('Are you sure you want to archive this scenario?')) {
      scenarioApi.archiveScenario(id)
        .then(() => {
          setSelectedScenario(null);
          fetchScenarios(selectedStudyId);
        })
        .catch(err => alert(err.message));
    }
  };

  const handleExport = (id: string) => {
    scenarioScnApi.exportScenarioScn(id)
      .then(data => setExportData(data))
      .catch(err => alert(err.message));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => alert('Copied!'))
      .catch(() => alert('Failed to copy'));
  };

  const updateFormData = (field: string, value: any) => {
    setFormData(prev => {
      const keys = field.split('.');
      if (keys.length === 1) return { ...prev, [field]: value };
      
      const newObj = { ...prev };
      let current: any = newObj;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return newObj;
    });
  };

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            {t('scenarios.title')}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            disabled={!selectedStudyId}
            onClick={() => setShowSimpleModal(true)}
            style={{
              padding: '8px 16px', border: 'none', backgroundColor: 'var(--primary)',
              color: '#fff', borderRadius: '8px', cursor: selectedStudyId ? 'pointer' : 'not-allowed',
              fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <span>⚡</span> Kịch bản đơn giản
          </button>
          <button
            disabled={!selectedStudyId}
            onClick={openAiModal}
            style={{
              padding: '8px 16px', border: '1px solid #7c3aed',
              background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(59,130,246,0.15))',
              color: '#a78bfa', borderRadius: '8px', cursor: selectedStudyId ? 'pointer' : 'not-allowed',
              fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <span style={{ fontSize: '12px' }}>✦</span> Tạo bằng AI
            {aiStatus && (
              <span style={{ fontSize: '11px', color: '#666', fontWeight: 400 }}>
                ({PROVIDER_LABELS[aiStatus.provider] ?? aiStatus.provider})
              </span>
            )}
          </button>
          <button
            disabled={!selectedStudyId}
            onClick={() => { setSelectedScenario(null); setFormData({ type: 'baseline', status: 'draft' }); setIsEditing(true); setExportData(null); }}
            style={{ padding: '8px 16px', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', cursor: selectedStudyId ? 'pointer' : 'not-allowed', fontWeight: 600 }}
          >
            + {t('common.create')}
          </button>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', flex: 1, minHeight: 0 }}>
        {/* Scenario List */}
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Select Study</label>
            <select 
              value={selectedStudyId} 
              onChange={e => setSelectedStudyId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: '8px', outline: 'none' }}
            >
              <option value="">-- Select a Study --</option>
              {studies.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>{t('common.loading')}</div>}
            {error && <div style={{ padding: '20px', color: 'var(--danger)', textAlign: 'center' }}>{error}</div>}
            {!loading && scenarios.length === 0 && (
               <div style={{ padding: '40px 20px', color: 'var(--text-muted)', textAlign: 'center' }}>{t('common.noData')}</div>
            )}
            {scenarios.map(s => (
              <div 
                key={s.id}
                onClick={() => { setSelectedScenario(s); setIsEditing(false); setExportData(null); }}
                style={{ 
                  padding: '16px 20px', 
                  borderBottom: '1px solid var(--border)', 
                  cursor: 'pointer',
                  backgroundColor: selectedScenario?.id === s.id ? 'var(--primary-light)' : 'transparent',
                  borderLeft: selectedScenario?.id === s.id ? '4px solid var(--primary)' : '4px solid transparent',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{ fontWeight: 600, color: selectedScenario?.id === s.id ? 'var(--primary)' : 'var(--text)' }}>{s.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  <span style={{ textTransform: 'capitalize' }}>{s.type}</span>
                  <span style={{ 
                    color: s.status === 'frozen' ? 'var(--primary)' : s.status === 'archived' ? 'var(--danger)' : 'var(--warning)',
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}>{s.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scenario Config Editor */}
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '24px', overflowY: 'auto' }}>
          {isEditing ? (
            <div>
              <h3 style={{ margin: '0 0 24px 0', color: 'var(--primary)', fontSize: '20px' }}>{selectedScenario ? t('common.edit') : t('common.create')}</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Name *</label>
                  <input value={formData.name || ''} onChange={e => updateFormData('name', e.target.value)} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none' }} />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Type *</label>
                  <select value={formData.type || 'baseline'} onChange={e => updateFormData('type', e.target.value)} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none' }}>
                    <option value="baseline">Baseline</option>
                    <option value="alternative">Alternative</option>
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Description</label>
                  <input value={formData.description || ''} onChange={e => updateFormData('description', e.target.value)} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>AIXM Dataset ID</label>
                  <input value={formData.aixmDatasetId || ''} onChange={e => updateFormData('aixmDatasetId', e.target.value)} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>AIRAC Cycle</label>
                  <input value={formData.airacCycle || ''} onChange={e => updateFormData('airacCycle', e.target.value)} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Airport</label>
                  <input value={formData.airport || ''} onChange={e => updateFormData('airport', e.target.value)} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none' }} />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Airspace</label>
                  <input value={formData.airspace || ''} onChange={e => updateFormData('airspace', e.target.value)} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none' }} />
                </div>

                {/* Config groups */}
                <div style={{ backgroundColor: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 16px 0', color: 'var(--text)', fontSize: '15px' }}>Runway Config</h4>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Arrival Runway</label>
                    <input value={formData.runwayConfig?.arrivalRunway || ''} onChange={e => updateFormData('runwayConfig.arrivalRunway', e.target.value)} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '6px', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Departure Runway</label>
                    <input value={formData.runwayConfig?.departureRunway || ''} onChange={e => updateFormData('runwayConfig.departureRunway', e.target.value)} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '6px', outline: 'none' }} />
                  </div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 16px 0', color: 'var(--text)', fontSize: '15px' }}>Traffic Demand</h4>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Source</label>
                    <select value={formData.trafficDemand?.source || 'manual'} onChange={e => updateFormData('trafficDemand.source', e.target.value)} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '6px', outline: 'none' }}>
                      <option value="manual">Manual</option>
                      <option value="fpl_dataset">FPL Dataset</option>
                      <option value="template">Template</option>
                      <option value="procedure_capacity">Sức chứa theo thủ tục thực (SID/STAR mix)</option>
                    </select>
                  </div>
                  {formData.trafficDemand?.source === 'procedure_capacity' ? (
                    formData.airport ? (
                      <CapacityConfigEditor
                        airport={formData.airport}
                        value={formData.trafficDemand?.capacityConfig}
                        onChange={(config: CapacityScenarioConfig) => updateFormData('trafficDemand.capacityConfig', config)}
                      />
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--warning)' }}>Nhập mã sân bay (Airport) ở trên trước để tải danh sách SID/STAR.</div>
                    )
                  ) : (
                    <>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Movement Count</label>
                        <input type="number" value={formData.trafficDemand?.movementCount || ''} onChange={e => updateFormData('trafficDemand.movementCount', parseInt(e.target.value))} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '6px', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>FPL Dataset ID</label>
                        <input value={formData.trafficDemand?.fplDatasetId || ''} onChange={e => updateFormData('trafficDemand.fplDatasetId', e.target.value)} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '6px', outline: 'none' }} />
                      </div>
                    </>
                  )}
                </div>

                <div style={{ backgroundColor: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 16px 0', color: 'var(--text)', fontSize: '15px' }}>Weather Config</h4>
                  <WeatherConfigEditor
                    value={formData.weatherConfig}
                    onChange={config => updateFormData('weatherConfig', config)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '32px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
                <button onClick={handleSave} style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>{t('common.save')}</button>
                <button onClick={() => setIsEditing(false)} style={{ backgroundColor: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>{t('common.cancel')}</button>
              </div>
            </div>
          ) : selectedScenario ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
                <h3 style={{ margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '22px' }}>
                  {selectedScenario.name} 
                  {selectedScenario.status === 'frozen' && <span style={{ fontSize: '11px', backgroundColor: 'var(--bg-surface-elevated)', padding: '4px 8px', borderRadius: '6px', color: 'var(--text)', border: '1px solid var(--border)', letterSpacing: '0.5px' }}>FROZEN</span>}
                </h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {selectedScenario.status === 'frozen' && (
                    <button onClick={() => handleExport(selectedScenario.id)} style={{ backgroundColor: 'var(--success)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Export .scn</button>
                  )}
                  {selectedScenario.status !== 'frozen' && (
                    <button onClick={() => handleValidate(selectedScenario.id)} style={{ backgroundColor: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>{t('common.validate')}</button>
                  )}
                  {selectedScenario.status !== 'frozen' && (selectedScenario.validationStatus === 'passed' || selectedScenario.validationStatus === 'warning') && (
                    <button onClick={() => handleFreeze(selectedScenario.id)} style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Freeze</button>
                  )}
                  <button onClick={() => handleClone(selectedScenario.id)} style={{ backgroundColor: 'var(--warning)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Clone</button>
                </div>
              </div>

              {exportData && (
                <div style={{ marginBottom: '24px', padding: '20px', borderRadius: '12px', backgroundColor: 'rgba(52, 211, 153, 0.1)', border: '1px solid var(--success)' }}>
                  <h4 style={{ margin: '0 0 16px 0', color: 'var(--success)', fontSize: '16px' }}>Export Successful</h4>
                  <div style={{ marginBottom: '8px', fontSize: '14px' }}><strong>File:</strong> {exportData.scenarioFileName}</div>
                  <div style={{ marginBottom: '8px', fontSize: '14px' }}><strong>Base name:</strong> {exportData.scenarioBaseName}</div>
                  <div style={{ marginBottom: '8px', fontSize: '14px' }}><strong>Path:</strong> {exportData.scenarioPath}</div>
                  <div style={{ marginBottom: '20px', fontSize: '14px' }}>
                    <strong>Run command:</strong> 
                    <code style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '4px 8px', borderRadius: '6px', color: 'var(--primary)', marginLeft: '8px', fontWeight: 600 }}>
                      IC {exportData.scenarioBaseName}
                    </code>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button onClick={() => copyToClipboard(`IC ${exportData.scenarioBaseName}`)} style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Copy IC Command</button>
                    <button onClick={() => setShowScnModal(true)} style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>View .scn</button>
                    <button onClick={() => navigate(`/simulations/live?scenarioFile=${exportData.scenarioFileName}`)} style={{ backgroundColor: 'var(--success)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>{t('common.open')} Live Simulation</button>
                  </div>
                </div>
              )}

              {selectedScenario.validationStatus && selectedScenario.validationStatus !== 'not_checked' && (
                <div style={{ marginBottom: '24px', padding: '20px', borderRadius: '12px', border: '1px solid', borderColor: selectedScenario.validationStatus === 'passed' ? 'var(--success)' : selectedScenario.validationStatus === 'warning' ? 'var(--warning)' : 'var(--danger)', backgroundColor: selectedScenario.validationStatus === 'passed' ? 'rgba(52,211,153,0.05)' : selectedScenario.validationStatus === 'warning' ? 'rgba(251,191,36,0.05)' : 'rgba(248,113,113,0.05)' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', color: selectedScenario.validationStatus === 'passed' ? 'var(--success)' : selectedScenario.validationStatus === 'warning' ? 'var(--warning)' : 'var(--danger)' }}>
                    Validation: {selectedScenario.validationStatus.toUpperCase()}
                  </h4>
                  {selectedScenario.validationMessages && selectedScenario.validationMessages.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: 'var(--text)' }}>
                      {selectedScenario.validationMessages.map((msg, idx) => <li key={idx}>{msg}</li>)}
                    </ul>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={{ backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 20px 0', color: 'var(--text-muted)', fontSize: '15px' }}>Environment & Data</h4>
                  
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Airport / Airspace</label>
                    <div style={{ color: 'var(--text)', fontWeight: 500 }}>{selectedScenario.airport || selectedScenario.airspace || 'N/A'}</div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Dataset / AIRAC</label>
                    <div style={{ color: 'var(--text)', fontWeight: 500 }}>{selectedScenario.aixmDatasetId || selectedScenario.airacCycle || 'N/A'}</div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Runways (Arr / Dep)</label>
                    <div style={{ color: 'var(--text)', fontWeight: 500 }}>{selectedScenario.runwayConfig?.arrivalRunway || 'N/A'} / {selectedScenario.runwayConfig?.departureRunway || 'N/A'}</div>
                  </div>
                  {selectedScenario.scnFileName && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>SCN File</label>
                      <div style={{ color: 'var(--text)', fontFamily: 'monospace', fontWeight: 500 }}>{selectedScenario.scnFileName}</div>
                    </div>
                  )}
                  {selectedScenario.scenarioBaseName && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Base Name</label>
                      <div style={{ color: 'var(--text)', fontFamily: 'monospace', fontWeight: 500 }}>{selectedScenario.scenarioBaseName}</div>
                    </div>
                  )}
                  {selectedScenario.icCommand && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Run Command</label>
                      <div style={{ color: 'var(--primary)', fontFamily: 'monospace', fontWeight: 600 }}>IC {selectedScenario.scenarioBaseName || selectedScenario.name.toLowerCase()}</div>
                    </div>
                  )}
                </div>

                <div style={{ backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 20px 0', color: 'var(--text-muted)', fontSize: '15px' }}>Traffic Demand</h4>
                  
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Source</label>
                    <div style={{ color: 'var(--text)', textTransform: 'capitalize', fontWeight: 500 }}>{selectedScenario.trafficDemand?.source || 'N/A'}</div>
                  </div>
                  {selectedScenario.trafficDemand?.source === 'procedure_capacity' && selectedScenario.trafficDemand.capacityConfig ? (
                    <>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Movements/giờ (đi / đến)</label>
                        <div style={{ color: 'var(--text)', fontWeight: 500 }}>
                          {Object.values(selectedScenario.trafficDemand.capacityConfig.sidMix || {}).reduce((a: number, b: number) => a + b, 0)} / {Object.values(selectedScenario.trafficDemand.capacityConfig.starMix || {}).reduce((a: number, b: number) => a + b, 0)}
                        </div>
                      </div>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Số giờ / Seed</label>
                        <div style={{ color: 'var(--text)', fontWeight: 500 }}>{selectedScenario.trafficDemand.capacityConfig.hours}h / {selectedScenario.trafficDemand.capacityConfig.seed}</div>
                      </div>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Phân cách (đến-đến / cất sau hạ / runway chung)</label>
                        <div style={{ color: 'var(--text)', fontWeight: 500 }}>
                          {selectedScenario.trafficDemand.capacityConfig.minArrArrGapSec}s / {selectedScenario.trafficDemand.capacityConfig.depAfterArrGapSec}s / {selectedScenario.trafficDemand.capacityConfig.minRunwayGapSec}s
                        </div>
                      </div>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>ASAS tự động tránh xung đột</label>
                        <div style={{ color: 'var(--text)', fontWeight: 500 }}>{selectedScenario.trafficDemand.capacityConfig.asasOn ? 'Bật' : 'Tắt'}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>FPL Dataset</label>
                        <div style={{ color: 'var(--text)', fontWeight: 500 }}>{selectedScenario.trafficDemand?.fplDatasetId || selectedScenario.fplDatasetId || 'N/A'}</div>
                      </div>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Movement Count</label>
                        <div style={{ color: 'var(--text)', fontWeight: 500 }}>{selectedScenario.trafficDemand?.movementCount || 'N/A'}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {selectedScenario.status !== 'frozen' && (
                <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px' }}>
                  <button onClick={() => { setFormData(selectedScenario); setIsEditing(true); }} style={{ backgroundColor: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>{t('common.edit')}</button>
                  <button onClick={() => handleArchive(selectedScenario.id)} style={{ backgroundColor: 'rgba(248,113,113,0.1)', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.3)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Archive</button>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-code-branch" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.2 }}></i>
              <div style={{ fontSize: '16px' }}>Select a scenario to view details or config</div>
            </div>
          )}
        </div>
      </div>

      {showSimpleModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'var(--card-bg)', padding: '28px', borderRadius: '16px', border: '1px solid var(--card-border)', width: '520px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚡</span> Kịch bản đơn giản (1 tàu bay)
              </h3>
              <button onClick={() => setShowSimpleModal(false)} style={{ background: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}>&times;</button>
            </div>
            <SimpleScenarioBuilder
              studyId={selectedStudyId}
              onCreated={(s) => {
                // Don't auto-close: SimpleScenarioBuilder shows a "saved to
                // FTS Server/scenario/..." confirmation the user should
                // actually see, not have yanked away immediately.
                fetchScenarios(selectedStudyId);
                setSelectedScenario(s);
              }}
            />
          </div>
        </div>
      )}

      {showAiModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'var(--card-bg)', padding: '28px', borderRadius: '16px', border: '1px solid #7c3aed44', width: '560px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 0 40px rgba(124,58,237,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#a78bfa', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✦</span> Tạo kịch bản bằng AI
              </h3>
              <button onClick={() => setShowAiModal(false)} style={{ background: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}>&times;</button>
            </div>

            {aiStatus && (
              <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(124,58,237,0.08)', border: '1px solid #7c3aed33', fontSize: '13px', color: '#a78bfa' }}>
                Provider: <strong>{PROVIDER_LABELS[aiStatus.provider] ?? aiStatus.provider}</strong>
                {aiStatus.provider === 'claude' && !aiStatus.claudeConfigured && (
                  <span style={{ color: '#f87171', marginLeft: '12px' }}>⚠ API key not configured — will fall back to rule-based</span>
                )}
                {aiStatus.provider === 'gemini' && !aiStatus.geminiConfigured && (
                  <span style={{ color: '#f87171', marginLeft: '12px' }}>⚠ API key not configured — will fall back to rule-based</span>
                )}
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Sân bay</label>
              <select
                value={aiForm.airport}
                onChange={e => updateAiAirport(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none' }}
              >
                {AIRPORTS_WITH_DATA.map(a => (
                  <option key={a.icao} value={a.icao}>{a.icao} — {a.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Đường CHC hạ cánh</label>
                <select
                  value={aiForm.arrRunway}
                  onChange={e => setAiForm(p => ({ ...p, arrRunway: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none' }}
                >
                  {(AIRPORTS_WITH_DATA.find(a => a.icao === aiForm.airport)?.runways.arr ?? []).map(rwy => (
                    <option key={rwy} value={rwy}>{rwy}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Đường CHC cất cánh</label>
                <select
                  value={aiForm.depRunway}
                  onChange={e => setAiForm(p => ({ ...p, depRunway: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none' }}
                >
                  {(AIRPORTS_WITH_DATA.find(a => a.icao === aiForm.airport)?.runways.dep ?? []).map(rwy => (
                    <option key={rwy} value={rwy}>{rwy}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Số lượng chuyến bay</label>
                <input
                  type="number" min={1} max={50}
                  value={aiForm.movementCount}
                  onChange={e => setAiForm(p => ({ ...p, movementCount: parseInt(e.target.value) || 10 }))}
                  style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Thời lượng (phút)</label>
                <input
                  type="number" min={10} max={240}
                  value={aiForm.durationMinutes}
                  onChange={e => setAiForm(p => ({ ...p, durationMinutes: parseInt(e.target.value) || 60 }))}
                  style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>
                Mô tả kịch bản <span style={{ color: '#555', fontWeight: 400 }}>(để trống = tạo tự động)</span>
              </label>
              <textarea
                value={aiForm.prompt}
                onChange={e => setAiForm(p => ({ ...p, prompt: e.target.value }))}
                rows={4}
                placeholder="VD: Kịch bản kiểm tra năng lực khu vực sân bay Đà Nẵng giờ cao điểm buổi sáng, mỗi 3 phút một chuyến, ưu tiên SID SADIN1G..."
                style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', fontSize: '14px' }}
              />
            </div>

            {aiError && <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '14px', padding: '10px', backgroundColor: 'rgba(248,71,71,0.1)', borderRadius: '6px' }}>{aiError}</div>}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAiModal(false)}
                style={{ padding: '10px 20px', background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >
                Hủy
              </button>
              <button
                onClick={handleAiGenerate}
                disabled={aiGenerating || !selectedStudyId}
                style={{
                  padding: '10px 24px',
                  background: aiGenerating ? '#555' : 'linear-gradient(135deg, #7c3aed, #3b82f6)',
                  color: 'white', border: 'none', borderRadius: '8px',
                  cursor: aiGenerating ? 'default' : 'pointer', fontWeight: 600, fontSize: '14px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
              >
                {aiGenerating ? (
                  <><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '14px' }}>⟳</span> Đang tạo…</>
                ) : (
                  <><span>✦</span> Tạo kịch bản</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showScnModal && exportData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '16px', border: '1px solid var(--card-border)', width: '80%', maxWidth: '900px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text)' }}>{exportData.scenarioFileName}</h3>
              <button onClick={() => setShowScnModal(false)} style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
            </div>
            <pre style={{ flex: 1, overflowY: 'auto', backgroundColor: '#0f172a', padding: '20px', borderRadius: '12px', color: '#10b981', fontFamily: 'monospace', fontSize: '13px', border: '1px solid #1e293b' }}>
              {exportData.scnContent}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScenariosPage;

