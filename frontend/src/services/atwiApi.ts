import {
  AtwiTaskDefinition,
  AtwiWorkloadModel,
  AtwiCalculationInput,
  AtwiCalculationResult,
  AtwiModelStatus,
  AtwiPosition
} from '../types/atwi';

const API_BASE = '/api/atwi';

export const atwiApi = {
  getAtwiTaskIndex: async (): Promise<AtwiTaskDefinition[]> => {
    const res = await fetch(`${API_BASE}/task-index`);
    if (!res.ok) throw new Error('Failed to load ATWI Task Index');
    return res.json();
  },

  updateAtwiTaskIndex: async (taskDefinitions: AtwiTaskDefinition[]): Promise<AtwiTaskDefinition[]> => {
    const res = await fetch(`${API_BASE}/task-index`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskDefinitions)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update ATWI Task Index');
    }
    return res.json();
  },

  getAtwiModels: async (): Promise<AtwiWorkloadModel[]> => {
    const res = await fetch(`${API_BASE}/models`);
    if (!res.ok) throw new Error('Failed to load ATWI Models');
    return res.json();
  },

  getAtwiModel: async (id: string): Promise<AtwiWorkloadModel> => {
    const res = await fetch(`${API_BASE}/models/${id}`);
    if (!res.ok) throw new Error('Failed to load ATWI Model detail');
    return res.json();
  },

  createAtwiModel: async (model: Partial<AtwiWorkloadModel>): Promise<AtwiWorkloadModel> => {
    const res = await fetch(`${API_BASE}/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to create ATWI Model');
    }
    return res.json();
  },

  updateAtwiModel: async (
    id: string,
    patch: Partial<AtwiWorkloadModel> & { version?: string; notes?: string }
  ): Promise<AtwiWorkloadModel> => {
    const res = await fetch(`${API_BASE}/models/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update ATWI Model');
    }
    return res.json();
  },

  cloneAtwiModel: async (id: string, payload: { name?: string; createdBy?: string }): Promise<AtwiWorkloadModel> => {
    const res = await fetch(`${API_BASE}/models/${id}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to clone ATWI Model');
    }
    return res.json();
  },

  updateAtwiModelStatus: async (
    id: string,
    payload: { status: AtwiModelStatus; user?: string; notes?: string }
  ): Promise<AtwiWorkloadModel> => {
    const res = await fetch(`${API_BASE}/models/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update ATWI Model status');
    }
    return res.json();
  },

  approveAtwiModel: async (id: string, payload: { user?: string; notes?: string }): Promise<AtwiWorkloadModel> => {
    const res = await fetch(`${API_BASE}/models/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to approve ATWI Model');
    }
    return res.json();
  },

  retireAtwiModel: async (id: string): Promise<AtwiWorkloadModel> => {
    const res = await fetch(`${API_BASE}/models/${id}/retire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to retire ATWI Model');
    }
    return res.json();
  },

  calculateAtwi: async (input: AtwiCalculationInput): Promise<AtwiCalculationResult> => {
    const res = await fetch('/api/atwi/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to calculate ATWI workload');
    }
    return res.json();
  },

  importAtwiModelJson: async (payload: {
    model: any;
    sourceFileName?: string;
    createdBy?: string;
  }): Promise<AtwiWorkloadModel> => {
    const res = await fetch('/api/atwi/import-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to import ATWI Model');
    }
    return res.json();
  },

  exportAtwiModelJsonUrl: (id: string): string => {
    return `${API_BASE}/models/${id}/export-json`;
  },

  analyzeRecordingAtwi: async (
    recordingId: string,
    modelId: string,
    windowDurationSec: number
  ): Promise<any> => {
    const res = await fetch(`${API_BASE}/analyze-recording`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordingId, modelId, windowDurationSec })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to analyze recording ATWI');
    }
    return res.json();
  },

  getRecordingAtwiResult: async (recordingId: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/recordings/${recordingId}/result`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to load ATWI recording analysis result');
    }
    return res.json();
  },

  evaluateScenarioAtwi: async (
    scenarioFileName: string,
    modelId: string,
    windowDurationSec: number
  ): Promise<any> => {
    const res = await fetch(`${API_BASE}/evaluate-scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioFileName, modelId, windowDurationSec })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to evaluate scenario ATWI');
    }
    return res.json();
  },

  getPositions: async (icao?: string): Promise<AtwiPosition[]> => {
    const url = icao ? `${API_BASE}/positions?icao=${encodeURIComponent(icao)}` : `${API_BASE}/positions`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load controller positions');
    return res.json();
  },

  createPosition: async (payload: Partial<AtwiPosition>): Promise<AtwiPosition> => {
    const res = await fetch(`${API_BASE}/positions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to create controller position');
    }
    return res.json();
  },

  updatePosition: async (id: string, payload: Partial<AtwiPosition>): Promise<AtwiPosition> => {
    const res = await fetch(`${API_BASE}/positions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update controller position');
    }
    return res.json();
  },

  deletePosition: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/positions/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete controller position');
    }
  }
};

