import { Map as MapLibreMap } from 'maplibre-gl';
import { DisplayOptions } from '../../../data/types';
import type { MapDisplay } from '../MapDisplay';
import type { StateManager } from '../../../core/StateManager';
import { Shape3DRenderer } from './Shape3DRenderer';
import { logger } from '../../../utils/Logger';

/**
 * ShapeRenderer - Handles rendering of geographic shapes
 *
 * Specialised to render only the high-fidelity Vietnam FIR boundaries:
 * - HA NOI FIR (VVHN)
 * - HO CHI MINH FIR (VVHM)
 * Displays them dynamically using the static GeoJSON file.
 */
export class ShapeRenderer {
    private mapDisplay: MapDisplay;
    private stateManager: StateManager;
    private shape3DRenderer: Shape3DRenderer;
    private initialized = false;

    // Layer and source IDs
    private readonly FIR_SOURCE_ID = 'vatm-fir-only';
    private readonly FIR_FILL_LAYER_ID = 'vatm-fir-only-fill';
    private readonly FIR_LINE_LAYER_ID = 'vatm-fir-only-line';
    private readonly FIR_LABEL_LAYER_ID = 'vatm-fir-only-label';

    constructor(mapDisplay: MapDisplay, stateManager: StateManager) {
        this.mapDisplay = mapDisplay;
        this.stateManager = stateManager;
        this.shape3DRenderer = new Shape3DRenderer(mapDisplay, stateManager);
    }

    /**
     * Initialize the shape renderer
     * Creates map sources and layers
     */
    public initialize(): void {
        if (this.initialized) return;

        const map = this.mapDisplay.getMap();
        if (!map) {
            logger.warn('ShapeRenderer', 'Cannot initialize - map not available');
            return;
        }

        // Set up map layers for shape rendering
        this.setupMapLayers();

        // Initialize 3D extrusion renderer
        this.shape3DRenderer.initialize();

        // Resize map after it settles
        map.once('idle', () => {
            this.mapDisplay.resize();
        });

        // Subscribe to display options changes
        this.stateManager.subscribe('displayOptions', (newOptions) => {
            if (newOptions) {
                this.updateDisplayOptions(newOptions);
            }
        });

        this.initialized = true;
        console.log("[VATM] Shapes now use FIR-only source:", "/static/data/vatm_kmz/vatm_fir_only.geojson");
        logger.info('ShapeRenderer', 'Initialized with Vietnam FIR boundaries only');
    }

    /**
     * Set up MapLibre GL sources and layers for shape rendering
     */
    private setupMapLayers(): void {
        const map = this.mapDisplay.getMap();
        if (!map) return;

        // Add source for Vietnam FIR
        if (!map.getSource(this.FIR_SOURCE_ID)) {
            map.addSource(this.FIR_SOURCE_ID, {
                type: 'geojson',
                data: '/static/data/vatm_kmz/vatm_fir_only.geojson'
            });
        }

        // Get current display options
        const displayOptions = this.stateManager.getDisplayOptions();

        // Add polygon fill layer for Vietnam FIR
        if (!map.getLayer(this.FIR_FILL_LAYER_ID)) {
            map.addLayer({
                id: this.FIR_FILL_LAYER_ID,
                source: this.FIR_SOURCE_ID,
                type: 'fill',
                paint: {
                    'fill-color': displayOptions.shapeFillColor || '#8b5cf6',
                    'fill-opacity': 0.03
                },
                layout: {
                    visibility: (displayOptions.showShapes && displayOptions.showShapeFill) ? 'visible' : 'none'
                }
            });
        }

        // Add line outline layer for Vietnam FIR
        if (!map.getLayer(this.FIR_LINE_LAYER_ID)) {
            map.addLayer({
                id: this.FIR_LINE_LAYER_ID,
                source: this.FIR_SOURCE_ID,
                type: 'line',
                paint: {
                    'line-color': displayOptions.shapeLinesColor || '#c084fc',
                    'line-width': 2,
                    'line-opacity': 0.9
                },
                layout: {
                    visibility: (displayOptions.showShapes && displayOptions.showShapeLines) ? 'visible' : 'none'
                }
            });
        }

        // Add text labels layer for Vietnam FIR
        if (!map.getLayer(this.FIR_LABEL_LAYER_ID)) {
            map.addLayer({
                id: this.FIR_LABEL_LAYER_ID,
                source: this.FIR_SOURCE_ID,
                type: 'symbol',
                minzoom: 4,
                layout: {
                    'text-field': ['get', 'fir'],
                    'text-size': 13,
                    'text-anchor': 'center',
                    visibility: (displayOptions.showShapes && displayOptions.showShapeLabels) ? 'visible' : 'none'
                },
                paint: {
                    'text-color': displayOptions.shapeLabelsColor || '#f5d0fe',
                    'text-halo-color': '#020617',
                    'text-halo-width': 1.5
                }
            });
        }

        logger.debug('ShapeRenderer', 'Vietnam FIR map layers created');
    }

    /**
     * Update display options (visibility, colors, etc.)
     */
    private updateDisplayOptions(displayOptions: DisplayOptions): void {
        const map = this.mapDisplay.getMap();
        if (!map) return;

        // Update layer visibility - respect master showShapes toggle
        if (map.getLayer(this.FIR_FILL_LAYER_ID)) {
            map.setLayoutProperty(
                this.FIR_FILL_LAYER_ID,
                'visibility',
                (displayOptions.showShapes && displayOptions.showShapeFill) ? 'visible' : 'none'
            );
            map.setPaintProperty(
                this.FIR_FILL_LAYER_ID,
                'fill-color',
                displayOptions.shapeFillColor || '#8b5cf6'
            );
        }

        if (map.getLayer(this.FIR_LINE_LAYER_ID)) {
            map.setLayoutProperty(
                this.FIR_LINE_LAYER_ID,
                'visibility',
                (displayOptions.showShapes && displayOptions.showShapeLines) ? 'visible' : 'none'
            );
            map.setPaintProperty(
                this.FIR_LINE_LAYER_ID,
                'line-color',
                displayOptions.shapeLinesColor || '#c084fc'
            );
        }

        if (map.getLayer(this.FIR_LABEL_LAYER_ID)) {
            map.setLayoutProperty(
                this.FIR_LABEL_LAYER_ID,
                'visibility',
                (displayOptions.showShapes && displayOptions.showShapeLabels) ? 'visible' : 'none'
            );
            map.setPaintProperty(
                this.FIR_LABEL_LAYER_ID,
                'text-color',
                displayOptions.shapeLabelsColor || '#f5d0fe'
            );
        }

        // Update 3D extrusion renderer
        this.shape3DRenderer.updateDisplayOptions(displayOptions);

        logger.debug('ShapeRenderer', 'Display options updated');
    }

    /**
     * Handle map style changes - re-add layers
     */
    public onStyleChange(): void {
        logger.debug('ShapeRenderer', 'Map style changed - recreating layers');
        this.initialized = false;
        this.initialize();

        // Re-create 3D extrusion layers
        this.shape3DRenderer.onStyleChange();

        // Resize map after it settles
        const map = this.mapDisplay.getMap();
        if (map) {
            map.once('idle', () => {
                this.mapDisplay.resize();
            });
        }
    }

    /**
     * Clean up resources
     */
    public destroy(): void {
        this.shape3DRenderer.destroy();
        this.initialized = false;
        logger.info('ShapeRenderer', 'Destroyed');
    }
}
