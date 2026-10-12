export interface NavItem {
  path: string;
  i18nKey: string;
  icon: string;
  children?: NavItem[];
}

export const NAVIGATION_GROUPS: { key: string; i18nKey: string; items: NavItem[] }[] = [
  {
    key: 'workspace',
    i18nKey: 'nav.workspace',
    items: [
      { path: '/dashboard', i18nKey: 'nav.dashboard', icon: 'fa-solid fa-chart-line' },
      { path: '/studies', i18nKey: 'nav.studies', icon: 'fa-solid fa-folder-open' },
      {
        path: '/scenarios', i18nKey: 'nav.scenarios', icon: 'fa-solid fa-code-branch',
        children: [
          { path: '/scenarios', i18nKey: 'nav.scenariosManage', icon: 'fa-solid fa-code-branch' },
          { path: '/scenarios/airports', i18nKey: 'nav.scenariosAirports', icon: 'fa-solid fa-tower-broadcast' },
          { path: '/scenarios/sectors', i18nKey: 'nav.scenariosSectors', icon: 'fa-solid fa-draw-polygon' },
          { path: '/scenarios/airways', i18nKey: 'nav.scenariosAirways', icon: 'fa-solid fa-road' },
          { path: '/scenarios/waypoints', i18nKey: 'nav.scenariosWaypoints', icon: 'fa-solid fa-location-dot' },
          { path: '/scenarios/routes', i18nKey: 'nav.scenariosRoutes', icon: 'fa-solid fa-route' },
          { path: '/scenarios/traffic-demand', i18nKey: 'nav.scenariosTrafficDemand', icon: 'fa-solid fa-plane-arrival' },
          { path: '/scenarios/constraints', i18nKey: 'nav.scenariosConstraints', icon: 'fa-solid fa-ban' },
          { path: '/scenarios/rules', i18nKey: 'nav.scenariosRules', icon: 'fa-solid fa-scale-balanced' },
          { path: '/scenarios/weather', i18nKey: 'nav.scenariosWeather', icon: 'fa-solid fa-cloud-sun-rain' },
          { path: '/scenarios/bada', i18nKey: 'nav.scenariosBada', icon: 'fa-solid fa-plane' },
        ],
      },
    ]
  },
  {
    key: 'simulationData',
    i18nKey: 'nav.simulationData',
    items: [
      { path: '/simulations/live', i18nKey: 'nav.liveSimulation', icon: 'fa-solid fa-plane' },
      { path: '/replay', i18nKey: 'nav.replay', icon: 'fa-solid fa-backward' },
      { path: '/aixm-manager', i18nKey: 'nav.aixmManager', icon: 'fa-solid fa-database' },
      { path: '/monte-carlo', i18nKey: 'nav.monteCarlo', icon: 'fa-solid fa-dice' }
    ]
  },
  {
    key: 'analytics',
    i18nKey: 'nav.analytics',
    items: [
      { path: '/kpi-reports', i18nKey: 'nav.kpiReports', icon: 'fa-solid fa-chart-bar' },
      { path: '/kpi-reports/atwi-workload', i18nKey: 'nav.atwiWorkload', icon: 'fa-solid fa-brain' }
    ]
  },
  {
    key: 'governance',
    i18nKey: 'nav.governance',
    items: [
      { path: '/evidence', i18nKey: 'nav.evidence', icon: 'fa-solid fa-file-shield' },
      { path: '/settings', i18nKey: 'nav.settings', icon: 'fa-solid fa-cog' }
    ]
  }
];

export const NAVIGATION = NAVIGATION_GROUPS.flatMap(g => g.items);
