import { ComplianceResult, ComplianceAirportInfo } from '../types/models';

const API_BASE = '/api/compliance';

export const complianceApi = {
  getSupportedAirports: async (): Promise<ComplianceAirportInfo[]> => {
    const res = await fetch(`${API_BASE}/airports`);
    if (!res.ok) throw new Error('Failed to load supported airports for compliance evaluation.');
    return res.json();
  },

  getRuleset: async (airport: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/ruleset/${airport}`);
    if (!res.ok) throw new Error(`Failed to load ruleset for airport ${airport}.`);
    return res.json();
  },

  evaluateCompliance: async (recordingId: string, options: { saveResult?: boolean } = {}): Promise<ComplianceResult> => {
    const res = await fetch(`${API_BASE}/recording/${recordingId}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ options }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to evaluate compliance for this recording.');
    }
    return res.json();
  },

  getComplianceResult: async (recordingId: string): Promise<ComplianceResult> => {
    const res = await fetch(`${API_BASE}/recording/${recordingId}/result`);
    if (!res.ok) throw new Error(`Failed to load compliance result for recording ${recordingId}.`);
    return res.json();
  },

  deleteComplianceResult: async (recordingId: string): Promise<{ message: string; deletedFiles: string[] }> => {
    const res = await fetch(`${API_BASE}/recording/${recordingId}/result`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete compliance result for recording ${recordingId}.`);
    return res.json();
  },

  // Downloads must go through fetch() (not a plain <a href>) because the app's auth interceptor
  // (see AuthProvider.tsx) attaches the "Authorization: Bearer <token>" header only to fetch()
  // calls to /api/* -- a raw browser navigation to the same URL has no token and gets 401.
  downloadComplianceExport: async (recordingId: string, format: 'json' | 'docx'): Promise<void> => {
    const res = await fetch(`${API_BASE}/recording/${recordingId}/export.${format}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to download compliance ${format.toUpperCase()} export.`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `compliance_report_${recordingId}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  },
};
