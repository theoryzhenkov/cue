import p5 from 'p5';
import { HSB, generateDistinctColor, hsbObjToRgb } from './color';
import { LINES, COLORS } from './config';

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
 * Draw a line on the canvas or graphics buffer with its color
 */
export function drawLine(target: p5 | p5.Graphics, line: LineConfig): void {
    const rgb = hsbObjToRgb(line.color);
    target.stroke(rgb.r, rgb.g, rgb.b);
    target.strokeWeight(line.weight);
    target.line(line.start.x, line.start.y, line.end.x, line.end.y);
}

/**
 * Draw a line to a buffer using black color (for boundary detection)
 */
export function drawLineToBuffer(buffer: p5.Graphics, line: LineConfig): void {
    buffer.stroke(0);
    buffer.strokeWeight(line.weight);
    buffer.line(line.start.x, line.start.y, line.end.x, line.end.y);
}
