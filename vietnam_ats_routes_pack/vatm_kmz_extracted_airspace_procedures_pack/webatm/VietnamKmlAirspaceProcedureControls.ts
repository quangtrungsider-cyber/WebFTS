/**
 * VATM KMZ Airspace + Procedure Overlay Controls for WebATM / MapLibre.
 * Source: 2026.04.20 DỮ LIỆU VÙNG TRỜI, PHƯƠNG THỨC BAY.kmz
 *
 * Important: SID/STAR layers below use nominal LineString tracks only.
 * Procedure protection areas are intentionally excluded from map toggle layers.
 * Decision-support / Non-operational.
 */
import type maplibregl from "maplibre-gl";

type ToggleGroup = {
  key: string;
  label: string;
  sourceId: string;
  data: string;
  layers: string[];
  active: boolean;
};

const GROUPS: ToggleGroup[] = [
  { key: "airspace", label: "🛰 Vùng trời", sourceId: "vatm-kmz-airspace", data: "/static/data/vatm_kmz/airspace_fir_acc_tma_ctr.geojson", layers: ["vatm-kmz-airspace-fill", "vatm-kmz-airspace-line", "vatm-kmz-airspace-label"], active: false },
  { key: "prd", label: "⚠️ P/R/D", sourceId: "vatm-kmz-prd", data: "/static/data/vatm_kmz/airspace_prd_areas.geojson", layers: ["vatm-kmz-prd-fill", "vatm-kmz-prd-line", "vatm-kmz-prd-label"], active: false },
  { key: "routes", label: "🛫 Đường HK", sourceId: "vatm-kmz-routes", data: "/static/data/vatm_kmz/ats_routes.geojson", layers: ["vatm-kmz-routes-line", "vatm-kmz-routes-label"], active: false },
  { key: "sid", label: "SID nominal", sourceId: "vatm-kmz-sid", data: "/static/data/vatm_kmz/procedures_sid_nominal_tracks.geojson", layers: ["vatm-kmz-sid-line", "vatm-kmz-sid-label"], active: false },
  { key: "star", label: "STAR nominal", sourceId: "vatm-kmz-star", data: "/static/data/vatm_kmz/procedures_star_nominal_tracks.geojson", layers: ["vatm-kmz-star-line", "vatm-kmz-star-label"], active: false },
  { key: "iap", label: "IAP nominal", sourceId: "vatm-kmz-iap", data: "/static/data/vatm_kmz/procedures_iap_nominal_tracks.geojson", layers: ["vatm-kmz-iap-line", "vatm-kmz-iap-label"], active: false },
  { key: "points", label: "📍 Điểm/Navaid", sourceId: "vatm-kmz-points", data: "/static/data/vatm_kmz/significant_points.geojson", layers: ["vatm-kmz-points-dot", "vatm-kmz-points-label"], active: false },
];

export function installVietnamKmlAirspaceProcedureControls(map: maplibregl.Map): void {
  map.on("load", () => {
    addSources(map);
    addLayers(map);
    createToolbar(map);
    GROUPS.forEach((group) => setVisibility(map, group, group.active));
  });
}

function addSources(map: maplibregl.Map): void {
  GROUPS.forEach((g) => {
    if (!map.getSource(g.sourceId)) {
      map.addSource(g.sourceId, { type: "geojson", data: g.data });
    }
  });
}

function addLayers(map: maplibregl.Map): void {
  addFillLineLabel(map, "airspace", "vatm-kmz-airspace", "#22d3ee", "#67e8f9", 0.10);
  addFillLineLabel(map, "prd", "vatm-kmz-prd", "#f97316", "#fb923c", 0.18);
  addLineLabel(map, "routes", "vatm-kmz-routes", "#38bdf8", 1.7);
  addLineLabel(map, "sid", "vatm-kmz-sid", "#22c55e", 2.0);
  addLineLabel(map, "star", "vatm-kmz-star", "#a78bfa", 2.0);
  addLineLabel(map, "iap", "vatm-kmz-iap", "#facc15", 1.8);

  if (!map.getLayer("vatm-kmz-points-dot")) {
    map.addLayer({ id: "vatm-kmz-points-dot", type: "circle", source: "vatm-kmz-points", paint: { "circle-radius": 3, "circle-color": "#facc15", "circle-stroke-color": "#020617", "circle-stroke-width": 1 } });
  }
  if (!map.getLayer("vatm-kmz-points-label")) {
    map.addLayer({ id: "vatm-kmz-points-label", type: "symbol", source: "vatm-kmz-points", layout: { "text-field": ["get", "name"], "text-size": 10, "text-offset": [0, 1.1], "text-allow-overlap": false }, paint: { "text-color": "#fef9c3", "text-halo-color": "#020617", "text-halo-width": 1.4 } });
  }
}

function addFillLineLabel(map: maplibregl.Map, suffix: string, source: string, fillColor: string, lineColor: string, opacity: number): void {
  if (!map.getLayer(`vatm-kmz-${suffix}-fill`)) {
    map.addLayer({ id: `vatm-kmz-${suffix}-fill`, type: "fill", source, paint: { "fill-color": fillColor, "fill-opacity": opacity } });
  }
  if (!map.getLayer(`vatm-kmz-${suffix}-line`)) {
    map.addLayer({ id: `vatm-kmz-${suffix}-line`, type: "line", source, paint: { "line-color": lineColor, "line-width": 2, "line-opacity": 0.9 } });
  }
  if (!map.getLayer(`vatm-kmz-${suffix}-label`)) {
    map.addLayer({ id: `vatm-kmz-${suffix}-label`, type: "symbol", source, layout: { "text-field": ["get", "name"], "text-size": 12, "text-allow-overlap": false }, paint: { "text-color": "#e0f2fe", "text-halo-color": "#020617", "text-halo-width": 1.6 } });
  }
}

function addLineLabel(map: maplibregl.Map, suffix: string, source: string, color: string, width: number): void {
  if (!map.getLayer(`vatm-kmz-${suffix}-line`)) {
    map.addLayer({ id: `vatm-kmz-${suffix}-line`, type: "line", source, paint: { "line-color": color, "line-width": width, "line-opacity": 0.85 } });
  }
  if (!map.getLayer(`vatm-kmz-${suffix}-label`)) {
    map.addLayer({ id: `vatm-kmz-${suffix}-label`, type: "symbol", source, layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-size": 10, "text-allow-overlap": false }, paint: { "text-color": color, "text-halo-color": "#020617", "text-halo-width": 1.4 } });
  }
}

function setVisibility(map: maplibregl.Map, group: ToggleGroup, visible: boolean): void {
  const value = visible ? "visible" : "none";
  group.layers.forEach((layer) => {
    if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", value);
  });
}

function createToolbar(map: maplibregl.Map): void {
  const container = document.createElement("div");
  container.className = "vatm-kmz-overlay-toolbar";
  Object.assign(container.style, {
    position: "absolute",
    top: "92px",
    right: "18px",
    zIndex: "10",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "10px",
    borderRadius: "14px",
    background: "rgba(2, 6, 23, 0.74)",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
  } as Partial<CSSStyleDeclaration>);

  GROUPS.forEach((group) => {
    const btn = document.createElement("button");
    btn.textContent = group.label;
    btn.type = "button";
    styleButton(btn, group.active);
    btn.onclick = () => {
      group.active = !group.active;
      setVisibility(map, group, group.active);
      styleButton(btn, group.active);
    };
    container.appendChild(btn);
  });

  const mapContainer = map.getContainer();
  if (getComputedStyle(mapContainer).position === "static") {
    mapContainer.style.position = "relative";
  }
  mapContainer.appendChild(container);
}

function styleButton(btn: HTMLButtonElement, active: boolean): void {
  Object.assign(btn.style, {
    border: active ? "1px solid rgba(34,211,238,0.85)" : "1px solid rgba(148,163,184,0.24)",
    background: active ? "linear-gradient(135deg, rgba(20,184,166,0.95), rgba(14,165,233,0.85))" : "rgba(15,23,42,0.92)",
    color: active ? "#f8fafc" : "#cbd5e1",
    borderRadius: "10px",
    padding: "8px 10px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
    textAlign: "left",
    whiteSpace: "nowrap",
  } as Partial<CSSStyleDeclaration>);
}
