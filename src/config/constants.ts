/**
 * Constants
 * 
 * Fixed values that are not meant to be seeded or changed at runtime.
 * These represent system limits, UI presets, and algorithm parameters.
 */

export interface Resolution {
    name: string;
    width: number;
    height: number;
    description: string;
}

export const RESOLUTION_PRESETS: Resolution[] = [
    { name: '4K Ultra HD', width: 3840, height: 2160, description: 'Desktop wallpaper, prints' },
    { name: '2K QHD', width: 2560, height: 1440, description: 'High-res desktop' },
    { name: 'Full HD', width: 1920, height: 1080, description: 'Standard desktop' },
    { name: 'Phone Portrait', width: 1170, height: 2532, description: 'iPhone 14/15' },
    { name: 'Phone Landscape', width: 2532, height: 1170, description: 'iPhone 14/15' },
    { name: 'Tablet', width: 2048, height: 2732, description: 'iPad Pro' },
    { name: 'Square', width: 2048, height: 2048, description: 'Social media' },
    { name: 'Instagram Story', width: 1080, height: 1920, description: '9:16 vertical' },
];

/** Maximum tile size for mobile-safe rendering */
export const MAX_TILE_SIZE = 1024;

/** Maximum preview resolution (longest side) - keeps WebGL within safe limits */
export const PREVIEW_MAX_RESOLUTION = 1920;

/** Maximum lines supported by shader uniform arrays (GLSL limit) */
export const MAX_SHADER_LINES = 40;

/** Maximum circles supported by shader uniform arrays (GLSL limit) */
export const MAX_SHADER_CIRCLES = 10;

/** Maximum arcs supported by shader uniform arrays (GLSL limit) */
export const MAX_SHADER_ARCS = 32;

/** Pixels darker than this threshold are considered boundary lines */
export const LINE_THRESHOLD = 50;

/** Reserved region ID for boundary pixels (max uint8 value) */
export const BOUNDARY_ID = 255;
