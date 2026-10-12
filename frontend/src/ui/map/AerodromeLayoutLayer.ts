import type maplibregl from 'maplibre-gl';
import { logger } from '../../utils/Logger';

let aerodromeLayoutActive = false;
let currentIcaos: string[] = [];
let activeMap: maplibregl.Map | null = null;

export async function setAerodromeLayoutIds(map: maplibregl.Map, icaos: string[]): Promise<void> {
  activeMap = map;
  currentIcaos = icaos;
  
  if (icaos.length > 0) {
    aerodromeLayoutActive = true;
    await fetchAndRenderAerodromeLayouts(map, icaos);
  } else {
    aerodromeLayoutActive = false;
    removeAerodromeLayout(map);
  }
}

export function isAerodromeLayoutActive(): boolean {
  return aerodromeLayoutActive;
}

export function getActiveAerodromeLayoutIds(): string[] {
  return currentIcaos;
}

async function fetchAndRenderAerodromeLayouts(map: maplibregl.Map, icaos: string[]) {
  try {
    const layerNames = [
      'runways', 'runway_centerlines', 'runway_labels',
      'pavements', 'taxiway_centerlines', 'taxiway_labels',
      'gates', 'ground_markings', 'taxiway_signs',
      'boundaries', 'helipads'
    ];

    const combinedLayers: Record<string, any> = {};
    layerNames.forEach(name => {
      combinedLayers[name] = { type: 'FeatureCollection', features: [] };
    });

    for (const icao of icaos) {
      const res = await fetch(`/api/aerodrome-layout/active/airports/${icao}/layers`);
      if (res.ok) {
        const data = await res.json();
        const { layers } = data;
        layerNames.forEach(name => {
          if (layers[name] && layers[name].features) {
            combinedLayers[name].features.push(...layers[name].features);
          }
        });
      }
    }

    addGeoJsonSource(map, 'aero-runways', combinedLayers.runways);
    addGeoJsonSource(map, 'aero-runway-centerlines', combinedLayers.runway_centerlines);
    addGeoJsonSource(map, 'aero-runway-labels', combinedLayers.runway_labels);
    addGeoJsonSource(map, 'aero-pavements', combinedLayers.pavements);
    addGeoJsonSource(map, 'aero-taxiway-centerlines', combinedLayers.taxiway_centerlines);
    addGeoJsonSource(map, 'aero-taxiway-labels', combinedLayers.taxiway_labels);
    addGeoJsonSource(map, 'aero-gates', combinedLayers.gates);
    addGeoJsonSource(map, 'aero-ground-markings', combinedLayers.ground_markings);
    addGeoJsonSource(map, 'aero-taxiway-signs', combinedLayers.taxiway_signs);
    addGeoJsonSource(map, 'aero-boundaries', combinedLayers.boundaries);
    addGeoJsonSource(map, 'aero-helipads', combinedLayers.helipads);

    const firstLabel = getFirstLabelLayerId(map);

    // 1. Pavements (Aprons/Taxiways Fill)
    if (!map.getLayer('aero-pavements-fill')) {
      map.addLayer({
        id: 'aero-pavements-fill',
        type: 'fill',
        source: 'aero-pavements',
        paint: {
          'fill-color': '#475569',
          'fill-opacity': 0.6
        }
      }, firstLabel);
    }

    // 2. Runways (Darker fill)
    if (!map.getLayer('aero-runways-fill')) {
      map.addLayer({
        id: 'aero-runways-fill',
        type: 'fill',
        source: 'aero-runways',
        paint: {
          'fill-color': '#1e293b',
          'fill-opacity': 0.8
        }
      }, firstLabel);
    }

    // 3. Ground Markings (White/Yellow lines or polygons)
    if (!map.getLayer('aero-ground-markings-line')) {
      map.addLayer({
        id: 'aero-ground-markings-line',
        type: 'line',
        source: 'aero-ground-markings',
        paint: {
          'line-color': '#cbd5e1',
          'line-width': 1.0,
          'line-opacity': 0.7
        }
      }, firstLabel);
    }

    // 4. Taxiway Centerlines (Solid Yellow)
    if (!map.getLayer('aero-taxiway-centerlines-line')) {
      map.addLayer({
        id: 'aero-taxiway-centerlines-line',
        type: 'line',
        source: 'aero-taxiway-centerlines',
        filter: ['!=', ['get', 'type'], 'pushback'],
        paint: {
          'line-color': '#facc15',
          'line-width': 2.0
        }
      }, firstLabel);
    }
    
    // 4b. Pushback Lines (Solid Yellow, only visible zoomed in)
    if (!map.getLayer('aero-pushback-lines')) {
      map.addLayer({
        id: 'aero-pushback-lines',
        type: 'line',
        source: 'aero-taxiway-centerlines',
        filter: ['==', ['get', 'type'], 'pushback'],
        minzoom: 16.5,
        paint: {
          'line-color': '#facc15',
          'line-width': 1.5,
          'line-opacity': 0.7
        }
      }, firstLabel);
    }

    // 5. Runway Centerlines (Dashed White)
    if (!map.getLayer('aero-runway-centerlines-line')) {
      map.addLayer({
        id: 'aero-runway-centerlines-line',
        type: 'line',
        source: 'aero-runway-centerlines',
        paint: {
          'line-color': '#ffffff',
          'line-width': 2.5,
          'line-dasharray': [3, 3] as any
        }
      }, firstLabel);
    }

    // 6. Helipads (Circle/Fill)
    if (!map.getLayer('aero-helipads-fill')) {
      map.addLayer({
        id: 'aero-helipads-fill',
        type: 'fill',
        source: 'aero-helipads',
        paint: {
          'fill-color': '#ef4444',
          'fill-opacity': 0.5
        }
      }, firstLabel);
    }

    // 7. Boundaries (Extruded 3D or simple line if no pitch)
    if (!map.getLayer('aero-boundaries-extrusion')) {
      map.addLayer({
        id: 'aero-boundaries-extrusion',
        type: 'fill-extrusion',
        source: 'aero-boundaries',
        paint: {
          'fill-extrusion-color': '#0f172a',
          'fill-extrusion-height': 5,
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.5
        }
      }, firstLabel);
    }

    // 8. Gates (Points)
    if (!map.getLayer('aero-gates-circle')) {
      map.addLayer({
        id: 'aero-gates-circle',
        type: 'circle',
        source: 'aero-gates',
        minzoom: 15,
        paint: {
          'circle-radius': 4,
          'circle-color': '#3b82f6',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#000'
        }
      });
      map.addLayer({
        id: 'aero-gates-label',
        type: 'symbol',
        source: 'aero-gates',
        minzoom: 14,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-allow-overlap': false
        } as any,
        paint: {
          'text-color': '#bfdbfe',
          'text-halo-color': '#000',
          'text-halo-width': 2
        }
      });
    }

    // 9. Taxiway Signs
    if (!map.getLayer('aero-taxiway-signs-circle')) {
      map.addLayer({
        id: 'aero-taxiway-signs-circle',
        type: 'circle',
        source: 'aero-taxiway-signs',
        minzoom: 15,
        paint: {
          'circle-radius': 3,
          'circle-color': '#f87171'
        }
      });
    }

    // 10. Labels (Runway & Taxiway)
    if (!map.getLayer('aero-runway-labels-text')) {
      map.addLayer({
        id: 'aero-runway-labels-text',
        type: 'symbol',
        source: 'aero-runway-labels',
        minzoom: 14,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 18,
          'text-allow-overlap': false
        } as any,
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 3
        }
      });
      
      map.addLayer({
        id: 'aero-taxiway-labels-text',
        type: 'symbol',
        source: 'aero-taxiway-labels',
        minzoom: 15,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 8,
          'text-allow-overlap': false
        } as any,
        paint: {
          'text-color': '#facc15',
          'text-halo-color': '#000000',
          'text-halo-width': 1
        }
      });
    }

    // Auto-fit bounds (approximate) - Only fly if exactly 1 airport was just activated
    // Disabled as per user request to maintain current view
    /*
    if (icaos.length === 1 && combinedLayers.pavements.features.length > 0) {
       const firstCoord = combinedLayers.pavements.features[0].geometry.coordinates[0];
       let lon = 0, lat = 0;
       if (Array.isArray(firstCoord[0])) {
         lon = firstCoord[0][0]; lat = firstCoord[0][1];
       } else {
         lon = firstCoord[0]; lat = firstCoord[1];
       }
       if (lon && lat) {
         map.flyTo({ center: [lon, lat], zoom: 14.5, pitch: 45 });
       }
    }
    */

  } catch (err) {
    console.error("Error rendering aerodrome layouts:", err);
  }
}

function addGeoJsonSource(map: maplibregl.Map, id: string, data: any) {
  const source = map.getSource(id) as maplibregl.GeoJSONSource;
  if (source) {
    source.setData(data || { type: "FeatureCollection", features: [] });
  } else {
    map.addSource(id, { type: 'geojson', data: data || { type: "FeatureCollection", features: [] } });
  }
}

function removeAerodromeLayout(map: maplibregl.Map) {
  const layers = [
    'aero-pavements-fill', 'aero-runways-fill', 'aero-ground-markings-line', 
    'aero-taxiway-centerlines-line', 'aero-pushback-lines', 'aero-runway-centerlines-line', 'aero-helipads-fill',
    'aero-boundaries-extrusion', 'aero-gates-circle', 'aero-gates-label',
    'aero-taxiway-signs-circle', 'aero-runway-labels-text', 'aero-taxiway-labels-text'
  ];
  
  const sources = [
    'aero-runways', 'aero-runway-centerlines', 'aero-runway-labels',
    'aero-pavements', 'aero-taxiway-centerlines', 'aero-taxiway-labels',
    'aero-gates', 'aero-ground-markings', 'aero-taxiway-signs',
    'aero-boundaries', 'aero-helipads'
  ];

  layers.forEach(l => {
    if (map.getLayer(l)) map.removeLayer(l);
  });
  sources.forEach(s => {
    if (map.getSource(s)) map.removeSource(s);
  });
}

function getFirstLabelLayerId(map: maplibregl.Map): string | undefined {
  const style = map.getStyle();
  if (!style || !style.layers) return undefined;
  for (let i = 0; i < style.layers.length; i++) {
    if (style.layers[i].type === 'symbol') {
      return style.layers[i].id;
    }
  }
  return undefined;
}
