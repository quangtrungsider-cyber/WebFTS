import { KpiRecordingAnalysisRequest, KpiRecordingAnalysisResult, KpiComparisonResult } from '../types/models';

const API_BASE = '/api/kpi';

export interface KpiCatalogueEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  unit: string;
  formula: string;
  sourceFiles: string[];
  method: string;
  higherIsWorse: boolean;
  requiresAtwi?: boolean;
}

export interface KpiSummaryData {
  recordingId: string;
  metadata: any;
  hasAtwiResult: boolean;
  hasKpiResult: boolean;
  generatedAt: string | null;
  sourcesAvailability: {
    [fileName: string]: boolean;
  };
}

export const kpiApi = {
  getKpiCatalogue: async (): Promise<KpiCatalogueEntry[]> => {
    const res = await fetch(`${API_BASE}/catalogue`);
    if (!res.ok) throw new Error('Failed to load KPI catalogue.');
    return res.json();
  },

  getKpiRecordingSummary: async (recordingId: string): Promise<KpiSummaryData> => {
    const res = await fetch(`${API_BASE}/recording/${recordingId}/summary`);
    if (!res.ok) throw new Error(`Failed to load summary for recording ${recordingId}.`);
    return res.json();
  },

  analyzeKpiRecording: async (recordingId: string, payload: KpiRecordingAnalysisRequest): Promise<KpiRecordingAnalysisResult> => {
    const res = await fetch(`${API_BASE}/recording/${recordingId}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to analyze recording KPIs.');
    }
    return res.json();
  },

  getKpiRecordingResult: async (recordingId: string): Promise<KpiRecordingAnalysisResult> => {
    const res = await fetch(`${API_BASE}/recording/${recordingId}/result`);
    if (!res.ok) throw new Error(`Failed to load KPI result for recording ${recordingId}.`);
    return res.json();
  },

  getKpiRecordingVector: async (recordingId: string): Promise<any[]> => {
    const res = await fetch(`${API_BASE}/recording/${recordingId}/vector`);
    if (!res.ok) throw new Error(`Failed to load KPI vector for recording ${recordingId}.`);
    return res.json();
  },

  getKpiRecordingWarnings: async (recordingId: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/recording/${recordingId}/warnings`);
    if (!res.ok) throw new Error(`Failed to load KPI warnings for recording ${recordingId}.`);
    return res.json();
  },

  compareKpiRecordings: async (payload: { baselineRecordingId: string; alternativeRecordingId: string }): Promise<KpiComparisonResult> => {
    const res = await fetch(`${API_BASE}/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to compare simulation recordings.');
    }
    return res.json();
  },

  deleteKpiRecordingResult: async (recordingId: string): Promise<{ message: string; deletedFiles: string[] }> => {
    const res = await fetch(`${API_BASE}/recording/${recordingId}/result`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete KPI result for recording ${recordingId}.`);
    return res.json();
  }
};
