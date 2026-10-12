import { AirwayLegacyParam, AirwaySegment, AirwaySummary, StructuredAirway } from '../types/models';

// Same convention as sectorsApi.ts: this reference data is a static KMZ/docx/
// PDF export, not something the backend computes, so it is fetched directly
// -- no Flask endpoint needed.
const ROUTES_GEOJSON_URL = '/static/data/vatm_kmz/vatm_ats_routes.geojson';
const RNAV2_DRAFT_URL = '/static/data/airways/airways_rnav2_draft.json';
const ENR31_LEGACY_URL = '/static/data/airways/airways_enr31_legacy.json';

interface RawRouteProps {
  id: string;
  name: string;
  category: string;
  navigation_type: string;
  description: string;
  source: string;
  status: string;
}

export type RawRouteFeature = GeoJSON.Feature<GeoJSON.LineString, RawRouteProps>;
interface RawRouteFC extends GeoJSON.FeatureCollection<GeoJSON.LineString, RawRouteProps> {
  features: RawRouteFeature[];
}

interface Rnav2DraftFile {
  schemaVersion: string;
  source: { document: string; documentTitle: string; meetingDate: string; status: string; note: string };
  airwayCount: number;
  airways: Array<{
    code: string;
    navigationSpec: string | null;
    waypointCount: number;
    segmentCount: number;
    waypoints: StructuredAirway['waypoints'];
    segments: AirwaySegment[];
  }>;
}

// Phase 2's own on-disk shape (FTS Server/tools/airways/parse_enr31_pdf.py) --
// close to AirwaySegment/AirwayWaypoint but with its own field names for
// values the RNAV2 draft doesn't publish (upperFL/lowerFL instead of a single
// nested upperLimit/lowerLimit, reverseMagneticTrackDeg, airspaceClass,
// widthKm, navAccuracy, remarks). Mapped into the shared AirwaySegment shape
// in `toSharedSegment` below rather than widening the on-disk schema to match
// the frontend's, so the extraction script's output stays a faithful
// transcription of the PDF's own column layout.
interface Enr31RawSegment {
  seq: number;
  fromWaypoint: string;
  toWaypoint: string;
  magneticTrackDeg: number | null;
  reverseMagneticTrackDeg: number | null;
  distanceKm: number | null;
  upperFL: number | null;
  lowerFL: number | null;
  minSafeAltitudeM: number | null;
  airspaceClass: string | null;
  widthKm: number | null;
  navAccuracy: string | null;
  remarks: string | null;
}
interface Enr31LegacyFile {
  schemaVersion: string;
  source: { document: string; documentTitle: string; amendment: string; effectiveDate: string; status: string; note: string };
  routeCount: number;
  routes: Array<{
    code: string;
    waypointCount: number;
    segmentCount: number;
    waypoints: StructuredAirway['waypoints'];
    segments: Enr31RawSegment[];
  }>;
}

interface AirwayDetail {
  structured: StructuredAirway | null;
  features: RawRouteFeature[];
  legacyParams: AirwayLegacyParam[];
  source: string | null;
  status: string | null;
}

function toSharedSegment(s: Enr31RawSegment): AirwaySegment {
  return {
    seq: s.seq,
    fromWaypoint: s.fromWaypoint,
    toWaypoint: s.toWaypoint,
    magneticTrackDeg: s.magneticTrackDeg,
    reverseMagneticTrackDeg: s.reverseMagneticTrackDeg,
    distanceKm: s.distanceKm,
    upperLimit: s.upperFL != null ? { value: s.upperFL, unit: 'FL' } : null,
    lowerLimit: s.lowerFL != null ? { value: s.lowerFL, unit: 'FL' } : null,
    minSafeAltitudeM: s.minSafeAltitudeM,
    widthKm: s.widthKm,
    airspaceClass: s.airspaceClass,
    navAccuracy: s.navAccuracy,
    // ENR3.1 never publishes an odd/even cruising-level split for these
    // routes (columns 4/5 are blank throughout the source PDF) -- null, not
    // guessed.
    cruisingLevels: null,
    usageConditions: s.remarks,
  };
}

let cache: Promise<{ routes: RawRouteFC; rnav2Draft: Rnav2DraftFile; enr31Legacy: Enr31LegacyFile }> | null = null;

function loadAll() {
  if (!cache) {
    cache = Promise.all([
      fetch(ROUTES_GEOJSON_URL).then(r => {
        if (!r.ok) throw new Error('Failed to load airway geometry');
        return r.json() as Promise<RawRouteFC>;
      }),
      fetch(RNAV2_DRAFT_URL).then(r => {
        if (!r.ok) throw new Error('Failed to load RNAV2 draft airway data');
        return r.json() as Promise<Rnav2DraftFile>;
      }),
      fetch(ENR31_LEGACY_URL).then(r => {
        if (!r.ok) throw new Error('Failed to load ENR3.1 legacy airway data');
        return r.json() as Promise<Enr31LegacyFile>;
      }),
    ]).then(([routes, rnav2Draft, enr31Legacy]) => ({ routes, rnav2Draft, enr31Legacy }));
  }
  return cache;
}

// The legacy AIP export packs every parameter into one flat string, e.g.
// "A1 FID 31 LASTMOD_DA 15/11/2022 IDENT_TXT A1 UPPER_LIMI 460 UPPER_UOM FL
// LOWER_LIMI 260 LOWER_UOM FL MINIMUM_AL 2600 MIN_ALT_UO M WIDTH_VAL 30
// WIDTH_UOM KM ROUTETYPE_ CONV RNP_VAL 0 MAGTRACK_V 74 REVERSEMAG 254
// LENGTH_VAL 35 DISTLENCOP KM CLASS A DOM_INTL INTL". The key order is fixed
// by the export and some values are blank (two keys back-to-back), so this
// scans token-by-token rather than using a regex with alternation lookahead,
// which can't cleanly express "value is possibly empty". Used only as a last
// resort now, for the ~20 routes that have neither structured source (see
// StructuredAirway's doc comment).
const AIP_KEYS = [
  'FID', 'LASTMOD_DA', 'IDENT_TXT', 'UPPER_LIMI', 'UPPER_UOM', 'LOWER_LIMI',
  'LOWER_UOM', 'MINIMUM_AL', 'MIN_ALT_UO', 'WIDTH_VAL', 'WIDTH_UOM', 'ROUTETYPE_',
  'RNP_VAL', 'MAGTRACK_V', 'REVERSEMAG', 'LENGTH_VAL', 'DISTLENCOP', 'CLASS', 'DOM_INTL',
];
const AIP_KEY_SET = new Set(AIP_KEYS);

function tokenizeAipDescription(desc: string): Record<string, string> {
  const tokens = (desc || '').trim().split(/\s+/);
  const kv: Record<string, string> = {};
  let i = 0;
  while (i < tokens.length && !AIP_KEY_SET.has(tokens[i])) i++; // skip the leading route name
  while (i < tokens.length) {
    const key = tokens[i];
    if (!AIP_KEY_SET.has(key)) { i++; continue; }
    i++;
    const value: string[] = [];
    while (i < tokens.length && !AIP_KEY_SET.has(tokens[i])) { value.push(tokens[i]); i++; }
    kv[key] = value.join(' ');
  }
  return kv;
}

function numOrNull(s: string | undefined): number | null {
  if (!s || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseLegacyParams(featureId: string, description: string): AirwayLegacyParam {
  const kv = tokenizeAipDescription(description);
  const upperVal = numOrNull(kv.UPPER_LIMI);
  const lowerVal = numOrNull(kv.LOWER_LIMI);
  return {
    featureId,
    fid: kv.FID || null,
    lastModified: kv.LASTMOD_DA || null,
    upperLimit: upperVal ? { value: upperVal, unit: kv.UPPER_UOM || '' } : null,
    lowerLimit: lowerVal ? { value: lowerVal, unit: kv.LOWER_UOM || '' } : null,
    minSafeAltitudeM: numOrNull(kv.MINIMUM_AL),
    widthKm: numOrNull(kv.WIDTH_VAL),
    routeType: kv.ROUTETYPE_ || null,
    rnp: numOrNull(kv.RNP_VAL),
    magneticTrackDeg: numOrNull(kv.MAGTRACK_V),
    reverseMagneticTrackDeg: numOrNull(kv.REVERSEMAG),
    lengthKm: numOrNull(kv.LENGTH_VAL),
    airspaceClass: kv.CLASS || null,
    domIntl: kv.DOM_INTL || null,
  };
}

export const airwaysApi = {
  listAirways: async (): Promise<AirwaySummary[]> => {
    const { routes, rnav2Draft, enr31Legacy } = await loadAll();
    const draftByCode = new Map(rnav2Draft.airways.map(a => [a.code, a]));
    const legacyByCode = new Map(enr31Legacy.routes.map(r => [r.code, r]));

    const grouped = new Map<string, RawRouteFeature[]>();
    for (const f of routes.features) {
      const name = f.properties.name;
      const list = grouped.get(name);
      if (list) list.push(f); else grouped.set(name, [f]);
    }

    const summaries: AirwaySummary[] = [];
    grouped.forEach((feats, code) => {
      const draft = draftByCode.get(code);
      const legacy = legacyByCode.get(code);
      const first = feats[0];
      summaries.push({
        code,
        hasStructuredData: !!draft || !!legacy,
        navigationSpec: draft?.navigationSpec ?? (first.properties.navigation_type || null),
        segmentFeatureCount: feats.length,
        status: first.properties.status,
        isDraft: first.properties.status.toLowerCase().includes('draft'),
      });
    });

    return summaries.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  },

  getAirwayDetail: async (code: string): Promise<AirwayDetail> => {
    const { routes, rnav2Draft, enr31Legacy } = await loadAll();
    const features = routes.features.filter(f => f.properties.name === code);

    const draft = rnav2Draft.airways.find(a => a.code === code);
    const legacy = enr31Legacy.routes.find(r => r.code === code);

    let structured: StructuredAirway | null = null;
    if (draft) {
      structured = { ...draft, sourceKind: 'rnav2Draft' };
    } else if (legacy) {
      structured = {
        code: legacy.code,
        navigationSpec: null,
        waypointCount: legacy.waypointCount,
        segmentCount: legacy.segmentCount,
        waypoints: legacy.waypoints,
        segments: legacy.segments.map(toSharedSegment),
        sourceKind: 'enr31Legacy',
      };
    }

    const legacyParams = structured
      ? []
      : features.map(f => parseLegacyParams(f.properties.id, f.properties.description));

    return {
      structured,
      features,
      legacyParams,
      source: structured?.sourceKind === 'enr31Legacy' ? enr31Legacy.source.document
        : structured?.sourceKind === 'rnav2Draft' ? rnav2Draft.source.document
        : features[0]?.properties.source ?? null,
      status: structured?.sourceKind === 'enr31Legacy' ? enr31Legacy.source.status
        : structured?.sourceKind === 'rnav2Draft' ? rnav2Draft.source.status
        : features[0]?.properties.status ?? null,
    };
  },

  getRnav2DraftSource: async () => (await loadAll()).rnav2Draft.source,
  getEnr31LegacySource: async () => (await loadAll()).enr31Legacy.source,
};
