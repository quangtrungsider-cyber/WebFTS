import React, { useEffect, useRef } from 'react';
import maplibregl, { Map } from 'maplibre-gl';
import { ReplayAircraftFrame, ReplayTrackSample } from '../../types/replay';
import { logger } from '../../utils/Logger';

interface ReplayMapViewerProps {
  currentFrames: ReplayAircraftFrame[];
  trackSamples: ReplayTrackSample[];
  selectedCallsign: string | null;
  onSelectAircraft: (callsign: string | null) => void;
}

export const ReplayMapViewer: React.FC<ReplayMapViewerProps> = ({
  currentFrames,
  trackSamples,
  selectedCallsign,
  onSelectAircraft
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    logger.info('ReplayMapViewer', 'Initializing MapLibre Replay Map');

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
      center: [106.66, 10.81], // Centered around SGN/VVTS
      zoom: 8.5,
      fadeDuration: 0
    });

    mapRef.current = map;

    map.on('load', () => {
      logger.info('ReplayMapViewer', 'Map loaded successfully');

      // Add image for aircraft icon (triangle)
      const canvas = document.createElement('canvas');
      canvas.width = 24;
      canvas.height = 24;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw elegant fighter/civil jet symbol
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 2.5;
        ctx.fillStyle = 'rgba(0, 255, 204, 0.25)';
        ctx.shadowColor = '#00ffcc';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(12, 2);
        ctx.lineTo(22, 20);
        ctx.lineTo(12, 15);
        ctx.lineTo(2, 20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Conflict aircraft icon
      const canvasConflict = document.createElement('canvas');
      canvasConflict.width = 24;
      canvasConflict.height = 24;
      const ctxConflict = canvasConflict.getContext('2d');
      if (ctxConflict) {
        ctxConflict.strokeStyle = '#ff3333';
        ctxConflict.lineWidth = 2.5;
        ctxConflict.fillStyle = 'rgba(255, 51, 51, 0.3)';
        ctxConflict.shadowColor = '#ff3333';
        ctxConflict.shadowBlur = 4;
        ctxConflict.beginPath();
        ctxConflict.moveTo(12, 2);
        ctxConflict.lineTo(22, 20);
        ctxConflict.lineTo(12, 15);
        ctxConflict.lineTo(2, 20);
        ctxConflict.closePath();
        ctxConflict.fill();
        ctxConflict.stroke();
      }

      // Add images to map style
      const imgData = ctx ? ctx.getImageData(0, 0, 24, 24) : null;
      if (imgData) {
        map.addImage('plane-icon', imgData);
      }

      const imgDataConflict = ctxConflict ? ctxConflict.getImageData(0, 0, 24, 24) : null;
      if (imgDataConflict) {
        map.addImage('plane-icon-conflict', imgDataConflict);
      }

      // 1. Setup Selected Trail Source & Layer
      map.addSource('selected-trail', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      map.addLayer({
        id: 'trail-line-glow',
        type: 'line',
        source: 'selected-trail',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#00ffcc',
          'line-width': 6,
          'line-opacity': 0.15
        }
      });

      map.addLayer({
        id: 'trail-line',
        type: 'line',
        source: 'selected-trail',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#64b5f6',
          'line-width': 2.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.85
        }
      });

      // 2. Setup Aircraft Source & Layer
      map.addSource('aircraft-replay', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Layer for plane icons
      map.addLayer({
        id: 'aircraft-replay-layer',
        type: 'symbol',
        source: 'aircraft-replay',
        layout: {
          'icon-image': [
            'case',
            ['get', 'isConflict'],
            'plane-icon-conflict',
            'plane-icon'
          ],
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': 0.8
        }
      });

      // Layer for callsign text labels
      map.addLayer({
        id: 'aircraft-replay-labels',
        type: 'symbol',
        source: 'aircraft-replay',
        layout: {
          'text-field': [
            'format',
            ['get', 'callsign'], { 'font-scale': 1.0, 'text-color': '#ffffff' },
            '\n', {},
            ['get', 'flightInfo'], { 'font-scale': 0.8, 'text-color': '#00ffcc' }
          ],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 1.8],
          'text-anchor': 'top',
          // Two real aircraft flying close together (e.g. a minimum-
          // separation/wake-turbulence test, exactly this project's own
          // vvdn_wake_category_minsep_matrix.scn) can sit only a few km
          // apart -- MapLibre's default label-collision avoidance
          // silently drops whichever callsign loses the collision, so
          // only ONE of two overlapping aircraft showed a label (looked
          // like a duplicate/ghost icon of the same plane). For an ATC-
          // adjacent display, hiding a callsign specifically when two
          // aircraft are close together is the one case it must NOT do --
          // matches icon-allow-overlap: true above, which already never
          // hides the icons themselves.
          'text-allow-overlap': true,
          'text-ignore-placement': true
        },
        paint: {
          'text-halo-color': '#000000',
          'text-halo-width': 1.5
        }
      });

      // Interactive clicks on aircraft symbols
      map.on('click', 'aircraft-replay-layer', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['aircraft-replay-layer'] });
        if (features.length > 0) {
          const callsign = features[0].properties?.callsign;
          if (callsign) {
            onSelectAircraft(callsign);
          }
        }
      });

      // Map hover mouse cursors
      map.on('mouseenter', 'aircraft-replay-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'aircraft-replay-layer', () => {
        map.getCanvas().style.cursor = '';
      });
    });

    // Auto-fit to active aircraft initially
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Aircraft GeoJSON Data when currentFrames or selectedCallsign change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('aircraft-replay') as maplibregl.GeoJSONSource;
    if (!source) return;

    // Convert frames to GeoJSON
    const features = currentFrames.map(f => {
      const isSelected = selectedCallsign === f.callsign;
      const isConflict = f.conflictStatus === 'conflict' || f.conflictStatus === 'stca';
      const altStr = f.altitudeFt !== undefined && f.altitudeFt !== null ? Math.round(f.altitudeFt / 100).toString().padStart(3, '0') : '000';
      const speedStr = f.speedKt !== undefined && f.speedKt !== null ? Math.round(f.speedKt / 10).toString() : '00';
      
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [f.lon, f.lat]
        },
        properties: {
          callsign: f.callsign,
          heading: f.headingDeg || 0,
          isConflict: isConflict,
          isSelected: isSelected,
          flightInfo: `FL${altStr} | ${speedStr}0kt`
        }
      };
    });

    source.setData({
      type: 'FeatureCollection',
      features: features
    });
  }, [currentFrames, selectedCallsign]);

  // Update selected aircraft flight trail line
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('selected-trail') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (!selectedCallsign) {
      // Clear trail line
      source.setData({
        type: 'FeatureCollection',
        features: []
      });
      return;
    }

    // Find all track samples for the selected aircraft callsign
    const samples = trackSamples
      .filter(s => s.callsign === selectedCallsign)
      .sort((a, b) => a.t - b.t);

    if (samples.length < 2) {
      source.setData({
        type: 'FeatureCollection',
        features: []
      });
      return;
    }

    // Create LineString coordinates
    const coordinates = samples.map(s => [s.lon, s.lat]);

    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          },
          properties: {}
        }
      ]
    });
  }, [selectedCallsign, trackSamples]);

  // Center map on selected aircraft if clicked or loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedCallsign) return;

    const activeFrame = currentFrames.find(f => f.callsign === selectedCallsign);
    if (activeFrame) {
      map.easeTo({
        center: [activeFrame.lon, activeFrame.lat],
        duration: 500
      });
    }
  }, [selectedCallsign]);

  // Fit to all aircraft once when recording first loads
  useEffect(() => {
    const map = mapRef.current;
    if (!map || currentFrames.length === 0) return;

    // Check if map is loaded and we have zoom
    map.once('idle', () => {
      let minLng = 180;
      let maxLng = -180;
      let minLat = 90;
      let maxLat = -90;

      currentFrames.forEach(f => {
        if (f.lon < minLng) minLng = f.lon;
        if (f.lon > maxLng) maxLng = f.lon;
        if (f.lat < minLat) minLat = f.lat;
        if (f.lat > maxLat) maxLat = f.lat;
      });

      if (minLng < maxLng && minLat < maxLat) {
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
          padding: 80,
          maxZoom: 10
        });
      }
    });
  }, [trackSamples.length === 0]); // Trigger when trackSamples are loaded

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid #333' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Decision-Support Watermark */}
      <div style={{
        position: 'absolute',
        top: '15px',
        right: '15px',
        backgroundColor: 'rgba(239, 83, 80, 0.85)', // Premium glowing soft red
        color: '#fff',
        padding: '5px 12px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        pointerEvents: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.2)',
        zIndex: 5
      }}>
        <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '6px' }}></i> Non-Operational / Decision Support
      </div>

      {/* Map details info overlay */}
      <div style={{
        position: 'absolute',
        bottom: '15px',
        left: '15px',
        backgroundColor: 'rgba(27,27,27,0.85)',
        border: '1px solid #444',
        padding: '8px 12px',
        borderRadius: '4px',
        color: '#ccc',
        fontSize: '11px',
        fontFamily: 'monospace',
        pointerEvents: 'none',
        zIndex: 5
      }}>
        <div>Active Targets: {currentFrames.length}</div>
        {selectedCallsign && <div style={{ color: '#64b5f6', marginTop: '2px' }}>Selected: {selectedCallsign}</div>}
      </div>
    </div>
  );
};
