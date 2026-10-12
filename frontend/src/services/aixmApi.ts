import { AixmDataset } from '../types/models';

export interface AixmImportError {
  ok: boolean;
  stage: 'upload' | 'extract' | 'scan' | 'parse' | 'normalize' | 'validate';
  message: string;
  details: Array<{
    file: string;
    group?: string;
    root?: string;
    status?: string;
    featureCount?: number;
    warnings?: string[];
    error?: string;
  }>;
}

export const aixmApi = {
  getDatasets: async (): Promise<AixmDataset[]> => {
    const res = await fetch('/api/aixm/datasets');
    if (!res.ok) {
      throw new Error('Failed to fetch datasets');
    }
    return res.json();
  },

  getActiveDataset: async (): Promise<AixmDataset> => {
    const res = await fetch('/api/aixm/active');
    if (!res.ok) {
      throw new Error('Failed to fetch active dataset');
    }
    return res.json();
  },

  uploadDataset: async (file: File): Promise<AixmDataset> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/aixm/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorObj = new Error(err.message || 'Failed to upload dataset') as any;
      errorObj.stage = err.stage || 'upload';
      errorObj.details = err.details || [];
      throw errorObj;
    }
    return res.json();
  },

  importServerFolder: async (serverPath: string): Promise<AixmDataset> => {
    const res = await fetch('/api/aixm/import-server', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ serverPath }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorObj = new Error(err.message || 'Failed to scan server folder') as any;
      errorObj.stage = err.stage || 'scan';
      errorObj.details = err.details || [];
      throw errorObj;
    }
    return res.json();
  },

  importMultipleXmls: async (files: File[]): Promise<AixmDataset> => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const res = await fetch('/api/aixm/import-multiple', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorObj = new Error(err.message || 'Failed to import XML files') as any;
      errorObj.stage = err.stage || 'parse';
      errorObj.details = err.details || [];
      throw errorObj;
    }
    return res.json();
  },

  validateDataset: async (datasetId: string): Promise<any> => {
    const res = await fetch(`/api/aixm/datasets/${datasetId}/validate`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to validate dataset');
    }
    return res.json();
  },

  activateDataset: async (datasetId: string): Promise<any> => {
    const res = await fetch(`/api/aixm/datasets/${datasetId}/activate`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to activate dataset');
    }
    return res.json();
  },

  deleteDataset: async (datasetId: string): Promise<any> => {
    const res = await fetch(`/api/aixm/datasets/${datasetId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to delete dataset');
    }
    return res.json();
  },

  compareDatasets: async (datasetId: string, otherId: string): Promise<any> => {
    const res = await fetch(`/api/aixm/datasets/${datasetId}/compare/${otherId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to compare datasets');
    }
    return res.json();
  }
};
