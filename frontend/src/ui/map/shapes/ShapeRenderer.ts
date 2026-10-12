import { Map as MapLibreMap } from 'maplibre-gl';
import { DisplayOptions } from '../../../data/types';
import type { MapDisplay } from '../MapDisplay';
import type { StateManager } from '../../../core/StateManager';
import { Shape3DRenderer } from './Shape3DRenderer';
import { logger } from '../../../utils/Logger';

/**
 * ShapeRenderer - Handles rendering of geographic shapes
 */
export class ShapeRenderer {
    private mapDisplay: MapDisplay;
    private stateManager: StateManager;
    private shape3DRenderer: Shape3DRenderer;
    private initialized = false;

    constructor(mapDisplay: MapDisplay, stateManager: StateManager) {
        this.mapDisplay = mapDisplay;
        this.stateManager = stateManager;
        this.shape3DRenderer = new Shape3DRenderer(mapDisplay, stateManager);
    }

    /**
     * Initialize the shape renderer
     */
    public initialize(): void {
        if (this.initialized) return;

        const map = this.mapDisplay.getMap();
        if (!map) {
            logger.warn('ShapeRenderer', 'Cannot initialize - map not available');
            return;
        }

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
        logger.info('ShapeRenderer', 'Initialized (Old FIR data removed)');
    }

    /**
     * Update display options (visibility, colors, etc.)
     */
    private updateDisplayOptions(displayOptions: DisplayOptions): void {
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
