import { extractBoundaries } from '../utility/sdf';
import { HSB } from '../utility/color';
import { ColorConfig } from '../config/types';
import { LINE_THRESHOLD, BOUNDARY_ID } from '../config/constants';

/**
 * Result of region detection - ready for shader rendering.
 * Distance field is now computed analytically in the shader using SDF.
 */
export interface RegionData {
    ids: Uint8Array;    // Region ID per pixel (0-254 = regions, 255 = boundary)
    colors: HSB[];      // Color for each region
}

/**
 * Span-based flood fill entry
 */
interface Span {
    y: number;
    xLeft: number;
    xRight: number;
}

/**
 * Detect regions from a line buffer using flood fill.
 * Returns region IDs and colors ready for GPU shader rendering.
 * Distance effects are computed analytically in the shader using SDF.
 * 
 * @param config - Color parameters from AppConfig
 */
export function detectRegions(
    linePixels: Uint8ClampedArray,
    width: number,
    height: number,
    config: ColorConfig
): RegionData {
    const totalPixels = width * height;

    // Extract boundaries from line buffer
    const boundaries = extractBoundaries(linePixels, width, height, LINE_THRESHOLD);

    // Initialize region IDs - boundaries marked as 255
    const ids = new Uint8Array(totalPixels);
    const visited = new Uint8Array(totalPixels);

    for (let i = 0; i < totalPixels; i++) {
        if (boundaries[i]) {
            ids[i] = BOUNDARY_ID;
            visited[i] = 1;
        }
    }

    // Flood fill to assign region IDs
    const colors: HSB[] = [];
    let regionId = 0;
    let maxRegionsReached = false;

    outer: for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;

            if (visited[idx]) continue;

            // Found a new region
            if (regionId >= 254) {  // Reserve 255 for boundaries
                if (!maxRegionsReached) {
                    console.warn('Maximum region count (254) reached');
                    maxRegionsReached = true;
                }
                break outer;
            }

            // Assign color for this region using resolved color parameters
            // Add small random variation per region
            const satVariance = 0.15;
            const briVariance = 0.15;
            const saturation = config.saturation + (Math.random() - 0.5) * 2 * satVariance;
            const brightness = config.brightness + (Math.random() - 0.5) * 2 * briVariance;
            
            // Use seeded hue base with golden ratio distribution within the hue range
            const goldenRatio = 0.618033988749895;
            const hueOffset = (regionId * goldenRatio) % 1;
            const hue = (config.hueBase + (hueOffset - 0.5) * config.hueRange + 1) % 1;
            
            colors.push({ 
                h: hue, 
                s: Math.max(0, Math.min(1, saturation)), 
                b: Math.max(0, Math.min(1, brightness)) 
            });

            // Flood fill this region with the current ID
            fillRegion(ids, visited, width, height, x, y, regionId);

            regionId++;
        }
    }

    return { ids, colors };
}

/**
 * Flood fill a region with a specific ID using span-based algorithm
 */
function fillRegion(
    ids: Uint8Array,
    visited: Uint8Array,
    width: number,
    height: number,
    startX: number,
    startY: number,
    regionId: number
): void {
    const stack: Span[] = [];

    // Find initial span
    const [left, right] = findSpan(visited, width, startX, startY);
    stack.push({ y: startY, xLeft: left, xRight: right });

    while (stack.length > 0) {
        const span = stack.pop()!;
        const { y, xLeft, xRight } = span;

        // Fill this span
        for (let x = xLeft; x <= xRight; x++) {
            const idx = y * width + x;
            if (visited[idx]) continue;

            visited[idx] = 1;
            ids[idx] = regionId;
        }

        // Check line above
        if (y > 0) {
            addSpansForLine(visited, width, y - 1, xLeft, xRight, stack);
        }

        // Check line below
        if (y < height - 1) {
            addSpansForLine(visited, width, y + 1, xLeft, xRight, stack);
        }
    }
}

/**
 * Find the horizontal extent of an unfilled span starting at (x, y)
 */
function findSpan(
    visited: Uint8Array,
    width: number,
    startX: number,
    y: number
): [number, number] {
    const rowStart = y * width;

    // Scan left
    let left = startX;
    while (left > 0 && !visited[rowStart + left - 1]) {
        left--;
    }

    // Scan right
    let right = startX;
    while (right < width - 1 && !visited[rowStart + right + 1]) {
        right++;
    }

    return [left, right];
}

/**
 * Scan a line for unfilled spans within the given x range and add to stack
 */
function addSpansForLine(
    visited: Uint8Array,
    width: number,
    y: number,
    xLeft: number,
    xRight: number,
    stack: Span[]
): void {
    const rowStart = y * width;
    let x = xLeft;

    while (x <= xRight) {
        // Skip visited pixels
        while (x <= xRight && visited[rowStart + x]) {
            x++;
        }

        if (x > xRight) break;

        // Found start of unfilled span
        const spanLeft = x;

        // Find end of unfilled span
        while (x <= xRight && !visited[rowStart + x]) {
            x++;
        }

        // Extend span to natural boundaries
        const [extLeft, extRight] = findSpan(visited, width, spanLeft, y);
        stack.push({ y, xLeft: extLeft, xRight: extRight });
    }
}
