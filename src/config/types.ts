/**
 * Configuration Types
 * 
 * Two layers:
 * 1. Template types (ConfigTemplate, SeededValue) - define how values are generated
 * 2. Resolved types (AppConfig) - final values used by rendering code
 */

export type SeedDimension = 'valence' | 'arousal' | 'focus';

/**
 * Value types for configuration template values
 */
export enum ConfigValueType {
    SEEDED = 'seeded'
}

/**
 * Prompt dimensions - emotional/psychological parameters that influence generation
 * - valence: Emotional tone (0 = negative/dark, 1 = positive/bright)
 * - arousal: Energy level (0 = calm/minimal, 1 = energetic/complex)
 * - focus: Clarity/sharpness (0 = diffuse/dreamy, 1 = sharp/precise)
 */
export interface PromptDimensions {
    valence: number;  // 0-1: negative to positive
    arousal: number;  // 0-1: calm to energetic
    focus: number;    // 0-1: diffuse to sharp
}

/**
 * Default neutral dimensions (0.5 for all)
 */
export const DEFAULT_DIMENSIONS: PromptDimensions = {
    valence: 0.5,
    arousal: 0.5,
    focus: 0.5
};

/**
 * A value that can be randomized and/or influenced by sentiment dimensions.
 * Uses discriminated union pattern for explicit runtime type checking.
 * - type: ConfigValueType.SEEDED - discriminator field for runtime type checking
 * - range: [min, max] bounds for the final value
 * - beta: [alpha, beta] params for distribution shape
 * - seed: which dimension influences this and how much (if any)
 */
export interface SeededValue {
    type: ConfigValueType.SEEDED;
    range: [number, number];
    beta: [number, number];
    seed?: {
        dimension: SeedDimension;
        influence: number;
    };
}

/**
 * Recursive mapped type that transforms SeededValue to number throughout the structure
 */
export type Resolved<T> = T extends SeededValue
    ? number
    : T extends object
    ? { [K in keyof T]: Resolved<T[K]> }
    : T;

/**
 * Line configuration template
 */
export interface LineConfigTemplate {
    density: SeededValue;
    weight: SeededValue;
}

export interface CircleConfigTemplate {
    density: SeededValue;
    weight: SeededValue;
    radius: SeededValue;
}

/**
 * Curve configuration template.
 *
 * A curve is a G1-continuous (tangent-continuous) "walking" line built from a
 * chain of tangent circles. Each step places a new circle externally tangent to
 * the previous one at the current point, then walks a random minor arc on it.
 * External tangency guarantees the arcs share a tangent at every join, so the
 * result is a single smooth line with no sharp corners.
 *
 * - radius: radius of each step circle (fraction of the smaller dimension).
 * - minDistance / maxDistance: chord length between an arc's endpoints
 *   (fraction of the smaller dimension). Clamped to the circle's diameter.
 * - iterations: number of arcs (steps) per curve.
 */
export interface CurveConfigTemplate {
    density: SeededValue;
    weight: SeededValue;
    radius: SeededValue;
    minDistance: number;
    maxDistance: number;
    iterations: number;
}

/**
 * Glass texture template. A reflective glass-pane surface applied to a random
 * subset of regions (per-region flag). Preserves the region's stained-glass color
 * and layers on specular streaks + fresnel rim + subtle refraction. All effect
 * parameters are SeededValue so they respond to prompt dimensions like the shapes.
 * - coverage: fraction of regions that receive the glass texture.
 * - strength: reflectivity intensity (scales specular highlights).
 * - roughness: surface roughness (0 = sharp streaks, 1 = broad/sheeny).
 * - specular: highlight intensity.
 * - fresnel: Schlick f0, rim reflectivity.
 * - streakScale: noise scale for the streak normal map (plain, like noiseScale).
 */
export interface GlassConfigTemplate {
    coverage: SeededValue;
    strength: SeededValue;
    roughness: SeededValue;
    specular: SeededValue;
    fresnel: SeededValue;
    streakScale: number;
}

export interface ColorConfigTemplate {
    hueBase: SeededValue;
    hueRange: SeededValue;
    saturation: SeededValue;
    brightness: SeededValue;
}

export interface StainedGlassTemplate {
    centerGlow: SeededValue;
    edgeDarken: SeededValue;
    glowFalloff: number;
    noiseScale: number;
    noiseIntensity: SeededValue;
}

export interface WatercolorTemplate {
    grainIntensity: SeededValue;
    colorBleed: SeededValue;
    saturationBleed: SeededValue;
    bleedScale: number;
}

export interface LeadingConfigTemplate {
    color: { r: number; g: number; b: number };
    roundingRadius: number;
    thickness: number;
}

/**
 * The Config Template - defines how values are generated
 */
export interface ConfigTemplate {
    lines: LineConfigTemplate;
    circles: CircleConfigTemplate;
    curves: CurveConfigTemplate;
    colors: ColorConfigTemplate;
    stainedGlass: StainedGlassTemplate;
    watercolor: WatercolorTemplate;
    leading: LeadingConfigTemplate;
    glass: GlassConfigTemplate;
}

/**
 * The Resolved Config - contains all final values for rendering
 * Automatically derived from ConfigTemplate using Resolved<T> mapped type
 */
export type AppConfig = Resolved<ConfigTemplate>;

// Type aliases for specific sections (for convenience and backwards compatibility)
export type LineShapeConfig = Resolved<LineConfigTemplate>;
export type CircleShapeConfig = Resolved<CircleConfigTemplate>;
export type CurveShapeConfig = Resolved<CurveConfigTemplate>;
export type GlassEffect = Resolved<GlassConfigTemplate>;
export type ColorConfig = Resolved<ColorConfigTemplate>;
export type StainedGlassEffect = Resolved<StainedGlassTemplate>;
export type WatercolorEffect = Resolved<WatercolorTemplate>;
export type LeadingConfig = Resolved<LeadingConfigTemplate>;
