import * as THREE from 'three';
import { MercatorCoordinate } from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { CustomLayer3D } from '../rendering/CustomLayer3D';
import type { RouteData, DisplayOptions, AircraftTrailPoint } from '../../../data/types';
import { logger } from '../../../utils/Logger';

/**
 * 3D "4D trajectory" renderer using Three.js.
 *
 * Renders, for every tracked aircraft (the single click-selected "primary"
 * aircraft, plus any Ctrl+click comparison set, plus -- when
 * `showAllAircraftTrajectories` is on -- every aircraft currently known):
 *   - Past trajectory: the aircraft's REAL flown position history (dashed
 *     line), not a planned/passed route segment.
 *   - Predicted trajectory: the remaining flight-plan route from the active
 *     waypoint onward, as a solid tube (not a thin flat line) so it reads as
 *     a 4D ribbon that visibly climbs/descends with altitude.
 *   - 4D corridor (optional): a wider, translucent wireframe tube around the
 *     same predicted path. This is a generic visual buffer with a fixed
 *     proportional radius -- it is NOT derived from real RNP/navigation-
 *     accuracy data, and must not be read as such.
 *
 * Altitude rule per waypoint (unchanged from the original single-aircraft
 * version): if `wpalt[i] > 0`, use that constraint altitude (meters);
 * otherwise use the aircraft's current altitude.
 *
 * NOTE: v1 uses scene-relative mercator positioning only. Globe-projection
 * support is a known follow-up (would need per-vertex getMatrixForModel).
 */
export class AircraftRoute3DRenderer {
    private customLayer: AircraftRoute3DCustomLayer;
    private map: MapLibreMap | null = null;
    private displayOptions: DisplayOptions;

    constructor(displayOptions: DisplayOptions) {
        this.displayOptions = displayOptions;
        this.customLayer = new AircraftRoute3DCustomLayer(displayOptions);
    }

    initialize(map: MapLibreMap): void {
        this.map = map;

        if (map.getLayer(this.customLayer.id)) {
            logger.warn('AircraftRoute3DRenderer', `Layer ${this.customLayer.id} already exists, removing first`);
            map.removeLayer(this.customLayer.id);
        }

        if (map.isStyleLoaded()) {
            this.addLayerToMap(map);
        } else {
            const waitForStyle = () => {
                if (map.isStyleLoaded()) {
                    this.addLayerToMap(map);
                } else {
                    requestAnimationFrame(waitForStyle);
                }
            };
            requestAnimationFrame(waitForStyle);
        }
    }

    private addLayerToMap(map: MapLibreMap): void {
        try {
            if (map.getLayer(this.customLayer.id)) {
                map.removeLayer(this.customLayer.id);
            }
            map.addLayer(this.customLayer as any);
            logger.debug('AircraftRoute3DRenderer', '3D route layer added to map');
        } catch (error) {
            logger.error('AircraftRoute3DRenderer', `Failed to add 3D route layer: ${error}`);
        }
    }

    /** Caches ROUTEDATA for whichever acid it's for (keyed internally by data.acid). Pass null to no-op. */
    updateRouteData(data: RouteData | null): void {
        if (!data) return;
        this.customLayer.setRouteData(data);
    }

    /** Sets which single aircraft is the "primary" selection (keeps the accent route-line color). */
    setSelectedAircraft(aircraftId: string | null): void {
        this.customLayer.setPrimaryAircraft(aircraftId);
    }

    /** Sets the full set of aircraft to render 4D trajectories for (primary + Ctrl-click set + show-all). */
    setTrackedAircraft(ids: string[]): void {
        this.customLayer.setTrackedAircraft(ids);
    }

    /** Current lat/lon/alt for every tracked aircraft (used as the predicted-path start point). */
    setAircraftStates(states: Map<string, { lat: number; lon: number; alt: number }>): void {
        this.customLayer.setAircraftStates(states);
    }

    /** Real flown-position history per tracked aircraft (used for the past-trajectory dashed line). */
    setAircraftTrails(trails: Map<string, AircraftTrailPoint[]>): void {
        this.customLayer.setAircraftTrails(trails);
    }

    /**
     * Combined update for tracked-ids + current states + trails, rebuilding
     * the scene exactly once. Every real caller (MapOverlay, on each
     * aircraft-data tick) always sets all three together anyway -- calling
     * the three setters above back-to-back would rebuild (dispose +
     * reallocate every tube/stem/sphere) three times per tick for nothing.
     */
    updateTrackedAircraft(
        ids: string[],
        states: Map<string, { lat: number; lon: number; alt: number }>,
        trails: Map<string, AircraftTrailPoint[]>
    ): void {
        this.customLayer.updateTrackedAircraft(ids, states, trails);
    }

    updateDisplayOptions(options: DisplayOptions): void {
        this.displayOptions = options;
        this.customLayer.updateDisplayOptions(options);
    }

    onStyleChange(): void {
        if (!this.map) return;

        const reinitializeLayer = () => {
            if (!this.map) return;
            try {
                if (this.map.getLayer(this.customLayer.id)) {
                    this.map.removeLayer(this.customLayer.id);
                }
                const previousState = this.customLayer.exportState();
                this.customLayer.cleanup();
                this.customLayer = new AircraftRoute3DCustomLayer(this.displayOptions);
                this.customLayer.importState(previousState);
                this.addLayerToMap(this.map);
            } catch (error) {
                logger.error('AircraftRoute3DRenderer', `Failed to reinitialize 3D route layer: ${error}`);
            }
        };

        if (this.map.isStyleLoaded()) {
            requestAnimationFrame(reinitializeLayer);
        } else {
            const waitAndReinitialize = () => {
                if (this.map && this.map.isStyleLoaded()) {
                    reinitializeLayer();
                } else if (this.map) {
                    requestAnimationFrame(waitAndReinitialize);
                }
            };
            requestAnimationFrame(waitAndReinitialize);
        }
    }

    destroy(): void {
        try {
            if (this.map && this.map.getLayer(this.customLayer.id)) {
                this.map.removeLayer(this.customLayer.id);
            }
        } catch (error) {
            logger.error('AircraftRoute3DRenderer', `Error removing 3D route layer: ${error}`);
        }

        try {
            this.customLayer.cleanup();
        } catch (error) {
            logger.error('AircraftRoute3DRenderer', `Error cleaning up custom layer: ${error}`);
        }

        this.map = null;
    }
}

interface RouteLayerState {
    routeDataByAcid: Map<string, RouteData>;
    aircraftStateByAcid: Map<string, { lat: number; lon: number; alt: number }>;
    trailsByAcid: Map<string, AircraftTrailPoint[]>;
    trackedIds: string[];
    primaryId: string | null;
}

const PASSED_COLOR = 0x888888;
const PAST_TRAJECTORY_COLOR = 0xaaaaaa;
const ACTIVE_WAYPOINT_COLOR = 0x00ff00;

// Distinct colors cycled across non-primary tracked aircraft (Ctrl+click comparison
// set / "show all"), so multiple simultaneous trajectories stay visually separable.
const COMPARISON_COLOR_PALETTE = [0xffa500, 0x00ffff, 0xffff00, 0x39ff14, 0xff4477, 0x8888ff];

const CORRIDOR_RADIUS_MULTIPLIER = 4;
const CORRIDOR_OPACITY = 0.15;

// Trajectory visuals (stem markers, predicted-path tube, waypoint spheres) use
// fixed sizes independent of the "3D Aircraft Scale" slider, which controls
// only the aircraft model mesh -- otherwise shrinking the aircraft to see
// more of the map also shrinks the trajectory into invisibility.
const STEM_MARKER_RADIUS = 10;
const PREDICTED_TUBE_RADIUS = 8;
const WAYPOINT_SPHERE_BASE_RADIUS = 12;

// Spacing between altitude stems along the predicted ground track (1 NM).
const STEM_INTERVAL_METERS = 1852;
// Hard cap on stems per aircraft, so a very long remaining route (e.g. a SID
// continuing far beyond the TMA) can't blow up object count when many
// aircraft are tracked at once (e.g. "Show All 4D Trajectories").
const MAX_STEMS_PER_AIRCRAFT = 80;

class AircraftRoute3DCustomLayer extends CustomLayer3D {
    private displayOptions: DisplayOptions;
    private routeDataByAcid: Map<string, RouteData> = new Map();
    private aircraftStateByAcid: Map<string, { lat: number; lon: number; alt: number }> = new Map();
    private trailsByAcid: Map<string, AircraftTrailPoint[]> = new Map();
    private trackedIds: string[] = [];
    private primaryId: string | null = null;

    // Per-acid Three.js objects, so a rebuild only needs to touch the acids that changed conceptually
    // (kept simple: full rebuild each update, matching the original single-aircraft version's approach --
    // aircraft counts here are small enough that this is not a performance concern).
    private objectsByAcid: Map<string, THREE.Object3D[]> = new Map();
    private sceneOrigin: { lng: number; lat: number } | null = null;
    private sceneOriginElevation: number = 0;

    // Scene-relative mercator group. Matches Aircraft3DCustomLayer's mercator group
    // conventions (x=east, y=up, z=north) so geometry aligns with aircraft meshes.
    private mercatorGroup: THREE.Group | null = null;

    constructor(displayOptions: DisplayOptions) {
        super('route-3d-layer');
        this.displayOptions = displayOptions;
    }

    protected onSceneReady(): void {
        this.mercatorGroup = new THREE.Group();
        this.mercatorGroup.rotateX(Math.PI / 2);
        this.mercatorGroup.scale.multiply(new THREE.Vector3(1, 1, -1));
        this.scene.add(this.mercatorGroup);

        this.rebuildScene();
    }

    setRouteData(data: RouteData): void {
        this.routeDataByAcid.set(data.acid, data);
        this.rebuildScene();
    }

    setPrimaryAircraft(aircraftId: string | null): void {
        this.primaryId = aircraftId;
        this.rebuildScene();
    }

    setTrackedAircraft(ids: string[]): void {
        this.applyTrackedAircraft(ids);
        this.rebuildScene();
    }

    setAircraftStates(states: Map<string, { lat: number; lon: number; alt: number }>): void {
        this.applyAircraftStates(states);
        this.rebuildScene();
    }

    setAircraftTrails(trails: Map<string, AircraftTrailPoint[]>): void {
        this.applyAircraftTrails(trails);
        this.rebuildScene();
    }

    /**
     * Combined update for tracked-ids + current states + trails, rebuilding
     * the scene exactly once instead of three times. See wrapper class
     * doc comment for why this matters.
     */
    updateTrackedAircraft(
        ids: string[],
        states: Map<string, { lat: number; lon: number; alt: number }>,
        trails: Map<string, AircraftTrailPoint[]>
    ): void {
        this.applyTrackedAircraft(ids);
        this.applyAircraftStates(states);
        this.applyAircraftTrails(trails);
        this.rebuildScene();
    }

    private applyTrackedAircraft(ids: string[]): void {
        this.trackedIds = ids;

        // Drop cached data for acids no longer tracked so stale positions/routes
        // don't silently reappear if the same acid becomes tracked again later.
        const trackedSet = new Set(ids);
        for (const acid of Array.from(this.routeDataByAcid.keys())) {
            if (!trackedSet.has(acid)) this.routeDataByAcid.delete(acid);
        }
        for (const acid of Array.from(this.aircraftStateByAcid.keys())) {
            if (!trackedSet.has(acid)) this.aircraftStateByAcid.delete(acid);
        }
        for (const acid of Array.from(this.trailsByAcid.keys())) {
            if (!trackedSet.has(acid)) this.trailsByAcid.delete(acid);
        }
    }

    private applyAircraftStates(states: Map<string, { lat: number; lon: number; alt: number }>): void {
        this.aircraftStateByAcid = new Map(states);
    }

    private applyAircraftTrails(trails: Map<string, AircraftTrailPoint[]>): void {
        this.trailsByAcid = new Map(trails);
    }

    updateDisplayOptions(options: DisplayOptions): void {
        this.displayOptions = options;
        this.rebuildScene();
    }

    exportState(): RouteLayerState {
        return {
            routeDataByAcid: new Map(this.routeDataByAcid),
            aircraftStateByAcid: new Map(this.aircraftStateByAcid),
            trailsByAcid: new Map(this.trailsByAcid),
            trackedIds: [...this.trackedIds],
            primaryId: this.primaryId
        };
    }

    importState(state: RouteLayerState): void {
        this.routeDataByAcid = new Map(state.routeDataByAcid);
        this.aircraftStateByAcid = new Map(state.aircraftStateByAcid);
        this.trailsByAcid = new Map(state.trailsByAcid);
        this.trackedIds = [...state.trackedIds];
        this.primaryId = state.primaryId;
    }

    cleanup(): void {
        this.clearGeometry();
    }

    private clearGeometry(): void {
        if (!this.mercatorGroup) return;

        for (const objects of this.objectsByAcid.values()) {
            for (const obj of objects) {
                this.mercatorGroup.remove(obj);
                this.disposeObject(obj);
            }
        }
        this.objectsByAcid.clear();
    }

    private disposeObject(obj: THREE.Object3D): void {
        const mesh = obj as THREE.Mesh | THREE.Line;
        if ((mesh as any).geometry) {
            (mesh as any).geometry.dispose();
        }
        const material = (mesh as any).material;
        if (material instanceof THREE.Material) {
            material.dispose();
        } else if (Array.isArray(material)) {
            material.forEach((m: THREE.Material) => m.dispose());
        }
    }

    private rebuildScene(): void {
        if (!this.scene || !this.mercatorGroup) {
            return;
        }

        this.clearGeometry();

        if (!this.displayOptions.showRoutes || this.trackedIds.length === 0) {
            return;
        }

        this.updateSceneOrigin();

        this.trackedIds.forEach((acid, index) => {
            const objects = this.buildForAircraft(acid, index);
            if (objects.length > 0) {
                objects.forEach(obj => this.mercatorGroup!.add(obj));
                this.objectsByAcid.set(acid, objects);
            }
        });

        this.map.triggerRepaint();
    }

    private buildForAircraft(acid: string, comparisonIndex: number): THREE.Object3D[] {
        const objects: THREE.Object3D[] = [];
        const isPrimary = acid === this.primaryId;
        const accentColor = isPrimary
            ? this.parseColor(this.displayOptions.routeLinesColor, 0x00aaff)
            : COMPARISON_COLOR_PALETTE[comparisonIndex % COMPARISON_COLOR_PALETTE.length];

        const aircraft = this.aircraftStateByAcid.get(acid);
        const trail = this.trailsByAcid.get(acid);
        const route = this.routeDataByAcid.get(acid);

        if (this.displayOptions.showRouteLines && trail && trail.length >= 2) {
            const points = trail.map(p => this.toScenePos(p.lat, p.lon, p.alt));
            objects.push(this.makeDashedLine(points, PAST_TRAJECTORY_COLOR));
        }

        const hasValidRoute = route && route.acid === acid && aircraft
            && route.wplat && route.wplat.length > 0
            && route.wplon?.length === route.wplat.length;

        if (this.displayOptions.showRouteLines && hasValidRoute) {
            const iactwp = Math.max(0, Math.min(route!.iactwp || 0, route!.wplat.length - 1));
            const altFor = (i: number): number => {
                // wpalt === 0 is a real, meaningful altitude (ground-level
                // taxi/exit waypoints after touchdown) -- it must NOT fall
                // back to the aircraft's current (much higher, mid-descent)
                // altitude, or the rendered path would incorrectly climb
                // back up right where it should keep descending to the
                // runway. Only a genuinely missing/undefined entry (no
                // constraint on that leg at all) falls back to current alt.
                const wpalt = route!.wpalt && route!.wpalt[i] !== undefined ? route!.wpalt[i] : -1;
                return wpalt >= 0 ? wpalt : aircraft!.alt;
            };

            const predictedPoints: THREE.Vector3[] = [this.toScenePos(aircraft!.lat, aircraft!.lon, aircraft!.alt)];
            for (let i = iactwp; i < route!.wplat.length; i++) {
                predictedPoints.push(this.toScenePos(route!.wplat[i], route!.wplon[i], altFor(i)));
            }

            if (predictedPoints.length >= 2) {
                const tubeRadius = this.predictedTubeRadius();
                objects.push(this.makeTube(predictedPoints, accentColor, tubeRadius, false));

                if (this.displayOptions.show4DCorridor) {
                    objects.push(this.makeTube(predictedPoints, accentColor, tubeRadius * CORRIDOR_RADIUS_MULTIPLIER, true));
                }
            }

            // Altitude stems evenly spaced along the flight (every ~1NM of
            // ground track, not just at the sparse original waypoints), so
            // the climb/level/descent profile reads as a dense "picket
            // fence" from any camera angle.
            if (this.displayOptions.showRouteLines) {
                const stemPoints = this.densifyForStems(predictedPoints, STEM_INTERVAL_METERS);
                objects.push(...this.buildAltitudeStems(stemPoints, accentColor));
            }

            if (this.displayOptions.showRoutePoints) {
                const allWaypointPositions: THREE.Vector3[] = [];
                for (let i = 0; i < route!.wplat.length; i++) {
                    allWaypointPositions.push(this.toScenePos(route!.wplat[i], route!.wplon[i], altFor(i)));
                }
                objects.push(...this.buildSpheres(allWaypointPositions, iactwp, accentColor));
            }
        } else if (this.displayOptions.showRouteLines && aircraft) {
            // No ROUTEDATA yet -- still show a stem at the aircraft's own
            // current position rather than waiting on the route to arrive.
            const current = this.toScenePos(aircraft.lat, aircraft.lon, aircraft.alt);
            objects.push(...this.buildAltitudeStems([current], accentColor));
        }

        return objects;
    }

    /**
     * Resamples a polyline (current position + upcoming waypoints, in scene
     * space) into points evenly spaced by ground-track distance, so altitude
     * stems land roughly every STEM_INTERVAL_METERS along the flown path
     * instead of only at the original (often sparsely/unevenly spaced)
     * waypoints. Distance is measured horizontally (x/z, i.e. east/north) --
     * altitude (y) at each resampled point is linearly interpolated between
     * the two waypoints it falls between, matching how BlueSky itself
     * interpolates altitude along a leg. Capped at MAX_STEMS_PER_AIRCRAFT to
     * bound object count for unusually long remaining routes.
     */
    private densifyForStems(points: THREE.Vector3[], intervalMeters: number): THREE.Vector3[] {
        if (points.length < 2) return [...points];

        const result: THREE.Vector3[] = [points[0].clone()];
        let distSinceLastStem = 0;

        for (let i = 0; i < points.length - 1 && result.length < MAX_STEMS_PER_AIRCRAFT; i++) {
            const a = points[i];
            const b = points[i + 1];
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const segLen = Math.hypot(dx, dz);
            if (segLen < 1e-6) continue;

            let pos = 0;
            while (result.length < MAX_STEMS_PER_AIRCRAFT) {
                const distToNextStem = intervalMeters - distSinceLastStem;
                if (pos + distToNextStem > segLen) {
                    distSinceLastStem += segLen - pos;
                    break;
                }
                pos += distToNextStem;
                const t = pos / segLen;
                result.push(new THREE.Vector3(a.x + dx * t, a.y + (b.y - a.y) * t, a.z + dz * t));
                distSinceLastStem = 0;
            }
        }

        return result;
    }

    /**
     * Vertical dashed line from EACH given scene-space point straight down to
     * its ground projection (same x/z, y=0), plus a small marker at each
     * ground point -- "flight-level stems" at every phase of the flight
     * (current position + each upcoming waypoint), not just one at the
     * aircraft's current altitude, so the climb/level/descent profile reads
     * as a "picket fence" from any camera angle -- the same convention used
     * in military/ATC 3D TBO displays. A point already at (or within ~1m of)
     * ground level is skipped, since a near-zero-length stem while
     * taxiing/at the gate would just be visual clutter.
     */
    private buildAltitudeStems(points: THREE.Vector3[], color: number): THREE.Object3D[] {
        const objects: THREE.Object3D[] = [];
        const markerRadius = STEM_MARKER_RADIUS;

        for (const top of points) {
            if (top.y < 1) continue;
            const ground = new THREE.Vector3(top.x, 0, top.z);

            const geometry = new THREE.BufferGeometry().setFromPoints([top, ground]);
            const material = new THREE.LineDashedMaterial({
                color,
                dashSize: 40,
                gapSize: 30,
                transparent: true,
                opacity: 0.6,
            });
            const line = new THREE.Line(geometry, material);
            line.computeLineDistances();
            line.frustumCulled = false;
            objects.push(line);

            const markerGeometry = new THREE.SphereGeometry(markerRadius, 12, 8);
            const markerMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.copy(ground);
            marker.frustumCulled = false;
            objects.push(marker);
        }

        return objects;
    }

    private predictedTubeRadius(): number {
        // A thin "pipe" (a few meters radius) reads as a flight-path indicator;
        // fixed regardless of the aircraft model scale slider.
        return PREDICTED_TUBE_RADIUS;
    }

    private makeDashedLine(points: THREE.Vector3[], color: number): THREE.Line {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineDashedMaterial({
            color,
            dashSize: 200,
            gapSize: 150,
            transparent: true,
            opacity: 0.85
        });
        const line = new THREE.Line(geometry, material);
        line.computeLineDistances();
        line.frustumCulled = false;
        return line;
    }

    private makeTube(points: THREE.Vector3[], color: number, radius: number, wireframeCorridor: boolean): THREE.Mesh {
        const curve = new THREE.CatmullRomCurve3(points);
        const tubularSegments = Math.max(4, points.length * 4);
        const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, 8, false);
        const material = wireframeCorridor
            ? new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: CORRIDOR_OPACITY })
            : new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        return mesh;
    }

    private buildSpheres(waypointPositions: THREE.Vector3[], iactwp: number, upcomingColor: number): THREE.Mesh[] {
        // Small waypoint markers, not landmarks: fixed size regardless of the
        // aircraft model scale slider.
        const baseRadius = WAYPOINT_SPHERE_BASE_RADIUS;
        const spheres: THREE.Mesh[] = [];

        for (let i = 0; i < waypointPositions.length; i++) {
            const isActive = i === iactwp;
            const isPassed = i < iactwp;

            const radius = isActive ? baseRadius * 1.5 : baseRadius;
            const color = isActive
                ? ACTIVE_WAYPOINT_COLOR
                : isPassed
                    ? PASSED_COLOR
                    : upcomingColor;

            const geometry = new THREE.SphereGeometry(radius, 16, 12);
            const material = new THREE.MeshBasicMaterial({ color });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(waypointPositions[i]);
            mesh.frustumCulled = false;
            spheres.push(mesh);
        }

        return spheres;
    }

    private parseColor(css: string | undefined, fallback: number): number {
        if (!css) return fallback;
        try {
            return new THREE.Color(css).getHex();
        } catch {
            return fallback;
        }
    }

    /**
     * Convert lat/lon/alt to scene-relative meter coordinates for the mercator group.
     * Scene axes after group rotation: x=east, y=up, z=north. Altitude in meters.
     *
     * Altitude is pre-scaled by the per-point / scene-origin mercator-per-meter
     * ratio so that, after the camera projection multiplies y by the scene
     * origin's mercator-per-meter, world Z equals altitude × per-point
     * mercator scale. This is what the 3D aircraft renderer also does, so
     * both layers agree on visual height regardless of where each puts its
     * scene origin.
     */
    private toScenePos(lat: number, lon: number, altitudeMeters: number): THREE.Vector3 {
        const rel = this.calculateRelativePosition(lat, lon);
        if (!this.sceneOrigin) {
            return new THREE.Vector3(rel.east, altitudeMeters, rel.north);
        }
        const pointMpm = MercatorCoordinate.fromLngLat([lon, lat]).meterInMercatorCoordinateUnits();
        const originMpm = MercatorCoordinate.fromLngLat([this.sceneOrigin.lng, this.sceneOrigin.lat]).meterInMercatorCoordinateUnits();
        const altScaled = altitudeMeters * (pointMpm / originMpm);
        return new THREE.Vector3(rel.east, altScaled, rel.north);
    }

    private calculateRelativePosition(lat: number, lng: number): { east: number; north: number } {
        if (!this.sceneOrigin) {
            return { east: 0, north: 0 };
        }

        const originMercator = MercatorCoordinate.fromLngLat([this.sceneOrigin.lng, this.sceneOrigin.lat]);
        const targetMercator = MercatorCoordinate.fromLngLat([lng, lat]);

        const mercatorPerMeter = originMercator.meterInMercatorCoordinateUnits();
        const dEast = (targetMercator.x - originMercator.x) / mercatorPerMeter;
        const dNorth = (originMercator.y - targetMercator.y) / mercatorPerMeter;

        return { east: dEast, north: dNorth };
    }

    /**
     * Scene origin tracks the primary aircraft's position when available (so
     * the geometry stays close to the origin and matches the aircraft 3D
     * layer's relative-positioning scheme), falling back to any other
     * tracked aircraft's position, then the map center.
     */
    private updateSceneOrigin(): void {
        const primaryState = this.primaryId ? this.aircraftStateByAcid.get(this.primaryId) : undefined;
        const fallbackState = primaryState ?? this.aircraftStateByAcid.values().next().value;

        if (fallbackState) {
            this.sceneOrigin = { lng: fallbackState.lon, lat: fallbackState.lat };
        } else if (!this.sceneOrigin && this.map) {
            const center = this.map.getCenter();
            this.sceneOrigin = { lng: center.lng, lat: center.lat };
        }
    }

    protected updateScene(args?: any): void {
        if (!this.sceneOrigin || !args || !this.mercatorGroup) return;

        const sceneOriginMercator = MercatorCoordinate.fromLngLat(
            [this.sceneOrigin.lng, this.sceneOrigin.lat],
            this.sceneOriginElevation
        );

        const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
        const l = new THREE.Matrix4()
            .makeTranslation(sceneOriginMercator.x, sceneOriginMercator.y, sceneOriginMercator.z)
            .scale(new THREE.Vector3(
                sceneOriginMercator.meterInMercatorCoordinateUnits(),
                -sceneOriginMercator.meterInMercatorCoordinateUnits(),
                sceneOriginMercator.meterInMercatorCoordinateUnits()
            ));

        this.camera.projectionMatrix = m.multiply(l);
    }
}
