import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import StudiesPage from '../pages/StudiesPage';
import ScenariosPage from '../pages/ScenariosPage';
import AirportsPage from '../pages/AirportsPage';
import SectorsPage from '../pages/SectorsPage';
import AirwaysPage from '../pages/AirwaysPage';
import WaypointsPage from '../pages/WaypointsPage';
import RoutesAirwaysPage from '../pages/RoutesAirwaysPage';
import TrafficDemandPage from '../pages/TrafficDemandPage';
import ConstraintsPage from '../pages/ConstraintsPage';
import RulesPage from '../pages/RulesPage';
import WeatherPage from '../pages/WeatherPage';
import BadaPage from '../pages/BadaPage';
import SimulationsPage from '../pages/SimulationsPage';
import ReplayPage from '../pages/ReplayPage';
import KpiReportsPage from '../pages/KpiReportsPage';
import AtwiWorkloadPage from '../pages/kpi/AtwiWorkloadPage';
import AixmManagerPage from '../pages/AixmManagerPage';
import MonteCarloPage from '../pages/MonteCarloPage';
import EvidencePage from '../pages/EvidencePage';
import MaturityGatePage from '../pages/MaturityGatePage';
import SettingsPage from '../pages/SettingsPage';
import LiveSimulationConsoleWrapper from '../modules/simulation/LiveSimulationConsoleWrapper';

import { LoginPage } from '../pages/auth/LoginPage';
import { UnauthorizedPage } from '../pages/auth/UnauthorizedPage';
import { ProtectedRoute } from '../auth/ProtectedRoute';

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      {/* Protected Routes */}
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/studies" element={<ProtectedRoute><StudiesPage /></ProtectedRoute>} />
      <Route path="/scenarios" element={<ProtectedRoute><ScenariosPage /></ProtectedRoute>} />
      <Route path="/scenarios/airports" element={<ProtectedRoute><AirportsPage /></ProtectedRoute>} />
      <Route path="/scenarios/sectors" element={<ProtectedRoute><SectorsPage /></ProtectedRoute>} />
      <Route path="/scenarios/airways" element={<ProtectedRoute><AirwaysPage /></ProtectedRoute>} />
      <Route path="/scenarios/waypoints" element={<ProtectedRoute><WaypointsPage /></ProtectedRoute>} />
      <Route path="/scenarios/routes" element={<ProtectedRoute><RoutesAirwaysPage /></ProtectedRoute>} />
      <Route path="/scenarios/traffic-demand" element={<ProtectedRoute><TrafficDemandPage /></ProtectedRoute>} />
      <Route path="/scenarios/constraints" element={<ProtectedRoute><ConstraintsPage /></ProtectedRoute>} />
      <Route path="/scenarios/rules" element={<ProtectedRoute><RulesPage /></ProtectedRoute>} />
      <Route path="/scenarios/weather" element={<ProtectedRoute><WeatherPage /></ProtectedRoute>} />
      <Route path="/scenarios/bada" element={<ProtectedRoute><BadaPage /></ProtectedRoute>} />
      <Route path="/simulations" element={<ProtectedRoute><SimulationsPage /></ProtectedRoute>} />
      <Route path="/simulations/live" element={<ProtectedRoute><LiveSimulationConsoleWrapper /></ProtectedRoute>} />
      <Route path="/replay" element={<ProtectedRoute><ReplayPage /></ProtectedRoute>} />
      <Route path="/kpi-reports" element={<ProtectedRoute><KpiReportsPage /></ProtectedRoute>} />
      <Route path="/kpi-reports/atwi-workload" element={<ProtectedRoute><AtwiWorkloadPage /></ProtectedRoute>} />
      <Route path="/aixm-manager" element={<ProtectedRoute><AixmManagerPage /></ProtectedRoute>} />
      <Route path="/monte-carlo" element={<ProtectedRoute><MonteCarloPage /></ProtectedRoute>} />
      <Route path="/evidence" element={<ProtectedRoute><EvidencePage /></ProtectedRoute>} />
      <Route path="/maturity-gate" element={<ProtectedRoute><MaturityGatePage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
    </Routes>
  );
};
