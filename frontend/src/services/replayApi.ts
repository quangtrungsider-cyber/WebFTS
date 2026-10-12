import {
  ReplayRecordingSummary,
  ReplayTrackSample,
  ReplayEvent,
  ReplayCommand,
  ReplayConflict,
  ReplayDataset
} from '../types/replay';

const API_BASE = '/api/recordings';

export const replayApi = {
  getRecordings: async (): Promise<ReplayRecordingSummary[]> => {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error('Failed to load recordings');
    return res.json();
  },

  getRecording: async (recordingId: string): Promise<ReplayRecordingSummary> => {
    const res = await fetch(`${API_BASE}/${recordingId}`);
    if (!res.ok) throw new Error(`Failed to load recording metadata for ${recordingId}`);
    return res.json();
  },

  getReplayTrack: async (recordingId: string): Promise<ReplayTrackSample[]> => {
    const res = await fetch(`${API_BASE}/${recordingId}/replay-track`);
    if (!res.ok) throw new Error(`Failed to load track samples for ${recordingId}`);
    return res.json();
  },

  getReplayEvents: async (recordingId: string): Promise<ReplayEvent[]> => {
    const res = await fetch(`${API_BASE}/${recordingId}/events`);
    if (!res.ok) throw new Error(`Failed to load events for ${recordingId}`);
    return res.json();
  },

  getReplayCommands: async (recordingId: string): Promise<ReplayCommand[]> => {
    const res = await fetch(`${API_BASE}/${recordingId}/commands`);
    if (!res.ok) throw new Error(`Failed to load commands for ${recordingId}`);
    return res.json();
  },

  getReplayConflicts: async (recordingId: string): Promise<ReplayConflict[]> => {
    const res = await fetch(`${API_BASE}/${recordingId}/conflicts`);
    if (!res.ok) throw new Error(`Failed to load conflicts for ${recordingId}`);
    return res.json();
  },

  getReplayDataset: async (recordingId: string): Promise<ReplayDataset> => {
    const res = await fetch(`${API_BASE}/${recordingId}/replay-dataset`);
    if (res.ok) {
      return res.json();
    }
    
    // Fallback: fetch endpoints in parallel if replay-dataset endpoint is unavailable
    const [metadata, trackSamples, events, commands, conflicts] = await Promise.all([
      replayApi.getRecording(recordingId),
      replayApi.getReplayTrack(recordingId),
      replayApi.getReplayEvents(recordingId),
      replayApi.getReplayCommands(recordingId),
      replayApi.getReplayConflicts(recordingId)
    ]);

    return {
      metadata,
      trackSamples,
      events,
      commands,
      conflicts
    };
  }
};
