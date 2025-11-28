precision highp float;

varying vec2 vTexCoord;

// Textures
uniform sampler2D uRegionTex;    // R channel = region ID (0-255)
uniform sampler2D uDistanceTex;  // R channel = normalized distance (0-1)
uniform sampler2D uColorsTex;    // 256x1 texture with region colors

// Canvas dimensions for pixel-space calculations
uniform vec2 uResolution;

// Stained glass parameters
uniform float uCenterGlow;       // How much brighter the center is (0-1)
uniform float uEdgeDarken;       // Subtle darkening at edges (0-1)
uniform float uGlowFalloff;      // How quickly the glow falls off

// Noise texture parameters
uniform float uNoiseScale;       // Scale of noise features
uniform float uNoiseIntensity;   // How much noise affects brightness (0-1)
uniform float uNoiseSeed;        // Seed for variation between generations

// Shape parameters for analytical SDF
#define MAX_LINES 40
#define MAX_CIRCLES 10

uniform vec4 uLines[MAX_LINES];      // Each vec4 = (x1, y1, x2, y2) in pixel coords
uniform int uLineCount;

uniform vec3 uCircles[MAX_CIRCLES];  // Each vec3 = (centerX, centerY, radius)
uniform int uCircleCount;

uniform float uLeadingThickness;
uniform float uRoundingRadius;
uniform vec3 uLeadingColor;

// Watercolor effect parameters
uniform float uGrainIntensity;     // Film grain visibility
uniform float uWobbleAmount;       // How much leading wobbles (pixels)
uniform float uWobbleScale;        // Scale of wobble pattern
uniform float uColorBleed;         // Hue shift within regions
uniform float uSaturationBleed;    // Saturation variation
uniform float uBleedScale;         // Scale of color bleeding pattern
uniform float uEdgeIrregularity;   // Organic edge variation

//=============================================================================
// SDF PRIMITIVES
//=============================================================================

/**
 * Signed distance to a line segment from point p to segment (a, b)
 */
float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

/**
 * Distance to circle BOUNDARY (ring, not filled disc)
 * Returns distance to the stroke, not the interior
 */
float sdCircleBoundary(vec2 p, vec2 center, float radius) {
    return abs(length(p - center) - radius);
}

/**
 * Smooth minimum - blends two distances with rounded transition
 * Only affects the result where a ≈ b (at shape intersections)
 * k controls the radius of the blend
 */
float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

/**
 * Compute the minimum distance to all shapes with smooth blending at intersections
 * Uses smooth min to create rounded corners where shapes meet
 */
float computeLeadingSDF(vec2 pixelPos) {
    float minDist = 1e10;

    // Lines
    for (int i = 0; i < MAX_LINES; i++) {
        if (i >= uLineCount) break;

        vec4 line = uLines[i];
        float d = sdSegment(pixelPos, line.xy, line.zw);
        minDist = smin(minDist, d, uRoundingRadius);
    }

    // Circles
    for (int i = 0; i < MAX_CIRCLES; i++) {
        if (i >= uCircleCount) break;

        vec3 circle = uCircles[i];
        float d = sdCircleBoundary(pixelPos, circle.xy, circle.z);
        minDist = smin(minDist, d, uRoundingRadius);
    }

    return minDist;
}

//=============================================================================
// SIMPLEX NOISE (2D)
//=============================================================================

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
    const vec4 C = vec4(
        0.211324865405187,   // (3.0-sqrt(3.0))/6.0
        0.366025403784439,   // 0.5*(sqrt(3.0)-1.0)
        -0.577350269189626,  // -1.0 + 2.0 * C.x
        0.024390243902439    // 1.0 / 41.0
    );

    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);

    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;

    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;

    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

// Fractal Brownian Motion - layered noise for organic glass texture
float fbm(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < 5; i++) {
        if (i >= octaves) break;
        value += amplitude * snoise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

//=============================================================================
// COLOR UTILITIES
//=============================================================================

vec3 rgb2hsb(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsb2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), rgb, c.y);
}

//=============================================================================
// FILM GRAIN
//=============================================================================

/**
 * High-frequency pseudo-random noise for film grain effect
 * Returns value in range [-1, 1]
 */
float filmGrain(vec2 coord, float seed) {
    return fract(sin(dot(coord + seed, vec2(12.9898, 78.233))) * 43758.5453) * 2.0 - 1.0;
}

//=============================================================================
// STAINED GLASS COLOR COMPUTATION (with watercolor effects)
//=============================================================================

vec3 computeGlassColor(vec2 pixelCoord, vec2 texCoord) {
    // Sample region ID
    float regionId = texture2D(uRegionTex, texCoord).r;

    // Get base color from palette
    vec3 baseColor = texture2D(uColorsTex, vec2(regionId, 0.5)).rgb;

    // Sample distance field (0 at edge, higher toward center)
    float dist = texture2D(uDistanceTex, texCoord).r;

    // -------------------------------------------------------------------------
    // WATERCOLOR COLOR BLEEDING - Large-scale hue/saturation variation
    // -------------------------------------------------------------------------
    vec2 bleedCoord = pixelCoord * uBleedScale + vec2(uNoiseSeed + regionId * 37.0);
    float bleedNoise = snoise(bleedCoord);
    float bleedNoise2 = snoise(bleedCoord * 1.7 + 50.0);

    // -------------------------------------------------------------------------
    // CENTER GLOW - Light transmission effect
    // -------------------------------------------------------------------------
    float glowFactor = smoothstep(0.0, uGlowFalloff, dist);
    float centerBrightness = glowFactor * uCenterGlow;

    // -------------------------------------------------------------------------
    // EDGE DARKENING with irregularity - Organic watercolor borders
    // -------------------------------------------------------------------------
    float edgeNoise = snoise(pixelCoord * 0.015 + uNoiseSeed) * uEdgeIrregularity;
    float edgeFactor = 1.0 - smoothstep(0.0, uGlowFalloff * 0.3 + edgeNoise, dist);
    float edgeDarkness = edgeFactor * uEdgeDarken;

    // -------------------------------------------------------------------------
    // GLASS TEXTURE NOISE - Fine organic imperfections
    // -------------------------------------------------------------------------
    vec2 noiseCoord = pixelCoord * uNoiseScale * 0.005 + vec2(uNoiseSeed + regionId * 100.0);

    float noise = fbm(noiseCoord, 4) * 0.5 + 0.5;
    float fineNoise = snoise(noiseCoord * 3.0) * 0.5 + 0.5;

    float textureNoise = mix(noise, fineNoise, 0.3);
    float noiseEffect = (textureNoise - 0.5) * uNoiseIntensity;

    // -------------------------------------------------------------------------
    // COMBINE EFFECTS - Watercolor stained glass look
    // -------------------------------------------------------------------------
    vec3 hsb = rgb2hsb(baseColor);

    // Apply watercolor color bleeding (large-scale hue/saturation shift)
    hsb.x = fract(hsb.x + bleedNoise * uColorBleed);
    hsb.y = clamp(hsb.y + bleedNoise2 * uSaturationBleed, 0.2, 1.0);

    // Apply center glow (brighter in center)
    hsb.z = min(1.0, hsb.z + centerBrightness * 0.4);
    hsb.y = min(1.0, hsb.y * (1.0 + centerBrightness * 0.2));

    // Apply edge darkening
    hsb.z *= (1.0 - edgeDarkness * 0.5);
    hsb.y = min(1.0, hsb.y * (1.0 + edgeDarkness * 0.2));

    // Apply fine noise texture
    hsb.z = clamp(hsb.z + noiseEffect * 0.25, 0.0, 1.0);
    hsb.y = clamp(hsb.y + noiseEffect * 0.1, 0.0, 1.0);

    // Additional subtle hue shift from fine noise
    hsb.x = fract(hsb.x + noiseEffect * 0.02);

    return hsb2rgb(hsb);
}

//=============================================================================
// MAIN
//=============================================================================

void main() {
    vec2 pixelCoord = vTexCoord * uResolution;

    // =========================================================================
    // 1. COMPUTE GLASS COLOR (always needed for proper blending)
    // =========================================================================
    vec3 glassColor = computeGlassColor(pixelCoord, vTexCoord);

    // =========================================================================
    // 2. WOBBLY LEADING - Organic hand-drawn look
    // =========================================================================
    // Distort position before SDF calculation for wavy lines
    vec2 wobble = vec2(
        snoise(pixelCoord * uWobbleScale + uNoiseSeed) * uWobbleAmount,
        snoise(pixelCoord * uWobbleScale + uNoiseSeed + 100.0) * uWobbleAmount
    );
    vec2 wobbledCoord = pixelCoord + wobble;

    float leadingSDF = computeLeadingSDF(wobbledCoord);

    // Anti-aliasing width in pixels
    float aaWidth = 1.5;

    // Compute blend factor: 1.0 = fully leading, 0.0 = fully glass
    float leadingBlend = 1.0 - smoothstep(uLeadingThickness - aaWidth, uLeadingThickness, leadingSDF);

    // Compute leading color with inner shading for depth
    float innerShade = smoothstep(0.0, uLeadingThickness * 0.5, leadingSDF) * 0.15 + 0.85;
    vec3 leadingColor = uLeadingColor * innerShade;

    // =========================================================================
    // 3. BLEND LEADING WITH GLASS
    // =========================================================================
    vec3 finalColor = mix(glassColor, leadingColor, leadingBlend);

    // =========================================================================
    // 4. FILM GRAIN - Visible texture overlay
    // =========================================================================
    float grain = filmGrain(pixelCoord, uNoiseSeed);
    finalColor += grain * uGrainIntensity;

    // Clamp to valid range
    finalColor = clamp(finalColor, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, 1.0);
}
