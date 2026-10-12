/**
 * DataProcessor - Unit conversion and data formatting utilities
 *
 * Provides centralized unit conversion for display across the application.
 * BlueSky server sends data in specific units:
 * - Speed: meters per second (m/s)
 * - Altitude: meters (m)
 * - Vertical Speed: meters per second (m/s)
 */

import { AircraftData, DisplayOptions, SpeedType, SpeedUnit, AltitudeUnit, VerticalSpeedUnit } from './types';

export class DataProcessor {
    /**
     * Convert speed from m/s to target unit
     */
    static convertSpeed(speedMs: number, targetUnit: SpeedUnit): number {
        switch (targetUnit) {
            case 'knots':
                return speedMs / 0.514444;
            case 'km/h':
                return speedMs * 3.6;
            case 'mph':
                return speedMs * 2.23694;
            case 'm/s':
            default:
                return speedMs;
        }
    }

    /**
     * Format speed value with unit label
     */
    static formatSpeed(speedMs: number, unit: SpeedUnit): string {
        const converted = this.convertSpeed(speedMs, unit);
        const rounded = Math.round(converted);

        switch (unit) {
            case 'm/s':
                return `${rounded} m/s`;
            case 'km/h':
                return `${rounded} km/h`;
            case 'mph':
                return `${rounded} mph`;
            case 'knots':
            default:
                return `${rounded} kt`;
        }
    }

    /**
     * Convert altitude from meters (BlueSky server unit) to target unit
     */
    static convertAltitude(altMeters: number, targetUnit: AltitudeUnit): number {
        switch (targetUnit) {
            case 'm':
                return altMeters;
            case 'km':
                return altMeters / 1000;
            case 'ft':
                return altMeters / 0.3048;
            case 'fl':
                return (altMeters / 0.3048) / 100; // Convert to feet, then to Flight Level
            default:
                return altMeters;
        }
    }

    /**
     * Format altitude value with unit label
     */
    static formatAltitude(altMeters: number, unit: AltitudeUnit): string {
        const converted = this.convertAltitude(altMeters, unit);

        switch (unit) {
            case 'm':
                return `${Math.round(converted)} m`;
            case 'km':
                return `${converted.toFixed(2)} km`;
            case 'ft':
                return `${Math.round(converted)} ft`;
            case 'fl':
                return `FL${Math.round(converted).toString().padStart(3, '0')}`;
            default:
                return `${Math.round(converted)} ft`;
        }
    }

    /**
     * Convert vertical speed from meters per second to target unit
     */
    static convertVerticalSpeed(vsMs: number, targetUnit: VerticalSpeedUnit): number {
        switch (targetUnit) {
            case 'm/s':
                return vsMs;
            case 'm/min':
                return vsMs * 60;
            case 'ft/min':
                return (vsMs / 0.3048) * 60;
            default:
                return vsMs;
        }
    }

    /**
     * Format vertical speed value with unit label
     */
    static formatVerticalSpeed(vsMs: number, unit: VerticalSpeedUnit): string {
        const converted = this.convertVerticalSpeed(vsMs, unit);
        const rounded = Math.round(converted);

        switch (unit) {
            case 'm/s':
                return `${rounded} m/s`;
            case 'm/min':
                return `${rounded} m/min`;
            case 'ft/min':
                return `${rounded} ft/min`;
            default:
                return `${rounded} m/s`;
        }
    }

    /**
     * Get speed value for aircraft based on speed type (CAS/TAS/GS)
     * Handles missing data gracefully with fallback to TAS
     */
    static getSpeedValue(data: AircraftData, index: number, type: SpeedType): number {
        switch (type) {
            case 'cas':
                // If CAS not available, fall back to TAS
                return (data.cas && data.cas[index]) || data.tas[index] || 0;
            case 'tas':
                return data.tas[index] || 0;
            case 'gs':
                // Fallback chain: gs -> tas -> cas
                return (data.gs && data.gs[index]) || data.tas[index] || (data.cas && data.cas[index]) || 0;
            default:
                return data.tas[index] || 0;
        }
    }

    /**
     * Reverse conversion: Convert speed from any unit to knots (for BlueSky commands)
     */
    static speedToKnots(value: number, fromUnit: SpeedUnit): number {
        switch (fromUnit) {
            case 'm/s':
                return value / 0.514444;
            case 'km/h':
                return value / 1.852;
            case 'mph':
                return value / 1.15078;
            case 'knots':
            default:
                return value;
        }
    }

    /**
     * Reverse conversion: Convert altitude from any unit to feet (for BlueSky commands)
     */
    static altitudeToFeet(value: number, fromUnit: AltitudeUnit): number {
        switch (fromUnit) {
            case 'm':
                return value / 0.3048;
            case 'km':
                return value / 0.0003048;
            case 'ft':
                return value;
            case 'fl':
                return value * 100; // Flight Level to feet
            default:
                return value;
        }
    }

    private static speedUnitSuffix(unit: SpeedUnit): string {
        switch (unit) {
            case 'knots':
                return 'kt';
            case 'km/h':
                return 'km/h';
            case 'mph':
                return 'mph';
            case 'm/s':
                return 'm/s';
            default:
                return 'kt';
        }
    }

    /**
     * Builds the same multi-line aircraft label text (ID / type / speed / altitude)
     * used by both the 2D map label and the 3D-model-anchored label overlay, so the
     * two stay in sync and respect the same display option toggles.
     */
    static formatAircraftLabel(aircraftData: AircraftData, index: number, displayOptions: DisplayOptions): string {
        const id = aircraftData.id[index];
        const actype = aircraftData.actype && aircraftData.actype[index] ? aircraftData.actype[index] : '';
        const altitude = aircraftData.alt ? aircraftData.alt[index] : 0;
        const verticalSpeed = aircraftData.vs ? aircraftData.vs[index] : 0;
        const speed = this.getSpeedValue(aircraftData, index, displayOptions.speedType);

        const labelParts: string[] = [];

        if (displayOptions.showAircraftId) {
            labelParts.push(id);
        }

        if (displayOptions.showAircraftType && actype) {
            labelParts.push(actype);
        }

        if (displayOptions.showAircraftSpeed && speed > 0) {
            // Speed values from BlueSky are in knots, format using DataProcessor
            const speedValue = Math.round(this.convertSpeed(speed, displayOptions.speedUnit));
            labelParts.push(`${speedValue}${this.speedUnitSuffix(displayOptions.speedUnit)}`);
        }

        if (displayOptions.showAircraftAltitude && altitude > 0) {
            // Altitude values from BlueSky are in meters, format using DataProcessor
            const converted = this.convertAltitude(altitude, displayOptions.altitudeUnit);
            let altitudeLabel: string;

            switch (displayOptions.altitudeUnit) {
                case 'fl':
                    altitudeLabel = 'FL' + Math.round(converted).toString().padStart(3, '0');
                    break;
                case 'km':
                    altitudeLabel = converted.toFixed(1) + 'km';
                    break;
                case 'ft':
                    altitudeLabel = Math.round(converted).toString() + 'ft';
                    break;
                case 'm':
                    altitudeLabel = Math.round(converted).toString() + 'm';
                    break;
                default:
                    altitudeLabel = Math.round(converted).toString();
                    break;
            }

            if (Math.abs(verticalSpeed) > 0.5) {
                altitudeLabel += verticalSpeed > 0 ? '↑' : '↓';
            }

            labelParts.push(altitudeLabel);
        }

        return labelParts.join('\n');
    }
}

export default DataProcessor;
