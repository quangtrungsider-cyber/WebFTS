/**
 * VATM Google Earth KMZ Airspace Overlay Controls for WebATM / MapLibre.
 * Generated from VATM Google Earth KMZ dataset dated 2026-04-20.
 *
 * VATM FTS / Decision-support / Non-operational. Not for operational air traffic control use.
 */
import type maplibregl from "maplibre-gl";

type SourceDef = { id: string; data: string; geom: "line" | "fill" | "circle" };
type GroupDef = { key: string; label: string; active: boolean; sources: SourceDef[] };

// Filter out holdings, procedures, and airspace boundaries from floating overlay toolbar to be managed by Accordion Tree
const GROUPS: GroupDef[] = [
  { key: "routes", label: "🛫 Đường bay", active: false, sources: [
    { id: "vatm-kmz-ats-routes", data: "/static/data/vatm_kmz/vatm_ats_routes.geojson", geom: "line" }
  ]},
  { key: "points", label: "📍 Điểm trọng yếu", active: false, sources: [
    { id: "vatm-kmz-significant-points", data: "/static/data/vatm_kmz/vatm_significant_points.geojson", geom: "circle" }
  ]},
  { key: "corridors", label: "🛣 Hành lang bay", active: false, sources: [
    { id: "vatm-kmz-route-corridors", data: "/static/data/vatm_kmz/vatm_route_corridors.geojson", geom: "fill" }
  ]},
  { key: "prd", label: "⚠️ P/R/D", active: false, sources: [
    { id: "vatm-kmz-prd", data: "/static/data/vatm_kmz/vatm_prd_airspace.geojson", geom: "fill" }
  ]}
];

// Global reference for active map instance
let activeMapInstance: maplibregl.Map | null = null;

export function installVietnamKmlAirspaceControls(map: maplibregl.Map): void {
  activeMapInstance = map;

  const setupOnStyleLoad = () => {
    // 1. Re-create active static groups
    GROUPS.forEach(g => {
      if (g.active) {
        g.sources.forEach(s => addSourceAndLayers(map, g.key, s));
        ensureGroupVisibility(map, g, true);
      }
    });

    // 2. Pre-initialize and register procedures, holdings, and boundaries (initially filtered to empty)
    setupDynamicProcedureAndHoldingLayers(map);

    // 3. Create the floating overlay toolbar
    createVatmOverlayToolbar(map);
  };

  map.on("style.load", setupOnStyleLoad);

  if (map.loaded()) {
    setupOnStyleLoad();
  }
}

/**
 * Gets the active Map instance. Useful for external modules (like DisplayOptionsPanel)
 * to communicate with the map without passing reference everywhere.
 */
export function getActiveAirspaceMap(): maplibregl.Map | null {
  return activeMapInstance;
}

/**
 * Sets up and registers procedure & holding layers with high-performance filters
 * and beautiful color mapping expressions.
 */
function setupDynamicProcedureAndHoldingLayers(map: maplibregl.Map): void {
  const dynamicSources = [
    { id: "vatm-kmz-holding", data: "/static/data/vatm_kmz/vatm_holding_areas.geojson", type: "holding" },
    { id: "vatm-kmz-proc-vvts", data: "/static/data/vatm_kmz/procedures_by_airport/vatm_procedures_VVTS.geojson", type: "proc" },
    { id: "vatm-kmz-proc-vvnb", data: "/static/data/vatm_kmz/procedures_by_airport/vatm_procedures_VVNB.geojson", type: "proc" },
    { id: "vatm-kmz-proc-vvdn", data: "/static/data/vatm_kmz/procedures_by_airport/vatm_procedures_VVDN.geojson", type: "proc" },
    { id: "vatm-kmz-acc-fir", data: "/static/data/vatm_kmz/vatm_acc_fir_sectors.geojson", type: "acc" },
    { id: "vatm-kmz-tma-ctr", data: "/static/data/vatm_kmz/vatm_tma_ctr.geojson", type: "tma" }
  ];

  dynamicSources.forEach(src => {
    // Register source if not present
    if (!map.getSource(src.id)) {
      map.addSource(src.id, { type: "geojson", data: src.data });
    }

    const emptyFilter = ["in", ["get", "id"], ["literal", []]] as any;

    // Define colors and styles dynamically based on source type
    let fillColorExpr: any;
    let lineColorExpr: any;
    let fillOpacityExpr: number;
    let lineWidthExpr: number;
    let lineOpacityExpr: number;

    if (src.type === "holding") {
      fillColorExpr = "#f59e0b"; // Amber
      lineColorExpr = "#f59e0b";
      fillOpacityExpr = 0.12;
      lineWidthExpr = 1.5;
      lineOpacityExpr = 0.85;
    } else if (src.type === "acc") {
      fillColorExpr = "#8b5cf6"; // Purple
      lineColorExpr = "#a78bfa";
      fillOpacityExpr = 0.06;
      lineWidthExpr = 1.5;
      lineOpacityExpr = 0.7;
    } else if (src.type === "tma") {
      fillColorExpr = "#0284c7"; // Blue
      lineColorExpr = "#38bdf8";
      fillOpacityExpr = 0.08;
      lineWidthExpr = 1.6;
      lineOpacityExpr = 0.7;
    } else {
      // Procedures
      fillColorExpr = [
        "case",
        ["in", "sid", ["downcase", ["coalesce", ["get", "folder_path"], ""]]], "#22c55e", // Emerald
        ["in", "star", ["downcase", ["coalesce", ["get", "folder_path"], ""]]], "#22d3ee", // Cyan
        ["in", "iap", ["downcase", ["coalesce", ["get", "folder_path"], ""]]], "#d946ef", // Magenta
        "#22d3ee" // Default Cyans
      ] as any;
      lineColorExpr = fillColorExpr;
      fillOpacityExpr = 0.12;
      lineWidthExpr = 1.5;
      lineOpacityExpr = 0.85;
    }

    // 1. Add Fill Layer (for protection area polygons)
    const fillId = `${src.id}-fill`;
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: "fill",
        source: src.id,
        filter: emptyFilter,
        paint: {
          "fill-color": fillColorExpr,
          "fill-opacity": fillOpacityExpr
        }
      });
    }

    // 2. Add Line Layer (for lines and polygon outlines)
    const lineId = `${src.id}-line`;
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: "line",
        source: src.id,
        filter: emptyFilter,
        paint: {
          "line-color": lineColorExpr,
          "line-width": lineWidthExpr,
          "line-opacity": lineOpacityExpr
        }
      });
    }

    // 3. Add Label Layer
    const labelId = `${src.id}-label`;
    if (!map.getLayer(labelId)) {
      const isPointPlacement = src.type === "holding" || src.type === "acc" || src.type === "tma";
      map.addLayer({
        id: labelId,
        type: "symbol",
        source: src.id,
        filter: emptyFilter,
        layout: {
          "symbol-placement": isPointPlacement ? "point" : "line",
          "text-field": ["coalesce", ["get", "name"], ["get", "id"], ""] as any,
          "text-size": (src.type === "holding"
            ? ["interpolate", ["linear"], ["zoom"], 7, 0, 8.5, 8.5]
            : 8.5) as any,
          "text-allow-overlap": false
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#090d16",
          "text-halo-width": 2.0
        }
      });
      
      // Set zoom constraints dynamically for crisp details
      map.setLayerZoomRange(labelId, isPointPlacement ? 7.5 : 8.5, 24);
    }
  });
}

/**
 * Public high-performance filter updater called by the Accordion Tree selection handler.
 */
export function updateActiveAirspaceFilters(map: maplibregl.Map, activeIds: string[]): void {
  const dynamicSourceIds = [
    "vatm-kmz-holding",
    "vatm-kmz-proc-vvts",
    "vatm-kmz-proc-vvnb",
    "vatm-kmz-proc-vvdn",
    "vatm-kmz-acc-fir",
    "vatm-kmz-tma-ctr"
  ];

  // MapLibre expression matching only checked IDs.
  // Using ["in", ...] checks whether the feature's ID is in the literal array of active IDs.
  const filterExpr = ["in", ["get", "id"], ["literal", activeIds]] as any;

  dynamicSourceIds.forEach(srcId => {
    ["fill", "line", "label"].forEach(suffix => {
      const layerId = `${srcId}-${suffix}`;
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, filterExpr);
      }
    });
  });
}

function addSourceAndLayers(map: maplibregl.Map, groupKey: string, s: SourceDef): void {
  if (!map.getSource(s.id)) {
    map.addSource(s.id, { type: "geojson", data: s.data });
  }

  if (s.geom === "fill") {
    const fillId = `${s.id}-fill`;
    if (!map.getLayer(fillId)) {
      map.addLayer({
        id: fillId,
        type: "fill",
        source: s.id,
        paint: {
          "fill-color": fillColorFor(s.id),
          "fill-opacity": fillOpacityFor(s.id)
        }
      });
    }

    const lineId = `${s.id}-line`;
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: "line",
        source: s.id,
        paint: {
          "line-color": outlineColorFor(s.id),
          "line-width": outlineWidthFor(s.id),
          "line-opacity": outlineOpacityFor(s.id)
        }
      });
    }

    addLabelLayer(map, s.id, false);
  } else if (s.geom === "line") {
    const lineId = `${s.id}-line`;
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: "line",
        source: s.id,
        paint: {
          "line-color": lineColorFor(s.id),
          "line-width": lineWidthFor(s.id),
          "line-opacity": lineOpacityFor(s.id)
        }
      });
    }

    addLabelLayer(map, s.id, true);
  } else if (s.geom === "circle") {
    const circleId = `${s.id}-circle`;
    if (!map.getLayer(circleId)) {
      map.addLayer({
        id: circleId,
        type: "circle",
        source: s.id,
        paint: {
          "circle-radius": 3.2,
          "circle-color": "#facc15",
          "circle-stroke-color": "#020617",
          "circle-stroke-width": 1.2
        }
      });
    }

    addLabelLayer(map, s.id, false, true);
  }
}

function addLabelLayer(map: maplibregl.Map, sourceId: string, line = false, zoomDependent = false): void {
  const labelId = `${sourceId}-label`;
  if (map.getLayer(labelId)) return;

  map.addLayer({
    id: labelId,
    type: "symbol",
    source: sourceId,
    layout: {
      ...(line ? { "symbol-placement": "line" } : {}),
      "text-field": ["coalesce", ["get", "name"], ["get", "id"], ""],
      "text-size": zoomDependent
        ? ["interpolate", ["linear"], ["zoom"], 7, 0, 9.5, 9.5]
        : 8.5,
      "text-allow-overlap": false
    },
    paint: {
      "text-color": "#e2e8f0",
      "text-halo-color": "#090d16",
      "text-halo-width": 2.0
    }
  });
}

function ensureGroupVisibility(map: maplibregl.Map, group: GroupDef, visible: boolean): void {
  group.active = visible;

  if (visible) {
    group.sources.forEach(s => addSourceAndLayers(map, group.key, s));
  }

  group.sources.forEach(s => {
    ["fill", "line", "circle", "label"].forEach(suffix => {
      const id = `${s.id}-${suffix}`;
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    });
  });
}

function createVatmOverlayToolbar(map: maplibregl.Map): void {
  let toolbar = document.getElementById("vatm-kmz-overlay-toolbar");
  if (toolbar) {
    return;
  }

  toolbar = document.createElement("div");
  toolbar.id = "vatm-kmz-overlay-toolbar";
  toolbar.style.cssText = "position:absolute;left:12px;top:84px;z-index:10;display:flex;flex-direction:column;gap:6px;background:rgba(2,6,23,.78);border:1px solid rgba(148,163,184,.26);border-radius:12px;padding:9px;backdrop-filter:blur(12px);box-shadow:0 12px 36px rgba(0,0,0,0.6);";

  const title = document.createElement("div");
  title.textContent = "🛰️ DỮ LIỆU KHÔNG PHẬN";
  title.style.cssText = "font:800 10px system-ui,sans-serif;color:#94a3b8;margin-bottom:4px;padding:2px 4px;letter-spacing:1px;text-align:center;border-bottom:1px solid rgba(148,163,184,.15);padding-bottom:6px;";
  toolbar.appendChild(title);

  GROUPS.forEach(group => {
    const btn = document.createElement("button");
    btn.textContent = group.label;
    btn.style.cssText = "font:600 11.5px system-ui,sans-serif;color:#dbeafe;background:rgba(15,23,42,.8);border:1px solid rgba(148,163,184,.25);border-radius:8px;padding:6px 10px;cursor:pointer;text-align:left;transition:all 0.15s ease-in-out;width:170px;";
    
    if (group.active) {
      btn.style.background = "rgba(20,184,166,.35)";
      btn.style.borderColor = "#14b8a6";
      btn.style.boxShadow = "0 0 8px rgba(20,184,166,.3)";
    }

    btn.onclick = () => {
      const newState = !group.active;
      ensureGroupVisibility(map, group, newState);
      if (newState) {
        btn.style.background = "rgba(20,184,166,.35)";
        btn.style.borderColor = "#14b8a6";
        btn.style.boxShadow = "0 0 8px rgba(20,184,166,.3)";
      } else {
        btn.style.background = "rgba(15,23,42,.8)";
        btn.style.borderColor = "rgba(148,163,184,.25)";
        btn.style.boxShadow = "none";
      }
    };
    toolbar.appendChild(btn);
  });

  const disclaimer = document.createElement("div");
  disclaimer.innerHTML = "Dữ liệu VATM FTS<br/>Non-operational / FTS only";
  disclaimer.style.cssText = "font:500 8px system-ui,sans-serif;color:#64748b;margin-top:4px;text-align:center;padding:4px 4px 2px 4px;border-top:1px solid rgba(148,163,184,.12);line-height:1.3;";
  toolbar.appendChild(disclaimer);

  const container = map.getContainer();
  container.appendChild(toolbar);
}

// Styling Helper functions
function fillColorFor(sourceId: string): string {
  if (sourceId === "vatm-kmz-prd") return "#ef4444"; // Red
  if (sourceId === "vatm-kmz-acc-fir") return "#8b5cf6"; // Purple
  if (sourceId === "vatm-kmz-tma-ctr") return "#0284c7"; // Blue
  return "#22d3ee"; // Cyan
}

function fillOpacityFor(sourceId: string): number {
  if (sourceId === "vatm-kmz-prd") return 0.15;
  if (sourceId === "vatm-kmz-acc-fir") return 0.06;
  if (sourceId === "vatm-kmz-tma-ctr") return 0.08;
  if (sourceId === "vatm-kmz-route-corridors") return 0.08;
  return 0.1;
}

function outlineColorFor(sourceId: string): string {
  if (sourceId === "vatm-kmz-prd") return "#f87171";
  if (sourceId === "vatm-kmz-acc-fir") return "#a78bfa";
  if (sourceId === "vatm-kmz-tma-ctr") return "#38bdf8";
  return "#22d3ee";
}

function outlineWidthFor(sourceId: string): number {
  if (sourceId === "vatm-kmz-prd") return 1.8;
  if (sourceId === "vatm-kmz-acc-fir") return 1.5;
  if (sourceId === "vatm-kmz-tma-ctr") return 1.6;
  return 1.2;
}

function outlineOpacityFor(sourceId: string): number {
  if (sourceId === "vatm-kmz-prd") return 0.8;
  if (sourceId === "vatm-kmz-route-corridors") return 0.4;
  return 0.7;
}

function lineColorFor(sourceId: string): string {
  return "#22d3ee"; // Cyan for ATS routes
}

function lineWidthFor(sourceId: string): number {
  if (sourceId === "vatm-kmz-ats-routes") return 1.8;
  return 1.5;
}

function lineOpacityFor(sourceId: string): number {
  if (sourceId === "vatm-kmz-ats-routes") return 0.75;
  return 0.85;
}
