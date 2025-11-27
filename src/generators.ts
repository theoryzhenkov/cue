import p5 from 'p5';
import { HSB, generateDistinctColor, hsbObjToRgb } from './color';
import { LINES, CIRCLES, COLORS } from './config';

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

//=============================================================================
// LINE GENERATION
//=============================================================================

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
export function generateEdgeToEdgeLine(p: p5, index: number, width: number, height: number): LineConfig {
    const startEdge = getRandomEdge(p);
    let endEdge = getRandomEdge(p);

    // Ensure we pick a different edge for more interesting lines
    while (endEdge === startEdge) {
        endEdge = getRandomEdge(p);
    }

    const saturation = COLORS.saturationMin + p.random(COLORS.saturationMax - COLORS.saturationMin);
    const brightness = COLORS.brightnessMin + p.random(COLORS.brightnessMax - COLORS.brightnessMin);

    return {
        start: getPointOnEdge(p, startEdge, width, height),
        end: getPointOnEdge(p, endEdge, width, height),
        color: generateDistinctColor(index, saturation, brightness),
        weight: p.random(LINES.weightMin, LINES.weightMax),
    };
}

/**
 * Generate multiple edge-to-edge lines
 */
export function generateLines(p: p5, count: number, width: number, height: number): LineConfig[] {
    const lines: LineConfig[] = [];
    for (let i = 0; i < count; i++) {
        lines.push(generateEdgeToEdgeLine(p, i, width, height));
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

//=============================================================================
// CIRCLE GENERATION
//=============================================================================

/**
 * Generate a random circle within the canvas bounds
 */
export function generateCircle(p: p5, index: number, width: number, height: number): CircleConfig {
    const radius = p.random(CIRCLES.radiusMin, CIRCLES.radiusMax);

    // Keep center within canvas with some margin
    const margin = radius * 0.5;
    const center: Point = {
        x: p.random(margin, width - margin),
        y: p.random(margin, height - margin),
    };

    const saturation = COLORS.saturationMin + p.random(COLORS.saturationMax - COLORS.saturationMin);
    const brightness = COLORS.brightnessMin + p.random(COLORS.brightnessMax - COLORS.brightnessMin);

    return {
        center,
        radius,
        color: generateDistinctColor(index + 100, saturation, brightness),  // Offset index for different hues
        weight: p.random(CIRCLES.weightMin, CIRCLES.weightMax),
    };
}

/**
 * Generate multiple circles
 */
export function generateCircles(p: p5, count: number, width: number, height: number): CircleConfig[] {
    const circles: CircleConfig[] = [];
    for (let i = 0; i < count; i++) {
        circles.push(generateCircle(p, i, width, height));
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
