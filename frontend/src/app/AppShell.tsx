import React from 'react';
import Header from '../components/layout/Header';
import Sidebar from '../components/layout/Sidebar';
import Breadcrumb from '../components/layout/Breadcrumb';
import { AppRoutes } from './routes';
import { useLocation } from 'react-router-dom';

const AppShell: React.FC = () => {
  const location = useLocation();
  const isSimulationLive = location.pathname === '/simulations/live';
  const isAuthPage = location.pathname === '/login' || location.pathname === '/unauthorized';

  if (isSimulationLive || isAuthPage) {
    return <AppRoutes />;
  }

  return (
    <div className="fts-app-shell">
      <Sidebar />
      <div className="fts-main-wrapper">
        <Header />
        <div className="fts-content-area">
          <Breadcrumb />
          <AppRoutes />
        </div>
      </div>
    </div>
  );
};

export default AppShell;
