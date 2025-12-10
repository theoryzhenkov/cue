import p5 from 'p5';
import { HSB, generateDistinctColor } from '../utility/color';
import { ShapeConfig, ColorConfig, ReferenceResolution } from '../config/types';

type Edge = 'top' | 'bottom' | 'left' | 'right';

export interface Point {
    x: number;
    y: number;
}

export interface LineConfig {
    start: Point;
    end: Point;
    color: HSB;
    weight: number;
}

export interface CircleConfig {
    center: Point;
    radius: number;
    color: HSB;
    weight: number;
}

/**
 * Calculate scale factors for resolution-based shape generation.
 * Shape counts scale with sqrt(area), sizes scale with linear dimension.
 */
export function getResolutionScale(width: number, height: number, reference: ReferenceResolution): {
    countScale: number;  // For scaling number of shapes
    sizeScale: number;   // For scaling shape sizes (radius, etc.)
} {
    const refArea = reference.width * reference.height;
    const targetArea = width * height;
    const refDimension = Math.min(reference.width, reference.height);
    const targetDimension = Math.min(width, height);
    
    return {
        countScale: Math.sqrt(targetArea / refArea),
        sizeScale: targetDimension / refDimension,
    };
}

/**
 * Get a random point on a specified edge
 */
function getPointOnEdge(p: p5, edge: Edge, width: number, height: number): Point {
    switch (edge) {
        case 'top':
            return { x: p.random(width), y: 0 };
        case 'bottom':
            return { x: p.random(width), y: height };
        case 'left':
            return { x: 0, y: p.random(height) };
        case 'right':
            return { x: width, y: p.random(height) };
    }
}

/**
 * Get a random edge
 */
function getRandomEdge(p: p5): Edge {
    const edges: Edge[] = ['top', 'bottom', 'left', 'right'];
    return edges[Math.floor(p.random(4))];
}

/**
 * Generate a line that stretches from one edge to another
 */
export function generateEdgeToEdgeLine(
    p: p5, 
    index: number, 
    width: number, 
    height: number,
    config: ShapeConfig,
    colors: ColorConfig
): LineConfig {
    const startEdge = getRandomEdge(p);
    let endEdge = getRandomEdge(p);

    // Ensure we pick a different edge for more interesting lines
    while (endEdge === startEdge) {
        endEdge = getRandomEdge(p);
    }

    // Use the resolved saturation/brightness values with small random variation
    const satVariance = 0.1;
    const briVariance = 0.1;
    const saturation = colors.saturation + p.random(-satVariance, satVariance);
    const brightness = colors.brightness + p.random(-briVariance, briVariance);

    return {
        start: getPointOnEdge(p, startEdge, width, height),
        end: getPointOnEdge(p, endEdge, width, height),
        color: generateDistinctColor(index, saturation, brightness),
        weight: config.weight,
    };
}

/**
 * Generate multiple edge-to-edge lines
 */
export function generateLines(
    p: p5, 
    count: number, 
    width: number, 
    height: number,
    config: ShapeConfig,
    colors: ColorConfig
): LineConfig[] {
    const lines: LineConfig[] = [];
    for (let i = 0; i < count; i++) {
        lines.push(generateEdgeToEdgeLine(p, i, width, height, config, colors));
    }
    return lines;
}

/**
 * Draw a line to a buffer using black color (for boundary detection)
 */
export function drawLineToBuffer(buffer: p5.Graphics, line: LineConfig): void {
    buffer.stroke(0);
    buffer.strokeWeight(line.weight);
    buffer.line(line.start.x, line.start.y, line.end.x, line.end.y);
}

/**
 * Generate a random circle within the canvas bounds.
 * @param sizeScale - Scale factor for radius (1.0 = reference resolution)
 */
export function generateCircle(
    p: p5,
    index: number,
    width: number,
    height: number,
    config: ShapeConfig,
    colors: ColorConfig,
    sizeScale: number = 1.0
): CircleConfig {
    // Scale radius based on resolution so circles cover proportional area
    const rMin = config.radiusMin ?? 200;
    const rMax = config.radiusMax ?? 600;
    
    const scaledRadiusMin = rMin * sizeScale;
    const scaledRadiusMax = rMax * sizeScale;
    const radius = p.random(scaledRadiusMin, scaledRadiusMax);

    // Keep center within canvas with some margin
    const margin = radius * 0.5;
    const center: Point = {
        x: p.random(margin, width - margin),
        y: p.random(margin, height - margin),
    };

    // Use the resolved saturation/brightness values with small random variation
    const satVariance = 0.1;
    const briVariance = 0.1;
    const saturation = colors.saturation + p.random(-satVariance, satVariance);
    const brightness = colors.brightness + p.random(-briVariance, briVariance);

    return {
        center,
        radius,
        color: generateDistinctColor(index + 100, saturation, brightness),  // Offset index for different hues
        weight: config.weight,
    };
}

/**
 * Generate multiple circles with resolution-based scaling.
 * @param sizeScale - Scale factor for radius (1.0 = reference resolution)
 */
export function generateCircles(
    p: p5,
    count: number,
    width: number,
    height: number,
    config: ShapeConfig,
    colors: ColorConfig,
    sizeScale: number = 1.0
): CircleConfig[] {
    const circles: CircleConfig[] = [];
    for (let i = 0; i < count; i++) {
        circles.push(generateCircle(p, i, width, height, config, colors, sizeScale));
    }
    return circles;
}

/**
 * Draw a circle to a buffer using black color (for boundary detection)
 */
export function drawCircleToBuffer(buffer: p5.Graphics, circle: CircleConfig): void {
    buffer.noFill();
    buffer.stroke(0);
    buffer.strokeWeight(circle.weight);
    buffer.circle(circle.center.x, circle.center.y, circle.radius * 2);
}
