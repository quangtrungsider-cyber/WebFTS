import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SimulationsPage = () => {
  const [activeTab, setActiveTab] = useState('queue');
  const navigate = useNavigate();

  const handleLiveConsoleClick = () => {
    navigate('/simulations/live');
  };

  return (
    <div className="simulations-page">
      <h2>Simulations</h2>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
        <button 
          onClick={() => setActiveTab('queue')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeTab === 'queue' ? '#0d47a1' : 'transparent',
            color: 'white',
            border: '1px solid #333',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Run Queue
        </button>
        <button 
          onClick={handleLiveConsoleClick}
          style={{
            padding: '8px 16px',
            backgroundColor: 'transparent',
            color: 'white',
            border: '1px solid #333',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          <i className="fa-solid fa-satellite-dish" style={{ marginRight: '8px' }}></i>
          Live Simulation Console
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'queue' && (
          <div>
            <h3>Simulation Run Queue</h3>
            <p>Mock content: No simulations currently in queue.</p>
            <button style={{ padding: '8px 16px', backgroundColor: '#388e3c', color: 'white', border: 'none', borderRadius: '4px', marginTop: '10px', cursor: 'pointer' }}>
              + Schedule New Run
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimulationsPage;
