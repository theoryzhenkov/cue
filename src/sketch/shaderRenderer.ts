import p5 from 'p5';
import { HSB, hsbObjToRgb } from '../utility/color';
import { AppConfig } from '../config/types';
import { MAX_SHADER_LINES, MAX_SHADER_CIRCLES, MAX_SHADER_ARCS } from '../config/constants';
import { LineConfig, CircleConfig, CurveConfig } from './generators';

// Import shaders as raw strings
import vertShader from '../shaders/region.vert' with { type: 'text' };
console.log('vertShader', vertShader);
import fragShader from '../shaders/region.frag' with { type: 'text' };
console.log('fragShader', fragShader);

/**
 * Tile rendering configuration for high-res export
 */
export interface TileConfig {
    tileOffset: { x: number; y: number };
    fullResolution: { width: number; height: number };
}

export interface RegionData {
    ids: Uint8Array;
    colors: HSB[];
    glass: Uint8Array;
}

/**
 * Pack line endpoints into array of vec4 for shader uniforms.
 * Each vec4 = [x1, y1, x2, y2] in pixel coordinates.
 * Denormalizes from [0,1] to pixel coordinates using provided dimensions.
 */
function packLinesForShader(lines: LineConfig[], width: number, height: number): number[] {
    const data: number[] = [];
    const count = Math.min(lines.length, MAX_SHADER_LINES);

    for (let i = 0; i < count; i++) {
        const line = lines[i];
        data.push(
            line.start.x * width, line.start.y * height,
            line.end.x * width, line.end.y * height
        );
    }

    // Pad to MAX_LINES vec4s (4 floats each)
    while (data.length < MAX_SHADER_LINES * 4) {
        data.push(0, 0, 0, 0);
    }

    return data;
}

/**
 * Pack circles into array of vec3 for shader uniforms.
 * Each vec3 = [centerX, centerY, radius] in pixel coordinates.
 * Denormalizes from [0,1] to pixel coordinates using provided dimensions.
 */
function packCirclesForShader(circles: CircleConfig[], width: number, height: number): number[] {
    const data: number[] = [];
    const count = Math.min(circles.length, MAX_SHADER_CIRCLES);
    const smallerDimension = Math.min(width, height);

    for (let i = 0; i < count; i++) {
        const circle = circles[i];
        data.push(
            circle.center.x * width,
            circle.center.y * height,
            circle.radius * smallerDimension
        );
    }

    // Pad to MAX_SHADER_CIRCLES vec3s (3 floats each)
    while (data.length < MAX_SHADER_CIRCLES * 3) {
        data.push(0, 0, 0);
    }

    return data;
}

/**
 * Pack curve arcs into two vec4 arrays for shader uniforms.
 * uArcCenters = (centerX, centerY, radius, a0)
 * uArcEnds    = (a1, 0, 0, 0)
 * Denormalizes from [0,1] to pixel coordinates using provided dimensions.
 * Total arcs across all curves is capped at MAX_SHADER_ARCS.
 */
function packArcsForShader(curves: CurveConfig[], width: number, height: number): { centers: number[]; ends: number[]; count: number } {
    const centers: number[] = [];
    const ends: number[] = [];
    const smallerDimension = Math.min(width, height);
    let count = 0;

    outer: for (const curve of curves) {
        for (const arc of curve.arcs) {
            if (count >= MAX_SHADER_ARCS) break outer;
            centers.push(
                arc.cx * width,
                arc.cy * height,
                arc.r * smallerDimension,
                arc.a0
            );
            ends.push(arc.a1, 0, 0, 0);
            count++;
        }
    }

    // Pad to MAX_SHADER_ARCS vec4s
    while (centers.length < MAX_SHADER_ARCS * 4) {
        centers.push(0, 0, 0, 0);
    }
    while (ends.length < MAX_SHADER_ARCS * 4) {
        ends.push(0, 0, 0, 0);
    }

    return { centers, ends, count };
}
export class ShaderRenderer {
    private shader: p5.Shader | null = null;
    private regionTex: p5.Graphics | null = null;
    private colorsTex: p5.Graphics | null = null;
    private glassTex: p5.Graphics | null = null;
    
    /** The WebGL renderer to draw to */
    private renderer: p5 | p5.Graphics;
    /** The p5 instance for creating 2D graphics (textures) */
    private p5Instance: p5;

    /**
     * @param renderer - The WebGL renderer to draw to (can be p5 or p5.Graphics)
     * @param p5Instance - Optional separate p5 instance for creating 2D textures.
     *                     Required when renderer is a p5.Graphics object.
     */
    constructor(renderer: p5 | p5.Graphics, p5Instance?: p5) {
        this.renderer = renderer;
        this.p5Instance = p5Instance || (renderer as p5);
    }

    /**
     * Initialize shader - call once in setup()
     */
    init(): void {
        this.shader = this.renderer.createShader(vertShader, fragShader);
        if (!this.shader) {
            console.error('Failed to create shader!');
        }
        console.log('shader', this.shader);
    }

    /**
     * Render regions with stained glass effect and rounded leading.
     * Uses analytical SDF for distance calculations (no distance texture needed).
     * 
     * @param previewScale - Scale factor for preview rendering (1.0 = full export resolution).
     *                       Effect parameters are multiplied by this to show accurate preview.
     * @param tileConfig - Optional tile configuration for high-res tiled rendering
     */
    render(
        data: RegionData,
        config: AppConfig,
        noiseSeed: number,
        lines: LineConfig[],
        circles: CircleConfig[] = [],
        curves: CurveConfig[] = [],
        previewScale: number = 1.0,
        tileConfig?: TileConfig
    ): void {
        if (!this.shader) {
            throw new Error('ShaderRenderer not initialized. Call init() first.');
        }

        const { width, height } = this.renderer;
        
        // Determine full resolution for tile offset
        const fullWidth = tileConfig?.fullResolution.width ?? width;
        const fullHeight = tileConfig?.fullResolution.height ?? height;

        // Create/update textures
        this.updateRegionTexture(data.ids, width, height);
        this.updateColorsTexture(data.colors);
        this.updateGlassTexture(data.glass);

        // Apply shader
        this.renderer.shader(this.shader);

        // Set texture uniforms
        this.shader.setUniform('uRegionTex', this.regionTex!);
        this.shader.setUniform('uColorsTex', this.colorsTex!);
        this.shader.setUniform('uGlassTex', this.glassTex!);

        // Resolution for pixel-space calculations
        this.shader.setUniform('uResolution', [width, height]);
        
        // Tile configuration for consistent rendering across tiles
        if (tileConfig) {
            this.shader.setUniform('uFullResolution', [fullWidth, fullHeight]);
            this.shader.setUniform('uTileOffset', [tileConfig.tileOffset.x, tileConfig.tileOffset.y]);
        } else {
            // Non-tiled rendering: full resolution equals tile resolution, no offset
            this.shader.setUniform('uFullResolution', [width, height]);
            this.shader.setUniform('uTileOffset', [0, 0]);
        }

        // Stained glass uniforms (scaled for preview)
        this.shader.setUniform('uCenterGlow', config.stainedGlass.centerGlow);
        this.shader.setUniform('uEdgeDarken', config.stainedGlass.edgeDarken);
        this.shader.setUniform('uGlowFalloff', config.stainedGlass.glowFalloff * previewScale);

        // Noise uniforms (scale inversely for consistent visual density)
        this.shader.setUniform('uNoiseScale', config.stainedGlass.noiseScale);
        this.shader.setUniform('uNoiseIntensity', config.stainedGlass.noiseIntensity);
        this.shader.setUniform('uNoiseSeed', noiseSeed);

        // Line uniforms for analytical SDF (denormalize to full resolution for consistent SDF)
        const lineData = packLinesForShader(lines, fullWidth, fullHeight);
        this.shader.setUniform('uLines', lineData);
        this.shader.setUniform('uLineCount', Math.min(lines.length, MAX_SHADER_LINES));

        // Circle uniforms for analytical SDF (denormalize to full resolution for consistent SDF)
        const circleData = packCirclesForShader(circles, fullWidth, fullHeight);
        this.shader.setUniform('uCircles', circleData);
        this.shader.setUniform('uCircleCount', Math.min(circles.length, MAX_SHADER_CIRCLES));

        // Curve arc uniforms for analytical SDF (denormalize to full resolution for consistent SDF)
        const arcData = packArcsForShader(curves, fullWidth, fullHeight);
        this.shader.setUniform('uArcCenters', arcData.centers);
        this.shader.setUniform('uArcEnds', arcData.ends);
        this.shader.setUniform('uArcCount', arcData.count);

        // Leading appearance (scaled for preview to match final appearance)
        this.shader.setUniform('uLeadingThickness', config.leading.thickness * previewScale);
        this.shader.setUniform('uRoundingRadius', config.leading.roundingRadius * previewScale);
        this.shader.setUniform('uLeadingColor', [config.leading.color.r, config.leading.color.g, config.leading.color.b]);

        // Watercolor effect uniforms (scaled for preview)
        this.shader.setUniform('uGrainIntensity', config.watercolor.grainIntensity);
        this.shader.setUniform('uColorBleed', config.watercolor.colorBleed);
        this.shader.setUniform('uSaturationBleed', config.watercolor.saturationBleed);
        this.shader.setUniform('uBleedScale', config.watercolor.bleedScale / previewScale);

        // Glass texture uniforms (per-region reflective glass pane). Effect is defined
        // in normalized image space, so no preview scaling is needed.
        this.shader.setUniform('uGlassStrength', config.glass.strength);
        this.shader.setUniform('uGlassRoughness', config.glass.roughness);
        this.shader.setUniform('uGlassSpecular', config.glass.specular);
        this.shader.setUniform('uGlassFresnel', config.glass.fresnel);
        this.shader.setUniform('uGlassStreakScale', config.glass.streakScale);

        // Draw full-screen quad to trigger fragment shader
        this.renderer.rect(0, 0, width, height);

        // Reset to default shader
        this.renderer.resetShader();
    }

    /**
     * Create texture with region IDs
     */
    private updateRegionTexture(ids: Uint8Array, width: number, height: number): void {
        if (!this.regionTex || this.regionTex.width !== width || this.regionTex.height !== height) {
            this.regionTex?.remove();
            this.regionTex = this.p5Instance.createGraphics(width, height);
            this.regionTex.pixelDensity(1);
            this.regionTex.noSmooth();
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
     * Create 256x1 texture with region colors
     */
    private updateColorsTexture(colors: HSB[]): void {
        if (!this.colorsTex) {
            this.colorsTex = this.p5Instance.createGraphics(256, 1);
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
     * Create 256x1 texture with per-region glass flags (R channel = 0 or 255)
     */
    private updateGlassTexture(glass: Uint8Array): void {
        if (!this.glassTex) {
            this.glassTex = this.p5Instance.createGraphics(256, 1);
            this.glassTex.pixelDensity(1);
        }

        this.glassTex.loadPixels();
        const pixels = this.glassTex.pixels;

        for (let i = 0; i < 256 * 4; i++) {
            pixels[i] = 0;
        }

        for (let i = 0; i < glass.length && i < 256; i++) {
            const idx = i * 4;
            pixels[idx] = glass[i] ? 255 : 0;
            pixels[idx + 3] = 255;
        }

        this.glassTex.updatePixels();
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.regionTex?.remove();
        this.colorsTex?.remove();
        this.glassTex?.remove();
    }
}
