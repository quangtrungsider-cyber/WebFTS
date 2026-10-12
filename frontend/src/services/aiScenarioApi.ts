import { AISettings, AIGenerateRequest, AIGenerateResponse, AIStatusResponse } from '../types/models';

const API_BASE = '/api';

export const aiScenarioApi = {
  getSettings: async (): Promise<{ aiGeneration: AISettings }> => {
    const res = await fetch(`${API_BASE}/settings/platform`);
    if (!res.ok) throw new Error('Failed to load AI settings');
    return res.json();
  },

  saveSettings: async (settings: Partial<AISettings>): Promise<void> => {
    const res = await fetch(`${API_BASE}/settings/platform`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiGeneration: settings }),
    });
    if (!res.ok) throw new Error('Failed to save AI settings');
  },

  getStatus: async (): Promise<AIStatusResponse> => {
    const res = await fetch(`${API_BASE}/settings/platform/ai-status`);
    if (!res.ok) throw new Error('Failed to fetch AI status');
    return res.json();
  },

  generate: async (payload: AIGenerateRequest): Promise<AIGenerateResponse> => {
    const res = await fetch(`${API_BASE}/scenarios/ai-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'AI generation failed');
    }
    return res.json();
  },
};
