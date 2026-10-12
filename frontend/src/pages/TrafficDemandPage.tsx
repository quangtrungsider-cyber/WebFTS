import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { scenarioApi } from '../services/scenarioApi';
import { studyApi } from '../services/studyApi';
import { Scenario } from '../types/models';
import { useI18n } from '../i18n';
import ScenarioDataTabs from '../components/ScenarioDataTabs';

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Manual', fpl_dataset: 'FPL', template: 'Template',
  procedure_capacity: 'Sức chứa', seasonal_schedule: 'Mùa',
};
// Full text kept for the stat cards (unchanged) and for the shortened
// badge's title tooltip in the table (Cải tiến 3).
const SOURCE_LABEL_FULL: Record<string, string> = {
  manual: 'Manual', fpl_dataset: 'FPL Dataset', template: 'Template',
  procedure_capacity: 'Sức chứa theo thủ tục thực', seasonal_schedule: 'Lịch bay theo mùa',
};
const SOURCE_COLOR: Record<string, string> = {
  manual: '#6b7280', fpl_dataset: '#3b82f6', template: '#8b5cf6',
  procedure_capacity: '#10b981', seasonal_schedule: '#f59e0b',
};

const WARNING_DISMISSED_KEY = 'webf_studio_trafficdemand_warning_dismissed';

function paramsText(s: Scenario): string {
  const td = s.trafficDemand;
  if (!td) return '—';
  switch (td.source) {
    case 'procedure_capacity': {
      const cfg = td.capacityConfig;
      if (!cfg) return '(chưa cấu hình SID/STAR mix)';
      const dep = Object.values(cfg.sidMix || {}).reduce((a, b) => a + b, 0);
      const arr = Object.values(cfg.starMix || {}).reduce((a, b) => a + b, 0);
      return `${dep} dep/h · ${arr} arr/h · ${cfg.hours}h · seed ${cfg.seed}${cfg.asasOn ? ' · ASAS ON' : ''}`;
    }
    case 'seasonal_schedule':
      return `${td.seasonalPlanPath ?? '(chưa chọn file)'}${td.scenarioDate ? ` · ngày ${td.scenarioDate}` : ''}`;
    case 'fpl_dataset':
      return `Dataset: ${td.fplDatasetId || '—'}${td.movementCount ? ` · ${td.movementCount} movements` : ''}`;
    default:
      return `${td.movementCount ?? '—'} movements${td.timeWindowStart ? ` · ${td.timeWindowStart}–${td.timeWindowEnd}` : ''}`;
  }
}

// Cải tiến 4: relative-time formatter for `updatedAt` (the only timestamp
// the Scenario schema has -- no `createdBy`/author field exists, so no
// avatar is rendered here, per the Step-0 schema check).
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} giờ trước`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'hôm qua';
  if (diffD < 30) return `${diffD} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

type SortMode = 'newest' | 'oldest' | 'name' | 'status';

const TrafficDemandPage = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [studyNames, setStudyNames] = useState<Record<string, string>>({});
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Cải tiến 1: per-row "⋮" action menu.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Cải tiến 2: client-side filter/sort state.
  const [studyFilter, setStudyFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  // Cải tiến 5: dismissible warning box, persisted in localStorage.
  const [warningDismissed, setWarningDismissed] = useState(
    () => localStorage.getItem(WARNING_DISMISSED_KEY) === '1'
  );

  const loadScenarios = () => {
    setLoading(true);
    Promise.all([
      scenarioApi.getScenarios({ includeArchived }),
      studyApi.getStudies({ includeArchived: true }),
    ])
      .then(([scenarioList, studies]) => {
        setScenarios(scenarioList);
        setStudyNames(Object.fromEntries(studies.map(s => [s.id, s.name])));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadScenarios, [includeArchived]);

  // Close the open "⋮" menu on an outside click.
  useEffect(() => {
    if (!openMenuId) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [openMenuId]);

  const bySource = useMemo(() => {
    const counts: Record<string, number> = {};
    scenarios.forEach(s => {
      const src = s.trafficDemand?.source || 'manual';
      counts[src] = (counts[src] || 0) + 1;
    });
    return counts;
  }, [scenarios]);

  const studyOptions = useMemo(
    () => Array.from(new Set(scenarios.map(s => s.studyId))).sort((a, b) => (studyNames[a] || a).localeCompare(studyNames[b] || b)),
    [scenarios, studyNames]
  );
  const statusOptions = useMemo(() => Array.from(new Set(scenarios.map(s => s.status))).sort(), [scenarios]);

  const visibleScenarios = useMemo(() => {
    let list = scenarios;
    if (studyFilter !== 'ALL') list = list.filter(s => s.studyId === studyFilter);
    if (sourceFilter !== 'ALL') list = list.filter(s => (s.trafficDemand?.source || 'manual') === sourceFilter);
    if (statusFilter !== 'ALL') list = list.filter(s => s.status === statusFilter);

    const sorted = [...list];
    switch (sortMode) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        break;
      case 'oldest':
        sorted.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'status':
        sorted.sort((a, b) => a.status.localeCompare(b.status));
        break;
    }
    return sorted;
  }, [scenarios, studyFilter, sourceFilter, statusFilter, sortMode]);

  const dismissWarning = () => {
    setWarningDismissed(true);
    localStorage.setItem(WARNING_DISMISSED_KEY, '1');
  };
  const restoreWarning = () => {
    setWarningDismissed(false);
    localStorage.removeItem(WARNING_DISMISSED_KEY);
  };

  const handleAction = async (action: 'view' | 'edit' | 'clone' | 'freeze' | 'delete', s: Scenario) => {
    setOpenMenuId(null);
    switch (action) {
      case 'view':
        // No per-id scenario-detail route exists (ScenariosPage keeps
        // selection in local React state, not deep-linkable) -- best
        // effort is the scenario list itself.
        navigate('/scenarios');
        break;
      case 'edit':
        // TODO: wire to a real edit entry point once ScenariosPage exposes
        // a way to open its edit form for a given scenario id externally
        // (e.g. a query param it reads on mount). Not done here to avoid
        // modifying ScenariosPage.tsx outside this task's scope.
        alert('Chưa hỗ trợ');
        break;
      case 'clone':
        try {
          await scenarioApi.cloneScenario(s.id);
          loadScenarios();
        } catch (e: any) {
          alert(e?.message || 'Nhân bản thất bại');
        }
        break;
      case 'freeze':
        try {
          await scenarioApi.freezeScenario(s.id);
          loadScenarios();
        } catch (e: any) {
          alert(e?.message || 'Đóng băng thất bại');
        }
        break;
      case 'delete':
        // TODO: no DELETE /api/scenarios/:id endpoint exists in
        // scenarioApi.ts -- not fabricated here.
        alert('Chưa hỗ trợ');
        break;
    }
  };

  const selectStyle: React.CSSProperties = {
    padding: '5px 8px', background: 'var(--bg-surface)', color: 'var(--text)',
    border: '1px solid var(--card-border)', borderRadius: '6px', fontSize: '12px',
  };

  return (
    <div>
      <ScenarioDataTabs />
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>Traffic Demand</h1>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} />
            Bao gồm scenario đã lưu trữ
          </label>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
          {Object.entries(SOURCE_LABEL_FULL).map(([src, label]) => (
            <div key={src} style={{
              padding: '10px 16px', borderRadius: '10px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)',
              display: 'flex', alignItems: 'center', gap: '10px', minWidth: '160px',
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: SOURCE_COLOR[src] }} />
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>{bySource[src] || 0}</div>
              </div>
            </div>
          ))}
        </div>

        {!warningDismissed && (
          <div style={{
            marginBottom: '20px', padding: '14px 18px', borderRadius: '10px',
            backgroundColor: 'rgba(251,191,36,0.08)', border: '1px solid var(--warning)', fontSize: '13px', color: 'var(--text)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px',
          }}>
            <div>
              <strong style={{ color: 'var(--warning)' }}>Chưa có:</strong> thư viện mẫu (template) nhu cầu bay dùng chung, và
              trang quản lý tập dữ liệu FPL độc lập — hiện mỗi scenario tự khai báo nhu cầu bay riêng, chưa có kho tái sử dụng
              giữa các scenario như Weather/Constraints.
            </div>
            <button
              onClick={dismissWarning}
              title="Ẩn cảnh báo này"
              style={{ background: 'none', border: 'none', color: 'var(--warning)', cursor: 'pointer', fontSize: '15px', lineHeight: 1, padding: '2px' }}
            >
              ✕
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <select value={studyFilter} onChange={e => setStudyFilter(e.target.value)} style={selectStyle}>
            <option value="ALL">Study: Tất cả</option>
            {studyOptions.map(id => <option key={id} value={id}>{studyNames[id] || id}</option>)}
          </select>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={selectStyle}>
            <option value="ALL">Nguồn: Tất cả</option>
            {Object.keys(SOURCE_LABEL).map(src => <option key={src} value={src}>{SOURCE_LABEL_FULL[src]}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
            <option value="ALL">Trạng thái: Tất cả</option>
            {statusOptions.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
          <select value={sortMode} onChange={e => setSortMode(e.target.value as SortMode)} style={selectStyle}>
            <option value="newest">Sắp xếp: Mới nhất</option>
            <option value="oldest">Sắp xếp: Cũ nhất</option>
            <option value="name">Sắp xếp: Tên A-Z</option>
            <option value="status">Sắp xếp: Trạng thái</option>
          </select>
          {warningDismissed && (
            <button
              onClick={restoreWarning}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline', padding: 0 }}
            >
              Khôi phục cảnh báo
            </button>
          )}
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '16px' }}>{error}</div>}
        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</div>
        ) : (
          <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'visible' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Scenario</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Study</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Nguồn</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Tham số</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Cập nhật</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Trạng thái</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600, width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {visibleScenarios.map(s => {
                  const src = s.trafficDemand?.source || 'manual';
                  return (
                    <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text)' }}>{s.name}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{studyNames[s.studyId] || s.studyId}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span
                          title={SOURCE_LABEL_FULL[src] || src}
                          style={{
                            padding: '2px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                            backgroundColor: `${SOURCE_COLOR[src]}22`, color: SOURCE_COLOR[src],
                          }}
                        >
                          {SOURCE_LABEL[src] || src}
                        </span>
                      </td>
                      <td
                        title={paramsText(s)}
                        style={{ padding: '10px 16px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '12.5px', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {paramsText(s)}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: '12.5px' }} title={new Date(s.updatedAt).toLocaleString('vi-VN')}>
                        {relativeTime(s.updatedAt)}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '11.5px', fontWeight: 600 }}>{s.status}</td>
                      <td style={{ padding: '10px 16px', position: 'relative', textAlign: 'center' }}>
                        <button
                          onClick={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px', padding: '2px 6px' }}
                        >
                          ⋮
                        </button>
                        {openMenuId === s.id && (
                          <div
                            ref={menuRef}
                            style={{
                              position: 'absolute', right: '12px', top: '34px', zIndex: 20,
                              backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '8px',
                              boxShadow: '0 8px 20px rgba(0,0,0,0.35)', minWidth: '140px', overflow: 'hidden',
                            }}
                          >
                            {([
                              ['view', 'Xem'], ['edit', 'Sửa'], ['clone', 'Nhân bản'],
                              ['freeze', 'Đóng băng'], ['delete', 'Xoá'],
                            ] as const).map(([action, label]) => (
                              <div
                                key={action}
                                onClick={() => handleAction(action, s)}
                                style={{
                                  padding: '8px 14px', fontSize: '12.5px', color: action === 'delete' ? 'var(--danger)' : 'var(--text)',
                                  cursor: 'pointer', textAlign: 'left',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                              >
                                {label}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visibleScenarios.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('common.noData')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrafficDemandPage;
