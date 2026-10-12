export interface ConstraintPreset {
  id: string;
  name: string;
  description: string;
  minArrArrGapSec: number;
  depAfterArrGapSec: number;
  minRunwayGapSec: number;
  createdAt: string;
  updatedAt: string;
}

const API_BASE = '/api/constraint-presets';

async function handle<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || fallback);
  }
  return res.json();
}

export const constraintPresetsApi = {
  list: (): Promise<ConstraintPreset[]> => fetch(API_BASE).then(res => handle(res, 'Failed to load constraint presets')),

  create: (data: Partial<ConstraintPreset>): Promise<ConstraintPreset> =>
    fetch(API_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(res => handle(res, 'Failed to create constraint preset')),

  update: (id: string, data: Partial<ConstraintPreset>): Promise<ConstraintPreset> =>
    fetch(`${API_BASE}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(res => handle(res, 'Failed to update constraint preset')),

  remove: (id: string): Promise<{ success: boolean }> =>
    fetch(`${API_BASE}/${id}`, { method: 'DELETE' }).then(res => handle(res, 'Failed to delete constraint preset')),
};
