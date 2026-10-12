import { AircraftData, AircraftTrailPoint, DisplayOptions, RouteData } from '../../data/types';
import { MapDisplay } from './MapDisplay';
import { AircraftRenderer } from './aircraft/AircraftRenderer';
import { Aircraft3DRenderer } from './aircraft/Aircraft3DRenderer';
import { AircraftRendererFactory } from './aircraft/AircraftRendererFactory';
import type { IEntityRenderer } from './rendering/IEntityRenderer';
import { AircraftRoutes } from './aircraft/AircraftRoutes';
import type { AircraftRoute3DRenderer } from './aircraft/AircraftRoute3DRenderer';
import { AIRCRAFT_SHAPES } from './aircraft/AircraftShapes';
import { StateManager } from '../../core/StateManager';
import { logger } from '../../utils/Logger';
import { storage } from '../../utils/StorageManager';
import { VietnameseAirports } from './VietnameseAirports';


/**
 * MapOverlay - Handles the map overlay information display
 *
 * Manages the overlay that shows aircraft count, conflicts, intrusions,
 * cursor position, and projection toggle functionality.
 * Also coordinates aircraft rendering and route visualization on the map.
 *
 * Rendering Architecture:
 * - 2D renderer is always active
 * - 3D renderer is an optional overlay that can be toggled
 * - When 3D overlay is enabled, both renderers update simultaneously
 */
export class MapOverlay {
    private mapDisplay: MapDisplay;
    private stateManager: StateManager;
    private aircraft2DRenderer: IEntityRenderer<AircraftData> | null = null;
    private aircraft3DRenderer: IEntityRenderer<AircraftData> | null = null;
    private aircraftRoutes: AircraftRoutes | null = null;
    private aircraftRoute3DRenderer: AircraftRoute3DRenderer | null = null;
    // Track if 3D overlay is currently active
    private is3DOverlayActive: boolean = false;
    private showAtsRoutes: boolean = false;
    // Re-applied to every newly-(re)created 3D renderer, since toggling
    // "Show 3D aircraft" off/on destroys and recreates it (see enable3DOverlay).
    private pendingLabelClickHandler: ((aircraftId: string, ctrlOrMeta: boolean) => void) | null = null;
    private pendingLabelContextMenuHandler: ((aircraftId: string, clientX: number, clientY: number) => void) | null = null;

    private aircraftCountElement: HTMLElement | null;
    private conflictCountElement: HTMLElement | null;
    private conflictTotalElement: HTMLElement | null;
    private intrusionCountElement: HTMLElement | null;
    private intrusionTotalElement: HTMLElement | null;
    private cursorPositionElement: HTMLElement | null;
    private projectionToggleButton: HTMLElement | null;
    private lastCursorLat: number | null = null;
    private lastCursorLng: number | null = null;

    constructor(mapDisplay: MapDisplay, stateManager: StateManager) {
        this.mapDisplay = mapDisplay;
        this.stateManager = stateManager;

        // Get references to all overlay elements
        this.aircraftCountElement = document.getElementById('aircraft-count');
        this.conflictCountElement = document.getElementById('conflict-count');
        this.conflictTotalElement = document.getElementById('conflict-total');
        this.intrusionCountElement = document.getElementById('intrusion-count');
        this.intrusionTotalElement = document.getElementById('intrusion-total');
        this.cursorPositionElement = document.getElementById('cursor-position');
        this.projectionToggleButton = document.getElementById('projection-toggle');
    }

    /**
     * Initialize the map overlay
     * Sets up event listeners and initial state
     * @param displayOptions - Display options for aircraft rendering
     */
    public async initialize(displayOptions: DisplayOptions): Promise<void> {
        // Set up projection toggle button
        this.setupProjectionToggle();

        // Set up cursor tracking
        this.setupCursorTracking();

        // Set up "C" shortcut to copy the cursor coordinates to clipboard
        this.setupCopyCursorShortcut();

        // Set initial values
        this.updateAircraftCount(0);
        this.updateConflictCounts(0, 0);
        this.updateIntrusionCounts(0, 0);
        this.updateCursorPosition(null, null);

        // Load saved preference for ATS routes
        this.showAtsRoutes = storage.get<boolean>('show-ats-routes') ?? false;

        // Render Vietnamese airports
        const map = this.mapDisplay.getMap();
        if (map) {
            VietnameseAirports.setupAirportsLayer(map);
        }


        // Initialize aircraft routes FIRST so they appear below aircraft
        this.initializeAircraftRoutes(displayOptions);

        // Initialize aircraft renderer LAST so aircraft appear on top
        await this.initializeAircraftRenderer(displayOptions);

        logger.debug('MapOverlay', 'MapOverlay initialized');
    }

    /**
     * Initialize the aircraft renderers.
     * Always creates 2D renderer, optionally enables 3D overlay.
     */
    private async initializeAircraftRenderer(displayOptions: DisplayOptions): Promise<void> {
        const map = this.mapDisplay.getMap();
        if (!map) {
            logger.warn('MapOverlay', 'Cannot initialize aircraft renderer: map not available');
            return;
        }

        this.aircraft2DRenderer = await AircraftRendererFactory.create(
            displayOptions,
            this.stateManager,
            false // request 2D
        );
        this.aircraft2DRenderer.initialize(map);
        logger.debug('MapOverlay', '2D aircraft renderer initialized (always active)');

        if (displayOptions.show3DOverlay) {
            await this.enable3DOverlay(displayOptions);
        }

        logger.debug('MapOverlay', `3D overlay: ${this.is3DOverlayActive ? 'enabled' : 'disabled'}`);
    }

    /**
     * Initialize the aircraft routes
     * @param displayOptions - Display options for route rendering
     */
    private initializeAircraftRoutes(displayOptions: DisplayOptions): void {
        const map = this.mapDisplay.getMap();
        if (!map) {
            logger.warn('MapOverlay', 'Cannot initialize aircraft routes: map not available');
            return;
        }

        this.aircraftRoutes = new AircraftRoutes(map, displayOptions);
        this.aircraftRoutes.setupLayers();

        logger.debug('MapOverlay', 'Aircraft routes initialized');
    }

    /**
     * Set up the projection toggle button
     */
    private setupProjectionToggle(): void {
        if (!this.projectionToggleButton) {
            logger.warn('MapOverlay', 'Projection toggle button not found');
            return;
        }

        // Set initial button state
        this.updateProjectionButton();

        // Add click event listener
        this.projectionToggleButton.addEventListener('click', () => {
            this.handleProjectionToggle();
        });

        logger.debug('MapOverlay', 'Projection toggle button initialized');
    }

    /**
     * Handle projection toggle button click
     */
    private handleProjectionToggle(): void {
        if (!this.mapDisplay.isInitialized()) {
            logger.warn('MapOverlay', 'Cannot toggle projection: map not initialized');
            return;
        }

        // Toggle the projection
        this.mapDisplay.toggleProjection();

        // Update button appearance
        this.updateProjectionButton();

        logger.info('MapOverlay', 'Projection toggled to:', this.mapDisplay.getProjection());
    }

    /**
     * Update projection toggle button based on current projection
     */
    private updateProjectionButton(): void {
        if (!this.projectionToggleButton) return;

        const currentProjection = this.mapDisplay.getProjection();

        if (currentProjection === 'globe') {
            // Currently in globe view, button shows option to switch to 2D
            this.projectionToggleButton.innerHTML = '🗺️';
            this.projectionToggleButton.title = 'Switch to 2D View';
        } else {
            // Currently in 2D view, button shows option to switch to globe
            this.projectionToggleButton.innerHTML = '🌐';
            this.projectionToggleButton.title = 'Switch to Globe View';
        }
    }

    /**
     * Set up cursor position tracking on the map
     */
    private setupCursorTracking(): void {
        const map = this.mapDisplay.getMap();
        if (!map) {
            logger.warn('MapOverlay', 'Cannot set up cursor tracking: map not available');
            return;
        }

        // Track mouse movement over the map
        map.on('mousemove', (e) => {
            const { lng, lat } = e.lngLat;
            this.updateCursorPosition(lat, lng);
        });

        // Clear cursor position when mouse leaves the map
        map.on('mouseleave', () => {
            this.updateCursorPosition(null, null);
        });

        logger.debug('MapOverlay', 'Cursor tracking initialized');
    }

    /**
     * Set up the "C" keyboard shortcut to copy the current cursor coordinates
     * to the clipboard. Uses a bare, unmodified letter key (like the existing
     * "R" shortcut for Range & Bearing) so it can never collide with a Chrome
     * browser shortcut - Chrome only reserves modifier combinations
     * (Ctrl/Alt/Cmd + key), never a plain letter key on its own.
     */
    private setupCopyCursorShortcut(): void {
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            // Don't hijack the key while the user is typing somewhere else in the UI
            const activeElement = document.activeElement;
            const isTyping = activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                (activeElement as HTMLElement).isContentEditable
            );

            if (!isTyping && e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                this.copyCursorPositionToClipboard();
            }
        });

        logger.debug('MapOverlay', 'Copy cursor position shortcut ("C") initialized');
    }

    /**
     * Copy the last known cursor lat/lng to the clipboard as "lat, lng"
     */
    private copyCursorPositionToClipboard(): void {
        if (this.lastCursorLat === null || this.lastCursorLng === null) {
            logger.debug('MapOverlay', 'Copy cursor shortcut pressed but cursor is not over the map');
            return;
        }

        const text = `${this.lastCursorLat.toFixed(6)}, ${this.lastCursorLng.toFixed(6)}`;
        navigator.clipboard.writeText(text)
            .then(() => {
                logger.debug('MapOverlay', `Copied cursor position to clipboard: ${text}`);
                this.flashCursorPositionElement();
            })
            .catch((err) => {
                logger.warn('MapOverlay', `Failed to copy cursor position to clipboard: ${err}`);
            });
    }

    /**
     * Briefly highlight the cursor position display to confirm the copy
     */
    private flashCursorPositionElement(): void {
        if (!this.cursorPositionElement) return;

        this.cursorPositionElement.classList.add('cursor-position-copied');
        setTimeout(() => {
            this.cursorPositionElement?.classList.remove('cursor-position-copied');
        }, 400);
    }

    /**
     * Update aircraft count display
     * @param count - Number of aircraft
     */
    public updateAircraftCount(count: number): void {
        if (this.aircraftCountElement) {
            this.aircraftCountElement.textContent = count.toString();
        }
    }

    /**
     * Update conflict counts display
     * @param current - Current number of conflicts
     * @param total - Total number of conflicts detected
     */
    public updateConflictCounts(current: number, total: number): void {
        if (this.conflictCountElement) {
            this.conflictCountElement.textContent = current.toString();
        }
        if (this.conflictTotalElement) {
            this.conflictTotalElement.textContent = total.toString();
        }
    }

    /**
     * Update intrusion counts display
     * @param current - Current number of intrusions
     * @param total - Total number of intrusions detected
     */
    public updateIntrusionCounts(current: number, total: number): void {
        if (this.intrusionCountElement) {
            this.intrusionCountElement.textContent = current.toString();
        }
        if (this.intrusionTotalElement) {
            this.intrusionTotalElement.textContent = total.toString();
        }
    }

    /**
     * Update cursor position display
     * @param lat - Latitude (null to clear)
     * @param lng - Longitude (null to clear)
     */
    public updateCursorPosition(lat: number | null, lng: number | null): void {
        this.lastCursorLat = lat;
        this.lastCursorLng = lng;

        if (!this.cursorPositionElement) return;

        if (lat === null || lng === null) {
            this.cursorPositionElement.textContent = '--';
        } else {
            // Format to 6 decimal places
            const latStr = lat.toFixed(6);
            const lngStr = lng.toFixed(6);
            this.cursorPositionElement.textContent = `${latStr}°, ${lngStr}°`;
        }
    }

    /**
     * Update overlay from aircraft data
     * @param aircraftData - Aircraft data containing counts
     */
    public updateFromAircraftData(aircraftData: AircraftData): void {
        // Update aircraft count
        const aircraftCount = aircraftData.id ? aircraftData.id.length : 0;
        this.updateAircraftCount(aircraftCount);

        // Update conflict counts
        const conflictCurrent = aircraftData.nconf_cur !== undefined ? aircraftData.nconf_cur : 0;
        const conflictTotal = aircraftData.nconf_tot !== undefined ? aircraftData.nconf_tot : 0;
        this.updateConflictCounts(conflictCurrent, conflictTotal);

        // Update intrusion counts
        const intrusionCurrent = aircraftData.nlos_cur !== undefined ? aircraftData.nlos_cur : 0;
        const intrusionTotal = aircraftData.nlos_tot !== undefined ? aircraftData.nlos_tot : 0;
        this.updateIntrusionCounts(intrusionCurrent, intrusionTotal);

        // Check if selected aircraft still exists
        const selectedAircraft = this.stateManager.getState().selectedAircraft;
        if (selectedAircraft && aircraftData.id && !aircraftData.id.includes(selectedAircraft)) {
            // Selected aircraft was deleted - deselect it and clear routes
            logger.info('MapOverlay', `Aircraft ${selectedAircraft} was deleted - clearing selection and routes`);
            this.stateManager.setSelectedAircraft(null);
            if (this.aircraftRoutes) {
                this.aircraftRoutes.clearRouteDisplay();
            }
            // Handle 2D renderer selected aircraft
            if (this.aircraft2DRenderer && this.aircraft2DRenderer.getType() === '2d') {
                const renderer2D = this.getAircraftRenderer() as AircraftRenderer;
                if (renderer2D) {
                    renderer2D.setSelectedAircraft(null);
                }
            }
            // Clear 3D route renderer's primary-aircraft accent (the tracked-aircraft
            // set itself is recomputed below from state, which no longer includes it)
            if (this.aircraftRoute3DRenderer) {
                this.aircraftRoute3DRenderer.setSelectedAircraft(null);
            }
        }
        // Drop any Ctrl+click comparison aircraft that no longer exist too
        if (aircraftData.id) {
            this.stateManager.pruneMissingTrajectoryAircraft(new Set(aircraftData.id));
        }

        // Update aircraft renderers with new data
        // Convert AircraftData to Map for interface compatibility
        if (aircraftData.id) {
            const aircraftMap = new Map<string, AircraftData>();
            // For now, pass the entire AircraftData as a single entry
            // The renderer will handle converting it to individual aircraft
            aircraftMap.set('batch', aircraftData);

            const simTime = this.stateManager.getState().simInfo?.simt || 0;

            // Always update 2D renderer
            if (this.aircraft2DRenderer) {
                this.aircraft2DRenderer.updateEntities(aircraftMap, simTime);
            }

            // Update 3D renderer if active
            if (this.is3DOverlayActive && this.aircraft3DRenderer) {
                this.aircraft3DRenderer.updateEntities(aircraftMap, simTime);
                // Debug: Confirm 3D renderer is receiving aircraft data after reset
                if (aircraftCount > 0) {
                    logger.debug('MapOverlay', `3D renderer updated with ${aircraftCount} aircraft`);
                }
            } else if (this.is3DOverlayActive && !this.aircraft3DRenderer) {
                // This would indicate a state inconsistency
                logger.warn('MapOverlay', '3D overlay marked active but no 3D renderer exists - this should not happen');
            }

            // Feed every tracked aircraft's position/trail into the 4D trajectory
            // renderer so predicted segments track current altitude and past
            // segments extend with the newest flown position.
            if (this.is3DOverlayActive && this.aircraftRoute3DRenderer) {
                this.pushTrackedAircraftDataTo3DRoute(aircraftData);
            }
        }
    }

    /**
     * Recomputes the full set of aircraft to render 4D trajectories for
     * (primary `selectedAircraft` + Ctrl+click `trajectoryAircraftIds` +,
     * when `showAllAircraftTrajectories` is on, every aircraft in
     * `aircraftData`), and pushes their current position + trail history to
     * the 3D route renderer. Pass `null` when no fresh tick data is at hand
     * (e.g. right after a selection change) to fall back to cached state.
     */
    private pushTrackedAircraftDataTo3DRoute(aircraftData: AircraftData | null): void {
        if (!this.aircraftRoute3DRenderer) return;

        const state = this.stateManager.getState();
        const data = aircraftData ?? state.aircraftData;

        const trackedSet = new Set<string>(state.trajectoryAircraftIds);
        if (state.selectedAircraft) trackedSet.add(state.selectedAircraft);
        if (state.displayOptions.showAllAircraftTrajectories && data?.id) {
            for (const id of data.id) trackedSet.add(id);
        }
        const trackedIds = Array.from(trackedSet);

        const statesMap = new Map<string, { lat: number; lon: number; alt: number }>();
        if (data?.id) {
            for (const id of trackedIds) {
                const idx = data.id.indexOf(id);
                if (idx >= 0) {
                    statesMap.set(id, { lat: data.lat[idx], lon: data.lon[idx], alt: data.alt[idx] });
                }
            }
        }

        const trailsMap = new Map<string, AircraftTrailPoint[]>();
        for (const id of trackedIds) {
            trailsMap.set(id, this.stateManager.getAircraftTrail(id));
        }

        // Single combined update -- rebuilds the 3D trajectory scene once per
        // tick instead of three times (one per setter), which matters since
        // 3D mode is otherwise the heaviest part of the app per aircraft-data tick.
        this.aircraftRoute3DRenderer.updateTrackedAircraft(trackedIds, statesMap, trailsMap);
    }

    /** Public hook for callers (e.g. App.ts on trajectoryAircraftIds changes) to force a tracked-aircraft refresh. */
    public refreshTrackedAircraft4D(): void {
        this.pushTrackedAircraftDataTo3DRoute(null);
    }

    /**
     * Set selected aircraft
     * @param aircraftId - Aircraft ID to select (null to deselect)
     */
    public setSelectedAircraft(aircraftId: string | null): void {
        // Handle 2D renderer which has setSelectedAircraft method
        if (this.aircraft2DRenderer && this.aircraft2DRenderer.getType() === '2d') {
            const renderer2D = this.getAircraftRenderer() as AircraftRenderer;
            if (renderer2D) {
                renderer2D.setSelectedAircraft(aircraftId);
            }
        }
        // TODO: 3D renderer will handle selection through display options or separate method

        if (this.aircraftRoutes) {
            this.aircraftRoutes.setSelectedAircraft(aircraftId);
        }

        if (this.aircraftRoute3DRenderer) {
            this.aircraftRoute3DRenderer.setSelectedAircraft(aircraftId);
            this.pushTrackedAircraftDataTo3DRoute(null);
        }
    }

    /**
     * Update route data from server
     * @param data - Route data for an aircraft
     */
    public updateRouteData(data: RouteData): void {
        if (this.aircraftRoutes) {
            this.aircraftRoutes.updateRouteData(data);
        }

        if (this.aircraftRoute3DRenderer) {
            this.aircraftRoute3DRenderer.updateRouteData(data);
        }
    }

    /**
     * Get the current route data for the selected aircraft (if any).
     * Used by RouteDrawingManager to anchor a leader line from the last
     * existing waypoint when appending to an aircraft that already has a route.
     */
    public getRouteData(): RouteData | null {
        return this.aircraftRoutes ? this.aircraftRoutes.getRouteData() : null;
    }

    /**
     * Update display options for aircraft rendering and routes
     * @param options - Display options to update
     */
    public async updateDisplayOptions(options: Partial<DisplayOptions>): Promise<void> {
        // Check if 3D overlay toggle changed
        if (options.show3DOverlay !== undefined) {
            const currentlyActive = this.is3DOverlayActive;
            const shouldBeActive = options.show3DOverlay;

            if (shouldBeActive && !currentlyActive) {
                logger.info('MapOverlay', 'Enabling 3D overlay');
                const fullOptions = { ...this.stateManager.getDisplayOptions(), ...options };
                await this.enable3DOverlay(fullOptions);
            } else if (!shouldBeActive && currentlyActive) {
                logger.info('MapOverlay', 'Disabling 3D overlay');
                await this.disable3DOverlay();
            }
        }

        // Get full display options by merging partial with current
        const fullOptions = { ...this.stateManager.getDisplayOptions(), ...options };

        // Always update 2D renderer
        if (this.aircraft2DRenderer) {
            this.aircraft2DRenderer.updateDisplayOptions(fullOptions);

            // If aircraft shape changed, update the shape
            if (options.aircraftShape && this.aircraft2DRenderer.getType() === '2d') {
                const renderer2D = this.getAircraftRenderer() as AircraftRenderer;
                if (renderer2D) {
                    const shapeConfig = AIRCRAFT_SHAPES[options.aircraftShape];
                    if (shapeConfig) {
                        renderer2D.setAircraftShape(shapeConfig.drawer);
                        logger.info('MapOverlay', 'Aircraft shape updated to:', options.aircraftShape);
                    }
                }
            }
        }

        // Update 3D renderer if active
        if (this.is3DOverlayActive && this.aircraft3DRenderer) {
            this.aircraft3DRenderer.updateDisplayOptions(fullOptions);
        }

        // Update routes with new display options
        if (this.aircraftRoutes) {
            this.aircraftRoutes.updateDisplayOptions(fullOptions);
        }

        // Update 3D route renderer if active
        if (this.is3DOverlayActive && this.aircraftRoute3DRenderer) {
            this.aircraftRoute3DRenderer.updateDisplayOptions(fullOptions);

            // showAllAircraftTrajectories changes the tracked-aircraft SET, not just
            // a cosmetic option, so recompute it (cheap: only runs when 3D is active).
            if (options.showAllAircraftTrajectories !== undefined) {
                this.pushTrackedAircraftDataTo3DRoute(null);
            }
        }
    }

    /**
     * Enable 3D overlay rendering alongside the always-active 2D renderer.
     */
    private async enable3DOverlay(displayOptions: DisplayOptions): Promise<void> {
        if (this.is3DOverlayActive) {
            logger.debug('MapOverlay', '3D overlay already active');
            return;
        }

        const map = this.mapDisplay.getMap();
        if (!map) {
            logger.warn('MapOverlay', 'Cannot enable 3D overlay: map not available');
            return;
        }

        logger.info('MapOverlay', 'Enabling 3D overlay...');

        // Save current view state before adding 3D layer
        // Three.js WebGLRenderer initialization can disrupt MapLibre's viewport
        const savedCenter = map.getCenter();
        const savedZoom = map.getZoom();
        const savedPitch = map.getPitch();
        const savedBearing = map.getBearing();

        // Create 3D renderer
        this.aircraft3DRenderer = await AircraftRendererFactory.create(
            displayOptions,
            this.stateManager,
            true // request 3D
        );

        this.aircraft3DRenderer.initialize(map);
        this.applyPendingLabelClickHandler();
        this.is3DOverlayActive = true;

        // Also create and initialize the 3D route renderer so the selected
        // aircraft's route is rendered at altitude alongside the aircraft.
        this.aircraftRoute3DRenderer = await AircraftRendererFactory.createRoute3D(displayOptions);
        if (this.aircraftRoute3DRenderer) {
            this.aircraftRoute3DRenderer.initialize(map);

            // Seed the 3D route renderer with current selection + route + aircraft state.
            const selectedId = this.stateManager.getState().selectedAircraft;
            this.aircraftRoute3DRenderer.setSelectedAircraft(selectedId);

            const existingRoute = this.aircraftRoutes?.getRouteData() ?? null;
            this.aircraftRoute3DRenderer.updateRouteData(existingRoute);

            this.pushTrackedAircraftDataTo3DRoute(null);
        }

        // Restore view state after map settles from adding 3D layer
        // Three.js WebGLRenderer initialization disrupts MapLibre's viewport/projection.
        // Using 'idle' event ensures the map has fully settled before we restore.
        map.once('idle', () => {
            map.jumpTo({
                center: savedCenter,
                zoom: savedZoom,
                pitch: savedPitch,
                bearing: savedBearing
            });
            this.mapDisplay.resize();
        });

        // Sync with current aircraft data if available
        const currentAircraftData = this.stateManager.getState().aircraftData;
        const currentSimTime = this.stateManager.getState().simInfo?.simt || 0;
        if (currentAircraftData && currentAircraftData.id) {
            const aircraftMap = new Map<string, AircraftData>();
            aircraftMap.set('batch', currentAircraftData);
            this.aircraft3DRenderer.updateEntities(aircraftMap, currentSimTime);
            logger.debug('MapOverlay', `3D overlay initialized with ${currentAircraftData.id.length} existing aircraft`);
        } else {
            logger.debug('MapOverlay', '3D overlay enabled with no existing aircraft data');
        }

        logger.info('MapOverlay', '3D overlay enabled successfully');
    }

    /**
     * Disable 3D overlay rendering
     * Destroys the 3D renderer, 2D renderer remains active
     */
    private async disable3DOverlay(): Promise<void> {
        if (!this.is3DOverlayActive) {
            logger.debug('MapOverlay', '3D overlay already disabled');
            return;
        }

        logger.info('MapOverlay', 'Disabling 3D overlay...');

        if (this.aircraftRoute3DRenderer) {
            this.aircraftRoute3DRenderer.destroy();
            this.aircraftRoute3DRenderer = null;
        }

        if (this.aircraft3DRenderer) {
            this.aircraft3DRenderer.destroy();
            this.aircraft3DRenderer = null;
        }

        this.is3DOverlayActive = false;
        logger.info('MapOverlay', '3D overlay disabled');
    }

    /**
     * Toggle 3D overlay on/off
     * Public method for UI controls to toggle 3D overlay
     * @returns Promise that resolves when toggle is complete
     */
    public async toggle3DOverlay(): Promise<boolean> {
        const newState = !this.is3DOverlayActive;
        const displayOptions = this.stateManager.getDisplayOptions();

        if (newState) {
            await this.enable3DOverlay(displayOptions);
        } else {
            await this.disable3DOverlay();
        }

        return this.is3DOverlayActive;
    }

    /**
     * Check if 3D overlay is currently active
     */
    public is3DOverlayEnabled(): boolean {
        return this.is3DOverlayActive;
    }

    /**
     * Switch between 2D and 3D rendering modes (deprecated)
     * Kept for backwards compatibility - now maps to toggle3DOverlay
     * @param mode - The rendering mode to switch to
     * @deprecated Use toggle3DOverlay() instead
     */
    public async switchRenderMode(mode: '2d' | '3d'): Promise<void> {
        logger.warn('MapOverlay', 'switchRenderMode is deprecated, use toggle3DOverlay instead');
        if (mode === '3d' && !this.is3DOverlayActive) {
            await this.enable3DOverlay(this.stateManager.getDisplayOptions());
        } else if (mode === '2d' && this.is3DOverlayActive) {
            await this.disable3DOverlay();
        }
    }

    /**
     * Toggle visibility of Vietnam ATS routes
     */
    public toggleAtsRoutes(visible: boolean): void {
        this.showAtsRoutes = visible;
        storage.set('show-ats-routes', visible);
    }

    /**
     * Check if Vietnam ATS routes are currently shown
     */
    public isAtsRoutesVisible(): boolean {
        return this.showAtsRoutes;
    }

    /**
     * Register the callback fired when the user clicks a 3D aircraft's HTML
     * label overlay. Re-applied automatically every time the 3D renderer is
     * (re)created (e.g. toggling "Show 3D aircraft" off/on), since that
     * destroys the previous instance.
     */
    public setAircraftLabelClickHandler(handler: (aircraftId: string, ctrlOrMeta: boolean) => void): void {
        this.pendingLabelClickHandler = handler;
        this.applyPendingLabelClickHandler();
    }

    private applyPendingLabelClickHandler(): void {
        if (this.pendingLabelClickHandler && this.aircraft3DRenderer instanceof Aircraft3DRenderer) {
            this.aircraft3DRenderer.setLabelClickHandler(this.pendingLabelClickHandler);
        }
        if (this.pendingLabelContextMenuHandler && this.aircraft3DRenderer instanceof Aircraft3DRenderer) {
            this.aircraft3DRenderer.setLabelContextMenuHandler(this.pendingLabelContextMenuHandler);
        }
    }

    /**
     * Register the callback fired when the user right-clicks a 3D aircraft's
     * HTML label overlay. See setAircraftLabelClickHandler for why this must
     * be re-applied whenever the 3D renderer is recreated.
     */
    public setAircraftLabelContextMenuHandler(handler: (aircraftId: string, clientX: number, clientY: number) => void): void {
        this.pendingLabelContextMenuHandler = handler;
        this.applyPendingLabelClickHandler();
    }

    /**
     * Handle map style change

     * Notifies aircraft renderers and routes to recreate layers
     */
    public onStyleChange(): void {
        const map = this.mapDisplay.getMap();
        if (map) {
            VietnameseAirports.setupAirportsLayer(map);
        }


        // Re-create route layers FIRST so they appear below aircraft
        if (this.aircraftRoutes) {
            this.aircraftRoutes.setupLayers();
        }
        // Re-create 2D aircraft layers
        if (this.aircraft2DRenderer) {
            this.aircraft2DRenderer.onStyleChange();
        }
        // Re-create 3D aircraft layers if active
        if (this.is3DOverlayActive && this.aircraft3DRenderer) {
            this.aircraft3DRenderer.onStyleChange();
        }
        // Re-create 3D route layer if active
        if (this.is3DOverlayActive && this.aircraftRoute3DRenderer) {
            this.aircraftRoute3DRenderer.onStyleChange();
        }
    }

    /**
     * Get the 2D aircraft renderer instance
     * Always returns the 2D renderer (which is always active)
     */
    public getAircraftRenderer(): AircraftRenderer | null {
        if (!this.aircraft2DRenderer || this.aircraft2DRenderer.getType() !== '2d') {
            return null;
        }
        // Cast to Aircraft2DRenderer to access the wrapper's getRenderer method
        const renderer2D = this.aircraft2DRenderer as any;
        return renderer2D.getRenderer ? renderer2D.getRenderer() : null;
    }

    /**
     * Reset all displays to default values
     */
    public reset(): void {
        this.updateAircraftCount(0);
        this.updateConflictCounts(0, 0);
        this.updateIntrusionCounts(0, 0);
        this.updateCursorPosition(null, null);

        // SIMPLE APPROACH: For 3D renderer, just destroy and recreate on reset
        // This is cleaner and more reliable than trying to clear individual models
        if (this.is3DOverlayActive && this.aircraft3DRenderer) {
            logger.info('MapOverlay', 'Recreating 3D renderer due to simulation reset');
            this.recreate3DRenderer();
        }

        // Clear selected aircraft and routes (including the route cache so stale
        // data from the previous scenario is not shown after reset)
        this.setSelectedAircraft(null);
        if (this.aircraftRoutes) {
            this.aircraftRoutes.clearRouteCache();
        }
    }

    /**
     * Destroy and recreate the 3D renderer
     * Used during simulation reset for clean state
     */
    private async recreate3DRenderer(): Promise<void> {
        if (!this.is3DOverlayActive || !this.aircraft3DRenderer) {
            return;
        }

        logger.debug('MapOverlay', 'Destroying existing 3D renderer...');

        // Destroy the current 3D route renderer too so enable3DOverlay can recreate it cleanly
        if (this.aircraftRoute3DRenderer) {
            this.aircraftRoute3DRenderer.destroy();
            this.aircraftRoute3DRenderer = null;
        }

        // Destroy the current 3D renderer
        this.aircraft3DRenderer.destroy();
        this.aircraft3DRenderer = null;
        this.is3DOverlayActive = false; // CRITICAL: Reset flag so enable3DOverlay() will work

        // Recreate the 3D renderer with current display options
        const displayOptions = this.stateManager.getDisplayOptions();
        await this.enable3DOverlay(displayOptions);

        logger.debug('MapOverlay', '3D renderer recreated successfully');
    }

    /**
     * Clean up resources
     */
    public destroy(): void {
        // Clean up 2D renderer
        if (this.aircraft2DRenderer) {
            this.aircraft2DRenderer.destroy();
            this.aircraft2DRenderer = null;
        }
        // Clean up 3D route renderer if active
        if (this.aircraftRoute3DRenderer) {
            this.aircraftRoute3DRenderer.destroy();
            this.aircraftRoute3DRenderer = null;
        }
        // Clean up 3D renderer if active
        if (this.aircraft3DRenderer) {
            this.aircraft3DRenderer.destroy();
            this.aircraft3DRenderer = null;
        }
        this.is3DOverlayActive = false;

        if (this.aircraftRoutes) {
            this.aircraftRoutes.clearRouteDisplay();
            this.aircraftRoutes = null;
        }
    }
}
