export interface WeatherPreset {
  id: string;
  name: string;
  description: string;
  mode: 'none' | 'vfr' | 'ifr' | 'cb_ts' | 'low_visibility' | 'custom';
  windDirection: number | null;
  windSpeedKt: number | null;
  visibilityM: number | null;
  ceilingFt: number | null;
  createdAt: string;
  updatedAt: string;
}

const API_BASE = '/api/weather-presets';

async function handle<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || fallback);
  }
  return res.json();
}

export const weatherPresetsApi = {
  list: (): Promise<WeatherPreset[]> => fetch(API_BASE).then(res => handle(res, 'Failed to load weather presets')),

  create: (data: Partial<WeatherPreset>): Promise<WeatherPreset> =>
    fetch(API_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(res => handle(res, 'Failed to create weather preset')),

  update: (id: string, data: Partial<WeatherPreset>): Promise<WeatherPreset> =>
    fetch(`${API_BASE}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(res => handle(res, 'Failed to update weather preset')),

  remove: (id: string): Promise<{ success: boolean }> =>
    fetch(`${API_BASE}/${id}`, { method: 'DELETE' }).then(res => handle(res, 'Failed to delete weather preset')),
};
