import React, { useState, useEffect } from 'react';
import { gateApi } from '../services/gateApi';
import { MaturityGate } from '../types/models';

const MaturityGatePage = () => {
  const [gates, setGates] = useState<MaturityGate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gateApi.getMaturityGates().then(data => {
      setGates(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="maturity-gate-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Maturity Gate & Readiness Assessment</h2>
        <select style={{ padding: '8px', backgroundColor: '#333', color: 'white', border: '1px solid #444', borderRadius: '4px' }}>
          <option>Study: SGN Capacity Assessment 2024</option>
          <option>Study: HAN TMA Redesign</option>
        </select>
      </div>

      {/* Gate Status Overview */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
        <div style={{ flex: 1, backgroundColor: '#1e1e1e', padding: '15px', borderRadius: '8px', borderTop: '4px solid #4caf50', borderLeft: '1px solid #333', borderRight: '1px solid #333', borderBottom: '1px solid #333', textAlign: 'center' }}>
          <h4 style={{ margin: '0 0 5px 0', color: '#aaaaaa' }}>Gate 1</h4>
          <div style={{ fontWeight: 'bold' }}>Concept & Objectives</div>
          <div style={{ color: '#4caf50', marginTop: '10px', fontSize: '12px', fontWeight: 'bold' }}>PASSED</div>
        </div>
        <div style={{ flex: 1, backgroundColor: '#1e1e1e', padding: '15px', borderRadius: '8px', borderTop: '4px solid #4caf50', borderLeft: '1px solid #333', borderRight: '1px solid #333', borderBottom: '1px solid #333', textAlign: 'center' }}>
          <h4 style={{ margin: '0 0 5px 0', color: '#aaaaaa' }}>Gate 2</h4>
          <div style={{ fontWeight: 'bold' }}>Data Readiness</div>
          <div style={{ color: '#4caf50', marginTop: '10px', fontSize: '12px', fontWeight: 'bold' }}>PASSED</div>
        </div>
        <div style={{ flex: 1, backgroundColor: '#1e1e1e', padding: '15px', borderRadius: '8px', borderTop: '4px solid #ff9800', borderLeft: '1px solid #333', borderRight: '1px solid #333', borderBottom: '1px solid #333', textAlign: 'center', transform: 'scale(1.05)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          <h4 style={{ margin: '0 0 5px 0', color: '#ff9800' }}>Gate 3</h4>
          <div style={{ fontWeight: 'bold', color: '#ff9800' }}>Pre-Simulation Review</div>
          <div style={{ color: '#ff9800', marginTop: '10px', fontSize: '12px', fontWeight: 'bold' }}>IN PROGRESS</div>
        </div>
        <div style={{ flex: 1, backgroundColor: '#1e1e1e', padding: '15px', borderRadius: '8px', borderTop: '4px solid #555', borderLeft: '1px solid #333', borderRight: '1px solid #333', borderBottom: '1px solid #333', textAlign: 'center', opacity: 0.5 }}>
          <h4 style={{ margin: '0 0 5px 0', color: '#aaaaaa' }}>Gate 4</h4>
          <div style={{ fontWeight: 'bold' }}>Result Validation</div>
          <div style={{ color: '#aaaaaa', marginTop: '10px', fontSize: '12px' }}>PENDING</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Checklist */}
        <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '15px', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Gate 3 Readiness Checklist</h3>
            <button style={{ backgroundColor: '#1976d2', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Submit for ERB Review</button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input type="checkbox" checked readOnly style={{ marginTop: '4px' }} />
              <div>
                <div style={{ fontWeight: 'bold' }}>AIXM/AIRAC Dataset Approved</div>
                <div style={{ fontSize: '12px', color: '#aaaaaa' }}>Dataset 2405 has been validated and activated by Data Manager.</div>
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input type="checkbox" checked readOnly style={{ marginTop: '4px' }} />
              <div>
                <div style={{ fontWeight: 'bold' }}>Scenario Configuration Frozen</div>
                <div style={{ fontSize: '12px', color: '#aaaaaa' }}>Baseline and Alternative scenarios are locked and hashed.</div>
              </div>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input type="checkbox" style={{ marginTop: '4px' }} />
              <div>
                <div style={{ fontWeight: 'bold' }}>Safety Support Assessment (SSA) Initial Review</div>
                <div style={{ fontSize: '12px', color: '#aaaaaa' }}>Safety proxies and tolerances defined and agreed upon by stakeholders.</div>
              </div>
            </label>
          </div>
        </div>

        {/* Risk Register */}
        <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '8px', border: '1px solid #333' }}>
          <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #333', paddingBottom: '15px' }}>Risk Register</h3>
          
          <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: 'rgba(244, 67, 54, 0.1)', borderLeft: '3px solid #f44336', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'bold', fontSize: '13px' }}>RSK-01: Weather Model Accuracy</span>
              <span style={{ color: '#f44336', fontSize: '12px', fontWeight: 'bold' }}>HIGH</span>
            </div>
            <div style={{ fontSize: '12px', color: '#aaaaaa', marginTop: '4px' }}>Historical monsoon data may not accurately reflect extreme microbursts.</div>
          </div>

          <div style={{ padding: '10px', backgroundColor: 'rgba(255, 152, 0, 0.1)', borderLeft: '3px solid #ff9800', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'bold', fontSize: '13px' }}>RSK-02: FPL Validation Gaps</span>
              <span style={{ color: '#ff9800', fontSize: '12px', fontWeight: 'bold' }}>MEDIUM</span>
            </div>
            <div style={{ fontSize: '12px', color: '#aaaaaa', marginTop: '4px' }}>Some VFR flights missing from baseline traffic sample.</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaturityGatePage;
