import { AirportProcedures, AirportRoutes, AirportWaypoint } from '../types/models';

const API_BASE = '/api';

export const airportProceduresApi = {
  listAirports: async (): Promise<string[]> => {
    const res = await fetch(`${API_BASE}/airports`);
    if (!res.ok) throw new Error('Failed to load airport list');
    const data = await res.json();
    return data.airports;
  },

  getProcedures: async (icao: string): Promise<AirportProcedures> => {
    const res = await fetch(`${API_BASE}/airports/${icao}/procedures`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to load procedures for ${icao}`);
    }
    return res.json();
  },

  getWaypoints: async (icao: string): Promise<AirportWaypoint[]> => {
    const res = await fetch(`${API_BASE}/airports/${icao}/waypoints`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to load waypoints for ${icao}`);
    }
    const data = await res.json();
    return data.waypoints;
  },

  getRoutes: async (icao: string): Promise<AirportRoutes> => {
    const res = await fetch(`${API_BASE}/airports/${icao}/routes`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to load routes for ${icao}`);
    }
    return res.json();
  },
};
