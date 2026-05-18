/**
 * VATM Google Earth KMZ Airspace Overlay Controls for WebATM / MapLibre.
 * Generated from VATM Google Earth KMZ dataset dated 2026-04-20.
 * Decision-support / Non-operational.
 */
import type maplibregl from "maplibre-gl";

type SourceDef = { id: string; data: string; geom: "line" | "fill" | "circle" };
type GroupDef = { key: string; label: string; active: boolean; sources: SourceDef[] };

const GROUPS: GroupDef[] = [
  { key: "routes", label: "🛫 Đường bay", active: false, sources: [
    { id: "vatm-kmz-ats-routes", data: "/static/data/vatm_kmz/vatm_ats_routes.geojson", geom: "line" },
    { id: "vatm-kmz-route-corridors", data: "/static/data/vatm_kmz/vatm_route_corridors.geojson", geom: "fill" },
    { id: "vatm-kmz-significant-points", data: "/static/data/vatm_kmz/vatm_significant_points.geojson", geom: "circle" },
  ]},
  { key: "airspace", label: "🛰 FIR/ACC/TMA", active: false, sources: [
    { id: "vatm-kmz-acc-fir", data: "/static/data/vatm_kmz/vatm_acc_fir_sectors.geojson", geom: "fill" },
    { id: "vatm-kmz-tma-ctr", data: "/static/data/vatm_kmz/vatm_tma_ctr.geojson", geom: "fill" },
  ]},
  { key: "prd", label: "⚠️ P/R/D", active: false, sources: [
    { id: "vatm-kmz-prd", data: "/static/data/vatm_kmz/vatm_prd_airspace.geojson", geom: "fill" },
  ]},
  { key: "holding", label: "⏱ Holding", active: false, sources: [
    { id: "vatm-kmz-holding", data: "/static/data/vatm_kmz/vatm_holding_areas.geojson", geom: "fill" },
  ]},
  { key: "vvts-proc", label: "🛬 TSN SID/STAR/IAP", active: false, sources: [
    { id: "vatm-kmz-proc-vvts", data: "/static/data/vatm_kmz/procedures_by_airport/vatm_procedures_VVTS.geojson", geom: "line" },
  ]},
  { key: "vvnb-proc", label: "🛫 NBA SID/STAR/IAP", active: false, sources: [
    { id: "vatm-kmz-proc-vvnb", data: "/static/data/vatm_kmz/procedures_by_airport/vatm_procedures_VVNB.geojson", geom: "line" },
  ]},
];

export function installVietnamKmlAirspaceControls(map: maplibregl.Map): void {
  map.on("load", () => {
    GROUPS.forEach(g => {
      g.sources.forEach(s => addSourceAndLayers(map, g.key, s));
      setGroupVisibility(map, g, g.active);
    });
    createVatmOverlayToolbar(map);
  });
}

function addSourceAndLayers(map: maplibregl.Map, groupKey: string, s: SourceDef): void {
  if (!map.getSource(s.id)) map.addSource(s.id, { type: "geojson", data: s.data });
  if (s.geom === "fill") {
    addLayer(map, { id: `${s.id}-fill`, type: "fill", source: s.id, paint: { "fill-color": colorFor(groupKey), "fill-opacity": 0.16 }});
    addLayer(map, { id: `${s.id}-line`, type: "line", source: s.id, paint: { "line-color": outlineFor(groupKey), "line-width": 1.6, "line-opacity": 0.9 }});
    addLabelLayer(map, s.id);
  } else if (s.geom === "line") {
    addLayer(map, { id: `${s.id}-line`, type: "line", source: s.id, paint: { "line-color": outlineFor(groupKey), "line-width": 1.8, "line-opacity": 0.82 }});
    addLabelLayer(map, s.id, true);
  } else {
    addLayer(map, { id: `${s.id}-circle`, type: "circle", source: s.id, paint: { "circle-radius": 3, "circle-color": "#facc15", "circle-stroke-color": "#020617", "circle-stroke-width": 1 }});
    addLabelLayer(map, s.id);
  }
}

function addLabelLayer(map: maplibregl.Map, sourceId: string, line = false): void {
  addLayer(map, {
    id: `${sourceId}-label`, type: "symbol", source: sourceId,
    layout: {
      ...(line ? { "symbol-placement": "line" } : {}),
      "text-field": ["coalesce", ["get", "name"], ["get", "id"]],
      "text-size": 10, "text-allow-overlap": false
    },
    paint: { "text-color": "#e0f2fe", "text-halo-color": "#020617", "text-halo-width": 1.5 }
  });
}

function addLayer(map: maplibregl.Map, layer: any): void {
  if (!map.getLayer(layer.id)) map.addLayer(layer);
}

function setGroupVisibility(map: maplibregl.Map, group: GroupDef, visible: boolean): void {
  group.active = visible;
  group.sources.forEach(s => {
    ["fill", "line", "circle", "label"].forEach(suffix => {
      const id = `${s.id}-${suffix}`;
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    });
  });
}

function createVatmOverlayToolbar(map: maplibregl.Map): void {
  if (document.getElementById("vatm-kmz-overlay-toolbar")) return;
  const toolbar = document.createElement("div");
  toolbar.id = "vatm-kmz-overlay-toolbar";
  toolbar.style.cssText = "position:absolute;left:12px;top:84px;z-index:10;display:flex;flex-direction:column;gap:6px;background:rgba(2,6,23,.72);border:1px solid rgba(148,163,184,.28);border-radius:12px;padding:8px;backdrop-filter:blur(10px);";
  GROUPS.forEach(group => {
    const btn = document.createElement("button");
    btn.textContent = group.label;
    btn.style.cssText = "font:600 12px system-ui,sans-serif;color:#dbeafe;background:rgba(15,23,42,.9);border:1px solid rgba(148,163,184,.3);border-radius:9px;padding:7px 10px;cursor:pointer;text-align:left;";
    btn.onclick = () => { setGroupVisibility(map, group, !group.active); btn.style.background = group.active ? "rgba(20,184,166,.28)" : "rgba(15,23,42,.9)"; };
    toolbar.appendChild(btn);
  });
  const container = map.getContainer();
  container.style.position = container.style.position || "relative";
  container.appendChild(toolbar);
}

function colorFor(groupKey: string): string {
  if (groupKey === "prd") return "#ef4444";
  if (groupKey === "holding") return "#a855f7";
  if (groupKey === "airspace") return "#38bdf8";
  return "#22d3ee";
}
function outlineFor(groupKey: string): string {
  if (groupKey === "prd") return "#f87171";
  if (groupKey === "holding") return "#c084fc";
  if (groupKey === "airspace") return "#7dd3fc";
  return "#67e8f9";
}
