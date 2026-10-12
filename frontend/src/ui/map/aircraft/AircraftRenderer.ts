import { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import { DataProcessor } from '../../../data/DataProcessor';
import { AircraftData, DisplayOptions } from '../../../data/types';
import { StateManager } from '../../../core/StateManager';
import { EntityRenderer, EntityShapeDrawer, EntityRenderConfig } from '../EntityRenderer';
import { logger } from '../../../utils/Logger';

/**
 * Aircraft shape drawing function type (for backward compatibility)
 */
export type AircraftShapeDrawer = EntityShapeDrawer;

/**
 * Trail data for a single aircraft
 */
interface AircraftTrailData {
    coordinates: [number, number][]; // [lon, lat] pairs
    lastSavedTime: number; // Simulation time when last point was saved
}

/**
 * AircraftRenderer - Handles aircraft visualization on the map
 *
 * This class extends EntityRenderer to provide aircraft-specific rendering
 * functionality, including aircraft labels with speed, altitude, and vertical
 * speed information, as well as conflict detection.
 */
export class AircraftRenderer extends EntityRenderer<AircraftData> {
    private stateManager: StateManager;

    // Trail management
    private aircraftTrails: Map<string, AircraftTrailData> = new Map();
    private readonly trailSaveInterval: number = 5; // Save trail point every 5 simulation seconds

    constructor(map: MapLibreMap, displayOptions: DisplayOptions, shapeDrawer: AircraftShapeDrawer, stateManager: StateManager) {
        // Create aircraft-specific configuration using colors from displayOptions
        const config: EntityRenderConfig = {
            entityType: 'Aircraft',
            layerPrefix: 'aircraft',
            spritePrefix: 'aircraft',
            colors: {
                normal: displayOptions.aircraftIconColor,
                selected: displayOptions.aircraftSelectedColor,
                conflict: displayOptions.aircraftConflictColor,
                label: displayOptions.aircraftLabelColor
            },
            iconSize: displayOptions.aircraftIconSize,
            shapeDrawer: shapeDrawer,
            enableTrails: true // Enable trails for aircraft
        };

        super(map, displayOptions, config);
        this.stateManager = stateManager;
    }

    /**
     * Build aircraft label text based on display options
     * Includes aircraft ID, speed, altitude, and vertical speed indicators
     */
    protected buildEntityLabel(aircraftData: AircraftData, index: number): string {
        return DataProcessor.formatAircraftLabel(aircraftData, index, this.displayOptions);
    }

    /**
     * Get conflict status for an aircraft
     */
    protected getConflictStatus(aircraftData: AircraftData, index: number): boolean {
        return aircraftData.inconf ? aircraftData.inconf[index] : false;
    }

    /**
     * Determine if labels should be shown
     */
    protected shouldShowLabels(): boolean {
        return this.displayOptions.showAircraftLabels;
    }

    /**
     * Determine if aircraft should be shown
     */
    protected shouldShowEntities(): boolean {
        return this.displayOptions.showAircraft;
    }

    /**
     * Determine if protected zones should be shown
     */
    protected shouldShowProtectedZones(): boolean {
        return this.displayOptions.showProtectedZones;
    }

    /**
     * ID of the 3D aircraft custom layer (kept in sync with Aircraft3DRenderer).
     * When the 3D overlay is active, we must keep this layer at the top of the
     * MapLibre layer stack so the flat 2D icons don't occlude the 3D models.
     */
    private static readonly AIRCRAFT_3D_LAYER_ID = 'aircraft-3d-layer';

    // Tracks the show3DOverlay value the icon/label layers were last adjusted
    // for, so updateLayerVisibility() (called on every ~5Hz data tick) only
    // touches MapLibre paint/layout properties when that value actually
    // flips, instead of redundantly re-applying the same opacity/visibility
    // every single tick regardless of mode (a real perf regression: it made
    // plain 2D-only usage noticeably heavier since these calls ran
    // continuously even with show3DOverlay permanently false).
    private lastAppliedShow3DOverlay: boolean | null = null;

    /**
     * Restore the 3D aircraft layer to the top of the MapLibre layer stack.
     * Safe to call any time — does nothing if the 3D overlay isn't enabled.
     */
    private raise3DLayerIfPresent(): void {
        if (this.map.getLayer(AircraftRenderer.AIRCRAFT_3D_LAYER_ID)) {
            this.map.moveLayer(AircraftRenderer.AIRCRAFT_3D_LAYER_ID);
        }
    }

    /**
     * Override setupLayers so that whenever the 2D aircraft sprite/label layers
     * are (re-)added, the 3D aircraft custom layer is moved back to the top.
     * Without this, a lazy 2D init (e.g. after a style change or when aircraft
     * data arrives before the map is fully ready) can leave the 2D icons
     * stacked above the 3D models.
     */
    protected setupLayers(): void {
        super.setupLayers();
        this.raise3DLayerIfPresent();
    }

    /**
     * When the 3D overlay is on, the flat 2D icon and its ground-anchored
     * label are both redundant/visually wrong (the icon duplicates the real
     * 3D model, and both stay pinned to the flat ground point while the 3D
     * model appears elevated once airborne) -- hide both. Aircraft3DRenderer
     * takes over rendering the same label text anchored to the 3D model's
     * actual screen position instead.
     *
     * IMPORTANT: both layers are hidden via PAINT properties (opacity), never
     * `visibility: 'none'` -- for two independent reasons:
     *  1. AircraftInteractionManager's click handling is bound to the points
     *     layer (`map.on('click', 'aircraft-points', ...)`), and MapLibre
     *     excludes non-'visible' layers from layer-scoped hit-testing
     *     entirely -- setting visibility:none there would silently make
     *     aircraft unclickable whenever 3D is on (confirmed regression).
     *  2. The base class's OWN `updateLayerVisibility()` (called via super()
     *     above, every ~5Hz data tick, unconditionally) already drives BOTH
     *     layers' `visibility` layout property from `shouldShowEntities()`/
     *     `shouldShowLabels()` -- which know nothing about 3D mode and will
     *     always resolve to 'visible'. If this override also wrote to that
     *     same `visibility` property, the two would fight every tick; the
     *     perf fix below (skip re-applying when show3DOverlay hasn't
     *     changed) would then only "win" for one tick before the base
     *     class's next call silently reverts it back to visible (confirmed
     *     regression: label duplicated both at the 2D ground point and at
     *     the 3D-anchored position). Paint opacity is a property the base
     *     class never touches, so there's nothing to fight over and the
     *     change-detection guard is safe.
     */
    protected updateLayerVisibility(): void {
        super.updateLayerVisibility();

        const show3D = this.displayOptions.show3DOverlay;
        if (this.lastAppliedShow3DOverlay === show3D) return;
        this.lastAppliedShow3DOverlay = show3D;

        const opacity = show3D ? 0 : 1;

        const pointsLayerId = `${this.config.layerPrefix}-points`;
        if (this.map.getLayer(pointsLayerId)) {
            const layerType = this.map.getLayer(pointsLayerId)?.type;
            if (layerType === 'circle') {
                this.map.setPaintProperty(pointsLayerId, 'circle-opacity', opacity);
                this.map.setPaintProperty(pointsLayerId, 'circle-stroke-opacity', opacity);
            } else {
                this.map.setPaintProperty(pointsLayerId, 'icon-opacity', opacity);
            }
        }

        const labelsLayerId = `${this.config.layerPrefix}-labels`;
        if (this.map.getLayer(labelsLayerId)) {
            this.map.setPaintProperty(labelsLayerId, 'text-opacity', opacity);
            this.map.setPaintProperty(labelsLayerId, 'text-halo-width', show3D ? 0 : 2);
        }
    }

    /**
     * Update aircraft display with new data
     * Provides aircraft-specific method name for backward compatibility
     */
    public updateAircraftDisplay(aircraftData: AircraftData): void {
        // Check if map sources are ready before updating
        // This handles the race condition where aircraft data arrives before map finishes loading
        const source = this.map.getSource('aircraft-points') as GeoJSONSource;
        if (!source) {
            // Sources not ready yet, which can happen:
            // 1. During initial map load 
            // 2. After map style change (sources are removed)
            // In both cases, we need to initialize the renderer
            logger.debug('AircraftRenderer', 'Points source not found, initializing renderer...');
            this.initialize(true);
            
            // After initialization, try updating again
            const sourceAfterInit = this.map.getSource('aircraft-points') as GeoJSONSource;
            if (!sourceAfterInit) {
                logger.warn('AircraftRenderer', 'Failed to initialize aircraft sources');
                return;
            }
        }

        this.updateEntityDisplay(aircraftData);
        this.updateAircraftTrails(aircraftData);

        // Defensive: if the 3D overlay exists, make sure its custom layer is
        // still on top. updateEntityDisplay doesn't add layers on the hot path,
        // but some code paths (style reloads, first-frame lazy init) can leave
        // the 2D sprites above the 3D layer — raising here is cheap and
        // guarantees correct stacking regardless of ordering.
        this.raise3DLayerIfPresent();
    }

    /**
     * Update aircraft trails based on current positions and simulation time
     */
    private updateAircraftTrails(aircraftData: AircraftData): void {
        // If no aircraft data, clear all trails
        if (!aircraftData.id || aircraftData.id.length === 0) {
            this.clearTrails();
            return;
        }

        const currentSimTime = this.stateManager.getSimulationTime();
        const ids = aircraftData.id;
        const lats = aircraftData.lat;
        const lons = aircraftData.lon;

        // Update trails for each aircraft
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const lat = lats[i];
            const lon = lons[i];

            // Validate coordinates
            if (
                typeof lat !== 'number' || typeof lon !== 'number' ||
                isNaN(lat) || isNaN(lon) ||
                lat < -90 || lat > 90 || lon < -180 || lon > 180
            ) {
                continue;
            }

            // Get or create trail data for this aircraft
            let trailData = this.aircraftTrails.get(id);
            if (!trailData) {
                trailData = {
                    coordinates: [],
                    lastSavedTime: currentSimTime
                };
                this.aircraftTrails.set(id, trailData);
            }

            // Check if enough simulation time has passed to save a new point
            const timeSinceLastSave = currentSimTime - trailData.lastSavedTime;
            if (timeSinceLastSave >= this.trailSaveInterval) {
                const newPoint: [number, number] = [lon, lat];

                // Only add point if it's different from the last one (avoid duplicates)
                const lastPoint = trailData.coordinates[trailData.coordinates.length - 1];
                if (!lastPoint || lastPoint[0] !== lon || lastPoint[1] !== lat) {
                    trailData.coordinates.push(newPoint);
                    trailData.lastSavedTime = currentSimTime;
                }
            }
        }

        // Remove trails for aircraft that no longer exist
        const currentIds = new Set(ids);
        for (const trailId of this.aircraftTrails.keys()) {
            if (!currentIds.has(trailId)) {
                this.aircraftTrails.delete(trailId);
            }
        }

        // Update the trail layer
        this.updateTrailLayer(aircraftData);
    }

    /**
     * Update the trail layer with current trail data
     */
    private updateTrailLayer(aircraftData: AircraftData): void {
        const trailSource = this.map.getSource('aircraft-trails') as GeoJSONSource;
        if (!trailSource) {
            return;
        }

        const trailFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
        const currentIds = new Set(aircraftData.id);

        for (const [id, trailData] of this.aircraftTrails.entries()) {
            // Only render trail if aircraft still exists
            if (!currentIds.has(id)) {
                continue;
            }

            // Only create trail if we have at least 2 points
            if (trailData.coordinates.length < 2) {
                continue;
            }

            // Get aircraft index for conflict status
            const index = aircraftData.id.indexOf(id);
            const inConflict = index >= 0 ? this.getConflictStatus(aircraftData, index) : false;
            const isSelected = id === this.selectedEntity;

            trailFeatures.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: trailData.coordinates
                },
                properties: {
                    aircraftId: id,
                    selected: isSelected,
                    in_conflict: inConflict
                }
            });
        }

        // Update the trail source
        trailSource.setData({
            type: 'FeatureCollection',
            features: trailFeatures
        });
    }

    /**
     * Clear all aircraft trails
     */
    public clearTrails(): void {
        this.aircraftTrails.clear();

        // Clear the trail layer
        const trailSource = this.map.getSource('aircraft-trails') as GeoJSONSource;
        if (trailSource) {
            trailSource.setData({
                type: 'FeatureCollection',
                features: []
            });
        }
    }

    /**
     * Set selected aircraft
     * Provides aircraft-specific method name for backward compatibility
     */
    public setSelectedAircraft(aircraftId: string | null): void {
        this.setSelectedEntity(aircraftId);
    }

    /**
     * Update display options
     */
    public updateDisplayOptions(options: Partial<DisplayOptions>): void {
        const oldIconSize = this.displayOptions.aircraftIconSize;
        this.displayOptions = { ...this.displayOptions, ...options };

        // Check if any colors have changed
        const colorChanged =
            options.aircraftIconColor !== undefined ||
            options.aircraftLabelColor !== undefined ||
            options.aircraftSelectedColor !== undefined ||
            options.aircraftConflictColor !== undefined ||
            options.protectedZonesColor !== undefined ||
            options.aircraftTrailColor !== undefined ||
            options.trailConflictColor !== undefined;

        // Update colors if any changed
        if (colorChanged) {
            this.updateColors({
                normal: this.displayOptions.aircraftIconColor,
                selected: this.displayOptions.aircraftSelectedColor,
                conflict: this.displayOptions.aircraftConflictColor,
                label: this.displayOptions.aircraftLabelColor
            });
            // Update trail colors
            this.updateTrailColors();
        }

        // Update aircraft icon size if changed
        if (options.aircraftIconSize !== undefined) {
            this.updateIconSize(options.aircraftIconSize);
        }

        // Update label text size if changed
        if (options.mapLabelsTextSize !== undefined && this.map.getLayer('aircraft-labels')) {
            this.map.setLayoutProperty('aircraft-labels', 'text-size', this.displayOptions.mapLabelsTextSize);
        }

        // Refresh display with new options (if colors didn't already refresh it)
        if (!colorChanged && this.entityData) {
            this.updateAircraftDisplay(this.entityData);
        }

        // Update layer visibility
        this.updateLayerVisibility();
    }

    /**
     * Update trail layer colors
     */
    private updateTrailColors(): void {
        if (!this.map.getLayer('aircraft-trails')) {
            return;
        }

        // Build color expression for trails
        const lineColorExpr: any[] = [
            'case',
            ['==', ['get', 'selected'], true],
            this.displayOptions.aircraftSelectedColor,
            ['==', ['get', 'in_conflict'], true],
            this.displayOptions.trailConflictColor,
            this.displayOptions.aircraftTrailColor
        ];

        this.map.setPaintProperty('aircraft-trails', 'line-color', lineColorExpr as any);
    }

    /**
     * Change the aircraft shape at runtime
     * @param shapeDrawer - New shape drawing function
     */
    public setAircraftShape(shapeDrawer: AircraftShapeDrawer): void {
        this.setEntityShape(shapeDrawer);
    }
}
