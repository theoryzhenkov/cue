/**
 * Central configuration for the generative art application.
 * Tweak these values to adjust the output.
 */

//=============================================================================
// CANVAS
//=============================================================================

export const CANVAS = {
    width: 3456,
    height: 2234,
};

//=============================================================================
// LINE GENERATION
//=============================================================================

export const LINES = {
    /** Minimum number of lines per generation */
    min: 4,
    /** Maximum number of lines per generation */
    max: 6,
    /** Line weight range */
    weightMin: 8,
    weightMax: 10,
};

//=============================================================================
// CIRCLE GENERATION
//=============================================================================

export const CIRCLES = {
    /** Minimum number of circles per generation */
    min: 1,
    /** Maximum number of circles per generation */
    max: 2,
    /** Circle radius range (in pixels) */
    radiusMin: 200,
    radiusMax: 600,
    /** Stroke weight range */
    weightMin: 8,
    weightMax: 10,
};

// Note: More shapes = more regions. Keep total under ~25 to stay within 254 region limit.

//=============================================================================
// STAINED GLASS EFFECT
//=============================================================================

export const STAINED_GLASS = {
    //-------------------------------------------------------------------------
    // Light Transmission
    //-------------------------------------------------------------------------

    /** How much brighter the center of each pane is (0-1) */
    centerGlow: 0.7,

    /** Subtle darkening at edges near the leading (0-1) */
    edgeDarken: 0.5,

    /** How far the glow extends from center (0-1, higher = larger glow area) */
    glowFalloff: 0.4,

    //-------------------------------------------------------------------------
    // Glass Texture (Noise)
    //-------------------------------------------------------------------------

    /** Scale of noise features (higher = smaller/finer details) */
    noiseScale: 2.5,

    /** How much noise affects the surface appearance (0-1) */
    noiseIntensity: 0.15,
};

//=============================================================================
// REGION COLORS
//=============================================================================

export const COLORS = {
    /** Base saturation range for region colors */
    saturationMin: 0.6,
    saturationMax: 0.8,

    /** Base brightness range for region colors */
    brightnessMin: 0.7,
    brightnessMax: 0.95,
};

//=============================================================================
// LEADING (Lines on top)
//=============================================================================

export const LEADING = {
    /** Color of the boundary lines in the shader (RGB 0-1) */
    color: { r: 0.08, g: 0.06, b: 0.04 },  // Dark brown like lead came

    /** Corner rounding radius in pixels */
    roundingRadius: 15,

    /** Base thickness of the leading in pixels */
    thickness: 4,
};
