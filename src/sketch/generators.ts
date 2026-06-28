import p5 from 'p5';
import { HSB, generateDistinctColor } from '../utility/color';
import { LineShapeConfig, CircleShapeConfig, CurveShapeConfig, ColorConfig, SeededValue, PromptDimensions } from '../config/types';
import { resolveValue } from '../config/seedConfig';

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
 * Get a random point on a specified edge in normalized [0,1] coordinates
 */
function getPointOnEdge(p: p5, edge: Edge): Point {
    switch (edge) {
        case 'top':
            return { x: p.random(1), y: 0 };
        case 'bottom':
            return { x: p.random(1), y: 1 };
        case 'left':
            return { x: 0, y: p.random(1) };
        case 'right':
            return { x: 1, y: p.random(1) };
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
 * Generate a line that stretches from one edge to another.
 */
export function generateEdgeToEdgeLine(
    p: p5, 
    index: number, 
    config: LineShapeConfig,
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
        start: getPointOnEdge(p, startEdge),
        end: getPointOnEdge(p, endEdge),
        color: generateDistinctColor(index, saturation, brightness),
        weight: config.weight,
    };
}

/**
 * Generate multiple edge-to-edge lines.
 * Positions are in normalized [0,1] coordinates; weight is absolute pixels.
 */
export function generateLines(
    p: p5, 
    count: number, 
    config: LineShapeConfig,
    colors: ColorConfig
): LineConfig[] {
    const lines: LineConfig[] = [];
    for (let i = 0; i < count; i++) {
        lines.push(generateEdgeToEdgeLine(p, i, config, colors));
    }
    return lines;
}

/**
 * Draw a line to a buffer using black color (for boundary detection).
 * Denormalizes positions from [0,1] to buffer dimensions.
 * @param weightScale - Scale factor for weight (1.0 for export, previewScale for preview)
 */
export function drawLineToBuffer(buffer: p5.Graphics, line: LineConfig, width: number, height: number, weightScale: number = 1.0): void {
    buffer.stroke(0);
    buffer.strokeWeight(line.weight * weightScale);
    buffer.line(
        line.start.x * width, line.start.y * height,
        line.end.x * width, line.end.y * height
    );
}

/**
 * Generate a random circle within the canvas bounds.
 * Center is in normalized [0,1] coordinates; radius is fraction of smaller dimension; weight is absolute pixels.
 * Radius is sampled from the distribution each time (not resolved once).
 */
export function generateCircle(
    p: p5,
    index: number,
    config: CircleShapeConfig,
    colors: ColorConfig,
    radiusTemplate: SeededValue,
    dimensions: PromptDimensions
): CircleConfig {
    const radius = resolveValue(radiusTemplate, dimensions);

    // Keep center within canvas with some margin (in normalized coords)
    // Margin is half the radius as a fraction
    const margin = radius * 0.5;
    const center: Point = {
        x: p.random(margin, 1 - margin),
        y: p.random(margin, 1 - margin),
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
 * Generate multiple circles.
 * Centers are in normalized [0,1] coordinates; radius is fraction of smaller dimension; weight is absolute pixels.
 * Radius is sampled from the distribution for each circle.
 */
export function generateCircles(
    p: p5,
    count: number,
    config: CircleShapeConfig,
    colors: ColorConfig,
    radiusTemplate: SeededValue,
    dimensions: PromptDimensions
): CircleConfig[] {
    const circles: CircleConfig[] = [];
    for (let i = 0; i < count; i++) {
        circles.push(generateCircle(p, i, config, colors, radiusTemplate, dimensions));
    }
    return circles;
}

/**
 * Draw a circle to a buffer using black color (for boundary detection).
 * Denormalizes positions from [0,1] to buffer dimensions.
 * @param weightScale - Scale factor for weight (1.0 for export, previewScale for preview)
 */
export function drawCircleToBuffer(buffer: p5.Graphics, circle: CircleConfig, width: number, height: number, weightScale: number = 1.0): void {
    buffer.noFill();
    buffer.stroke(0);
    buffer.strokeWeight(circle.weight * weightScale);
    const smallerDimension = Math.min(width, height);
    buffer.circle(
        circle.center.x * width,
        circle.center.y * height,
        circle.radius * smallerDimension * 2
    );
}

/**
 * A single circular arc segment of a curve.
 *
 * Storage is resolution-independent and consistent with circles: cx/cy in
 * normalized [0,1] (denormalized as cx*W, cy*H), r as a fraction of the smaller
 * dimension (denormalized as r * min(W,H)). Angles a0/a1 are in radians; the arc
 * is the minor arc (<= pi) from a0 to a1.
 */
export interface ArcConfig {
    cx: number;
    cy: number;
    r: number;
    a0: number;
    a1: number;
}

export interface CurveConfig {
    arcs: ArcConfig[];
    color: HSB;
    weight: number;
}

const TWO_PI = Math.PI * 2;

/**
 * Normalize a 2D vector to unit length (returns (0,0)-safe unit vector).
 */
function normalize2(v: Point): Point {
    const len = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / len, y: v.y / len };
}

/**
 * Sample a chord length (endpoint distance) on a circle of pixel-radius `pxR`,
 * within [minFrac, maxFrac] of minDim. Clamped to the circle's diameter so the
 * resulting arc is always the minor arc (<= pi).
 */
function sampleChord(p: p5, pxR: number, minFrac: number, maxFrac: number, minDim: number): number {
    const maxPx = Math.min(2 * pxR * 0.999, maxFrac * minDim);
    const minPx = Math.min(minFrac * minDim, maxPx);
    return p.random(minPx, maxPx);
}

/**
 * Generate a smooth "walking" curve as a chain of tangent circles.
 *
 * Geometry is computed in pixel space (uniform metric) so that external
 * tangency is preserved when later denormalized to non-square buffers. The
 * first circle is placed within the canvas; each subsequent circle is placed
 * externally tangent to the previous one at the current point, and a random
 * minor arc is walked on it continuing in the forward tangent direction.
 *
 * External tangency places consecutive circle centers on opposite sides of the
 * shared tangent, so curvature flips at every join -> the result is a smooth
 * serpentine (S-curve) walk with G1 continuity (no sharp corners).
 */
export function generateCurve(
    p: p5,
    index: number,
    config: CurveShapeConfig,
    colors: ColorConfig,
    radiusTemplate: SeededValue,
    dimensions: PromptDimensions,
    width: number,
    height: number
): CurveConfig {
    const minDim = Math.min(width, height);
    const minFrac = config.minDistance;
    const maxFrac = config.maxDistance;
    const iterations = Math.max(1, Math.floor(config.iterations));

    const arcs: ArcConfig[] = [];

    // --- First circle + first arc (fully random) ---
    const r1 = resolveValue(radiusTemplate, dimensions);
    const pxR1 = r1 * minDim;
    const margin = pxR1;
    const cx1 = p.random(margin, Math.max(margin + 1, width - margin));
    const cy1 = p.random(margin, Math.max(margin + 1, height - margin));

    const a0First = p.random(TWO_PI);
    const sweepFirst = p.random() < 0.5 ? 1 : -1;
    const chord1 = sampleChord(p, pxR1, minFrac, maxFrac, minDim);
    const span1 = 2 * Math.asin(chord1 / (2 * pxR1));
    const a1First = a0First + sweepFirst * span1;
    arcs.push({ cx: cx1 / width, cy: cy1 / height, r: r1, a0: a0First, a1: a1First });

    let prevCenter: Point = { x: cx1, y: cy1 };
    let prevR = pxR1;
    let endPt: Point = {
        x: cx1 + pxR1 * Math.cos(a1First),
        y: cy1 + pxR1 * Math.sin(a1First),
    };
    // Travel direction at the end of the arc (tangent in the forward direction)
    let curTangent: Point = {
        x: sweepFirst >= 0 ? -Math.sin(a1First) : Math.sin(a1First),
        y: sweepFirst >= 0 ? Math.cos(a1First) : -Math.cos(a1First),
    };

    // --- Subsequent tangent circles ---
    for (let i = 1; i < iterations; i++) {
        const r = resolveValue(radiusTemplate, dimensions);
        const pxR = r * minDim;

        // Outward normal of the previous circle at endPt -> externally tangent center
        const n = normalize2({ x: endPt.x - prevCenter.x, y: endPt.y - prevCenter.y });
        const newCenter: Point = { x: endPt.x + pxR * n.x, y: endPt.y + pxR * n.y };

        // Angle of endPt on the new circle (its arc start)
        const theta0 = Math.atan2(endPt.y - newCenter.y, endPt.x - newCenter.x);

        // Pick the sweep direction that continues forward (matches the incoming tangent).
        // The ccw travel tangent at theta0 is (-sin, cos); align to curTangent.
        const forwardDot = curTangent.x * -Math.sin(theta0) + curTangent.y * Math.cos(theta0);
        const s = forwardDot >= 0 ? 1 : -1;

        const chord = sampleChord(p, pxR, minFrac, maxFrac, minDim);
        const span = 2 * Math.asin(chord / (2 * pxR));
        const theta1 = theta0 + s * span;
        const finish: Point = {
            x: newCenter.x + pxR * Math.cos(theta1),
            y: newCenter.y + pxR * Math.sin(theta1),
        };

        arcs.push({ cx: newCenter.x / width, cy: newCenter.y / height, r, a0: theta0, a1: theta1 });

        curTangent = {
            x: s >= 0 ? -Math.sin(theta1) : Math.sin(theta1),
            y: s >= 0 ? Math.cos(theta1) : -Math.cos(theta1),
        };
        prevCenter = newCenter;
        prevR = pxR;
        endPt = finish;
    }

    const satVariance = 0.1;
    const briVariance = 0.1;
    const saturation = colors.saturation + p.random(-satVariance, satVariance);
    const brightness = colors.brightness + p.random(-briVariance, briVariance);

    return {
        arcs,
        color: generateDistinctColor(index + 300, saturation, brightness),
        weight: config.weight,
    };
}

/**
 * Generate multiple curves.
 * Arc geometry is computed in pixel space at the target resolution; stored
 * normalized so it renders identically (scaled) at preview and export.
 */
export function generateCurves(
    p: p5,
    count: number,
    config: CurveShapeConfig,
    colors: ColorConfig,
    radiusTemplate: SeededValue,
    dimensions: PromptDimensions,
    width: number,
    height: number
): CurveConfig[] {
    const curves: CurveConfig[] = [];
    for (let i = 0; i < count; i++) {
        curves.push(generateCurve(p, i, config, colors, radiusTemplate, dimensions, width, height));
    }
    return curves;
}

/**
 * Draw a curve to a buffer as a single continuous, smooth stroked path.
 *
 * Uses the raw 2D canvas context so exact circular arcs (not tessellated
 * chords) can be chained into one path. Because consecutive arcs share their
 * join point (tangent circles meet there), ctx.arc's implicit connecting line
 * is zero-length, and the shared tangent makes joins invisible -> the curve
 * renders as one true smooth line. Black stroke for boundary detection.
 *
 * @param weightScale - Scale factor for weight (1.0 for export, previewScale for preview)
 */
export function drawCurveToBuffer(buffer: p5.Graphics, curve: CurveConfig, width: number, height: number, weightScale: number = 1.0): void {
    if (curve.arcs.length === 0) return;
    const ctx = buffer.drawingContext as CanvasRenderingContext2D;
    const smallerDimension = Math.min(width, height);

    ctx.beginPath();
    const first = curve.arcs[0];
    const fr = first.r * smallerDimension;
    const fcx = first.cx * width;
    const fcy = first.cy * height;
    ctx.moveTo(fcx + fr * Math.cos(first.a0), fcy + fr * Math.sin(first.a0));
    for (const arc of curve.arcs) {
        ctx.arc(
            arc.cx * width,
            arc.cy * height,
            arc.r * smallerDimension,
            arc.a0,
            arc.a1,
            arc.a1 < arc.a0  // anticlockwise when sweeping backwards
        );
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = curve.weight * weightScale;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
}
