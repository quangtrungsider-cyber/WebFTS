import { Scenario } from '../types/models';

const API_BASE = '/api';

export const scenarioApi = {
  getScenarios: async (filters?: { studyId?: string; status?: string; type?: string; includeArchived?: boolean }): Promise<Scenario[]> => {
    const params = new URLSearchParams();
    if (filters?.studyId) params.set('studyId', filters.studyId);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.includeArchived) params.set('includeArchived', 'true');

    const res = await fetch(`${API_BASE}/scenarios?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load scenarios');
    return res.json();
  },

  getScenarioById: async (id: string): Promise<Scenario> => {
    const res = await fetch(`${API_BASE}/scenarios/${id}`);
    if (!res.ok) throw new Error('Failed to load scenario');
    return res.json();
  },

  createScenario: async (payload: Partial<Scenario>): Promise<Scenario> => {
    const res = await fetch(`${API_BASE}/scenarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to create scenario');
    }
    return res.json();
  },

  updateScenario: async (id: string, payload: Partial<Scenario>): Promise<Scenario> => {
    const res = await fetch(`${API_BASE}/scenarios/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update scenario');
    }
    return res.json();
  },

  archiveScenario: async (id: string): Promise<Scenario> => {
    const res = await fetch(`${API_BASE}/scenarios/${id}/archive`, {
      method: 'PATCH',
    });
    if (!res.ok) throw new Error('Failed to archive scenario');
    return res.json();
  },

  cloneScenario: async (id: string, payload?: { name?: string; type?: string }): Promise<Scenario> => {
    const res = await fetch(`${API_BASE}/scenarios/${id}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) throw new Error('Failed to clone scenario');
    return res.json();
  },

  validateScenario: async (id: string): Promise<Scenario> => {
    const res = await fetch(`${API_BASE}/scenarios/${id}/validate`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to validate scenario');
    return res.json();
  },

  freezeScenario: async (id: string): Promise<Scenario> => {
    const res = await fetch(`${API_BASE}/scenarios/${id}/freeze`, {
      method: 'POST',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to freeze scenario');
    }
    return res.json();
  }
};
