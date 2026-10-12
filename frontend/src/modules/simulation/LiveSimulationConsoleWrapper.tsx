import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ScenarioLauncher from './ScenarioLauncher';

const LiveSimulationConsoleWrapper: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Component Mounts: Show the legacy simulation UI
    const legacyContainer = document.getElementById('legacy-simulation-container');
    const exitBtn = document.getElementById('exit-sim-btn');

    if (legacyContainer) {
      legacyContainer.style.display = 'flex'; // Restore original display mode
      legacyContainer.style.position = 'absolute';
      legacyContainer.style.top = '0';
      legacyContainer.style.left = '0';
      legacyContainer.style.width = '100vw';
      legacyContainer.style.height = '100vh';
      legacyContainer.style.zIndex = '100';

      // Trigger map resize since container went from none -> flex
      // Wait a tick for the browser layout to update
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        // Fallback for MapLibre instance if exposed globally
        if ((window as any).map && typeof (window as any).map.resize === 'function') {
          (window as any).map.resize();
        }
      }, 100);
    }

    // Handle exit button click
    const handleExitClick = () => {
      navigate('/dashboard');
    };

    if (exitBtn) {
      exitBtn.addEventListener('click', handleExitClick);
    }

    // Cleanup when component unmounts (user navigates away)
    return () => {
      if (legacyContainer) {
        legacyContainer.style.display = 'none'; // Hide it again
      }
      if (exitBtn) {
        exitBtn.removeEventListener('click', handleExitClick);
      }
    };
  }, [navigate]);

  return (
    <>
      {/* This wrapper acts as a controller for the legacy DOM nodes. */}
      <div style={{ display: 'none' }} data-testid="live-simulation-controller"></div>
      
      {/* Render the new Scenario Launcher over the legacy simulation */}
      <ScenarioLauncher />
    </>
  );
};

export default LiveSimulationConsoleWrapper;
