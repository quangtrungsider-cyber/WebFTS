import { SimulationRecording, AircraftTrackSample, SimulationEvent, CommandLogEntry, ConflictLogEntry } from '../types/models';

const API_BASE = '/api';

export const recordingApi = {
  createRecording: async (payload: {
    studyId?: string;
    scenarioId?: string;
    scenarioName?: string;
    scenarioFileName?: string;
    scenarioBaseName?: string;
    icCommand?: string;
    route?: string;
  }): Promise<{ recordingId: string; metadata: SimulationRecording; outputFolder: string }> => {
    const res = await fetch(`${API_BASE}/recordings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to create recording session');
    }
    return res.json();
  },

  appendSamples: async (recordingId: string, samples: AircraftTrackSample[]): Promise<{ recordingId: string; appended: number }> => {
    const res = await fetch(`${API_BASE}/recordings/${recordingId}/samples`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to append samples');
    }
    return res.json();
  },

  appendEvents: async (recordingId: string, events: SimulationEvent[]): Promise<{ recordingId: string; appended: number }> => {
    const res = await fetch(`${API_BASE}/recordings/${recordingId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to append events');
    }
    return res.json();
  },

  appendCommands: async (recordingId: string, commands: CommandLogEntry[]): Promise<{ recordingId: string; appended: number }> => {
    const res = await fetch(`${API_BASE}/recordings/${recordingId}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to append commands');
    }
    return res.json();
  },

  appendConflicts: async (recordingId: string, conflicts: ConflictLogEntry[]): Promise<{ recordingId: string; appended: number }> => {
    const res = await fetch(`${API_BASE}/recordings/${recordingId}/conflicts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conflicts }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to append conflicts');
    }
    return res.json();
  },

  stopRecording: async (recordingId: string): Promise<SimulationRecording> => {
    const res = await fetch(`${API_BASE}/recordings/${recordingId}/stop`, {
      method: 'POST',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to stop recording');
    }
    return res.json();
  },

  getRecordings: async (): Promise<SimulationRecording[]> => {
    const res = await fetch(`${API_BASE}/recordings`);
    if (!res.ok) throw new Error('Failed to load recordings');
    return res.json();
  },

  getRecording: async (recordingId: string): Promise<SimulationRecording> => {
    const res = await fetch(`${API_BASE}/recordings/${recordingId}`);
    if (!res.ok) throw new Error('Failed to load recording metadata');
    return res.json();
  },

  getReplayTrack: async (recordingId: string): Promise<AircraftTrackSample[]> => {
    const res = await fetch(`${API_BASE}/recordings/${recordingId}/replay-track`);
    if (!res.ok) throw new Error('Failed to load replay tracks');
    return res.json();
  },

  getRecordingEvents: async (recordingId: string): Promise<SimulationEvent[]> => {
    const res = await fetch(`${API_BASE}/recordings/${recordingId}/events`);
    if (!res.ok) throw new Error('Failed to load recording events');
    return res.json();
  },

  getRecordingCommands: async (recordingId: string): Promise<CommandLogEntry[]> => {
    const res = await fetch(`${API_BASE}/recordings/${recordingId}/commands`);
    if (!res.ok) throw new Error('Failed to load recording commands');
    return res.json();
  },

  getRecordingConflicts: async (recordingId: string): Promise<ConflictLogEntry[]> => {
    const res = await fetch(`${API_BASE}/recordings/${recordingId}/conflicts`);
    if (!res.ok) throw new Error('Failed to load recording conflicts');
    return res.json();
  },

  deleteRecording: async (recordingId: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/recordings/${recordingId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete recording');
    }
  }
};
