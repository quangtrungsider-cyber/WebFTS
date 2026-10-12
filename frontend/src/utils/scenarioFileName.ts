/**
 * Utility functions for scenario file name and command generation
 */

/**
 * Extract scenario base name (remove .scn extension if present, trim whitespace)
 */
export function getScenarioBaseName(fileName: string): string {
  if (!fileName) return '';
  // Remove .scn from the end (case-insensitive) and trim
  let baseName = fileName.trim();
  if (baseName.toLowerCase().endsWith('.scn')) {
    baseName = baseName.slice(0, -4);
  }
  return baseName.trim();
}

/**
 * Generate BlueSky command to load the scenario (IC command without .scn suffix)
 */
export function buildIcCommand(fileNameOrBaseName: string): string {
  const baseName = getScenarioBaseName(fileNameOrBaseName);
  return `IC ${baseName}`;
}

/**
 * Sanitize input to generate a safe scenario file name with .scn extension
 */
export function sanitizeScenarioFileName(input: string): string {
  if (!input) return 'untitled_scenario.scn';
  
  // Convert Vietnamese accented characters to non-accented
  let str = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Replace spaces and special chars with underscores
  str = str.replace(/\s+/g, '_');
  
  // Keep only alphanumeric, underscores, hyphens, and dots
  str = str.replace(/[^a-zA-Z0-9_\-\.]/g, '');
  
  // Convert to lowercase for clean filesystem names
  str = str.toLowerCase();
  
  // Remove dangerous path traversals
  str = str.replace(/\.+/g, '.'); // collapse multiple dots
  str = str.replace(/[\/\\]/g, ''); // strip slashes
  
  // Ensure it has .scn suffix
  const base = getScenarioBaseName(str);
  return `${base || 'scenario'}.scn`;
}
