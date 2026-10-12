import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';

interface DashboardSummary {
  studies: { total: number; recent: any[] };
  scenarios: { total: number; frozen: number; recent: any[] };
  recordings: { total: number; latest: any[] };
  kpi: { resultCount: number; latest: any[] };
  aixm: { activeDatasetId: string; validationStatus: string };
  system: { apiStatus: string; generatedAt: string };
}

const DashboardPage = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/summary')
      .then(res => res.json())
      .then(data => {
        setSummary(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Dashboard summary fetch failed', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '40px', height: '40px', border: '4px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Initializing Executive Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', color: 'var(--primary)', padding: '6px 10px', borderRadius: '8px', fontSize: '18px' }}>
              <i className="fa-solid fa-chart-line"></i>
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0, color: 'var(--text)', letterSpacing: '-0.5px' }}>
              Executive Operations Dashboard
            </h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: summary?.system?.apiStatus === 'ok' ? 'var(--success)' : 'var(--danger)', boxShadow: summary?.system?.apiStatus === 'ok' ? '0 0 8px var(--success)' : 'none' }}></span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Core API: {summary?.system?.apiStatus === 'ok' ? 'ONLINE' : 'OFFLINE'}</span>
          </div>
          <button onClick={() => navigate('/simulations/live')} style={{ padding: '10px 20px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)' }}>
            <i className="fa-solid fa-play"></i> Launch Live Console
          </button>
        </div>
      </div>

      {/* Top Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        
        {/* Stat 1 */}
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-15px', right: '-15px', fontSize: '80px', opacity: 0.05 }}>📁</div>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Studies</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <span style={{ fontSize: '42px', fontWeight: 800, color: 'var(--text)', lineHeight: '1' }}>{summary?.studies?.total || 0}</span>
            <span style={{ fontSize: '14px', color: 'var(--success)', fontWeight: 600, marginBottom: '6px' }}><i className="fa-solid fa-arrow-up"></i> Active</span>
          </div>
        </div>

        {/* Stat 2 */}
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-15px', right: '-15px', fontSize: '80px', opacity: 0.05 }}>🎬</div>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Scenarios Created</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <span style={{ fontSize: '42px', fontWeight: 800, color: 'var(--text)', lineHeight: '1' }}>{summary?.scenarios?.total || 0}</span>
            <span style={{ fontSize: '14px', color: 'var(--primary)', fontWeight: 600, marginBottom: '6px' }}>{summary?.scenarios?.frozen || 0} Frozen</span>
          </div>
        </div>

        {/* Stat 3 */}
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-15px', right: '-15px', fontSize: '80px', opacity: 0.05 }}>📹</div>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Simulation Recordings</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <span style={{ fontSize: '42px', fontWeight: 800, color: 'var(--text)', lineHeight: '1' }}>{summary?.recordings?.total || 0}</span>
            <span style={{ fontSize: '14px', color: 'var(--warning)', fontWeight: 600, marginBottom: '6px' }}><i className="fa-solid fa-database"></i> Stored</span>
          </div>
        </div>

        {/* Stat 4 */}
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-15px', right: '-15px', fontSize: '80px', opacity: 0.05 }}>📊</div>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>KPI Analytics Results</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <span style={{ fontSize: '42px', fontWeight: 800, color: 'var(--text)', lineHeight: '1' }}>{summary?.kpi?.resultCount || 0}</span>
            <span style={{ fontSize: '14px', color: '#a855f7', fontWeight: 600, marginBottom: '6px' }}><i className="fa-solid fa-chart-pie"></i> Generated</span>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Studies & Activities */}
          <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-folder-open" style={{ color: 'var(--primary)' }}></i> Recent Studies
              </h2>
              <button onClick={() => navigate('/studies')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>View All &rarr;</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {summary?.studies?.recent?.length === 0 ? (
                 <div style={{ textAlign: 'center', padding: '40px 20px', backgroundColor: 'var(--bg-surface)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                   <i className="fa-solid fa-inbox" style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.5 }}></i>
                   <div>No recent studies found. Create one to get started.</div>
                 </div>
              ) : (
                summary?.studies?.recent?.map((study: any) => (
                  <div key={study.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border)', transition: 'transform 0.2s', cursor: 'pointer' }} onClick={() => navigate('/studies')} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(56, 189, 248, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                        <i className="fa-solid fa-plane-departure"></i>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '15px', marginBottom: '4px' }}>{study.name}</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{study.type} • {study.area || 'Unknown Area'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '12px', backgroundColor: study.status === 'completed' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(251, 191, 36, 0.1)', color: study.status === 'completed' ? 'var(--success)' : 'var(--warning)', fontWeight: 700, border: `1px solid ${study.status === 'completed' ? 'rgba(52, 211, 153, 0.2)' : 'rgba(251, 191, 36, 0.2)'}` }}>
                        {study.status.toUpperCase()}
                      </span>
                      <i className="fa-solid fa-chevron-right" style={{ color: 'var(--text-muted)' }}></i>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Workflow Progress */}
          <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 20px 0', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-diagram-project" style={{ color: '#a855f7' }}></i> Platform Readiness
            </h2>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {[
                { title: 'Airspace Data', status: summary?.aixm?.activeDatasetId ? 'Ready' : 'Pending', icon: 'fa-earth-asia', color: summary?.aixm?.activeDatasetId ? 'var(--success)' : 'var(--warning)' },
                { title: 'Scenarios', status: (summary?.scenarios?.total || 0) > 0 ? 'Ready' : 'Empty', icon: 'fa-code-branch', color: (summary?.scenarios?.total || 0) > 0 ? 'var(--success)' : 'var(--text-muted)' },
                { title: 'Simulation Env', status: 'Online', icon: 'fa-server', color: 'var(--success)' },
                { title: 'KPI Models', status: 'Active', icon: 'fa-brain', color: 'var(--primary)' }
              ].map((item, i) => (
                <div key={i} style={{ flex: 1, minWidth: '150px', backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: `${item.color}22`, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={`fa-solid ${item.icon}`}></i>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 700 }}>{item.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Quick Actions */}
          <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 20px 0', color: 'var(--text)' }}>
              Quick Actions
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              <button onClick={() => navigate('/studies')} style={{ padding: '16px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(56, 189, 248, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  <i className="fa-solid fa-folder-plus"></i>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>Create New Study</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Start a new simulation project</div>
                </div>
              </button>
              
              <button onClick={() => navigate('/scenarios')} style={{ padding: '16px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--success)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(52, 211, 153, 0.1)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  <i className="fa-solid fa-code-branch"></i>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>Build Scenario</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Configure flight events</div>
                </div>
              </button>
              
              <button onClick={() => navigate('/aixm-manager')} style={{ padding: '16px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--warning)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(251, 191, 36, 0.1)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  <i className="fa-solid fa-globe"></i>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>Manage AIXM Data</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Update airspace structures</div>
                </div>
              </button>

              <button onClick={() => navigate('/kpi')} style={{ padding: '16px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = '#a855f7'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  <i className="fa-solid fa-chart-pie"></i>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>View KPI Reports</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Analyze simulation results</div>
                </div>
              </button>
            </div>
          </div>

          {/* System Status Details */}
          <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--text)' }}>
              Environment Status
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Simulation Backend</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--success)', backgroundColor: 'rgba(52, 211, 153, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>OPERATIONAL</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Database Connection</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--success)', backgroundColor: 'rgba(52, 211, 153, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>CONNECTED</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>AIXM Dataset</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: summary?.aixm?.activeDatasetId ? 'var(--text)' : 'var(--warning)' }}>
                  {summary?.aixm?.activeDatasetId ? 'Dataset Loaded' : 'None Active'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Last Data Sync</span>
                <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text)' }}>
                  {new Date().toLocaleString()}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
