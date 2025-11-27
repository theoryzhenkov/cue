import { DistanceField, calculateDistanceField, extractBoundaries } from './sdf';
import { HSB, generateDistinctColor } from './color';
import { COLORS } from './config';

const LINE_THRESHOLD = 50; // Pixels darker than this are considered lines
const BOUNDARY_ID = 255;   // Reserved ID for boundary pixels

/**
 * Result of region detection - ready for shader rendering
 */
export interface RegionData {
    ids: Uint8Array;              // Region ID per pixel (0-254 = regions, 255 = boundary)
    colors: HSB[];                // Color for each region
    distanceField: DistanceField; // SDF for edge effects
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
 * Detect regions and compute SDF from a line buffer.
 * Returns data ready for GPU shader rendering.
 */
export function detectRegions(
    linePixels: Uint8ClampedArray,
    width: number,
    height: number
): RegionData {
    const totalPixels = width * height;

    // Extract boundaries from line buffer
    const boundaries = extractBoundaries(linePixels, width, height, LINE_THRESHOLD);

    // Calculate distance field for edge effects
    const distanceField = calculateDistanceField(boundaries, width, height);

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

            // Assign color for this region using config values
            const saturation = COLORS.saturationMin + Math.random() * (COLORS.saturationMax - COLORS.saturationMin);
            const brightness = COLORS.brightnessMin + Math.random() * (COLORS.brightnessMax - COLORS.brightnessMin);
            colors.push(generateDistinctColor(regionId, saturation, brightness));

            // Flood fill this region with the current ID
            fillRegion(ids, visited, width, height, x, y, regionId);

            regionId++;
        }
    }

    return { ids, colors, distanceField };
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
