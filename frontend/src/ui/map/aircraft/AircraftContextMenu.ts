/**
 * AircraftContextMenu — right-click quick-action menu on an aircraft.
 *
 * Lets a controller issue common ATC instructions (climb/descend, heading,
 * direct-to, hold at a nearby published holding fix, go-around, speed,
 * resume own navigation, delete) without typing raw stack commands.
 *
 * Design notes (see plan discussion):
 * - "Direct to a point" needs a temporary waypoint: BlueSky's DIRECT command
 *   only accepts a waypoint name already in the route (`'wpinroute'`), not a
 *   raw lat/lon (confirmed in `FTS Server/bluesky/traffic/route.py`). So we
 *   DEFWPT a throwaway point, ADDWPT it into the route, then DIRECT to it.
 * - "Hold at a point" means directing the aircraft to an existing published
 *   holding fix (TAMLA/LOLUC/KONGA/...), not inventing a generic racetrack
 *   geometry from scratch. The real fix geometries are already shipped as
 *   `procedure_type: "HOLDING"` features in the per-airport procedure
 *   GeoJSON served at `/static/data/vatm_kmz/procedures_by_airport/...`
 *   (the same source `proceduresIndexApi` uses for the airspace overlay).
 *   We reuse that API rather than re-deriving/hardcoding fix coordinates.
 * - BlueSky auto-deletes an aircraft when it reaches the LAST waypoint in
 *   its route (documented project pitfall). A holding racetrack is a closed
 *   loop, so appending it once and stopping there would delete the aircraft
 *   mid-hold. We append the loop coordinates a few times (multiple laps)
 *   and then re-append the aircraft's own remaining route afterward, so it
 *   safely continues its original flight if the controller doesn't
 *   intervene before the laps run out.
 * - No altitude/speed number is invented for a generic hold or go-around —
 *   the controller enters the target value; only real, source-confirmed
 *   numbers (e.g. KONGA's specific missed-approach data) would ever be
 *   hardcoded, and none of those apply generically to an arbitrary aircraft
 *   at an arbitrary fix.
 */

import { MapMouseEvent } from 'maplibre-gl';
import type { App } from '../../../core/App';
import { MapDisplay } from '../MapDisplay';
import { StateManager } from '../../../core/StateManager';
import { proceduresIndexApi } from '../../../services/proceduresIndexApi';
import { logger } from '../../../utils/Logger';

const HOLD_LAPS = 3;
const NEAREST_HOLD_COUNT = 5;
// Only airports with real published HOLDING procedure data today. Extend
// this list as more airports get real procedure GeoJSON exported.
const HOLD_DATA_AIRPORTS = ['VVDN'];

interface HoldFixOption {
    name: string;
    lat: number;
    lon: number;
    coords: Array<[number, number]>; // [lon, lat] pairs, in published order
    distanceNm: number;
}

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R_NM = 3440.065;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class AircraftContextMenu {
    private readonly app: App;
    private readonly mapDisplay: MapDisplay;
    private readonly stateManager: StateManager;

    private readonly root: HTMLDivElement;
    private targetAcid: string | null = null;

    private isRouteDrawingActive: (() => boolean) | null = null;
    private isRangeBearingActive: (() => boolean) | null = null;

    // Torn down whenever the menu closes or a new "pick a point" session starts.
    private pickPointCleanup: (() => void) | null = null;
    private tempWaypointCounter = 0;

    constructor(app: App, mapDisplay: MapDisplay, stateManager: StateManager) {
        this.app = app;
        this.mapDisplay = mapDisplay;
        this.stateManager = stateManager;

        this.root = document.createElement('div');
        this.root.className = 'aircraft-context-menu';
        this.root.style.display = 'none';
        document.body.appendChild(this.root);

        this.bindMapContextMenu();
        this.bindGlobalDismiss();
    }

    public setRouteDrawingActiveCheck(check: () => boolean): void {
        this.isRouteDrawingActive = check;
    }

    public setRangeBearingActiveCheck(check: () => boolean): void {
        this.isRangeBearingActive = check;
    }

    private bindMapContextMenu(): void {
        const map = this.mapDisplay.getMap();
        if (!map) return;

        map.on('contextmenu', 'aircraft-points', (e: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
            if (this.isRouteDrawingActive && this.isRouteDrawingActive()) return;
            if (this.isRangeBearingActive && this.isRangeBearingActive()) return;

            const features = (e as any).features;
            if (!features || features.length === 0) return;
            const acid = features[0].properties?.entity_id || features[0].properties?.callsign;
            if (!acid) return;

            e.preventDefault();
            this.open(acid, e.originalEvent.clientX, e.originalEvent.clientY);
        });
    }

    private bindGlobalDismiss(): void {
        document.addEventListener('mousedown', (e) => {
            if (this.root.style.display === 'none') return;
            if (!this.root.contains(e.target as Node)) this.close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });
        // Any map movement invalidates the menu's anchored screen position.
        const map = this.mapDisplay.getMap();
        map?.on('movestart', () => this.close());
    }

    /** Open the menu for `acid`, anchored at the given viewport coordinates. */
    public open(acid: string, clientX: number, clientY: number): void {
        if (this.isRouteDrawingActive && this.isRouteDrawingActive()) return;
        if (this.isRangeBearingActive && this.isRangeBearingActive()) return;

        this.targetAcid = acid;
        this.teardownPickMode();
        this.renderMainMenu();
        this.root.style.display = 'block';

        // Clamp inside the viewport so the menu never renders off-screen.
        const rect = this.root.getBoundingClientRect();
        const x = Math.min(clientX, window.innerWidth - rect.width - 8);
        const y = Math.min(clientY, window.innerHeight - rect.height - 8);
        this.root.style.left = `${Math.max(4, x)}px`;
        this.root.style.top = `${Math.max(4, y)}px`;

        // Prime route data for "direct to next waypoint" -- harmless if the
        // aircraft is already the tracked selection.
        this.app.sendCommand(`POS ${acid}`);
    }

    public close(): void {
        this.teardownPickMode();
        this.root.style.display = 'none';
        this.targetAcid = null;
    }

    // ---- Row builders -----------------------------------------------

    private clear(): void {
        this.root.innerHTML = '';
    }

    private addHeader(text: string): void {
        const h = document.createElement('div');
        h.className = 'acm-header';
        h.textContent = text;
        this.root.appendChild(h);
    }

    private addSeparator(): void {
        const s = document.createElement('div');
        s.className = 'acm-separator';
        this.root.appendChild(s);
    }

    private addActionItem(label: string, onClick: () => void): void {
        const item = document.createElement('div');
        item.className = 'acm-item';
        item.textContent = label;
        item.addEventListener('click', onClick);
        this.root.appendChild(item);
    }

    /**
     * A row that expands in place into a small numeric input + confirm
     * button when clicked, instead of opening a separate modal.
     */
    private addNumberInputItem(
        label: string,
        placeholder: string,
        onSubmit: (value: number) => void
    ): void {
        const item = document.createElement('div');
        item.className = 'acm-item';
        item.textContent = label;

        item.addEventListener('click', () => {
            const row = document.createElement('div');
            row.className = 'acm-input-row';

            const input = document.createElement('input');
            input.type = 'number';
            input.placeholder = placeholder;
            input.className = 'acm-input';

            const confirm = document.createElement('button');
            confirm.type = 'button';
            confirm.className = 'acm-confirm';
            confirm.textContent = '✓';

            const submit = () => {
                const value = parseFloat(input.value);
                if (!Number.isNaN(value)) {
                    onSubmit(value);
                    this.close();
                }
            };
            confirm.addEventListener('click', submit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit();
                e.stopPropagation();
            });

            row.appendChild(input);
            row.appendChild(confirm);
            item.replaceWith(row);
            input.focus();
        });

        this.root.appendChild(item);
    }

    private addDangerConfirmItem(label: string, confirmLabel: string, onConfirm: () => void): void {
        const item = document.createElement('div');
        item.className = 'acm-item acm-danger';
        item.textContent = label;

        item.addEventListener('click', () => {
            const row = document.createElement('div');
            row.className = 'acm-confirm-row';

            const text = document.createElement('span');
            text.textContent = confirmLabel;

            const yes = document.createElement('button');
            yes.type = 'button';
            yes.className = 'acm-confirm-yes';
            yes.textContent = 'Có';
            yes.addEventListener('click', () => {
                onConfirm();
                this.close();
            });

            const no = document.createElement('button');
            no.type = 'button';
            no.className = 'acm-confirm-no';
            no.textContent = 'Không';
            no.addEventListener('click', () => this.renderMainMenu());

            row.appendChild(text);
            row.appendChild(yes);
            row.appendChild(no);
            item.replaceWith(row);
        });

        this.root.appendChild(item);
    }

    // ---- Main menu ----------------------------------------------------

    private renderMainMenu(): void {
        const acid = this.targetAcid;
        if (!acid) return;
        this.clear();
        this.addHeader(acid);

        this.addNumberInputItem('Climb (độ cao, ft)', 'FL / ft', (alt) => {
            this.app.sendCommand(`ALT ${acid},${Math.round(alt)}`);
        });
        this.addNumberInputItem('Descend (độ cao, ft)', 'FL / ft', (alt) => {
            this.app.sendCommand(`ALT ${acid},${Math.round(alt)}`);
        });
        this.addNumberInputItem('Bay hướng (Heading, °)', '0-360', (hdg) => {
            this.app.sendCommand(`HDG ${acid},${Math.round(hdg)}`);
        });

        this.addActionItem('Direct đến waypoint kế tiếp', () => {
            this.directToNextWaypoint(acid);
        });
        this.addActionItem('Direct to điểm…', () => {
            this.startPickPoint(acid, (lat, lon) => this.issueDirectToPoint(acid, lat, lon));
        });

        this.addActionItem('Hold tại điểm chờ…', () => {
            this.renderHoldSubmenu(acid);
        });

        this.addNumberInputItem('Go-around — độ cao đích (ft)', 'ft', (alt) => {
            this.issueGoAround(acid, Math.round(alt));
        });

        this.addNumberInputItem('Tăng tốc (kt)', 'kt', (spd) => {
            this.app.sendCommand(`SPD ${acid},${Math.round(spd)}`);
        });
        this.addNumberInputItem('Giảm tốc (kt)', 'kt', (spd) => {
            this.app.sendCommand(`SPD ${acid},${Math.round(spd)}`);
        });

        this.addSeparator();
        this.addActionItem('Trở về lộ trình (Resume own navigation)', () => {
            this.app.sendCommand(`LNAV ${acid},ON`);
            this.app.sendCommand(`VNAV ${acid},ON`);
            this.close();
        });

        this.addSeparator();
        this.addDangerConfirmItem(
            'Xoá tàu bay',
            `Xóa ${acid}?`,
            () => this.app.sendCommand(`DEL ${acid}`)
        );
    }

    // ---- Action implementations ----------------------------------------

    private directToNextWaypoint(acid: string): void {
        const route = this.app.getRouteData();
        if (!route || route.acid !== acid || !route.wpname || route.wpname.length === 0) {
            logger.warn('AircraftContextMenu', `No cached route data for ${acid} yet -- try again after selecting it`);
            this.close();
            return;
        }
        const nextIdx = Math.min(route.iactwp, route.wpname.length - 1);
        const wpname = route.wpname[nextIdx];
        if (wpname) {
            this.app.sendCommand(`DIRECT ${acid},${wpname}`);
        }
        this.close();
    }

    private nextTempWaypointName(): string {
        this.tempWaypointCounter += 1;
        return `ACM${Date.now() % 100000}${this.tempWaypointCounter}`;
    }

    private issueDirectToPoint(acid: string, lat: number, lon: number): void {
        const wpname = this.nextTempWaypointName();
        this.app.sendCommand(`DEFWPT ${wpname},${lat.toFixed(6)},${lon.toFixed(6)}`);
        this.app.sendCommand(`ADDWPT ${acid},${wpname}`);
        this.app.sendCommand(`DIRECT ${acid},${wpname}`);
    }

    private issueGoAround(acid: string, targetAltFt: number): void {
        // Generic missed approach: climb straight ahead on the aircraft's
        // current track to a controller-supplied altitude. No airport-
        // specific missed-approach heading/altitude is assumed.
        const aircraft = this.stateManager.getAircraftById(acid);
        if (aircraft) {
            this.app.sendCommand(`HDG ${acid},${Math.round(aircraft.trk)}`);
        }
        this.app.sendCommand(`ALT ${acid},${targetAltFt}`);
    }

    // ---- "Pick a point on the map" mode ---------------------------------

    /** Mirrors RouteDrawingManager's single-click "enter picking mode,
     * capture the next map click, tear down" idiom. */
    private startPickPoint(acid: string, onPicked: (lat: number, lon: number) => void): void {
        this.close();
        const map = this.mapDisplay.getMap();
        if (!map) return;

        map.getCanvas().style.cursor = 'crosshair';

        const clickHandler = (e: MapMouseEvent) => {
            teardown();
            onPicked(e.lngLat.lat, e.lngLat.lng);
        };
        const keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') teardown();
        };
        const teardown = () => {
            map.getCanvas().style.cursor = '';
            map.off('click', clickHandler);
            document.removeEventListener('keydown', keyHandler);
            this.pickPointCleanup = null;
        };

        map.on('click', clickHandler);
        document.addEventListener('keydown', keyHandler);
        this.pickPointCleanup = teardown;
    }

    private teardownPickMode(): void {
        if (this.pickPointCleanup) {
            this.pickPointCleanup();
        }
    }

    // ---- Hold-at-a-published-fix submenu --------------------------------

    private renderHoldSubmenu(acid: string): void {
        this.clear();
        this.addHeader('Chọn khu vực chờ gần nhất');
        const loading = document.createElement('div');
        loading.className = 'acm-item acm-loading';
        loading.textContent = 'Đang tìm khu vềc chờ…';
        this.root.appendChild(loading);

        const aircraft = this.stateManager.getAircraftById(acid);
        if (!aircraft) {
            this.close();
            return;
        }

        this.findNearestHoldFixes(aircraft.lat, aircraft.lon)
            .then((options) => {
                if (this.targetAcid !== acid) return; // menu moved on
                this.clear();
                this.addHeader('Chọn khu vực chờ gần nhất');

                if (options.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'acm-item acm-loading';
                    empty.textContent = 'Không có khu vực chờ nào có sẵn gần đây.';
                    this.root.appendChild(empty);
                } else {
                    for (const opt of options) {
                        this.addActionItem(
                            `${opt.name} — ${opt.distanceNm.toFixed(1)} NM`,
                            () => {
                                this.issueHoldAtFix(acid, opt);
                                this.close();
                            }
                        );
                    }
                }

                this.addSeparator();
                this.addActionItem('← Quay lại', () => this.renderMainMenu());
            })
            .catch((err) => {
                logger.error('AircraftContextMenu', 'Failed to load holding fixes', err);
                this.close();
            });
    }

    private async findNearestHoldFixes(lat: number, lon: number): Promise<HoldFixOption[]> {
        const index = await proceduresIndexApi.getIndex();
        const options: HoldFixOption[] = [];

        for (const icao of HOLD_DATA_AIRPORTS) {
            const names = proceduresIndexApi.transitionNamesFor(index, icao, 'HOLDING');
            for (const name of names) {
                const track = await proceduresIndexApi.getTransitionTrack(index, icao, 'HOLDING', name);
                const coords: Array<[number, number]> = [];
                for (const feature of track.features) {
                    if (feature.geometry.type === 'LineString') {
                        coords.push(...(feature.geometry.coordinates as Array<[number, number]>));
                    }
                }
                if (coords.length === 0) continue;

                // Anchor distance/entry point on the fix's first published
                // coordinate (matches how the KONGA scenario generator
                // treats coords[0] as the fix itself).
                const [entryLon, entryLat] = coords[0];
                options.push({
                    name,
                    lat: entryLat,
                    lon: entryLon,
                    coords,
                    distanceNm: haversineNm(lat, lon, entryLat, entryLon),
                });
            }
        }

        options.sort((a, b) => a.distanceNm - b.distanceNm);
        return options.slice(0, NEAREST_HOLD_COUNT);
    }

    private issueHoldAtFix(acid: string, fix: HoldFixOption): void {
        // Direct to the fix, then loop the published racetrack HOLD_LAPS
        // times so the aircraft doesn't run out of route mid-hold (BlueSky
        // deletes an aircraft on reaching its last waypoint), then hand
        // back to whatever route the aircraft already had so it resumes
        // its own flight automatically if the controller doesn't intervene.
        const remaining = this.app.getRouteData();
        const hasOwnRoute = remaining && remaining.acid === acid && remaining.wpname && remaining.wpname.length > 0;

        const wpname = this.nextTempWaypointName();
        this.app.sendCommand(`DEFWPT ${wpname},${fix.lat.toFixed(6)},${fix.lon.toFixed(6)}`);
        this.app.sendCommand(`ADDWPT ${acid},${wpname}`);
        this.app.sendCommand(`DIRECT ${acid},${wpname}`);

        for (let lap = 0; lap < HOLD_LAPS; lap++) {
            for (const [clon, clat] of fix.coords) {
                this.app.sendCommand(`ADDWPT ${acid},${clat.toFixed(6)},${clon.toFixed(6)}`);
            }
        }

        if (hasOwnRoute && remaining) {
            const fromIdx = Math.min(remaining.iactwp, remaining.wpname.length - 1);
            for (let i = fromIdx; i < remaining.wplat.length; i++) {
                this.app.sendCommand(
                    `ADDWPT ${acid},${remaining.wplat[i].toFixed(6)},${remaining.wplon[i].toFixed(6)}`
                );
            }
        }

        this.app.sendCommand(`LNAV ${acid},ON`);
    }
}
