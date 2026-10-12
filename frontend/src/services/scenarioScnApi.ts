const API_BASE = '/api';

export const scenarioScnApi = {
  exportScenarioScn: async (scenarioId: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/export-scn`, {
      method: 'POST',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to export .scn');
    }
    return res.json();
  },

  getScenarioScn: async (scenarioId: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/scn`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to get .scn content');
    }
    return res.json();
  },

  downloadScenarioScn: (scenarioId: string) => {
    window.open(`${API_BASE}/scenarios/${scenarioId}/scn/download`, '_blank');
  }
};
