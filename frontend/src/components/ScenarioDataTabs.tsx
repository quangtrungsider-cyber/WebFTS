import React from 'react';
import { NavLink } from 'react-router-dom';

const TABS = [
  { path: '/scenarios/airports', label: 'Airports' },
  { path: '/scenarios/sectors', label: 'Sectors' },
  { path: '/scenarios/airways', label: 'Airways' },
  { path: '/scenarios/waypoints', label: 'Waypoints' },
  { path: '/scenarios/routes', label: 'Routes / Airways' },
  { path: '/scenarios/traffic-demand', label: 'Traffic Demand' },
  { path: '/scenarios/constraints', label: 'Constraints' },
  { path: '/scenarios/rules', label: 'Rules' },
  { path: '/scenarios/weather', label: 'Weather' },
  { path: '/scenarios/bada', label: 'BADA' },
];

/** Horizontal switcher between sibling Scenario data-category pages
 * (Airports/Sectors/Waypoints/...) -- lets a user jump directly from one
 * category to another without going back through the sidebar, same pattern
 * shown across all the reference mockups. */
const ScenarioDataTabs: React.FC = () => (
  <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '20px', overflowX: 'auto' }}>
    {TABS.map(tab => (
      <NavLink
        key={tab.path}
        to={tab.path}
        style={({ isActive }) => ({
          padding: '10px 16px',
          fontSize: '13.5px',
          fontWeight: isActive ? 600 : 500,
          color: isActive ? 'var(--primary)' : 'var(--text-muted)',
          textDecoration: 'none',
          borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
          whiteSpace: 'nowrap',
        })}
      >
        {tab.label}
      </NavLink>
    ))}
  </div>
);

export default ScenarioDataTabs;
