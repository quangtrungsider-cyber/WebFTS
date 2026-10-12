import { Study } from '../types/models';

const API_BASE = '/api';

export const studyApi = {
  getStudies: async (filters?: { status?: string; type?: string; includeArchived?: boolean }): Promise<Study[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.includeArchived) params.set('includeArchived', 'true');

    const res = await fetch(`${API_BASE}/studies?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load studies');
    return res.json();
  },

  getStudyById: async (id: string): Promise<Study> => {
    const res = await fetch(`${API_BASE}/studies/${id}`);
    if (!res.ok) throw new Error('Failed to load study');
    return res.json();
  },

  createStudy: async (payload: Partial<Study>): Promise<Study> => {
    const res = await fetch(`${API_BASE}/studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to create study');
    }
    return res.json();
  },

  updateStudy: async (id: string, payload: Partial<Study>): Promise<Study> => {
    const res = await fetch(`${API_BASE}/studies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update study');
    }
    return res.json();
  },

  archiveStudy: async (id: string): Promise<Study> => {
    const res = await fetch(`${API_BASE}/studies/${id}/archive`, {
      method: 'PATCH',
    });
    if (!res.ok) throw new Error('Failed to archive study');
    return res.json();
  }
};
