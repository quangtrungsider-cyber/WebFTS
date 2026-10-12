export interface AerodromeLayoutAirport {
  icao: string;
  name: string;
  features: { runways: number; aprons: number; taxiways: number };
}

export interface AerodromeLayoutLayers {
  icao: string;
  layers: Record<string, GeoJSON.FeatureCollection>;
}

const API_BASE = '/api/aerodrome-layout';

let activeDatasetCache: Promise<string | null> | null = null;
let airportsCache: Promise<AerodromeLayoutAirport[]> | null = null;

async function handle<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || fallback);
  }
  return res.json();
}

export const aerodromeLayoutApi = {
  getActiveDatasetId: (): Promise<string | null> => {
    if (!activeDatasetCache) {
      activeDatasetCache = fetch(`${API_BASE}/active`)
        .then(res => handle<{ activeDatasetId: string | null }>(res, 'Failed to load active dataset'))
        .then(d => d.activeDatasetId);
    }
    return activeDatasetCache;
  },

  listAirports: async (): Promise<AerodromeLayoutAirport[]> => {
    if (!airportsCache) {
      airportsCache = aerodromeLayoutApi.getActiveDatasetId().then(datasetId => {
        if (!datasetId) return [];
        return fetch(`${API_BASE}/datasets/${datasetId}/airports`)
          .then(res => handle<AerodromeLayoutAirport[]>(res, 'Failed to load layout airports'));
      });
    }
    return airportsCache;
  },

  getLayers: (icao: string): Promise<AerodromeLayoutLayers> =>
    fetch(`${API_BASE}/active/airports/${icao}/layers`).then(res => handle(res, `Failed to load layout layers for ${icao}`)),
};
