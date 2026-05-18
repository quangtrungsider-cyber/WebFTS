/**
 * Vietnam ATS Routes Layer for WebATM / VATM FTS
 * Data source:
 * - /static/data/vietnam_ats_routes.geojson
 * - /static/data/vietnam_ats_waypoints.geojson
 *
 * Copy both GeoJSON files to:
 *   WebATM/static/data/
 *
 * Then call addVietnamAtsRoutesLayer(map) after MapLibre map load.
 */

import type maplibregl from "maplibre-gl";

export function addVietnamAtsRoutesLayer(map: maplibregl.Map): void {
  if (!map.getSource("vietnam-ats-routes")) {
    map.addSource("vietnam-ats-routes", {
      type: "geojson",
      data: "/static/data/vietnam_ats_routes.geojson"
    });

    map.addLayer({
      id: "vietnam-ats-routes-line",
      type: "line",
      source: "vietnam-ats-routes",
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "section"], "ENR 3.3 RNAV Routes"], "#22d3ee",
          "#34d399"
        ],
        "line-width": 2,
        "line-opacity": 0.78
      }
    });

    map.addLayer({
      id: "vietnam-ats-routes-label",
      type: "symbol",
      source: "vietnam-ats-routes",
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "route_id"],
        "text-size": 11,
        "text-allow-overlap": false,
        "text-ignore-placement": false
      },
      paint: {
        "text-color": "#e0f2fe",
        "text-halo-color": "#020617",
        "text-halo-width": 1.4
      }
    });
  }

  if (!map.getSource("vietnam-ats-waypoints")) {
    map.addSource("vietnam-ats-waypoints", {
      type: "geojson",
      data: "/static/data/vietnam_ats_waypoints.geojson"
    });

    map.addLayer({
      id: "vietnam-ats-waypoints-circle",
      type: "circle",
      source: "vietnam-ats-waypoints",
      paint: {
        "circle-radius": 3,
        "circle-color": "#facc15",
        "circle-stroke-color": "#020617",
        "circle-stroke-width": 1
      }
    });

    map.addLayer({
      id: "vietnam-ats-waypoints-label",
      type: "symbol",
      source: "vietnam-ats-waypoints",
      layout: {
        "text-field": ["get", "name"],
        "text-size": 10,
        "text-offset": [0, 1.1],
        "text-allow-overlap": false
      },
      paint: {
        "text-color": "#fef9c3",
        "text-halo-color": "#020617",
        "text-halo-width": 1.4
      }
    });
  }
}
