/**
 * Configuration Types
 * 
 * Two layers:
 * 1. Template types (ConfigTemplate, SeededValue) - define how values are generated
 * 2. Resolved types (AppConfig) - final values used by rendering code
 */

export type SeedDimension = 'valence' | 'arousal' | 'focus';

/**
 * A value that can be randomized and/or influenced by sentiment dimensions.
 * - range: [min, max] bounds for the final value
 * - beta: [alpha, beta] params for distribution shape (default [1.5, 1.5])
 * - seed: which dimension influences this and how much
 */
export interface SeededValue {
    range: [number, number];
    beta?: [number, number];
    seed?: {
        dimension: SeedDimension;
        influence: number;  // 0-1, how much dimension shifts vs pure randomness
    };
}

/**
 * A config property can be:
 * - A fixed number (constant, no randomness)
 * - A SeededValue (randomized and/or seeded)
 */
export type ConfigValue = number | SeededValue;

/**
 * Helper to check if a value is SeededValue
 */
export function isSeededValue(value: ConfigValue): value is SeededValue {
    return typeof value === 'object' && 'range' in value;
}

export interface ShapeConfigTemplate {
    count: SeededValue;
    weight: SeededValue;
    radiusMin?: ConfigValue;
    radiusMax?: ConfigValue;
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
    glowFalloff: ConfigValue;
    noiseScale: ConfigValue;
    noiseIntensity: SeededValue;
}

export interface WatercolorTemplate {
    grainIntensity: SeededValue;
    wobbleAmount: SeededValue;
    wobbleScale: SeededValue;
    colorBleed: SeededValue;
    saturationBleed: SeededValue;
    bleedScale: ConfigValue;
    edgeIrregularity: ConfigValue;
}

export interface LeadingConfigTemplate {
    color: { r: number; g: number; b: number };
    roundingRadius: ConfigValue;
    thickness: ConfigValue;
}

export interface ReferenceResolution {
    width: number;
    height: number;
}

/**
 * The Config Template - defines how values are generated
 */
export interface ConfigTemplate {
    lines: ShapeConfigTemplate;
    circles: ShapeConfigTemplate;
    colors: ColorConfigTemplate;
    stainedGlass: StainedGlassTemplate;
    watercolor: WatercolorTemplate;
    leading: LeadingConfigTemplate;
    referenceResolution: ReferenceResolution;
}

/**
 * Resolved config types - used by rendering code
 * These contain plain numbers after resolution
 */
export interface ShapeConfig {
    count: number;
    weight: number;
    radiusMin?: number;
    radiusMax?: number;
}

export interface ColorConfig {
    hueBase: number;
    hueRange: number;
    saturation: number;
    brightness: number;
}

export interface StainedGlassEffect {
    centerGlow: number;
    edgeDarken: number;
    glowFalloff: number;
    noiseScale: number;
    noiseIntensity: number;
}

export interface WatercolorEffect {
    grainIntensity: number;
    wobbleAmount: number;
    wobbleScale: number;
    colorBleed: number;
    saturationBleed: number;
    bleedScale: number;
    edgeIrregularity: number;
}

export interface LeadingConfig {
    color: { r: number; g: number; b: number };
    roundingRadius: number;
    thickness: number;
}

/**
 * The Resolved Config - contains all final values for rendering
 */
export interface AppConfig {
    lines: ShapeConfig;
    circles: ShapeConfig;
    colors: ColorConfig;
    stainedGlass: StainedGlassEffect;
    watercolor: WatercolorEffect;
    leading: LeadingConfig;
    referenceResolution: ReferenceResolution;
}
