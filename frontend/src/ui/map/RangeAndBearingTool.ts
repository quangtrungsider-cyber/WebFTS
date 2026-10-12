import { Map as MapLibreMap, MapMouseEvent, GeoJSONSource } from 'maplibre-gl';
import type { MapDisplay } from './MapDisplay';
import { calculateDistanceNM, calculateBearing } from '../../utils/geo';
import { logger } from '../../utils/Logger';

interface PointInfo {
    lat: number;
    lon: number;
    aircraftId?: string;
}

/**
 * Range and Bearing Tool (R&B / RBL)
 * Allows users to click two points (or aircraft) on the map to measure
 * distance in Nautical Miles and true bearing in degrees.
 */
export class RangeAndBearingTool {
    private mapDisplay: MapDisplay;
    private active: boolean = false;
    
    private pointA: PointInfo | null = null;
    private pointB: PointInfo | null = null;
    
    private clickHandler: ((e: MapMouseEvent) => void) | null = null;
    private mouseMoveHandler: ((e: MapMouseEvent) => void) | null = null;
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

    private readonly RNB_SOURCE_ID = 'rnb-tool-source';
    private readonly RNB_LINE_LAYER_ID = 'rnb-tool-line-layer';
    private readonly RNB_LABEL_LAYER_ID = 'rnb-tool-label-layer';

    // Callbacks for UI updates if needed
    public onStateChange: ((isActive: boolean) => void) | null = null;

    constructor(mapDisplay: MapDisplay) {
        this.mapDisplay = mapDisplay;
    }

    public isActive(): boolean {
        return this.active;
    }

    /**
     * Toggle the R&B tool on or off
     */
    public toggle(): void {
        if (this.active) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    /**
     * Activate the tool
     */
    public activate(): void {
        if (this.active) return;
        
        const map = this.mapDisplay.getMap();
        if (!map) return;

        this.active = true;
        this.pointA = null;
        this.pointB = null;

        // Change cursor to crosshair
        const canvas = map.getCanvas();
        if (canvas) canvas.style.cursor = 'crosshair';

        this.clickHandler = (e: MapMouseEvent) => this.handleClick(e);
        this.mouseMoveHandler = (e: MapMouseEvent) => this.handleMouseMove(e);
        this.keydownHandler = (e: KeyboardEvent) => this.handleKeydown(e);

        map.on('click', this.clickHandler);
        map.on('mousemove', this.mouseMoveHandler);
        document.addEventListener('keydown', this.keydownHandler);

        logger.info('RangeAndBearingTool', 'Activated');
        
        if (this.onStateChange) {
            this.onStateChange(true);
        }
    }

    /**
     * Deactivate the tool and clean up
     */
    public deactivate(): void {
        if (!this.active) return;

        const map = this.mapDisplay.getMap();
        if (map) {
            if (this.clickHandler) map.off('click', this.clickHandler);
            if (this.mouseMoveHandler) map.off('mousemove', this.mouseMoveHandler);
            
            // Restore cursor
            const canvas = map.getCanvas();
            if (canvas) canvas.style.cursor = '';

            this.removeMapLayers(map);
        }

        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
        }

        this.active = false;
        this.pointA = null;
        this.pointB = null;
        this.clickHandler = null;
        this.mouseMoveHandler = null;
        this.keydownHandler = null;

        logger.info('RangeAndBearingTool', 'Deactivated');

        if (this.onStateChange) {
            this.onStateChange(false);
        }
    }

    private handleKeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            if (this.pointB) {
                // If line is locked, unlock it and clear point B
                this.pointB = null;
                this.render(this.pointA, null); // Will clear map since no pointB/mouse coords are passed to render without event
            } else if (this.pointA) {
                // If only point A is selected, clear it
                this.pointA = null;
                const map = this.mapDisplay.getMap();
                if (map) this.removeMapLayers(map);
            } else {
                // Completely deactivate
                this.deactivate();
            }
        }
    }

    private handleClick(e: MapMouseEvent): void {
        // Prevent map interaction bubbles
        if (e.originalEvent) e.originalEvent.preventDefault();

        const lat = e.lngLat.lat;
        const lon = e.lngLat.lng;

        // Try to identify if user clicked on an aircraft
        let aircraftId: string | undefined;
        const map = this.mapDisplay.getMap();
        if (map) {
            // MapLibre query rendered features to see if we clicked an aircraft label or icon
            const features = map.queryRenderedFeatures(e.point, {
                layers: ['aircraft-labels', 'aircraft-points']
            });
            if (features.length > 0 && features[0].properties) {
                aircraftId = (features[0].properties.entity_id || features[0].properties.id || features[0].properties.callsign) as string;
            }
        }

        if (!this.pointA) {
            this.pointA = { lat, lon, aircraftId };
            logger.debug('RangeAndBearingTool', 'Point A selected', this.pointA);
        } else if (!this.pointB) {
            this.pointB = { lat, lon, aircraftId };
            logger.debug('RangeAndBearingTool', 'Point B selected', this.pointB);
            this.render(this.pointA, this.pointB);
        } else {
            // Reset and start over
            this.pointA = { lat, lon, aircraftId };
            this.pointB = null;
            logger.debug('RangeAndBearingTool', 'Restarted selection. Point A selected', this.pointA);
            const mapInst = this.mapDisplay.getMap();
            if (mapInst) this.removeMapLayers(mapInst);
        }
    }

    private handleMouseMove(e: MapMouseEvent): void {
        // Only draw dynamic line if A is selected but B is not
        if (this.pointA && !this.pointB) {
            const mousePoint: PointInfo = { lat: e.lngLat.lat, lon: e.lngLat.lng };
            this.render(this.pointA, mousePoint);
        }
    }

    /**
     * Update coordinates of Point A or Point B if they are tied to an aircraft.
     * Called by MapOverlay/EntityRenderer when aircraft positions update.
     */
    public updateTargetPosition(aircraftId: string, lat: number, lon: number): void {
        if (!this.active) return;
        
        let changed = false;
        if (this.pointA && this.pointA.aircraftId === aircraftId) {
            this.pointA.lat = lat;
            this.pointA.lon = lon;
            changed = true;
        }
        if (this.pointB && this.pointB.aircraftId === aircraftId) {
            this.pointB.lat = lat;
            this.pointB.lon = lon;
            changed = true;
        }

        if (changed && this.pointA) {
            if (this.pointB) {
                this.render(this.pointA, this.pointB);
            }
        }
    }

    private render(p1: PointInfo | null, p2: PointInfo | null): void {
        const map = this.mapDisplay.getMap();
        if (!map || !p1 || !p2) return;

        const distance = calculateDistanceNM(p1.lat, p1.lon, p2.lat, p2.lon);
        const bearing = calculateBearing(p1.lat, p1.lon, p2.lat, p2.lon);

        const distStr = distance.toFixed(1);
        const bearingStr = Math.round(bearing).toString().padStart(3, '0');
        const labelText = `${distStr} NM / ${bearingStr}°`;

        // Midpoint for label
        const midLat = (p1.lat + p2.lat) / 2;
        const midLon = (p1.lon + p2.lon) / 2;

        const data = {
            type: 'FeatureCollection' as const,
            features: [
                {
                    type: 'Feature' as const,
                    geometry: {
                        type: 'LineString' as const,
                        coordinates: [
                            [p1.lon, p1.lat],
                            [p2.lon, p2.lat]
                        ]
                    },
                    properties: {
                        isLine: true
                    }
                },
                {
                    type: 'Feature' as const,
                    geometry: {
                        type: 'Point' as const,
                        coordinates: [midLon, midLat]
                    },
                    properties: {
                        isLabel: true,
                        label: labelText
                    }
                }
            ]
        };

        const existingSource = map.getSource(this.RNB_SOURCE_ID) as GeoJSONSource | undefined;
        if (existingSource) {
            existingSource.setData(data);
        } else {
            map.addSource(this.RNB_SOURCE_ID, {
                type: 'geojson',
                data: data
            });

            // Line Layer
            map.addLayer({
                id: this.RNB_LINE_LAYER_ID,
                type: 'line',
                source: this.RNB_SOURCE_ID,
                filter: ['==', 'isLine', true],
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#ff8c00',
                    'line-width': 2,
                    'line-dasharray': [4, 4],
                    'line-opacity': 0.9
                }
            });

            // Label Layer
            map.addLayer({
                id: this.RNB_LABEL_LAYER_ID,
                type: 'symbol',
                source: this.RNB_SOURCE_ID,
                filter: ['==', 'isLabel', true],
                layout: {
                    'text-field': ['get', 'label'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Regular'],
                    'text-size': 15,
                    'text-anchor': 'bottom',
                    'text-offset': [0, -0.5]
                },
                paint: {
                    'text-color': '#ff8c00',
                    'text-halo-color': '#000000',
                    'text-halo-width': 2
                }
            });
        }
    }

    private removeMapLayers(map: MapLibreMap): void {
        if (map.getLayer(this.RNB_LABEL_LAYER_ID)) {
            map.removeLayer(this.RNB_LABEL_LAYER_ID);
        }
        if (map.getLayer(this.RNB_LINE_LAYER_ID)) {
            map.removeLayer(this.RNB_LINE_LAYER_ID);
        }
        if (map.getSource(this.RNB_SOURCE_ID)) {
            map.removeSource(this.RNB_SOURCE_ID);
        }
    }
}
