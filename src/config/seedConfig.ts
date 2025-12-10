/**
 * Config Resolver - Resolves ConfigTemplate to AppConfig
 * 
 * Uses beta distribution sampling and sentiment dimensions to generate final values.
 */

import { PromptDimensions } from '../llms/promptAnalyzer';
import { 
    ConfigTemplate, 
    AppConfig, 
    SeededValue, 
    ConfigValue, 
    isSeededValue,
    SeedDimension
} from './types';
import { CONFIG_TEMPLATE } from './config';

/**
 * Sample from a Beta distribution using the Joehnk algorithm.
 * Returns a value in [0, 1].
 */
function sampleBeta(alpha: number, beta: number): number {
    // For alpha, beta >= 1, use rejection sampling
    // For simplicity, use the inverse transform via gamma functions approximation
    
    // Joehnk's algorithm for alpha, beta < 1 or simple cases
    if (alpha === 1 && beta === 1) {
        return Math.random(); // Uniform
    }
    
    // Use the ratio of gamma variates method
    const gammaA = sampleGamma(alpha);
    const gammaB = sampleGamma(beta);
    return gammaA / (gammaA + gammaB);
}

/**
 * Sample from Gamma distribution using Marsaglia and Tsang's method
 */
function sampleGamma(shape: number): number {
    if (shape < 1) {
        // Boost for shape < 1
        return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }
    
    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);
    
    while (true) {
        let x: number;
        let v: number;
        
        do {
            x = randomNormal();
            v = 1 + c * x;
        } while (v <= 0);
        
        v = v * v * v;
        const u = Math.random();
        
        if (u < 1 - 0.0331 * (x * x) * (x * x)) {
            return d * v;
        }
        
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
            return d * v;
        }
    }
}

/**
 * Sample from standard normal distribution using Box-Muller
 */
function randomNormal(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Linear interpolation
 */
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * Resolve a single SeededValue to a number.
 * 
 * The process:
 * 1. Sample from Beta distribution → t in [0, 1]
 * 2. If seeded, shift t based on dimension value (0.5 = no shift, preserves beta distribution)
 * 3. Map final t to range
 */
function resolveValue(value: SeededValue, dimensions: PromptDimensions): number {
    const [alpha, beta] = value.beta ?? [1.5, 1.5];
    const [low, high] = value.range;
    
    // Sample from beta distribution
    let t = sampleBeta(alpha, beta);
    
    // If seeded, shift t based on dimension value
    // sentiment = 0.5 → no shift (pure beta distribution)
    // sentiment = 1.0 → shift up by influence
    // sentiment = 0.0 → shift down by influence
    if (value.seed) {
        const dimensionValue = dimensions[value.seed.dimension];
        const influence = value.seed.influence;
        
        // Offset model: sentiment shifts the beta sample, 0.5 is neutral
        t = t + (dimensionValue - 0.5) * influence * 2;
        t = Math.max(0, Math.min(1, t)); // clamp to [0, 1]
    }
    
    // Map to range
    return lerp(low, high, t);
}

/**
 * Resolve a ConfigValue (number or SeededValue) to a number
 */
function resolveConfigValue(value: ConfigValue, dimensions: PromptDimensions): number {
    if (isSeededValue(value)) {
        return resolveValue(value, dimensions);
    }
    return value;
}

/**
 * Generate a resolved AppConfig from the template and dimensions
 */
export function resolveConfig(
    template: ConfigTemplate = CONFIG_TEMPLATE,
    dimensions: PromptDimensions
): AppConfig {
    return {
        lines: {
            count: Math.round(resolveValue(template.lines.count, dimensions)),
            weight: resolveValue(template.lines.weight, dimensions),
            radiusMin: template.lines.radiusMin !== undefined 
                ? resolveConfigValue(template.lines.radiusMin, dimensions) 
                : undefined,
            radiusMax: template.lines.radiusMax !== undefined 
                ? resolveConfigValue(template.lines.radiusMax, dimensions) 
                : undefined
        },
        circles: {
            count: Math.round(resolveValue(template.circles.count, dimensions)),
            weight: resolveValue(template.circles.weight, dimensions),
            radiusMin: template.circles.radiusMin !== undefined 
                ? resolveConfigValue(template.circles.radiusMin, dimensions) 
                : undefined,
            radiusMax: template.circles.radiusMax !== undefined 
                ? resolveConfigValue(template.circles.radiusMax, dimensions) 
                : undefined
        },
        colors: {
            hueBase: resolveValue(template.colors.hueBase, dimensions),
            hueRange: resolveValue(template.colors.hueRange, dimensions),
            saturation: resolveValue(template.colors.saturation, dimensions),
            brightness: resolveValue(template.colors.brightness, dimensions)
        },
        stainedGlass: {
            centerGlow: resolveValue(template.stainedGlass.centerGlow, dimensions),
            edgeDarken: resolveValue(template.stainedGlass.edgeDarken, dimensions),
            glowFalloff: resolveConfigValue(template.stainedGlass.glowFalloff, dimensions),
            noiseScale: resolveConfigValue(template.stainedGlass.noiseScale, dimensions),
            noiseIntensity: resolveValue(template.stainedGlass.noiseIntensity, dimensions)
        },
        watercolor: {
            grainIntensity: resolveValue(template.watercolor.grainIntensity, dimensions),
            wobbleAmount: resolveValue(template.watercolor.wobbleAmount, dimensions),
            wobbleScale: resolveValue(template.watercolor.wobbleScale, dimensions),
            colorBleed: resolveValue(template.watercolor.colorBleed, dimensions),
            saturationBleed: resolveValue(template.watercolor.saturationBleed, dimensions),
            bleedScale: resolveConfigValue(template.watercolor.bleedScale, dimensions),
            edgeIrregularity: resolveConfigValue(template.watercolor.edgeIrregularity, dimensions)
        },
        leading: {
            color: template.leading.color,
            roundingRadius: resolveConfigValue(template.leading.roundingRadius, dimensions),
            thickness: resolveConfigValue(template.leading.thickness, dimensions)
        },
        referenceResolution: template.referenceResolution
    };
}

/**
 * Generate a config using default template and provided dimensions.
 * This is the main entry point for seeded config generation.
 */
export function generateSeededConfig(dimensions: PromptDimensions): AppConfig {
    return resolveConfig(CONFIG_TEMPLATE, dimensions);
}

/**
 * Generate a config with neutral dimensions (0.5 for all).
 * Useful for non-seeded generation.
 */
export function generateDefaultConfig(): AppConfig {
    return resolveConfig(CONFIG_TEMPLATE, {
        valence: 0.5,
        arousal: 0.5,
        focus: 0.5
    });
}
