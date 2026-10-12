/**
 * Geographic Math Utilities
 */

/**
 * Calculate the great circle distance between two coordinates in Nautical Miles (NM)
 * using the Haversine formula.
 * 
 * @param lat1 Latitude of point 1 in degrees
 * @param lon1 Longitude of point 1 in degrees
 * @param lat2 Latitude of point 2 in degrees
 * @param lon2 Longitude of point 2 in degrees
 * @returns Distance in Nautical Miles
 */
export function calculateDistanceNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3440.065; // Earth radius in Nautical Miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
        
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Calculate the initial true bearing between two coordinates in degrees (0-360)
 * 
 * @param lat1 Latitude of point 1 in degrees
 * @param lon1 Longitude of point 1 in degrees
 * @param lat2 Latitude of point 2 in degrees
 * @param lon2 Longitude of point 2 in degrees
 * @returns True bearing in degrees
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const dLonRad = (lon2 - lon1) * Math.PI / 180;

    const y = Math.sin(dLonRad) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLonRad);
              
    let brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
}
