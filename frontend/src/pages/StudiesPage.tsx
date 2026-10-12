import React, { useState, useEffect } from 'react';
import { studyApi } from '../services/studyApi';
import { Study, StudyType, StudyStatus } from '../types/models';
import { useI18n } from '../i18n';

const TYPE_LABELS: Record<StudyType, string> = {
  capacity: 'Capacity / Năng lực',
  safety: 'Safety / An toàn',
  atfm: 'ATFM / Luồng không lưu',
  procedure: 'Procedure / Phương thức bay',
  airspace: 'Airspace / Vùng trời',
  other: 'Khác',
};

const STATUS_LABELS: Record<StudyStatus, string> = {
  draft: 'Dự thảo',
  in_analysis: 'Đang phân tích',
  review: 'Đang xem xét',
  completed: 'Hoàn thành',
  archived: 'Đã lưu trữ',
};

const StudiesPage = () => {
  const { t } = useI18n();
  const [studies, setStudies] = useState<Study[]>([]);
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Study>>({});
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [includeArchived, setIncludeArchived] = useState(false);

  const fetchStudies = () => {
    setLoading(true);
    setError('');
    studyApi.getStudies({ type: filterType, status: filterStatus, includeArchived })
      .then(data => {
        setStudies(data);
        if (selectedStudy) {
          const updated = data.find(s => s.id === selectedStudy.id);
          setSelectedStudy(updated || null);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStudies();
  }, [filterType, filterStatus, includeArchived]);

  const handleSave = () => {
    if (selectedStudy?.id) {
      studyApi.updateStudy(selectedStudy.id, formData)
        .then(() => {
          setIsEditing(false);
          fetchStudies();
        })
        .catch(err => alert(err.message));
    } else {
      studyApi.createStudy(formData)
        .then(() => {
          setIsEditing(false);
          fetchStudies();
        })
        .catch(err => alert(err.message));
    }
  };

  const handleArchive = (id: string) => {
    if (window.confirm('Bạn có chắc muốn lưu trữ Study này không?')) {
      studyApi.archiveStudy(id)
        .then(() => fetchStudies())
        .catch(err => alert(err.message));
    }
  };

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text)' }}>
            {t('studies.title')}
          </h1>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', flex: 1, minHeight: 0 }}>
        {/* List Panel */}
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>Studies Library</h3>
            <button 
              onClick={() => { setSelectedStudy(null); setFormData({}); setIsEditing(true); }}
              style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
            >
              + {t('common.create')}
            </button>
          </div>
          
          {/* Filters */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ flex: 1, padding: '8px', backgroundColor: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}>
                <option value="">All Types</option>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ flex: 1, padding: '8px', backgroundColor: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}>
                <option value="">All Statuses</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} style={{ accentColor: 'var(--primary)' }} />
              Include Archived
            </label>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>{t('common.loading')}</div>}
            {error && <div style={{ padding: '20px', color: 'var(--danger)', textAlign: 'center' }}>{error}</div>}
            {!loading && studies.length === 0 && (
               <div style={{ padding: '40px 20px', color: 'var(--text-muted)', textAlign: 'center' }}>{t('common.noData')}</div>
            )}
            
            {studies.map(study => (
              <div 
                key={study.id}
                onClick={() => { setSelectedStudy(study); setIsEditing(false); }}
                style={{ 
                  padding: '16px 20px', 
                  borderBottom: '1px solid var(--border)', 
                  cursor: 'pointer',
                  backgroundColor: selectedStudy?.id === study.id ? 'var(--primary-light)' : 'transparent',
                  borderLeft: selectedStudy?.id === study.id ? '4px solid var(--primary)' : '4px solid transparent',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{ fontWeight: 600, color: selectedStudy?.id === study.id ? 'var(--primary)' : 'var(--text)', marginBottom: '6px' }}>
                  {study.name}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>{TYPE_LABELS[study.type] || study.type} • {study.area}</span>
                  <span style={{ color: study.status === 'archived' ? 'var(--danger)' : study.status === 'completed' ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>{STATUS_LABELS[study.status] || study.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Details / Edit Panel */}
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '24px', overflowY: 'auto' }}>
          {isEditing ? (
            <div>
              <h2 style={{ margin: '0 0 24px 0', color: 'var(--primary)', fontSize: '20px' }}>{selectedStudy ? 'Edit Study' : 'Create New Study'}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Study Name *</label>
                  <input value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: '8px', outline: 'none' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Type</label>
                    <select value={formData.type || 'capacity'} onChange={e => setFormData({...formData, type: e.target.value as StudyType})} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: '8px', outline: 'none' }}>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Status</label>
                    <select value={formData.status || 'draft'} onChange={e => setFormData({...formData, status: e.target.value as StudyStatus})} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: '8px', outline: 'none' }}>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Area *</label>
                  <input value={formData.area || ''} onChange={e => setFormData({...formData, area: e.target.value})} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: '8px', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Objective *</label>
                  <input value={formData.objective || ''} onChange={e => setFormData({...formData, objective: e.target.value})} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: '8px', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Owner *</label>
                  <input value={formData.owner || ''} onChange={e => setFormData({...formData, owner: e.target.value})} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: '8px', outline: 'none' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>AIRAC Cycle</label>
                    <input value={formData.airacCycle || ''} onChange={e => setFormData({...formData, airacCycle: e.target.value})} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: '8px', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>AIXM Dataset ID</label>
                    <input value={formData.aixmDatasetId || ''} onChange={e => setFormData({...formData, aixmDatasetId: e.target.value})} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: '8px', outline: 'none' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Description</label>
                  <textarea value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} rows={4} style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)', color: 'var(--text)', border: '1px solid var(--input-border)', borderRadius: '8px', outline: 'none', resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
                  <button onClick={handleSave} style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>{t('common.save')}</button>
                  <button onClick={() => { setIsEditing(false); if (!selectedStudy) setSelectedStudy(null); }} style={{ backgroundColor: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>{t('common.cancel')}</button>
                </div>
              </div>
            </div>
          ) : selectedStudy ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '24px', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, color: 'var(--primary)', fontSize: '24px' }}>{selectedStudy.name}</h2>
                {selectedStudy.status === 'archived' && (
                  <span style={{ backgroundColor: 'rgba(248,113,113,0.1)', color: 'var(--danger)', padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: '1px solid rgba(248,113,113,0.3)' }}>Archived</span>
                )}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Type</div>
                  <div style={{ fontWeight: 500, color: 'var(--text)' }}>{TYPE_LABELS[selectedStudy.type] || selectedStudy.type}</div>
                </div>
                <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Status</div>
                  <div style={{ fontWeight: 500, color: 'var(--text)' }}>{STATUS_LABELS[selectedStudy.status] || selectedStudy.status}</div>
                </div>
                <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Owner</div>
                  <div style={{ fontWeight: 500, color: 'var(--text)' }}>{selectedStudy.owner}</div>
                </div>
                <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Area</div>
                  <div style={{ fontWeight: 500, color: 'var(--text)' }}>{selectedStudy.area}</div>
                </div>
                <div style={{ gridColumn: 'span 2', backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Objective</div>
                  <div style={{ color: 'var(--text)' }}>{selectedStudy.objective}</div>
                </div>
                <div style={{ gridColumn: 'span 2', backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Description</div>
                  <div style={{ color: 'var(--text)' }}>{selectedStudy.description || 'No description provided.'}</div>
                </div>
                <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>AIXM Dataset</div>
                  <div style={{ fontWeight: 500, color: 'var(--text)' }}>{selectedStudy.aixmDatasetId || 'N/A'}</div>
                </div>
                <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>AIRAC Cycle</div>
                  <div style={{ fontWeight: 500, color: 'var(--text)' }}>{selectedStudy.airacCycle || 'N/A'}</div>
                </div>
              </div>
              
              <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => { setFormData(selectedStudy); setIsEditing(true); }}
                  style={{ backgroundColor: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                >
                  {t('common.edit')}
                </button>
                {selectedStudy.status !== 'archived' && (
                  <button 
                    onClick={() => handleArchive(selectedStudy.id)}
                    style={{ backgroundColor: 'rgba(248,113,113,0.1)', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.3)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Archive Study
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-folder-open" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.2 }}></i>
              <div style={{ fontSize: '16px' }}>Select a study to view details</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudiesPage;
