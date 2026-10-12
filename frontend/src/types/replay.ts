export interface ReplayRecordingSummary {
  recordingId: string;
  runId?: string;
  studyId?: string;
  scenarioId?: string;
  scenarioName?: string;
  scenarioFileName?: string;
  scenarioBaseName?: string;
  icCommand?: string;
  status?: string;
  startedAt?: string;
  stoppedAt?: string | null;
  savedAt?: string | null;
  outputFolder?: string;
  sampleCount?: number;
  eventCount?: number;
  commandCount?: number;
  conflictCount?: number;
  watermark?: string;
  limitations?: string[];
}

export interface ReplayTrackSample {
  t: number;
  wallClock: string;
  callsign: string;
  lat: number;
  lon: number;
  altitudeFt?: number | null;
  speedKt?: number | null;
  headingDeg?: number | null;
  verticalSpeedFpm?: number | null;
  status?: string;
  conflictStatus?: string;
  source?: string;
}

export interface ReplayAircraftFrame {
  callsign: string;
  t: number;
  wallClock?: string;
  lat: number;
  lon: number;
  altitudeFt?: number | null;
  speedKt?: number | null;
  headingDeg?: number | null;
  verticalSpeedFpm?: number | null;
  status?: string;
  conflictStatus?: string;
}

export interface ReplayEvent {
  id: string;
  t: number;
  wallClock: string;
  type: string;
  message: string;
  data?: any;
}

export interface ReplayCommand {
  id: string;
  t: number;
  wallClock: string;
  command: string;
  source?: string;
  sent?: boolean;
}

export interface ReplayConflict {
  id: string;
  t: number;
  wallClock: string;
  callsign1: string;
  callsign2: string;
  horizontalNm?: number | null;
  verticalFt?: number | null;
  severity?: string;
  status?: string;
  data?: any;
}

export interface ReplayDataset {
  metadata: ReplayRecordingSummary;
  trackSamples: ReplayTrackSample[];
  events: ReplayEvent[];
  commands: ReplayCommand[];
  conflicts: ReplayConflict[];
}
