import p5 from 'p5';
import { DistanceField, getMaxDistance } from './sdf';
import { HSB, hsbObjToRgb } from './color';
import { LEADING } from './config';
import { LineConfig, CircleConfig } from './generators';

// Import shaders as raw strings (Vite handles this with ?raw)
import vertShader from './shaders/region.vert?raw';
import fragShader from './shaders/region.frag?raw';

// Maximum shapes supported by uniform arrays (GLSL limit)
const MAX_LINES = 40;
const MAX_CIRCLES = 10;

/**
 * Stained glass effect configuration
 */
export interface StainedGlassConfig {
    centerGlow: number;
    edgeDarken: number;
    glowFalloff: number;
    noiseScale: number;
    noiseIntensity: number;
    noiseSeed: number;
}

interface RegionData {
    ids: Uint8Array;
    colors: HSB[];
    distanceField: DistanceField;
}

/**
 * Pack line endpoints into array of vec4 for shader uniforms.
 * Each vec4 = [x1, y1, x2, y2] in pixel coordinates
 */
function packLinesForShader(lines: LineConfig[]): number[] {
    const data: number[] = [];
    const count = Math.min(lines.length, MAX_LINES);

    for (let i = 0; i < count; i++) {
        const line = lines[i];
        data.push(line.start.x, line.start.y, line.end.x, line.end.y);
    }

    // Pad to MAX_LINES vec4s (4 floats each)
    while (data.length < MAX_LINES * 4) {
        data.push(0, 0, 0, 0);
    }

    return data;
}

/**
 * Pack circles into array of vec3 for shader uniforms.
 * Each vec3 = [centerX, centerY, radius] in pixel coordinates
 */
function packCirclesForShader(circles: CircleConfig[]): number[] {
    const data: number[] = [];
    const count = Math.min(circles.length, MAX_CIRCLES);

    for (let i = 0; i < count; i++) {
        const circle = circles[i];
        data.push(circle.center.x, circle.center.y, circle.radius);
    }

    // Pad to MAX_CIRCLES vec3s (3 floats each)
    while (data.length < MAX_CIRCLES * 3) {
        data.push(0, 0, 0);
    }

    return data;
}

/**
 * Manages GPU-accelerated region rendering via shaders
 */
export class ShaderRenderer {
    private shader: p5.Shader | null = null;
    private regionTex: p5.Graphics | null = null;
    private distanceTex: p5.Graphics | null = null;
    private colorsTex: p5.Graphics | null = null;

    constructor(private p: p5) {}

    /**
     * Initialize shader - call once in setup()
     */
    init(): void {
        this.shader = this.p.createShader(vertShader, fragShader);
    }

    /**
     * Render regions with stained glass effect and rounded leading
     */
    render(
        data: RegionData,
        config: StainedGlassConfig,
        lines: LineConfig[],
        circles: CircleConfig[] = []
    ): void {
        if (!this.shader) {
            throw new Error('ShaderRenderer not initialized. Call init() first.');
        }

        const { width, height } = this.p;

        // Create/update textures
        this.updateRegionTexture(data.ids, width, height);
        this.updateDistanceTexture(data.distanceField);
        this.updateColorsTexture(data.colors);

        // Apply shader
        this.p.shader(this.shader);

        // Set texture uniforms
        this.shader.setUniform('uRegionTex', this.regionTex!);
        this.shader.setUniform('uDistanceTex', this.distanceTex!);
        this.shader.setUniform('uColorsTex', this.colorsTex!);

        // Resolution for pixel-space calculations
        this.shader.setUniform('uResolution', [width, height]);

        // Stained glass uniforms
        this.shader.setUniform('uCenterGlow', config.centerGlow);
        this.shader.setUniform('uEdgeDarken', config.edgeDarken);
        this.shader.setUniform('uGlowFalloff', config.glowFalloff);

        // Noise uniforms
        this.shader.setUniform('uNoiseScale', config.noiseScale);
        this.shader.setUniform('uNoiseIntensity', config.noiseIntensity);
        this.shader.setUniform('uNoiseSeed', config.noiseSeed);

        // Line uniforms for analytical SDF
        const lineData = packLinesForShader(lines);
        this.shader.setUniform('uLines', lineData);
        this.shader.setUniform('uLineCount', Math.min(lines.length, MAX_LINES));

        // Circle uniforms for analytical SDF
        const circleData = packCirclesForShader(circles);
        this.shader.setUniform('uCircles', circleData);
        this.shader.setUniform('uCircleCount', Math.min(circles.length, MAX_CIRCLES));

        // Leading appearance
        this.shader.setUniform('uLeadingThickness', LEADING.thickness);
        this.shader.setUniform('uRoundingRadius', LEADING.roundingRadius);
        this.shader.setUniform('uLeadingColor', [LEADING.color.r, LEADING.color.g, LEADING.color.b]);

        // Draw full-screen quad to trigger fragment shader
        this.p.rect(0, 0, width, height);

        // Reset to default shader
        this.p.resetShader();
    }

    /**
     * Create texture with region IDs
     */
    private updateRegionTexture(ids: Uint8Array, width: number, height: number): void {
        if (!this.regionTex || this.regionTex.width !== width || this.regionTex.height !== height) {
            this.regionTex = this.p.createGraphics(width, height);
            this.regionTex.pixelDensity(1);
        }

        this.regionTex.loadPixels();
        const pixels = this.regionTex.pixels;

        for (let i = 0; i < ids.length; i++) {
            const idx = i * 4;
            const regionId = ids[i];
            pixels[idx] = regionId;
            pixels[idx + 1] = 0;
            pixels[idx + 2] = 0;
            pixels[idx + 3] = 255;
        }

        this.regionTex.updatePixels();
    }

    /**
     * Create texture with normalized distance values
     */
    private updateDistanceTexture(field: DistanceField): void {
        const { width, height, data } = field;

        if (!this.distanceTex || this.distanceTex.width !== width || this.distanceTex.height !== height) {
            this.distanceTex = this.p.createGraphics(width, height);
            this.distanceTex.pixelDensity(1);
        }

        const maxDist = getMaxDistance(field);

        this.distanceTex.loadPixels();
        const pixels = this.distanceTex.pixels;

        for (let i = 0; i < data.length; i++) {
            const idx = i * 4;
            const normalizedDist = maxDist > 0 ? Math.sqrt(data[i]) / maxDist : 0;
            const distByte = Math.min(255, Math.floor(normalizedDist * 255));
            pixels[idx] = distByte;
            pixels[idx + 1] = 0;
            pixels[idx + 2] = 0;
            pixels[idx + 3] = 255;
        }

        this.distanceTex.updatePixels();
    }

    /**
     * Create 256x1 texture with region colors
     */
    private updateColorsTexture(colors: HSB[]): void {
        if (!this.colorsTex) {
            this.colorsTex = this.p.createGraphics(256, 1);
            this.colorsTex.pixelDensity(1);
        }

        this.colorsTex.loadPixels();
        const pixels = this.colorsTex.pixels;

        // Initialize all to black
        for (let i = 0; i < 256 * 4; i++) {
            pixels[i] = 0;
        }

        // Set colors for each region
        for (let i = 0; i < colors.length && i < 255; i++) {
            const rgb = hsbObjToRgb(colors[i]);
            const idx = i * 4;
            pixels[idx] = rgb.r;
            pixels[idx + 1] = rgb.g;
            pixels[idx + 2] = rgb.b;
            pixels[idx + 3] = 255;
        }

        this.colorsTex.updatePixels();
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.regionTex?.remove();
        this.distanceTex?.remove();
        this.colorsTex?.remove();
    }
}
