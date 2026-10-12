const API_BASE = '/api/monte-carlo';

export type MonteCarloStudyType = 'p_wake' | '3nm_der';

export interface MonteCarloJobConfig {
  jobId: string;
  label: string;
  studyType: MonteCarloStudyType;
  nRuns: number;
  nWorkers: number;
  // p_wake only:
  aircraftType?: string;
  pWakeNm?: number;
  // 3nm_der only:
  mCandidates?: number[];
  tDelayMinS?: number;
  tDelayMaxS?: number;
}

export type MonteCarloJobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface MonteCarloJobProgress {
  done: number;
  total: number;
}

export interface MonteCarloJobSummary {
  jobId: string;
  label: string;
  studyType: MonteCarloStudyType;
  aircraftType?: string;
  mCandidates?: number[];
  nRuns: number;
  status: MonteCarloJobState;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  progress: MonteCarloJobProgress;
}

export interface MonteCarloJobDetail {
  jobId: string;
  config: MonteCarloJobConfig;
  status: MonteCarloJobState;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  progress: MonteCarloJobProgress;
  queuePosition: number | null;
}

export interface MonteCarloStatsBlock {
  min: number;
  p05: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface MonteCarloRunResult {
  seed: number;
  wind_dir_deg: number;
  wind_spd_kt: number;
  wind_source_ts?: string;
  liftoff_t_s: number | null;
  marker_t_s: number | null;
  marker_alt_ft: number | null;
  deleted_early: boolean;
}

export interface MonteCarloJobSummaryStats {
  nTotal: number;
  nError: number;
  nDeletedEarly: number;
  nNoMarkerReached: number;
  nValid: number;
  markerTimeS: MonteCarloStatsBlock | null;
  markerAltFt: MonteCarloStatsBlock | null;
  liftoffTimeS: MonteCarloStatsBlock | null;
  windSpdKtSampled: MonteCarloStatsBlock | null;
  worstCase: MonteCarloRunResult | null;
  bestCase: MonteCarloRunResult | null;
}

// --- 3NM/DER study result shapes (analysis/monte_carlo_3nm/aggregate.py:summarize()) ---

export interface ThreeNmStatsBlock {
  mean: number;
  p5: number;
  p1: number;
}

export interface ThreeNmTableRow {
  group: string;
  leader_type: string | null;
  follower_type: string | null;
  m_candidate_nm: number;
  n_runs: number;
  d_start: ThreeNmStatsBlock | null;
  d_min: ThreeNmStatsBlock | null;
  violation_rate_start_pct: number | null;
  violation_rate_min_pct: number | null;
}

export interface ThreeNmSummary {
  table: ThreeNmTableRow[];
  recommended: Record<string, ThreeNmTableRow | null>;
  runway_len_nm: number;
}

export interface MonteCarloJobResults {
  jobId: string;
  studyType: MonteCarloStudyType;
  config: MonteCarloJobConfig;
  summary: MonteCarloJobSummaryStats | ThreeNmSummary;
}

export interface CreateMonteCarloJobPayload {
  label: string;
  studyType: MonteCarloStudyType;
  nRuns: number;
  nWorkers: number;
  // p_wake only:
  aircraftType?: string;
  pWakeNm?: number;
  // 3nm_der only:
  mCandidates?: number[];
  tDelayMinS?: number;
  tDelayMaxS?: number;
}

async function handleJsonResponse<T>(res: Response, fallbackError: string): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || fallbackError);
  }
  return res.json();
}

export const monteCarloApi = {
  listJobs: async (): Promise<MonteCarloJobSummary[]> => {
    const res = await fetch(`${API_BASE}/jobs`);
    return handleJsonResponse(res, 'Failed to load Monte Carlo job list.');
  },

  createJob: async (payload: CreateMonteCarloJobPayload): Promise<{ jobId: string; status: MonteCarloJobState }> => {
    const res = await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleJsonResponse(res, 'Failed to launch Monte Carlo job.');
  },

  getJob: async (jobId: string): Promise<MonteCarloJobDetail> => {
    const res = await fetch(`${API_BASE}/jobs/${jobId}`);
    return handleJsonResponse(res, `Failed to load Monte Carlo job ${jobId}.`);
  },

  getJobResults: async (jobId: string): Promise<MonteCarloJobResults> => {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/results`);
    return handleJsonResponse(res, `Failed to load results for Monte Carlo job ${jobId}.`);
  },

  cancelJob: async (jobId: string): Promise<{ jobId: string; status: MonteCarloJobState }> => {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/cancel`, { method: 'POST' });
    return handleJsonResponse(res, `Failed to cancel Monte Carlo job ${jobId}.`);
  },

  deleteJob: async (jobId: string): Promise<{ success: boolean }> => {
    const res = await fetch(`${API_BASE}/jobs/${jobId}`, { method: 'DELETE' });
    return handleJsonResponse(res, `Failed to delete Monte Carlo job ${jobId}.`);
  },
};
