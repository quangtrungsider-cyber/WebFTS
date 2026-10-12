import {
  ReplayTrackSample,
  ReplayEvent,
  ReplayCommand,
  ReplayConflict,
  ReplayAircraftFrame
} from '../types/replay';

export const replayEngine = {
  /**
   * Determine the absolute time range [startT, endT] for the recording.
   */
  getReplayTimeRange(
    trackSamples: ReplayTrackSample[],
    events: ReplayEvent[],
    commands: ReplayCommand[],
    conflicts: ReplayConflict[]
  ): { startT: number; endT: number } {
    let minT = Infinity;
    let maxT = -Infinity;

    // Check track samples
    trackSamples.forEach(s => {
      if (s.t < minT) minT = s.t;
      if (s.t > maxT) maxT = s.t;
    });

    // Check events
    events.forEach(e => {
      if (e.t < minT) minT = e.t;
      if (e.t > maxT) maxT = e.t;
    });

    // Check commands
    commands.forEach(c => {
      if (c.t < minT) minT = c.t;
      if (c.t > maxT) maxT = c.t;
    });

    // Check conflicts
    conflicts.forEach(c => {
      if (c.t < minT) minT = c.t;
      if (c.t > maxT) maxT = c.t;
    });

    // Fallbacks if no data exists
    if (minT === Infinity) minT = 0;
    if (maxT === -Infinity) maxT = 3600; // 1 hour default

    // Add a tiny buffer at the end
    return { startT: minT, endT: Math.max(minT + 1, maxT) };
  },

  /**
   * Group track samples by callsign, sorted ascending by time t.
   */
  groupSamplesByCallsign(trackSamples: ReplayTrackSample[]): Record<string, ReplayTrackSample[]> {
    const groups: Record<string, ReplayTrackSample[]> = {};
    
    trackSamples.forEach(sample => {
      if (!sample.callsign) return;
      if (!groups[sample.callsign]) {
        groups[sample.callsign] = [];
      }
      groups[sample.callsign].push(sample);
    });

    // Sort each group by time t ascending
    Object.keys(groups).forEach(callsign => {
      groups[callsign].sort((a, b) => a.t - b.t);
    });

    return groups;
  },

  /**
   * Interpolate aircraft parameters linearly for a given time t.
   */
  interpolateAircraftFrame(
    samples: ReplayTrackSample[],
    currentT: number
  ): ReplayAircraftFrame | null {
    if (!samples || samples.length === 0) return null;

    const first = samples[0];
    const last = samples[samples.length - 1];

    // Out of bounds: do not render if current time is outside the first and last sample window
    if (currentT < first.t || currentT > last.t) {
      return null;
    }

    // Exact match or single sample
    if (samples.length === 1) {
      return {
        callsign: first.callsign,
        t: currentT,
        wallClock: first.wallClock,
        lat: first.lat,
        lon: first.lon,
        altitudeFt: first.altitudeFt,
        speedKt: first.speedKt,
        headingDeg: first.headingDeg,
        verticalSpeedFpm: first.verticalSpeedFpm,
        status: first.status,
        conflictStatus: first.conflictStatus
      };
    }

    // Find the segment containing currentT
    let prev = first;
    let next = last;

    for (let i = 0; i < samples.length - 1; i++) {
      if (samples[i].t <= currentT && samples[i + 1].t >= currentT) {
        prev = samples[i];
        next = samples[i + 1];
        break;
      }
    }

    const duration = next.t - prev.t;
    if (duration <= 0) {
      return {
        callsign: prev.callsign,
        t: currentT,
        wallClock: prev.wallClock,
        lat: prev.lat,
        lon: prev.lon,
        altitudeFt: prev.altitudeFt,
        speedKt: prev.speedKt,
        headingDeg: prev.headingDeg,
        verticalSpeedFpm: prev.verticalSpeedFpm,
        status: prev.status,
        conflictStatus: prev.conflictStatus
      };
    }

    // Calculate linear interpolation weight
    const factor = (currentT - prev.t) / duration;

    const interpolatedLat = prev.lat + (next.lat - prev.lat) * factor;
    const interpolatedLon = prev.lon + (next.lon - prev.lon) * factor;

    // Linear altitude and speed interpolation
    const prevAlt = prev.altitudeFt ?? 0;
    const nextAlt = next.altitudeFt ?? 0;
    const interpolatedAlt = prev.altitudeFt !== undefined && next.altitudeFt !== undefined
      ? prevAlt + (nextAlt - prevAlt) * factor
      : prev.altitudeFt;

    const prevSpeed = prev.speedKt ?? 0;
    const nextSpeed = next.speedKt ?? 0;
    const interpolatedSpeed = prev.speedKt !== undefined && next.speedKt !== undefined
      ? prevSpeed + (nextSpeed - prevSpeed) * factor
      : prev.speedKt;

    // For heading, use the closest sample's heading to avoid issues crossing 360/0 deg
    const closestSample = factor < 0.5 ? prev : next;
    const heading = closestSample.headingDeg;

    return {
      callsign: prev.callsign,
      t: currentT,
      wallClock: closestSample.wallClock,
      lat: interpolatedLat,
      lon: interpolatedLon,
      altitudeFt: interpolatedAlt,
      speedKt: interpolatedSpeed,
      headingDeg: heading,
      verticalSpeedFpm: closestSample.verticalSpeedFpm,
      status: closestSample.status,
      conflictStatus: closestSample.conflictStatus
    };
  },

  /**
   * Build aircraft frames for all callsigns active at a specific time t.
   */
  buildCurrentFrames(
    groupedSamples: Record<string, ReplayTrackSample[]>,
    currentT: number
  ): ReplayAircraftFrame[] {
    const frames: ReplayAircraftFrame[] = [];

    Object.keys(groupedSamples).forEach(callsign => {
      const frame = this.interpolateAircraftFrame(groupedSamples[callsign], currentT);
      if (frame !== null) {
        frames.push(frame);
      }
    });

    return frames;
  },

  /**
   * Get events near the specified time t within a window.
   */
  getEventsNearTime(events: ReplayEvent[], currentT: number, windowSec: number = 5): ReplayEvent[] {
    return events.filter(e => Math.abs(e.t - currentT) <= windowSec);
  },

  /**
   * Get active conflicts near the specified time t.
   */
  getActiveConflicts(
    conflicts: ReplayConflict[],
    currentT: number,
    windowSec: number = 5
  ): ReplayConflict[] {
    return conflicts.filter(c => Math.abs(c.t - currentT) <= windowSec);
  }
};
