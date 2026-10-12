/**
 * ConflictsPanel - Manages the Conflicts panel
 *
 * This panel handles:
 * - Displaying aircraft currently in conflict (inconf === true)
 * - TCPA (Time to Closest Point of Approach) display
 * - Aircraft selection with single/double click support
 * - Scrollable conflict list
 * - Real-time updates with change detection optimization
 */

import { BasePanel } from '../BasePanel';
import { AircraftData } from '../../../data/types';
import { StateManager } from '../../../core/StateManager';
import { logger } from '../../../utils/Logger';

export class ConflictsPanel extends BasePanel {
    private conflictsInfoElement: HTMLElement | null = null;
    private stateManager: StateManager | null = null;
    private currentAircraftData: AircraftData | null = null;
    private selectedAircraft: string | null = null;
    private lastConflictIds: string[] = [];
    private clickTimeouts: Map<string, number> = new Map();

    constructor() {
        super('.conflicts-panel', 'conflicts-content');
    }

    protected onInit(): void {
        this.conflictsInfoElement = document.getElementById('conflicts-info');

        if (!this.conflictsInfoElement) {
            logger.warn('ConflictsPanel', 'Conflicts info element not found');
            return;
        }

        // Delegated listener for the Accept/Reject resolution buttons: the
        // container element survives innerHTML rebuilds, so this is attached
        // once rather than re-attached on every render. Capture phase so it
        // runs (and can stopPropagation) before the per-item bubble-phase
        // selection click handler added in addConflictClickHandlers.
        this.conflictsInfoElement.addEventListener('click', (e) => this.handleResoActionClick(e), true);

        logger.debug('ConflictsPanel', 'ConflictsPanel initialized');
    }

    /**
     * Handle clicks on the Accept/Reject resolution buttons (event
     * delegation). Stops propagation so it doesn't also trigger the
     * conflict-item's own aircraft-selection click handling.
     */
    private handleResoActionClick(e: Event): void {
        const target = e.target as HTMLElement;
        const btn = target.closest('.reso-btn') as HTMLElement | null;
        if (!btn) return;
        e.stopPropagation();

        const item = btn.closest('.conflict-item') as HTMLElement | null;
        const aircraftId = item?.getAttribute('data-aircraft-id');
        const action = btn.getAttribute('data-action');
        if (!aircraftId || !action) return;

        const command = action === 'accept' ? `RESOACCEPT ${aircraftId}` : `RESOREJECT ${aircraftId}`;
        this.sendResoCommand(command);
    }

    /**
     * Send a RESOACCEPT/RESOREJECT stack command to the simulation.
     */
    private async sendResoCommand(command: string): Promise<void> {
        try {
            const response = await fetch('/api/simulation/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command })
            });
            const result = await response.json();
            if (!result.success) {
                logger.warn('ConflictsPanel', `Reso command failed: ${command} -> ${result.error || 'unknown error'}`);
            }
        } catch (error) {
            logger.warn('ConflictsPanel', `Reso command error: ${command} -> ${(error as Error).message}`);
        }
    }

    /**
     * Set the state manager to enable aircraft selection coordination
     */
    public setStateManager(stateManager: StateManager): void {
        this.stateManager = stateManager;

        // Subscribe to selected aircraft changes
        this.stateManager.subscribe('selectedAircraft', (newAircraft) => {
            this.selectedAircraft = newAircraft;
            this.updateSelectionVisuals();
        });

        // Subscribe to aircraft data updates
        this.stateManager.subscribe('aircraftData', (newData) => {
            this.currentAircraftData = newData;
            this.updateConflictsListIfChanged();
        });
    }

    /**
     * Update panel with new data
     */
    public update(data?: AircraftData): void {
        if (data) {
            this.currentAircraftData = data;
        }
        this.updateConflictsListIfChanged();
    }

    /**
     * Only update conflicts list if conflicts actually changed (optimization)
     */
    private updateConflictsListIfChanged(): void {
        if (!this.currentAircraftData?.id || !this.currentAircraftData?.inconf) {
            if (this.lastConflictIds.length > 0) {
                // Had conflicts before, now have none - update
                this.updateConflictsList();
                this.lastConflictIds = [];
            }
            return;
        }

        // Find current aircraft in conflict
        const currentConflictIds: string[] = [];
        for (let i = 0; i < this.currentAircraftData.id.length; i++) {
            if (this.currentAircraftData.id[i] &&
                this.currentAircraftData.id[i].trim() !== '' &&
                this.currentAircraftData.inconf[i]) {
                currentConflictIds.push(this.currentAircraftData.id[i]);
            }
        }

        // Check if conflicts changed
        const conflictsChanged =
            this.lastConflictIds.length !== currentConflictIds.length ||
            !this.lastConflictIds.every(id => currentConflictIds.includes(id)) ||
            !currentConflictIds.every(id => this.lastConflictIds.includes(id));

        if (conflictsChanged) {
            this.updateConflictsList();
            this.lastConflictIds = currentConflictIds;
        } else if (currentConflictIds.length > 0) {
            // Update TCPA text dynamically without rebuilding the DOM to keep it continuous
            this.updateTcpaValues();
        }
    }

    /**
     * Update TCPA values for existing conflict elements
     */
    private updateTcpaValues(): void {
        if (!this.conflictsInfoElement || !this.currentAircraftData) return;

        const conflictItems = this.conflictsInfoElement.querySelectorAll('.conflict-item');
        conflictItems.forEach(item => {
            const htmlItem = item as HTMLElement;
            const indexAttr = htmlItem.getAttribute('data-index');

            if (indexAttr) {
                const index = parseInt(indexAttr);
                const tcpa = this.currentAircraftData!.tcpamax && this.currentAircraftData!.tcpamax[index]
                    ? this.currentAircraftData!.tcpamax[index]
                    : null;

                const tcpaElement = htmlItem.querySelector('.conflict-tcpa');
                if (tcpaElement) {
                    tcpaElement.textContent = tcpa !== null ? `TCPA: ${tcpa.toFixed(1)}s` : '';
                }

                const resoElement = htmlItem.querySelector('.conflict-reso');
                if (resoElement) {
                    resoElement.textContent = ConflictsPanel.formatResolution(this.currentAircraftData!, index);
                }

                const actionsElement = htmlItem.querySelector('.conflict-reso-actions');
                if (actionsElement) {
                    const reso = ConflictsPanel.formatResolution(this.currentAircraftData!, index);
                    const accepted = this.currentAircraftData!.asasaccepted?.[index] === true;
                    actionsElement.innerHTML = ConflictsPanel.renderResoActions(reso, accepted);
                }
            }
        });
    }

    /**
     * Render the Accept/Reject controls for a conflict item, or '' if there
     * is no resolution yet to act on.
     */
    private static renderResoActions(reso: string, accepted: boolean): string {
        if (!reso) return '';
        if (accepted) {
            return '<span class="reso-status">✓ Đang bay theo đề xuất</span>' +
                '<button class="reso-btn reso-cancel" data-action="reject">Hủy</button>';
        }
        return '<button class="reso-btn reso-accept" data-action="accept">Chấp nhận</button>';
    }

    /**
     * Render the ASAS-proposed resolution (heading / speed / altitude) for
     * an aircraft currently in conflict, or '' if BlueSky hasn't computed
     * one (RESO OFF, or no advisory needed yet).
     */
    private static formatResolution(data: AircraftData, index: number): string {
        const parts: string[] = [];
        const trk = data.asastrk?.[index];
        const tas = data.asastas?.[index];
        const vs = data.asasvs?.[index];
        if (trk !== undefined && !Number.isNaN(trk)) {
            parts.push(`HDG ${Math.round(trk)}°`);
        }
        if (tas !== undefined && !Number.isNaN(tas)) {
            parts.push(`SPD ${Math.round(tas * 1.94384)}kt`);
        }
        if (vs !== undefined && !Number.isNaN(vs) && Math.abs(vs) > 0.1) {
            const fpm = Math.round(vs * 196.850);
            parts.push(`VS ${fpm > 0 ? '+' : ''}${fpm}ft/min`);
        }
        return parts.length ? `Đề xuất: ${parts.join(' · ')}` : '';
    }

    /**
     * Update conflicts list display
     */
    private updateConflictsList(): void {
        if (!this.conflictsInfoElement) return;

        if (!this.currentAircraftData?.id || !this.currentAircraftData?.inconf) {
            this.conflictsInfoElement.innerHTML = '<div class="no-conflicts">No conflicts detected</div>';
            return;
        }

        // Find all aircraft in conflict
        const conflictAircraft: Array<{ id: string; index: number; tcpa: number | null; reso: string; accepted: boolean }> = [];

        for (let i = 0; i < this.currentAircraftData.id.length; i++) {
            const aircraftId = this.currentAircraftData.id[i];
            if (aircraftId && aircraftId.trim() !== '' && this.currentAircraftData.inconf[i]) {
                const tcpa = this.currentAircraftData.tcpamax && this.currentAircraftData.tcpamax[i]
                    ? this.currentAircraftData.tcpamax[i]
                    : null;

                conflictAircraft.push({
                    id: aircraftId,
                    index: i,
                    tcpa: tcpa,
                    reso: ConflictsPanel.formatResolution(this.currentAircraftData, i),
                    accepted: this.currentAircraftData.asasaccepted?.[i] === true
                });
            }
        }

        if (conflictAircraft.length === 0) {
            this.conflictsInfoElement.innerHTML = '<div class="no-conflicts">No conflicts detected</div>';
            return;
        }

        // Build conflicts list HTML
        let html = '<div class="conflicts-list">';
        conflictAircraft.forEach(conflict => {
            const tcpaStr = conflict.tcpa !== null ? `TCPA: ${conflict.tcpa.toFixed(1)}s` : '';

            html += `
                <div class="conflict-item" data-aircraft-id="${conflict.id}" data-index="${conflict.index}">
                    <div class="conflict-pair"><strong>${conflict.id}</strong></div>
                    <div class="conflict-tcpa">${tcpaStr}</div>
                    <div class="conflict-reso">${conflict.reso}</div>
                    <div class="conflict-reso-actions">${ConflictsPanel.renderResoActions(conflict.reso, conflict.accepted)}</div>
                </div>
            `;
        });
        html += '</div>';

        this.conflictsInfoElement.innerHTML = html;

        // Add click handlers to conflict items
        const conflictItems = this.conflictsInfoElement.querySelectorAll('.conflict-item');
        conflictItems.forEach(item => {
            const htmlItem = item as HTMLElement;
            const aircraftId = htmlItem.getAttribute('data-aircraft-id');
            const indexAttr = htmlItem.getAttribute('data-index');

            if (aircraftId && indexAttr) {
                const index = parseInt(indexAttr);
                this.addConflictClickHandlers(htmlItem, aircraftId, index);
            }
        });

        // Update selection state after rebuilding
        this.updateSelectionVisuals();
    }

    /**
     * Add click handlers for conflict items (single and double click)
     */
    private addConflictClickHandlers(element: HTMLElement, aircraftId: string, index: number): void {
        let clickCount = 0;

        element.addEventListener('click', () => {
            clickCount++;

            // Clear any existing timeout for this aircraft
            const existingTimeout = this.clickTimeouts.get(aircraftId);
            if (existingTimeout) {
                clearTimeout(existingTimeout);
                this.clickTimeouts.delete(aircraftId);
            }

            if (clickCount === 2) {
                // Double click detected - select and zoom/follow aircraft
                clickCount = 0;
                this.handleConflictDoubleClick(aircraftId, index);
            } else {
                // Single click - wait to see if there's a second click
                const timeout = window.setTimeout(() => {
                    clickCount = 0;
                    this.clickTimeouts.delete(aircraftId);
                    this.handleConflictSingleClick(aircraftId, index);
                }, 300); // 300ms delay to detect double-click

                this.clickTimeouts.set(aircraftId, timeout);
            }
        });
    }

    /**
     * Handle single click on conflict item
     */
    private handleConflictSingleClick(aircraftId: string, index: number): void {
        if (!this.stateManager) return;

        // Check if clicking the same aircraft that's already selected
        const isSameAircraft = this.selectedAircraft === aircraftId;

        if (isSameAircraft) {
            // Unselect aircraft
            this.stateManager.setSelectedAircraft(null);
            logger.debug('ConflictsPanel', `Unselected aircraft from conflicts: ${aircraftId}`);
        } else {
            // Select new aircraft
            this.stateManager.setSelectedAircraft(aircraftId);
            logger.debug('ConflictsPanel', `Selected aircraft from conflicts: ${aircraftId}`);

            // Emit custom event for map to handle zoom/pan
            const event = new CustomEvent('aircraft-single-click', {
                detail: { aircraftId, index }
            });
            document.dispatchEvent(event);
        }
    }

    /**
     * Handle double click on conflict item (zoom/follow behavior)
     */
    private handleConflictDoubleClick(aircraftId: string, index: number): void {
        if (!this.stateManager) return;

        // Select aircraft
        this.stateManager.setSelectedAircraft(aircraftId);

        // Emit custom event for map to handle zoom/follow
        const event = new CustomEvent('aircraft-double-click', {
            detail: { aircraftId, index }
        });
        document.dispatchEvent(event);

        logger.debug('ConflictsPanel', `Double-clicked conflict aircraft: ${aircraftId} - zooming/following`);
    }

    /**
     * Update visual selection state for all conflict items
     */
    private updateSelectionVisuals(): void {
        if (!this.conflictsInfoElement) return;

        const conflictItems = this.conflictsInfoElement.querySelectorAll('.conflict-item');
        conflictItems.forEach(item => {
            const htmlItem = item as HTMLElement;
            const aircraftId = htmlItem.getAttribute('data-aircraft-id');

            if (this.selectedAircraft === aircraftId) {
                htmlItem.classList.add('selected');
            } else {
                htmlItem.classList.remove('selected');
            }
        });
    }

    /**
     * Clear the conflicts display
     */
    public clearConflicts(): void {
        if (this.conflictsInfoElement) {
            this.conflictsInfoElement.innerHTML = '<div class="no-conflicts">No conflicts detected</div>';
            this.lastConflictIds = [];
        }
    }

    protected onDestroy(): void {
        // Clear all click timeouts
        this.clickTimeouts.forEach(timeout => clearTimeout(timeout));
        this.clickTimeouts.clear();
        this.lastConflictIds = [];
    }
}
