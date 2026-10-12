import { Map as MapLibreMap } from 'maplibre-gl';
import { logger } from '../../utils/Logger';

/**
 * VietnameseAirports - Handles rendering of Vietnamese airports with ICAO codes
 * and names on the MapLibre GL map.
 */
export class VietnameseAirports {
    // List of major and domestic airports in Vietnam
    private static readonly AIRPORTS_DATA = {
        type: 'FeatureCollection' as const,
        features: [
            // International Airports (Priority 1)
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [106.6519, 10.8188] },
                properties: { icao: 'VVTS', name: 'Tan Son Nhat Intl', priority: 1 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [105.8072, 21.2212] },
                properties: { icao: 'VVNB', name: 'Noi Bai Intl', priority: 1 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [108.1994, 16.0439] },
                properties: { icao: 'VVDN', name: 'Da Nang Intl', priority: 1 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [109.2194, 11.9981] },
                properties: { icao: 'VVCR', name: 'Cam Ranh Intl', priority: 1 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [103.9961, 10.1691] },
                properties: { icao: 'VVPQ', name: 'Phu Quoc Intl', priority: 1 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [107.4161, 21.1147] },
                properties: { icao: 'VVVD', name: 'Van Don Intl', priority: 1 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [106.7247, 20.8189] },
                properties: { icao: 'VVCI', name: 'Cat Bi Intl', priority: 1 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [107.7003, 16.4017] },
                properties: { icao: 'VVPB', name: 'Phu Bai Intl', priority: 1 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [105.6706, 18.7364] },
                properties: { icao: 'VVVH', name: 'Vinh Intl', priority: 1 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [105.4678, 19.9014] },
                properties: { icao: 'VVTX', name: 'Tho Xuan', priority: 2 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [109.0433, 13.9547] },
                properties: { icao: 'VVPC', name: 'Phu Cat', priority: 2 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [108.3728, 11.7506] },
                properties: { icao: 'VVDL', name: 'Lien Khuong', priority: 2 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [108.0167, 14.0044] },
                properties: { icao: 'VVPK', name: 'Pleiku', priority: 2 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [108.1203, 12.6681] },
                properties: { icao: 'VVBM', name: 'Buon Ma Thuot', priority: 2 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [109.3339, 13.0489] },
                properties: { icao: 'VVTH', name: 'Tuy Hoa', priority: 2 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [108.7050, 15.4122] },
                properties: { icao: 'VVCA', name: 'Chu Lai', priority: 2 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [106.5906, 17.5150] },
                properties: { icao: 'VVDH', name: 'Dong Hoi', priority: 2 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [103.0078, 21.3972] },
                properties: { icao: 'VVDB', name: 'Dien Bien Phu', priority: 2 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [106.6322, 8.7322] },
                properties: { icao: 'VVCS', name: 'Con Dao', priority: 2 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [105.1324, 9.9575] },
                properties: { icao: 'VVRG', name: 'Rach Gia', priority: 2 }
            },
            {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: [105.1775, 9.1764] },
                properties: { icao: 'VVCM', name: 'Ca Mau', priority: 2 }
            }
        ]
    };

    // IATA -> ICAO mapping (AIRPORTS_DATA only carries ICAO codes)
    private static readonly IATA_TO_ICAO: Record<string, string> = {
        SGN: 'VVTS', HAN: 'VVNB', DAD: 'VVDN', CXR: 'VVCR', PQC: 'VVPQ',
        VDO: 'VVVD', HPH: 'VVCI', HUI: 'VVPB', VII: 'VVVH', THD: 'VVTX',
        UIH: 'VVPC', DLI: 'VVDL', PXU: 'VVPK', BMV: 'VVBM', TBB: 'VVTH',
        VCL: 'VVCA', VDH: 'VVDH', DIN: 'VVDB', VCS: 'VVCS', VKG: 'VVRG',
        CAH: 'VVCM'
    };

    /**
     * Look up an airport by its ICAO or IATA code (case-insensitive).
     * Returns the coordinates ([lon, lat]) and name, or null if not found.
     */
    public static findByCode(code: string): { icao: string; name: string; lon: number; lat: number } | null {
        const normalized = code.trim().toUpperCase();
        const icao = this.IATA_TO_ICAO[normalized] ?? normalized;
        const feature = this.AIRPORTS_DATA.features.find((f) => f.properties.icao === icao);
        if (!feature) return null;

        const [lon, lat] = feature.geometry.coordinates;
        return { icao: feature.properties.icao, name: feature.properties.name, lon, lat };
    }

    /**
     * Set up the Vietnamese airports source and layers on the map.
     * Safe to call multiple times (cleans up existing layers/sources first).
     */
    public static setupAirportsLayer(map: MapLibreMap): void {
        const sourceId = 'vietnamese-airports';
        const glowLayerId = 'vietnamese-airports-glow';
        const circleLayerId = 'vietnamese-airports-circles';
        const labelsLayerId = 'vietnamese-airports-labels';

        try {
            // 1. Clean up existing layers and source to prevent duplicates or errors
            if (map.getLayer(labelsLayerId)) map.removeLayer(labelsLayerId);
            if (map.getLayer(circleLayerId)) map.removeLayer(circleLayerId);
            if (map.getLayer(glowLayerId)) map.removeLayer(glowLayerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);

            // 2. Add GeoJSON Source
            map.addSource(sourceId, {
                type: 'geojson',
                data: this.AIRPORTS_DATA
            });

            // 3. Add Outer Glow Layer (glowing neon cyan aura)
            map.addLayer({
                id: glowLayerId,
                type: 'circle',
                source: sourceId,
                paint: {
                    'circle-radius': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        4, 4,
                        8, 7,
                        12, 10
                    ],
                    'circle-color': '#00f0ff',
                    'circle-opacity': 0.25,
                    'circle-pitch-alignment': 'map'
                }
            });

            // 4. Add Center Circle Layer (sharp center dot)
            map.addLayer({
                id: circleLayerId,
                type: 'circle',
                source: sourceId,
                paint: {
                    'circle-radius': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        4, 1.5,
                        8, 3,
                        12, 4
                    ],
                    'circle-color': '#00f0ff',
                    'circle-stroke-color': '#060913',
                    'circle-stroke-width': 1.5,
                    'circle-pitch-alignment': 'map'
                }
            });

            // 5. Add Labels Layer (ICAO code and Name)
            map.addLayer({
                id: labelsLayerId,
                type: 'symbol',
                source: sourceId,
                layout: {
                    'text-field': ['concat', ['get', 'icao'], '\n', ['get', 'name']],
                    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                    'text-size': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        4, 7.5,
                        8, 10,
                        12, 11
                    ],
                    'text-offset': [0, 1.2],
                    'text-anchor': 'top',
                    'text-allow-overlap': false, // Avoid overlapping labels
                    'text-ignore-placement': false,
                    'symbol-sort-key': ['get', 'priority'] // Render Priority 1 first
                },
                paint: {
                    'text-color': '#00f0ff',
                    'text-halo-color': '#060913',
                    'text-halo-width': 2,
                    'text-halo-blur': 0.5
                }
            });

            logger.info('VietnameseAirports', 'Successfully loaded Vietnamese airports layer onto the map');

        } catch (error) {
            logger.error('VietnameseAirports', 'Error setting up airports layer:', error);
        }
    }
}
