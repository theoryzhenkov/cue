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
    colors: ColorConfigTemplate;
    stainedGlass: StainedGlassTemplate;
    watercolor: WatercolorTemplate;
    leading: LeadingConfigTemplate;
}

/**
 * The Resolved Config - contains all final values for rendering
 * Automatically derived from ConfigTemplate using Resolved<T> mapped type
 */
export type AppConfig = Resolved<ConfigTemplate>;

// Type aliases for specific sections (for convenience and backwards compatibility)
export type LineShapeConfig = Resolved<LineConfigTemplate>;
export type CircleShapeConfig = Resolved<CircleConfigTemplate>;
export type ColorConfig = Resolved<ColorConfigTemplate>;
export type StainedGlassEffect = Resolved<StainedGlassTemplate>;
export type WatercolorEffect = Resolved<WatercolorTemplate>;
export type LeadingConfig = Resolved<LeadingConfigTemplate>;
