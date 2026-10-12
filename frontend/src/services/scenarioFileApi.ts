const API_BASE = '/api';

export interface ScenarioFile {
  fileName: string;
  baseName: string;
  displayName: string;
  sizeBytes: number;
  updatedAt: string;
  icCommand: string;
}

export const scenarioFileApi = {
  getScenarioFiles: async (): Promise<ScenarioFile[]> => {
    const res = await fetch(`${API_BASE}/scenario-files`);
    if (!res.ok) throw new Error('Failed to load scenario files');
    return res.json();
  },

  getScenarioFileContent: async (fileName: string): Promise<{fileName: string; baseName: string; icCommand: string; scnContent: string}> => {
    const res = await fetch(`${API_BASE}/scenario-files/${fileName}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as {error?: string}).error || 'Failed to get file content');
    }
    return res.json();
  },

  updateScenarioFileContent: async (fileName: string, scnContent: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/scenario-files/${fileName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scnContent }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as {error?: string}).error || 'Failed to save file');
    }
  },

  deleteScenarioFile: async (fileName: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/scenario-files/${fileName}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as {error?: string}).error || 'Failed to delete file');
    }
  },

  uploadScenarioFile: async (file: File): Promise<{ overwritten: boolean; file: ScenarioFile }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/scenario-files`, { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as {error?: string}).error || 'Failed to upload file');
    }
    return data;
  },
};
