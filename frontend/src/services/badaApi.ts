export interface BadaAircraftPerformance {
  code: string;
  numEngines: number;
  engineType: string;
  weightCategory: string;
  weightCategoryLabel: string;
  mtowT: number;
  mrefT: number;
  mminT: number;
  vmoKt: number;
  mmo: number;
  maxAltFt: number;
  tolM: number;
  ldlM: number;
  wingspanM: number;
  lengthM: number;
  /** Vstall (KCAS) by flight phase: CR/IC/TO/AP/LD. The only speed BADA itself publishes. */
  stallSpeedsKcas: Record<string, number>;
}

/** NOT raw BADA — derived from Vstall(LD) via the standard 1.15-1.35x margin convention. */
export interface BadaApproachSpeeds {
  vAppNormalKt: number;
  vAppMaxKt: number;
  vTouchdownNormalKt: number;
  vTouchdownMaxKt: number;
  basedOnVstallLdKcas: number;
  note: string;
}

export interface BadaClimbSchedule {
  casCl1Kt: number;
  casCl2Kt: number;
  mCl: number;
}

export interface BadaGridRow {
  fl: number;
  climbSpeedLoKt: number | null;
  climbSpeedNomKt: number | null;
  climbSpeedHiKt: number | null;
  climbRocLoFpm: number | null;
  climbRocNomFpm: number | null;
  climbRocHiFpm: number | null;
  cruiseSpeedKt: number | null;
  cruiseFuelLoKgMin: number | null;
  cruiseFuelNomKgMin: number | null;
  cruiseFuelHiKgMin: number | null;
  descentSpeedKt: number | null;
  descentRodFpm: number | null;
}

export interface BadaAircraftDetail {
  code: string;
  manufacturerModel: string;
  coeffFile: string;
  isEquivalent: boolean;
  usedInFleetMix: boolean;
  performance: BadaAircraftPerformance | null;
  approachSpeeds: BadaApproachSpeeds | null;
  climbSchedule: BadaClimbSchedule | null;
  climbCruiseDescentGrid: BadaGridRow[];
  descentMassTier: string | null;
}

export interface BadaAircraft {
  code: string;
  manufacturerModel: string;
  coeffFile: string;
  isEquivalent: boolean;
  isIcaoDesignator: boolean;
  usedInFleetMix: boolean;
  performance: BadaAircraftPerformance | null;
}

export interface BadaComparisonNotes {
  installedRelease: string;
  installedReleaseDate: string;
  suppliedBaseIdentical: boolean;
  suppliedSynonymUpdatesAvailableThrough: string;
  newAircraftTypeCodesInLatestUpdate: number;
  removedAircraftTypeCodesInLatestUpdate: number;
  newCodesAreFleetRelevant: boolean;
  offIsaDataAvailable: boolean;
  offIsaWiredIntoEngine: boolean;
  badaFamilyHSampleIsDummyOnly: boolean;
}

export interface BadaStatus {
  release: { version: string; releaseDate: string };
  synonymCount: number;
  coeffFileCount: number;
  fleetMixCodes: string[];
  comparison: BadaComparisonNotes;
}

const API_BASE = '/api/bada';

async function handle<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || fallback);
  }
  return res.json();
}

export const badaApi = {
  getStatus: (): Promise<BadaStatus> => fetch(`${API_BASE}/status`).then(res => handle(res, 'Failed to load BADA status')),

  listAircraft: (opts?: { q?: string; fleetOnly?: boolean }): Promise<BadaAircraft[]> => {
    const params = new URLSearchParams();
    if (opts?.q) params.set('q', opts.q);
    if (opts?.fleetOnly) params.set('fleetOnly', 'true');
    return fetch(`${API_BASE}/aircraft?${params.toString()}`).then(res => handle(res, 'Failed to load BADA aircraft'));
  },

  getDetail: (code: string): Promise<BadaAircraftDetail> =>
    fetch(`${API_BASE}/aircraft/${encodeURIComponent(code)}`).then(res => handle(res, 'Failed to load BADA aircraft detail')),
};
