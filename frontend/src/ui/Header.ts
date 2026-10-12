/**
 * Header - Manages the top application header bar
 *
 * This class handles all functionality in the header section including:
 * - Simulation controls (play, pause, reset, speed adjustment)
 * - Connection status display
 * - Simulation time and rate display
 * - Menu dropdown
 * - Settings button
 * - Layout reset button
 *
 * The header is NOT a panel - it's a persistent top-level UI component.
 */

import { SocketManager } from '../core/SocketManager';
import { StateManager } from '../core/StateManager';
import { MapDisplay } from './map/MapDisplay';
import { VietnameseAirports } from './map/VietnameseAirports';
import { SimInfo } from '../data/types';
import { settingsModal } from './SettingsModal';
import { logger } from '../utils/Logger';

export class Header {
    // DOM Elements - Left side
    private headerElement: HTMLElement | null = null;
    private connectionStatusElement: HTMLElement | null = null;

    // DOM Elements - Right side controls
    private playButton: HTMLElement | null = null;
    private playPauseButton: HTMLElement | null = null;
    private resetButton: HTMLElement | null = null;
    private speedSelect: HTMLSelectElement | null = null;
    private menuDropdownButton: HTMLElement | null = null;
    private menuDropdown: HTMLElement | null = null;
    private settingsButton: HTMLElement | null = null;
    private resetLayoutButton: HTMLElement | null = null;

    // DOM Elements - Airport search
    private airportSearchInput: HTMLInputElement | null = null;
    private airportSearchFeedback: HTMLElement | null = null;
    private airportSearchFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

    // DOM Elements - Simulation display
    private simTimeElement: HTMLElement | null = null;
    private simRateElement: HTMLElement | null = null;

    // DOM Elements - Fullscreen floating sim bar
    private fsSimTimeElement: HTMLElement | null = null;
    private fsSimRateElement: HTMLElement | null = null;
    private fsPlayButton: HTMLElement | null = null;
    private fsPlayPauseButton: HTMLElement | null = null;
    private fsResetButton: HTMLElement | null = null;
    private fsSpeedSelect: HTMLSelectElement | null = null;

    // State
    private socketManager: SocketManager | null = null;
    private stateManager: StateManager | null = null;
    private mapDisplay: MapDisplay | null = null;
    private lastIsRunning: boolean | null = null;
    private eventListeners: Array<{
        element: HTMLElement | Document;
        event: string;
        handler: EventListener;
    }> = [];

    /**
     * Initialize the header
     * Must be called after DOM is ready
     */
    public init(): void {
        this.headerElement = document.querySelector('.header');

        if (!this.headerElement) {
            console.warn('[Header] Header element not found');
            return;
        }

        // Initialize DOM references
        this.initializeDOMReferences();

        // Set up event listeners
        this.setupEventListeners();

        // Initialize display
        this.updateConnectionStatus('Not Configured');
        this.updateSimTime('--:--:--');
        this.updateSimRate('1x');

        logger.info('Header', 'Header initialized');
    }

    /**
     * Initialize references to DOM elements
     */
    private initializeDOMReferences(): void {
        // Left side elements
        this.connectionStatusElement = document.getElementById('bluesky-connection-status');

        // Control buttons
        this.playButton = document.getElementById('play-btn');
        this.playPauseButton = document.getElementById('play-pause-btn');
        this.resetButton = document.getElementById('reset-btn');
        this.speedSelect = document.getElementById('speed-select') as HTMLSelectElement;
        this.menuDropdownButton = document.getElementById('menu-dropdown-btn');
        this.menuDropdown = document.getElementById('menu-dropdown');
        this.settingsButton = document.getElementById('settings-btn');
        this.resetLayoutButton = document.getElementById('reset-layout-btn');

        // Airport search
        this.airportSearchInput = document.getElementById('airport-search-input') as HTMLInputElement;
        this.airportSearchFeedback = document.getElementById('airport-search-feedback');

        // Simulation display elements
        this.simTimeElement = document.getElementById('sim-time');
        this.simRateElement = document.getElementById('sim-rate');

        // Fullscreen floating bar elements
        this.fsSimTimeElement = document.getElementById('fs-sim-time');
        this.fsSimRateElement = document.getElementById('fs-sim-rate');
        this.fsPlayButton = document.getElementById('fs-play-btn');
        this.fsPlayPauseButton = document.getElementById('fs-play-pause-btn');
        this.fsResetButton = document.getElementById('fs-reset-btn');
        this.fsSpeedSelect = document.getElementById('fs-speed-select') as HTMLSelectElement;
    }

    /**
     * Set up all event listeners for header controls
     */
    private setupEventListeners(): void {
        // Play button
        if (this.playButton) {
            this.addEventListener(this.playButton, 'click', () => {
                this.handlePlayClick();
            });
        }

        // Play/Pause toggle button
        if (this.playPauseButton) {
            this.addEventListener(this.playPauseButton, 'click', () => {
                this.handlePlayPauseClick();
            });
        }

        // Reset button
        if (this.resetButton) {
            this.addEventListener(this.resetButton, 'click', () => {
                this.handleResetClick();
            });
        }

        // Speed selector
        if (this.speedSelect) {
            this.addEventListener(this.speedSelect, 'change', (e) => {
                this.handleSpeedChange(e as Event);
            });
        }

        // Menu dropdown button
        if (this.menuDropdownButton) {
            this.addEventListener(this.menuDropdownButton, 'click', (e) => {
                e.stopPropagation();
                this.toggleMenuDropdown();
            });
        }

        // Settings button
        if (this.settingsButton) {
            this.addEventListener(this.settingsButton, 'click', () => {
                this.handleSettingsClick();
            });
        }

        // Reset layout button
        if (this.resetLayoutButton) {
            this.addEventListener(this.resetLayoutButton, 'click', () => {
                this.handleResetLayoutClick();
            });
        }

        // Airport search input
        if (this.airportSearchInput) {
            this.addEventListener(this.airportSearchInput, 'keydown', (e) => {
                const keyEvent = e as KeyboardEvent;
                if (keyEvent.key === 'Enter') {
                    this.handleAirportSearch();
                }
            });
        }

        // Close menu dropdown when clicking outside
        this.addEventListener(document, 'click', (e) => {
            this.handleDocumentClick(e as MouseEvent);
        });

        // Fullscreen floating bar buttons
        if (this.fsPlayButton) {
            this.addEventListener(this.fsPlayButton, 'click', () => this.handlePlayClick());
        }
        if (this.fsPlayPauseButton) {
            this.addEventListener(this.fsPlayPauseButton, 'click', () => this.handlePlayPauseClick());
        }
        if (this.fsResetButton) {
            this.addEventListener(this.fsResetButton, 'click', () => this.handleResetClick());
        }
        if (this.fsSpeedSelect) {
            this.addEventListener(this.fsSpeedSelect, 'change', (e) => this.handleSpeedChange(e as Event));
        }
    }

    /**
     * Add an event listener and track it for cleanup
     */
    private addEventListener(
        element: HTMLElement | Document,
        event: string,
        handler: EventListener
    ): void {
        element.addEventListener(event, handler);
        this.eventListeners.push({ element, event, handler });
    }

    /**
     * Set the socket manager instance
     */
    public setSocketManager(socketManager: SocketManager): void {
        this.socketManager = socketManager;
    }

    /**
     * Set the state manager instance
     */
    public setStateManager(stateManager: StateManager): void {
        this.stateManager = stateManager;
    }

    /**
     * Set the map display instance (used by the airport search box)
     */
    public setMapDisplay(mapDisplay: MapDisplay): void {
        this.mapDisplay = mapDisplay;
    }

    // ========================================
    // Event Handlers
    // ========================================

    /**
     * Handle Enter key in the airport search box: look up the ICAO/IATA
     * code and fly the map to that airport.
     */
    private handleAirportSearch(): void {
        if (!this.airportSearchInput) return;

        const code = this.airportSearchInput.value.trim();
        if (!code) return;

        const airport = VietnameseAirports.findByCode(code);
        if (!airport) {
            this.showAirportSearchFeedback(`Không tìm thấy "${code}"`, 'error');
            return;
        }

        if (!this.mapDisplay || !this.mapDisplay.isInitialized()) {
            this.showAirportSearchFeedback('Bản đồ chưa sẵn sàng', 'error');
            return;
        }

        const map = this.mapDisplay.getMap();
        if (map) {
            map.flyTo({ center: [airport.lon, airport.lat], zoom: 11 });
        } else {
            this.mapDisplay.panTo(airport.lat, airport.lon);
        }

        this.showAirportSearchFeedback(`${airport.icao} - ${airport.name}`, 'success');
        logger.info('Header', `Airport search: jumped to ${airport.icao} (${airport.name})`);
    }

    /**
     * Show transient feedback next to the airport search box
     */
    private showAirportSearchFeedback(message: string, type: 'success' | 'error'): void {
        if (!this.airportSearchFeedback) return;

        this.airportSearchFeedback.textContent = message;
        this.airportSearchFeedback.className = `airport-search-feedback ${type}`;

        if (this.airportSearchFeedbackTimeout) {
            clearTimeout(this.airportSearchFeedbackTimeout);
        }
        this.airportSearchFeedbackTimeout = setTimeout(() => {
            if (this.airportSearchFeedback) {
                this.airportSearchFeedback.textContent = '';
                this.airportSearchFeedback.className = 'airport-search-feedback';
            }
        }, 3000);
    }

    /**
     * Handle play button click
     */
    private handlePlayClick(): void {
        if (this.socketManager) {
            this.socketManager.sendCommand('OP');
            logger.debug('Header', 'Play command sent');
        }
    }

    /**
     * Handle play/pause toggle button click
     */
    private handlePlayPauseClick(): void {
        if (!this.stateManager || !this.socketManager) return;

        const state = this.stateManager.getState();
        const isPaused = state.simInfo?.speed === 0;

        this.socketManager.sendCommand(isPaused ? 'OP' : 'HOLD');
        logger.info('Header', `${isPaused ? 'Resuming simulation' : 'Pausing simulation'}`);
    }

    /**
     * Handle reset button click
     */
    private handleResetClick(): void {
        if (this.socketManager) {
            this.socketManager.sendCommand('RESET');
            logger.debug('Header', 'Reset command sent');
        }
    }

    /**
     * Handle speed selector change
     */
    private handleSpeedChange(event: Event): void {
        if (!this.socketManager) return;

        const target = event.target as HTMLSelectElement;
        const speed = parseFloat(target.value);

        const simState = this.stateManager?.getSimulationState();
        const isRunning = simState?.state === 'OP';

        if (isRunning) {
            this.socketManager.sendCommand(`DTMULT ${speed}`);
        } else {
            // Sim is paused/init: resume, then set multiplier after a short delay
            // so the server processes the two commands in order.
            this.socketManager.sendCommand('OP');
            setTimeout(() => {
                this.socketManager?.sendCommand(`DTMULT ${speed}`);
            }, 300);
        }
        logger.info('Header', `Simulation speed set to ${speed}x`);
    }

    /**
     * Handle settings button click
     */
    private handleSettingsClick(): void {
        // Open settings modal using the SettingsModal singleton
        settingsModal.open();
        logger.debug('Header', 'Settings modal opened via Header');
    }

    /**
     * Handle reset layout button click
     */
    private handleResetLayoutClick(): void {
        // This will be handled by PanelResizer
        // We emit a custom event that the App can listen to
        const event = new CustomEvent('resetLayout');
        window.dispatchEvent(event);
        logger.info('Header', 'Reset layout requested');
    }

    /**
     * Handle document click for closing dropdown
     */
    private handleDocumentClick(event: MouseEvent): void {
        if (!this.menuDropdown || !this.menuDropdownButton) return;

        const target = event.target as Node;

        // Close dropdown if clicking outside
        if (!this.menuDropdown.contains(target) && !this.menuDropdownButton.contains(target)) {
            this.closeMenuDropdown();
        }

    }

    // ========================================
    // Menu Dropdown Methods
    // ========================================

    /**
     * Toggle menu dropdown visibility
     */
    private toggleMenuDropdown(): void {
        if (!this.menuDropdown) return;

        const isVisible = this.menuDropdown.style.display === 'block';
        this.menuDropdown.style.display = isVisible ? 'none' : 'block';
    }

    /**
     * Close menu dropdown
     */
    private closeMenuDropdown(): void {
        if (this.menuDropdown) {
            this.menuDropdown.style.display = 'none';
        }
    }

    /**
     * Open menu dropdown
     */
    public openMenuDropdown(): void {
        if (this.menuDropdown) {
            this.menuDropdown.style.display = 'block';
        }
    }

    // ========================================
    // Display Update Methods
    // ========================================

    /**
     * Update connection status display
     */
    public updateConnectionStatus(status: string): void {
        if (this.connectionStatusElement) {
            this.connectionStatusElement.textContent = status;

            // Update CSS class based on status
            // Default to waiting/yellow state for disconnected messages
            this.connectionStatusElement.className = 'status-waiting';

            if (status.toLowerCase().includes('connected') &&
                !status.toLowerCase().includes('disconnected')) {
                // Connected state - green
                this.connectionStatusElement.className = 'status-connected';
            } else if (status.toLowerCase().includes('error')) {
                // Error state - red
                this.connectionStatusElement.className = 'status-disconnected';
            }
            // Disconnected messages stay as status-waiting (yellow/orange)
        }
    }

    /**
     * Update simulation time display
     */
    public updateSimTime(timeString: string): void {
        if (this.simTimeElement && this.simTimeElement.textContent !== timeString) {
            this.simTimeElement.textContent = timeString;
        }
        if (this.fsSimTimeElement && this.fsSimTimeElement.textContent !== timeString) {
            this.fsSimTimeElement.textContent = timeString;
        }
    }

    /**
     * Update simulation rate display
     */
    public updateSimRate(rateString: string): void {
        const displayText = rateString.startsWith('Rate:') ? rateString : `Rate: ${rateString}`;
        if (this.simRateElement && this.simRateElement.textContent !== displayText) {
            this.simRateElement.textContent = displayText;
        }
        if (this.fsSimRateElement && this.fsSimRateElement.textContent !== displayText) {
            this.fsSimRateElement.textContent = displayText;
        }
    }

    /**
     * Update all simulation info at once
     */
    public updateSimInfo(simInfo: SimInfo): void {
        // Update time display
        if (simInfo.simt !== undefined) {
            const timeStr = this.formatSimTime(simInfo.simt);
            this.updateSimTime(timeStr);
        }

        // Update rate display (rounded to 1 decimal point)
        if (simInfo.speed !== undefined) {
            const roundedSpeed = Math.round(simInfo.speed * 10) / 10;
            const rateStr = `${roundedSpeed}x`;
            this.updateSimRate(rateStr);
        }

        // Update speed selector to match current speed
        if (this.speedSelect && simInfo.speed !== undefined) {
            this.updateSpeedSelector(simInfo.speed);
        }

        // Toggle which simulation controls are usable based on run state
        this.updateControlsForSimState(simInfo);
    }

    /**
     * Enable the OP (play) button only when the sim is paused/idle, and
     * enable the pause toggle and speed selector only when the sim is running.
     * BlueSky simstate: 0=INIT, 1=HOLD, 2=OP, 3=END.
     */
    private updateControlsForSimState(simInfo: SimInfo): void {
        const isRunning = simInfo?.state === 2;

        if (this.lastIsRunning === isRunning) return;
        this.lastIsRunning = isRunning;

        this.setControlEnabled(this.playButton, !isRunning);
        this.setControlEnabled(this.playPauseButton, isRunning);
        this.setControlEnabled(this.speedSelect, isRunning);

        // Mirror state to fullscreen bar
        this.setControlEnabled(this.fsPlayButton, !isRunning);
        this.setControlEnabled(this.fsPlayPauseButton, isRunning);
        this.setControlEnabled(this.fsSpeedSelect, isRunning);

        // Tell the user *why* a button is inactive when they hover over it.
        if (this.playButton) {
            this.playButton.title = isRunning ? 'Simulation is already running' : '';
        }
        if (this.playPauseButton) {
            this.playPauseButton.title = isRunning ? '' : 'Simulation is not running';
        }
        if (this.fsPlayButton) {
            this.fsPlayButton.title = isRunning ? 'Simulation is already running' : 'Start';
        }
        if (this.fsPlayPauseButton) {
            this.fsPlayPauseButton.title = isRunning ? 'Pause/Resume' : 'Simulation is not running';
        }
    }

    /**
     * Toggle the disabled state + styling on a single control.
     */
    private setControlEnabled(
        control: HTMLElement | HTMLSelectElement | null,
        enabled: boolean
    ): void {
        if (!control) return;
        if (enabled) {
            control.removeAttribute('disabled');
            control.classList.remove('disabled');
        } else {
            control.setAttribute('disabled', 'true');
            control.classList.add('disabled');
        }
    }

    /**
     * Update speed selector dropdown to match current simulation speed
     * Handles both predefined speeds and custom speeds not in the menu
     */
    private updateSpeedSelector(speed: number): void {
        if (!this.speedSelect) return;

        // Round speed to match how we round the rate display
        const roundedSpeed = Math.round(speed * 10) / 10;
        const speedStr = String(roundedSpeed);

        // Check if this speed exists as an option in the dropdown
        let optionExists = false;
        for (let i = 0; i < this.speedSelect.options.length; i++) {
            const option = this.speedSelect.options[i];
            // Skip the "Other" option when checking
            if (option.dataset.other === 'true') continue;

            if (option.value === speedStr) {
                optionExists = true;
                break;
            }
        }

        if (optionExists) {
            // Speed exists in dropdown - select it
            this.speedSelect.value = speedStr;
            if (this.fsSpeedSelect) this.fsSpeedSelect.value = speedStr;
        } else {
            // Speed doesn't exist - ensure "Other" option exists and select it
            this.ensureOtherOptionExists();

            // Select the "Other" option
            for (let i = 0; i < this.speedSelect.options.length; i++) {
                if (this.speedSelect.options[i].dataset.other === 'true') {
                    this.speedSelect.selectedIndex = i;
                    break;
                }
            }
        }
    }

    /**
     * Ensure the "Other" option exists in the speed selector
     * This option is disabled and shown when speed doesn't match predefined values
     */
    private ensureOtherOptionExists(): void {
        if (!this.speedSelect) return;

        // Check if "Other" option already exists
        let otherExists = false;
        for (let i = 0; i < this.speedSelect.options.length; i++) {
            if (this.speedSelect.options[i].dataset.other === 'true') {
                otherExists = true;
                break;
            }
        }

        // Add "Other" option if it doesn't exist
        if (!otherExists) {
            const otherOption = document.createElement('option');
            otherOption.value = 'other';
            otherOption.textContent = 'Other';
            otherOption.disabled = true;
            otherOption.dataset.other = 'true';
            this.speedSelect.add(otherOption);
        }
    }

    /**
     * Format simulation time for display
     */
    private formatSimTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // ========================================
    // State Methods
    // ========================================

    /**
     * Enable/disable header controls based on connection state
     */
    public setControlsEnabled(enabled: boolean): void {
        const controls = [
            this.playButton,
            this.playPauseButton,
            this.resetButton,
            this.speedSelect
        ];

        controls.forEach(control => {
            if (control) {
                if (enabled) {
                    control.removeAttribute('disabled');
                    control.classList.remove('disabled');
                } else {
                    control.setAttribute('disabled', 'true');
                    control.classList.add('disabled');
                }
            }
        });
    }

    /**
     * Show the header
     */
    public show(): void {
        if (this.headerElement) {
            this.headerElement.style.display = '';
        }
    }

    /**
     * Hide the header
     */
    public hide(): void {
        if (this.headerElement) {
            this.headerElement.style.display = 'none';
        }
    }

    /**
     * Check if header is visible
     */
    public isVisible(): boolean {
        if (!this.headerElement) return false;
        return this.headerElement.style.display !== 'none';
    }

    // ========================================
    // Cleanup
    // ========================================

    /**
     * Clean up header resources
     */
    public destroy(): void {
        if (this.airportSearchFeedbackTimeout) {
            clearTimeout(this.airportSearchFeedbackTimeout);
            this.airportSearchFeedbackTimeout = null;
        }

        // Remove all event listeners
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = [];

        // Clear references
        this.socketManager = null;
        this.stateManager = null;

        logger.info('Header', 'Header destroyed');
    }
}
