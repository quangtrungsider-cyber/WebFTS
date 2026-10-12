import React, { useState, useEffect } from 'react';
import { evidenceApi } from '../services/evidenceApi';
import { EvidencePackage } from '../types/models';
import { useI18n } from '../i18n';

const EvidencePage = () => {
  const { t } = useI18n();
  const [packages, setPackages] = useState<EvidencePackage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    evidenceApi.getEvidencePackages().then(data => {
      setPackages(data);
      setLoading(false);
    });
  }, []);

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>Evidence Package Manager</h1>
        <button style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Generate Evidence Package</button>
      </div>

      <div style={{ backgroundColor: 'rgba(25, 118, 210, 0.1)', padding: '20px', borderRadius: '12px', borderLeft: '4px solid var(--primary)', marginBottom: '32px' }}>
        <h4 style={{ margin: '0 0 8px 0', color: 'var(--primary)', fontSize: '16px' }}>DO-278A / ED-109A Compliance</h4>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>All simulation artifacts are securely hashed and logged to ensure traceability for safety assessments and regulatory approvals.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', flex: 1, minHeight: 0 }}>
        {/* Package List */}
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '15px' }}>Signed Evidence Packages</div>
          
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>{t('common.loading')}</div>}
            {packages.map(pkg => (
              <div key={pkg.id} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', backgroundColor: pkg.status === 'Approved' ? 'var(--primary-light)' : 'transparent', cursor: 'pointer', borderLeft: pkg.status === 'Approved' ? '4px solid var(--success)' : '4px solid transparent', transition: 'background 0.2s' }}>
                <div style={{ fontWeight: 600, color: pkg.status === 'Approved' ? 'var(--text)' : 'var(--text)' }}>{pkg.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>{pkg.status === 'Approved' ? 'Signed' : 'Draft'}: {pkg.date} by {pkg.author}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Package Details */}
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '16px', border: '1px solid var(--card-border)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '20px', marginBottom: '24px' }}>
            <div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: 'var(--primary)' }}>Package: EVP-2024-001</h3>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Study: SGN Capacity Assessment 2024</div>
            </div>
            <button style={{ backgroundColor: 'transparent', color: 'var(--success)', border: '1px solid var(--success)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-download"></i> Download ZIP
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px', fontWeight: 600 }}>Chain of Custody Status</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(52, 211, 153, 0.1)', color: 'var(--success)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, border: '1px solid rgba(52, 211, 153, 0.3)' }}>
                <i className="fa-solid fa-shield-check"></i> VERIFIED
              </div>
            </div>
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px', fontWeight: 600 }}>Signature Hash (SHA-256)</div>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all', backgroundColor: 'var(--input-bg)', color: 'var(--text)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--input-border)' }}>
                8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4
              </div>
            </div>
          </div>

          <h4 style={{ margin: '0 0 16px 0', borderBottom: '1px solid var(--border)', paddingBottom: '12px', fontSize: '16px', color: 'var(--text)' }}>Contained Artifacts</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 0', width: '40px', textAlign: 'center' }}><i className="fa-solid fa-database" style={{ color: 'var(--text-muted)' }}></i></td>
                <td style={{ padding: '12px 0', color: 'var(--text)', fontWeight: 500 }}>AIXM_AIRAC_2405.zip</td>
                <td style={{ padding: '12px 0', color: 'var(--text-muted)', textAlign: 'right' }}>4.2 MB</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 0', textAlign: 'center' }}><i className="fa-solid fa-code-branch" style={{ color: 'var(--text-muted)' }}></i></td>
                <td style={{ padding: '12px 0', color: 'var(--text)', fontWeight: 500 }}>SGN_Baseline_Config.scn</td>
                <td style={{ padding: '12px 0', color: 'var(--text-muted)', textAlign: 'right' }}>128 KB</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 0', textAlign: 'center' }}><i className="fa-solid fa-file-lines" style={{ color: 'var(--text-muted)' }}></i></td>
                <td style={{ padding: '12px 0', color: 'var(--text)', fontWeight: 500 }}>Simulation_Trace_Log_01.csv</td>
                <td style={{ padding: '12px 0', color: 'var(--text-muted)', textAlign: 'right' }}>15.6 MB</td>
              </tr>
              <tr>
                <td style={{ padding: '12px 0', textAlign: 'center' }}><i className="fa-solid fa-file-pdf" style={{ color: 'var(--text-muted)' }}></i></td>
                <td style={{ padding: '12px 0', color: 'var(--text)', fontWeight: 500 }}>KPI_Comparison_Report.pdf</td>
                <td style={{ padding: '12px 0', color: 'var(--text-muted)', textAlign: 'right' }}>1.1 MB</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EvidencePage;
