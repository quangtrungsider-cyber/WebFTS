import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';

// Register the `pmtiles://` protocol once for the page's lifetime -- same
// guarded pattern as the legacy viewer's MapDisplay.ts, so both can coexist
// without double-registering.
const PMTILES_PROTOCOL_KEY = '__webatmPmtilesRegistered__';
if (!(window as any)[PMTILES_PROTOCOL_KEY]) {
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  (window as any)[PMTILES_PROTOCOL_KEY] = true;
}

const OFFLINE_STYLE = '/static/map/offline-style-light.json';
const PMTILES_ARCHIVE = '/static/tiles/world.pmtiles';
// `offline-style-light.json` renders nothing but its background colour unless
// the PMTiles archive it points at is actually present, and that archive is not
// shipped with the repo -- which is why every preview here used to be a blank
// cream rectangle. Probe for it once and fall back to a key-less online
// basemap so the previews always show real geography.
const FALLBACK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Real en-route (ACC) airspace polygons extracted from the 2026.09.19 RNAV2
// KMZ. This replaces `vatm_fir_only.geojson`, which was a hand-drawn
// approximation: its Ha Noi FIR was a 6-point coastal strip that excluded the
// entire northern landmass, and its Ho Chi Minh FIR had a western edge cutting
// straight through Cambodia and Vietnam. That file has been deleted.
const FIR_URL = '/static/data/vatm_kmz/vatm_acc_fir_2026.geojson';
/** Whole-country view: both Vietnamese FIRs (Ha Noi + Ho Chi Minh) plus margin. */
const VIETNAM_BOUNDS: [[number, number], [number, number]] = [[99.5, 6.0], [119.5, 24.5]];
const DEFAULT_CENTER: [number, number] = [108.0, 16.5]; // Vietnam FIR
const DEFAULT_ZOOM = 5;

const FIR_SOURCE_ID = '__context-fir';
const FIR_FILL_LAYER = '__context-fir-fill';
const FIR_LINE_LAYER = '__context-fir-line';

/** Resolved once per page load and shared by every map instance. */
let styleUrlPromise: Promise<string> | null = null;
function resolveStyleUrl(): Promise<string> {
  if (!styleUrlPromise) {
    styleUrlPromise = fetch(PMTILES_ARCHIVE, { method: 'HEAD' })
      .then(r => (r.ok ? OFFLINE_STYLE : FALLBACK_STYLE))
      .catch(() => FALLBACK_STYLE);
  }
  return styleUrlPromise;
}

/** FIR outline geometry, fetched once and reused by every map instance. */
let firDataPromise: Promise<GeoJSON.FeatureCollection | null> | null = null;
function loadFirData(): Promise<GeoJSON.FeatureCollection | null> {
  if (!firDataPromise) {
    firDataPromise = fetch(FIR_URL)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return firDataPromise;
}

export interface MapMarker {
  id: string;
  lat: number;
  lon: number;
  label?: string;
  color?: string;
  active?: boolean;
}

export interface MapLine {
  id: string;
  points: [number, number][]; // [lon, lat][]
  color?: string;
}

export interface MapPolygon {
  id: string;
  rings: [number, number][][]; // GeoJSON Polygon coordinates: [ring][point] = [lon, lat]
  color?: string;
  label?: string;
  active?: boolean;
}

/** Arbitrary GeoJSON FeatureCollection overlay -- for real source data whose
 * geometry mix isn't known upfront (a KML-derived "runways" layer can hold
 * both Polygon and LineString features, "gates" both Point and LineString).
 * Renders fill+line+circle layers against the same source; maplibre simply
 * skips layers whose paint type doesn't match a given feature's geometry, so
 * one overlay entry safely covers mixed-geometry real data without the
 * caller needing to pre-split it by geometry type. */
export interface GeoJsonOverlay {
  id: string;
  data: GeoJSON.FeatureCollection;
  color?: string;
  fillOpacity?: number;
  lineWidth?: number;
  circleRadius?: number;
}

interface Props {
  markers?: MapMarker[];
  lines?: MapLine[];
  polygons?: MapPolygon[];
  overlays?: GeoJsonOverlay[];
  center?: [number, number];
  zoom?: number;
  height?: string | number;
  onMarkerClick?: (id: string) => void;
  onPolygonClick?: (id: string) => void;
  /** Draw the Ha Noi / Ho Chi Minh en-route (ACC) airspace underneath the
   * content so the reader can place the geometry within Vietnamese airspace.
   * Default on. */
  showFirContext?: boolean;
}

/** Thin React wrapper around the same offline MapLibre style/tiles the
 * legacy live-simulation viewer uses (`ui/map/MapDisplay.ts`) -- no network
 * tiles needed. New for the React "ops console" pages (Waypoints, Routes/
 * Airways, Sectors...); none of them plotted a map before this. */
const OfflineMapView: React.FC<Props> = ({ markers = [], lines = [], polygons = [], overlays = [], center, zoom, height = '480px', onMarkerClick, onPolygonClick, showFirContext = true }) => {
  // Callers (RoutesAirwaysPage etc.) recompute `overlays`/`markers`/etc. as
  // fresh array literals on every one of their own re-renders, even when the
  // actual selection hasn't changed. A cheap content fingerprint (ids +
  // feature counts, not full geometry) lets effects below depend on "did the
  // selection actually change" by value instead of by array reference --
  // needed so a setTimeout-based watchdog isn't constantly cleared and
  // restarted by unrelated parent re-renders before it ever gets to fire.
  const contentSignature = [
    markers.map(m => m.id).join(','),
    lines.map(l => `${l.id}:${l.points.length}`).join(','),
    polygons.map(p => p.id).join(','),
    overlays.map(o => `${o.id}:${o.data.features.length}`).join(','),
    center ? `${center[0]},${center[1]}` : '',
  ].join('|');

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Flipped once the style has loaded, so the content-drawing effect knows it
  // may touch the map even though map creation is now asynchronous.
  const [styleReady, setStyleReady] = useState(false);
  // Tracks every source/layer id added by the previous drawLayers() call so
  // it can be torn down before redrawing -- without this, switching between
  // datasets (e.g. airport A -> airport B) would leave every prior line/
  // polygon/overlay source+layer behind, accumulating forever and eventually
  // showing stale geometry from long-gone selections.
  const drawnIdsRef = useRef<{ sourceId: string; layerIds: string[] }[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let created: MapLibreMap | null = null;

    // Style selection is async (it probes for the PMTiles archive), so guard
    // every post-await step against the component having unmounted meanwhile.
    Promise.all([resolveStyleUrl(), showFirContext ? loadFirData() : Promise.resolve(null)])
      .then(([styleUrl, firData]) => {
        if (disposed || !containerRef.current) return;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: styleUrl,
          center: center ?? DEFAULT_CENTER,
          zoom: zoom ?? DEFAULT_ZOOM,
          fadeDuration: 0,
          attributionControl: { compact: true },
        });
        created = map;
        map.addControl(new maplibregl.NavigationControl(), 'top-left');
        map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
        mapRef.current = map;

        map.once('load', () => {
          if (disposed) return;
          if (firData && firData.features?.length) {
            map.addSource(FIR_SOURCE_ID, { type: 'geojson', data: firData });
            // Very faint wash so the FIR reads as background context and never
            // competes with the procedure/route geometry drawn on top of it.
            map.addLayer({
              id: FIR_FILL_LAYER, type: 'fill', source: FIR_SOURCE_ID,
              paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.06 },
            });
            map.addLayer({
              id: FIR_LINE_LAYER, type: 'line', source: FIR_SOURCE_ID,
              paint: { 'line-color': '#38bdf8', 'line-width': 1.2, 'line-opacity': 0.75, 'line-dasharray': [4, 3] },
            });
          }
          setStyleReady(true);
        });
      });

    return () => {
      disposed = true;
      setStyleReady(false);
      if (created) created.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFirContext]);

  // Always calls the *current* render's fitToContent (assigned at the bottom
  // of the content-drawing effect below) -- the ResizeObserver effect has an
  // empty dep array so it must never close over stale markers/lines/overlays.
  const fitToContentRef = useRef<() => void>(() => {});

  // MapLibre sizes its WebGL canvas from the container's layout box exactly
  // once, at map-creation time. Several pages here mount this component
  // inside a CSS grid column, and remount it (via a changing `key`) every
  // time the selected procedure/transition changes -- if that remount lands
  // a frame before the grid has settled the column's final width, the canvas
  // locks in that transient (often much narrower) size. `map.resize()` alone
  // fixes the *canvas*, but `fitBounds` had already computed its camera
  // against the stale (narrow) transform -- resizing the canvas afterwards
  // does not retroactively recompute that camera, so the map would stay
  // zoomed out even once correctly sized. So on every observed resize, redo
  // the fit too: cheap (no network/data refetch) and safe here because none
  // of this component's callers expect a user's manual pan/zoom to survive
  // a container resize.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
      fitToContentRef.current();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** Zoom out to the whole of Vietnam (both FIRs). */
  const showWholeCountry = useCallback(() => {
    mapRef.current?.fitBounds(VIETNAM_BOUNDS, { padding: 24, duration: 600 });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawLayers = () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      drawnIdsRef.current.forEach(({ sourceId, layerIds }) => {
        layerIds.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      });
      drawnIdsRef.current = [];

      markers.forEach(m => {
        const el = document.createElement('div');
        el.style.width = '12px';
        el.style.height = '12px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.3)';
        el.style.backgroundColor = m.color ?? (m.active ? '#1976d2' : '#f59e0b');
        el.style.cursor = onMarkerClick ? 'pointer' : 'default';
        if (onMarkerClick) el.addEventListener('click', () => onMarkerClick(m.id));
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([m.lon, m.lat])
          .setPopup(new maplibregl.Popup({ offset: 12 }).setText(m.label ?? m.id))
          .addTo(map);
        markersRef.current.push(marker);
      });

      lines.forEach(line => {
        const sourceId = `line-${line.id}`;
        const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: line.points },
        };
        map.addSource(sourceId, { type: 'geojson', data: geojson });
        map.addLayer({
          id: sourceId, type: 'line', source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': line.color ?? '#1976d2', 'line-width': 2.5 },
        });
        drawnIdsRef.current.push({ sourceId, layerIds: [sourceId] });
      });

      polygons.forEach(poly => {
        const sourceId = `poly-${poly.id}`;
        const geojson: GeoJSON.Feature<GeoJSON.Polygon> = {
          type: 'Feature', properties: { id: poly.id },
          geometry: { type: 'Polygon', coordinates: poly.rings },
        };
        const color = poly.color ?? '#1976d2';
        map.addSource(sourceId, { type: 'geojson', data: geojson });
        map.addLayer({
          id: `${sourceId}-fill`, type: 'fill', source: sourceId,
          paint: { 'fill-color': color, 'fill-opacity': poly.active ? 0.35 : 0.15 },
        });
        map.addLayer({
          id: `${sourceId}-outline`, type: 'line', source: sourceId,
          paint: { 'line-color': color, 'line-width': poly.active ? 2.5 : 1.5 },
        });
        if (onPolygonClick) {
          map.on('click', `${sourceId}-fill`, () => onPolygonClick(poly.id));
          map.on('mouseenter', `${sourceId}-fill`, () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', `${sourceId}-fill`, () => { map.getCanvas().style.cursor = ''; });
        }
        drawnIdsRef.current.push({ sourceId, layerIds: [`${sourceId}-fill`, `${sourceId}-outline`] });
      });

      overlays.forEach(ov => {
        const sourceId = `ov-${ov.id}`;
        const color = ov.color ?? '#1976d2';
        map.addSource(sourceId, { type: 'geojson', data: ov.data });
        const fillId = `${sourceId}-fill`;
        const lineId = `${sourceId}-line`;
        const circleId = `${sourceId}-circle`;
        map.addLayer({ id: fillId, type: 'fill', source: sourceId, paint: { 'fill-color': color, 'fill-opacity': ov.fillOpacity ?? 0.25 } });
        map.addLayer({ id: lineId, type: 'line', source: sourceId, paint: { 'line-color': color, 'line-width': ov.lineWidth ?? 2 } });
        map.addLayer({ id: circleId, type: 'circle', source: sourceId, paint: { 'circle-color': color, 'circle-radius': ov.circleRadius ?? 3, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
        drawnIdsRef.current.push({ sourceId, layerIds: [fillId, lineId, circleId] });
      });
    };

    const fitToContent = () => {
      if (center) return; // explicit center/zoom takes priority (e.g. a selected waypoint)
      const points: [number, number][] = [
        ...markers.map(m => [m.lon, m.lat] as [number, number]),
        ...lines.flatMap(l => l.points),
        ...polygons.flatMap(p => p.rings.flat()),
      ];
      overlays.forEach(ov => {
        ov.data.features.forEach(f => {
          const g = f.geometry;
          if (!g) return;
          if (g.type === 'Point') points.push(g.coordinates as [number, number]);
          else if (g.type === 'LineString') points.push(...(g.coordinates as [number, number][]));
          else if (g.type === 'Polygon') points.push(...(g.coordinates as [number, number][][]).flat());
          else if (g.type === 'MultiLineString') points.push(...(g.coordinates as [number, number][][]).flat());
          else if (g.type === 'MultiPolygon') points.push(...(g.coordinates as [number, number][][][]).flat(2));
        });
      });
      if (points.length === 0) return;
      const bounds = points.reduce(
        (b, p) => b.extend(p),
        new maplibregl.LngLatBounds(points[0], points[0])
      );
      map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
    };
    fitToContentRef.current = fitToContent;

    // `map.resize()` re-reads the container's *current* box and re-syncs the
    // WebGL canvas + internal transform from it. The ResizeObserver above
    // covers the general case, but its callback can still land a frame later
    // than this effect (e.g. right after a `key`-driven remount, where the
    // container/data/overlays all change in the same commit) -- and
    // `fitBounds` computed against a stale transform silently "fits" the
    // wrong viewport instead of erroring. Forcing a resize immediately before
    // every fit removes that race entirely: by the time fitToContent runs,
    // the transform is guaranteed current. Two rAFs before the very first
    // draw give the browser a chance to finish committing layout for a
    // freshly-mounted container (one rAF is not always enough for a grid
    // column whose width depends on a sibling that's still painting).
    const drawAndFit = () => {
      map.resize();
      drawLayers();
      map.resize();
      fitToContent();
    };

    if (map.isStyleLoaded()) {
      requestAnimationFrame(() => requestAnimationFrame(drawAndFit));
    } else {
      map.once('load', () => {
        requestAnimationFrame(() => requestAnimationFrame(drawAndFit));
      });
    }
    // `idle` fires once the map has finished its own internal first render
    // pass (tiles/sources settled) -- a stronger readiness signal than
    // `load`, which can fire a tick before that. Re-running the fit here
    // costs nothing when the first attempt already succeeded.
    map.once('idle', () => fitToContent());

    const backstop = setTimeout(() => {
      map.resize();
      fitToContent();
    }, 150);

    return () => clearTimeout(backstop);
    // `styleReady` is what re-runs this effect once the asynchronously-created
    // map finishes loading -- without it the first render would silently draw
    // nothing, because mapRef.current is still null at that point. Depending
    // on `contentSignature` rather than the raw `markers`/`lines`/`polygons`/
    // `overlays` arrays means an unrelated parent re-render (new array
    // literals, same actual content) doesn't tear down and restart this
    // effect's in-flight rAF/backstop timers before they get a chance to
    // fire -- `markers` etc. are still read fresh via closure below, just
    // not used as the dependency that decides whether to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleReady, contentSignature, onMarkerClick, onPolygonClick]);

  useEffect(() => {
    if (mapRef.current && center) mapRef.current.easeTo({ center, zoom: zoom ?? mapRef.current.getZoom() });
  }, [center, zoom]);

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: '12px', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      <button
        type="button"
        onClick={showWholeCountry}
        title="Thu nhỏ về toàn cảnh vùng thông báo bay Việt Nam"
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          color: '#e2e8f0', background: 'rgba(15,23,42,0.82)',
          border: '1px solid rgba(148,163,184,0.35)', borderRadius: 6,
          backdropFilter: 'blur(6px)',
        }}
      >
        Toàn cảnh VN
      </button>

      {showFirContext && (
        <div
          style={{
            position: 'absolute', bottom: 10, right: 10, zIndex: 2,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 8px', fontSize: 11,
            color: '#e2e8f0', background: 'rgba(15,23,42,0.82)',
            border: '1px solid rgba(148,163,184,0.35)', borderRadius: 6,
            backdropFilter: 'blur(6px)', pointerEvents: 'none',
          }}
        >
          <span style={{ width: 16, borderTop: '2px dashed #38bdf8', display: 'inline-block' }} />
          Vùng trời đường dài ACC (VVHN / VVHM)
        </div>
      )}
    </div>
  );
};

export default OfflineMapView;
