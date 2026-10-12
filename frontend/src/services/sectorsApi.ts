import { SectorFeature } from '../types/models';

const SECTORS_GEOJSON_URL = '/static/data/vietnam_tma_app_control_areas.geojson';

interface RawFeature {
  properties: {
    name: string;
    unit: string | null;
    frequency: string | null;
    service: string;
    vertical: string | null;
    source: string;
    center: string | null;
    radius_km: number | null;
    airspace_class?: string | null;
    horizontal_note?: string | null;
    vertical_note?: string | null;
    geometry_caveat?: string | null;
  };
  geometry: { type: string; coordinates: [number, number][][] };
}

export const sectorsApi = {
  listSectors: async (): Promise<SectorFeature[]> => {
    const res = await fetch(SECTORS_GEOJSON_URL);
    if (!res.ok) throw new Error('Failed to load sector boundaries');
    const data: { features: RawFeature[] } = await res.json();
    return data.features
      .filter(f => f.geometry.type === 'Polygon')
      .map(f => ({
        name: f.properties.name,
        unit: f.properties.unit,
        frequency: f.properties.frequency,
        service: f.properties.service,
        vertical: f.properties.vertical,
        source: f.properties.source,
        center: f.properties.center,
        radiusKm: f.properties.radius_km,
        rings: f.geometry.coordinates,
        airspaceClass: f.properties.airspace_class ?? null,
        horizontalNote: f.properties.horizontal_note ?? null,
        verticalNote: f.properties.vertical_note ?? null,
        geometryCaveat: f.properties.geometry_caveat ?? null,
      }))
      // Alphabetical, not source-file order -- entries appended later (e.g. a
      // newly added airspace) would otherwise land at the end of a long list
      // with no visual cue, making them easy to miss.
      .sort((a, b) => a.name.localeCompare(b.name));
  },
};
