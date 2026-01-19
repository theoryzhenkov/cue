import p5 from 'p5';
import {
    generateLines,
    drawLineToBuffer,
    LineConfig,
    generateCircles,
    drawCircleToBuffer,
    CircleConfig,
} from './sketch/generators';
import { detectRegions, RegionData } from './sketch/regionFiller';
import { ShaderRenderer, TileConfig } from './sketch/shaderRenderer';
import { MAX_TILE_SIZE, PREVIEW_MAX_RESOLUTION } from './config/constants';
import { resolveConfig, densityToCount } from './config/seedConfig';
import { AppConfig, PromptDimensions, DEFAULT_DIMENSIONS } from './config/types';
import { CONFIG_TEMPLATE } from './config/config';
import { UI } from './ui';
import {
    calculateTileGrid,
    needsTiledRendering,
    compositeTiles,
    extractTileRegionData,
    downloadCanvas,
    TileInfo,
} from './sketch/tiledRenderer';
import { appState } from './state/appState';

/**
 * API interface exposed on window for headless rendering via Puppeteer
 */
export interface CueAPI {
    generateForAPI: (width: number, height: number, dimensions?: PromptDimensions) => Promise<string>;
    isReady: boolean;
}

declare global {
    interface Window {
        cueAPI: CueAPI;
    }
}

const sketch = (p: p5) => {
    let shaderRenderer: ShaderRenderer;
    let ui: UI;

    /**
     * Calculate preview render resolution (capped for WebGL safety)
     * and CSS display scale to fit the screen
     */
    function calculatePreviewDimensions(targetWidth: number, targetHeight: number): {
        renderWidth: number;
        renderHeight: number;
        displayScale: number;
    } {
        // Cap render resolution at PREVIEW_MAX_RESOLUTION on longest side
        const aspectRatio = targetWidth / targetHeight;
        let renderWidth: number;
        let renderHeight: number;
        
        if (targetWidth >= targetHeight) {
            // Landscape or square
            renderWidth = Math.min(targetWidth, PREVIEW_MAX_RESOLUTION);
            renderHeight = Math.round(renderWidth / aspectRatio);
        } else {
            // Portrait
            renderHeight = Math.min(targetHeight, PREVIEW_MAX_RESOLUTION);
            renderWidth = Math.round(renderHeight * aspectRatio);
        }
        
        // Calculate available screen space
        const availableWidth = window.innerWidth - 80;
        const availableHeight = window.innerHeight - 160;
        
        // Calculate CSS scale to fit rendered canvas to screen
        const scaleToFitWidth = availableWidth / renderWidth;
        const scaleToFitHeight = availableHeight / renderHeight;
        const displayScale = Math.min(scaleToFitWidth, scaleToFitHeight, 1); // Never scale up
        
        return { renderWidth, renderHeight, displayScale };
    }

    /**
     * Apply CSS transform to canvas for display scaling
     */
    function applyDisplayScale(displayScale: number): void {
        const canvas = (p as unknown as { canvas: HTMLCanvasElement }).canvas;
        canvas.style.transform = `scale(${displayScale})`;
        canvas.style.transformOrigin = 'center center';
    }

    /**
     * Generate shapes in normalized [0,1] coordinates using resolved config.
     * Calculate counts from density at this point (density × megapixels).
     * Shapes are resolution-independent; weight is constant absolute pixels.
     * Circle radius is sampled from distribution for each circle.
     */
    function generateShapes(width: number, height: number, config: AppConfig, dimensions: PromptDimensions): { lines: LineConfig[]; circles: CircleConfig[] } {
        const { lines: lineConfig, circles: circleConfig, colors: colorConfig } = config;
        
        // Calculate shape counts from density at the point of use
        const lineCount = densityToCount(lineConfig.density, width, height);
        const circleCount = densityToCount(circleConfig.density, width, height);
        
        const lines = generateLines(p, lineCount, lineConfig, colorConfig);
        // Pass radius template and dimensions so each circle samples radius independently
        const circles = generateCircles(p, circleCount, circleConfig, colorConfig, CONFIG_TEMPLATE.circles.radius, dimensions);
        
        return { lines, circles };
    }

    /**
     * Compute region data from shapes with seeded color parameters.
     * Shapes are in normalized [0,1] coordinates; denormalized to buffer dimensions for rendering.
     * @param weightScale - Scale factor for stroke weights (1.0 for export, previewScale for preview)
     */
    function computeRegionData(
        lines: LineConfig[],
        circles: CircleConfig[],
        width: number,
        height: number,
        config: AppConfig,
        weightScale: number = 1.0
    ): RegionData {
        const buffer = p.createGraphics(width, height);
        buffer.pixelDensity(1);
        buffer.background(255);
        
        for (const line of lines) {
            drawLineToBuffer(buffer, line, width, height, weightScale);
        }
        for (const circle of circles) {
            drawCircleToBuffer(buffer, circle, width, height, weightScale);
        }
        
        buffer.loadPixels();
        const regionData = detectRegions(buffer.pixels as unknown as Uint8ClampedArray, width, height, config.colors);
        buffer.remove();
        
        return regionData;
    }

    /**
     * Render preview at capped resolution.
     * Shapes are in normalized coordinates and will be denormalized to preview dimensions.
     * Preview is an accurate scaled-down representation of the final export.
     */
    function renderPreview(): void {
        const { previewWidth, previewHeight, targetWidth, lines, circles, noiseSeed, activeConfig } = appState.getState();
        
        // Calculate preview scale (ratio of preview to target resolution)
        // This scales weights and effect parameters so preview looks like a scaled-down final image
        const previewScale = previewWidth / targetWidth;
        
        // Compute region data at preview resolution with scaled weights
        const regionData = computeRegionData(lines, circles, previewWidth, previewHeight, activeConfig, previewScale);
        
        // Render with preview scale for accurate visual representation
        p.background(255);
        shaderRenderer.render(regionData, activeConfig, noiseSeed, lines, circles, previewScale);
    }

    /**
     * Generate new artwork with the given target resolution and seeded config.
     * If config is not provided, re-resolves with stored prompt dimensions.
     */
    function generateArt(targetWidth: number, targetHeight: number, seededConfig?: AppConfig, dimensions?: PromptDimensions): void {
        if (seededConfig && dimensions) {
            // Initial generation from UI with LLM dimensions
            appState.setConfig(seededConfig, dimensions);
        } else {
            // Regeneration: re-resolve with stored dimensions for fresh random values
            appState.setConfig(resolveConfig(undefined, appState.promptDimensions));
        }
        
        // Calculate preview dimensions and display scale
        const { renderWidth, renderHeight, displayScale } = calculatePreviewDimensions(targetWidth, targetHeight);
        
        // Resize canvas to preview resolution
        if (p.width !== renderWidth || p.height !== renderHeight) {
            p.resizeCanvas(renderWidth, renderHeight);
        }
        
        // Update state dimensions
        appState.setDimensions(targetWidth, targetHeight, renderWidth, renderHeight, displayScale);
        
        // Generate new shapes at target resolution using seeded config
        const { lines, circles } = generateShapes(targetWidth, targetHeight, appState.activeConfig, appState.promptDimensions);
        appState.setShapes(lines, circles);
        appState.setNoiseSeed(p.random(1000));
        
        // Render preview
        renderPreview();
        
        // Apply CSS scaling for display
        applyDisplayScale(displayScale);
        
        // Show canvas with fade-in
        const canvas = (p as unknown as { canvas: HTMLCanvasElement }).canvas;
        canvas.classList.add('visible');
        
        // Update resolution display
        ui.updateResolutionDisplay(targetWidth, targetHeight);
    }

    /**
     * Export full resolution image using tiled rendering if needed
     */
    async function exportFullResolution(): Promise<void> {
        const { targetWidth, targetHeight, lines, circles, noiseSeed, activeConfig } = appState.getState();
        
        ui.showProgress('Preparing export...');
        
        // Check if we need tiled rendering
        const useTiling = needsTiledRendering(targetWidth, targetHeight);
        
        if (!useTiling) {
            // Simple case: render directly at full resolution
            ui.updateProgress('Rendering...');
            
            const exportP5 = p.createGraphics(targetWidth, targetHeight, p.WEBGL);
            exportP5.pixelDensity(1);
            
            // Compute full-res region data with seeded colors
            const regionData = computeRegionData(lines, circles, targetWidth, targetHeight, activeConfig);
            
            const exportRenderer = new ShaderRenderer(exportP5, p);
            exportRenderer.init();
            
            // Scale = 1.0 for full resolution export
            exportRenderer.render(regionData, activeConfig, noiseSeed, lines, circles, 1.0);
            
            const canvas = (exportP5 as unknown as { canvas: HTMLCanvasElement }).canvas;
            downloadCanvas(canvas, `cue-${targetWidth}x${targetHeight}.png`);
            
            exportRenderer.dispose();
            exportP5.remove();
            
            ui.hideProgress();
            return;
        }
        
        // Tiled rendering for large images
        const tiles = calculateTileGrid(targetWidth, targetHeight, MAX_TILE_SIZE);
        const totalTiles = tiles.length;
        
        ui.updateProgress(`Computing regions...`);
        
        // Compute full-resolution region data once with seeded colors
        const fullRegionData = computeRegionData(lines, circles, targetWidth, targetHeight, activeConfig);
        
        const renderedTiles: { canvas: HTMLCanvasElement; info: TileInfo }[] = [];
        
        for (let i = 0; i < tiles.length; i++) {
            const tile = tiles[i];
            ui.updateProgress(`Rendering tile ${i + 1}/${totalTiles}...`);
            
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const tileP5 = p.createGraphics(tile.width, tile.height, p.WEBGL);
            tileP5.pixelDensity(1);
            
            const tileRegionData = extractTileRegionData(fullRegionData, tile, targetWidth, targetHeight);
            
            const tileRenderer = new ShaderRenderer(tileP5, p);
            tileRenderer.init();
            
            const tileConfig: TileConfig = {
                tileOffset: { x: tile.x, y: tile.y },
                fullResolution: { width: targetWidth, height: targetHeight },
            };
            
            tileRenderer.render(tileRegionData, activeConfig, noiseSeed, lines, circles, 1.0, tileConfig);
            
            const tileCanvas = (tileP5 as unknown as { canvas: HTMLCanvasElement }).canvas;
            
            const copyCanvas = document.createElement('canvas');
            copyCanvas.width = tile.width;
            copyCanvas.height = tile.height;
            const ctx = copyCanvas.getContext('2d');
            ctx?.drawImage(tileCanvas, 0, 0);
            
            renderedTiles.push({ canvas: copyCanvas, info: tile });
            
            tileRenderer.dispose();
            tileP5.remove();
        }
        
        ui.updateProgress('Compositing...');
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const finalCanvas = compositeTiles(renderedTiles, targetWidth, targetHeight);
        const randomId = Math.random().toString(36).substring(2, 8);
        downloadCanvas(finalCanvas, `cue-${targetWidth}x${targetHeight}-${randomId}.png`);
        
        ui.hideProgress();
    }

    /**
     * Generate image for API - renders at full resolution and returns data URL.
     * This bypasses the UI and preview rendering for headless use.
     */
    async function generateForAPI(
        targetWidth: number,
        targetHeight: number,
        dimensions: PromptDimensions = DEFAULT_DIMENSIONS
    ): Promise<string> {
        // Resolve config with provided dimensions
        const config = resolveConfig(undefined, dimensions);
        
        // Generate shapes at target resolution
        const { lines: lineConfig, circles: circleConfig, colors: colorConfig } = config;
        const lineCount = densityToCount(lineConfig.density, targetWidth, targetHeight);
        const circleCount = densityToCount(circleConfig.density, targetWidth, targetHeight);
        
        const lines = generateLines(p, lineCount, lineConfig, colorConfig);
        const circles = generateCircles(p, circleCount, circleConfig, colorConfig, CONFIG_TEMPLATE.circles.radius, dimensions);
        const noiseSeed = p.random(1000);
        
        // Check if we need tiled rendering
        const useTiling = needsTiledRendering(targetWidth, targetHeight);
        
        if (!useTiling) {
            // Simple case: render directly at full resolution
            const exportP5 = p.createGraphics(targetWidth, targetHeight, p.WEBGL);
            exportP5.pixelDensity(1);
            
            // Compute region data
            const buffer = p.createGraphics(targetWidth, targetHeight);
            buffer.pixelDensity(1);
            buffer.background(255);
            for (const line of lines) {
                drawLineToBuffer(buffer, line, targetWidth, targetHeight, 1.0);
            }
            for (const circle of circles) {
                drawCircleToBuffer(buffer, circle, targetWidth, targetHeight, 1.0);
            }
            buffer.loadPixels();
            const regionData = detectRegions(buffer.pixels as unknown as Uint8ClampedArray, targetWidth, targetHeight, config.colors);
            buffer.remove();
            
            const exportRenderer = new ShaderRenderer(exportP5, p);
            exportRenderer.init();
            exportRenderer.render(regionData, config, noiseSeed, lines, circles, 1.0);
            
            const canvas = (exportP5 as unknown as { canvas: HTMLCanvasElement }).canvas;
            const dataUrl = canvas.toDataURL('image/png');
            
            exportRenderer.dispose();
            exportP5.remove();
            
            return dataUrl;
        }
        
        // Tiled rendering for large images
        const tiles = calculateTileGrid(targetWidth, targetHeight, MAX_TILE_SIZE);
        
        // Compute region data for full image
        const buffer = p.createGraphics(targetWidth, targetHeight);
        buffer.pixelDensity(1);
        buffer.background(255);
        for (const line of lines) {
            drawLineToBuffer(buffer, line, targetWidth, targetHeight, 1.0);
        }
        for (const circle of circles) {
            drawCircleToBuffer(buffer, circle, targetWidth, targetHeight, 1.0);
        }
        buffer.loadPixels();
        const fullRegionData = detectRegions(buffer.pixels as unknown as Uint8ClampedArray, targetWidth, targetHeight, config.colors);
        buffer.remove();
        
        const renderedTiles: { canvas: HTMLCanvasElement; info: TileInfo }[] = [];
        
        for (const tile of tiles) {
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const tileP5 = p.createGraphics(tile.width, tile.height, p.WEBGL);
            tileP5.pixelDensity(1);
            
            const tileRegionData = extractTileRegionData(fullRegionData, tile, targetWidth, targetHeight);
            
            const tileRenderer = new ShaderRenderer(tileP5, p);
            tileRenderer.init();
            
            const tileConfig: TileConfig = {
                tileOffset: { x: tile.x, y: tile.y },
                fullResolution: { width: targetWidth, height: targetHeight },
            };
            
            tileRenderer.render(tileRegionData, config, noiseSeed, lines, circles, 1.0, tileConfig);
            
            const tileCanvas = (tileP5 as unknown as { canvas: HTMLCanvasElement }).canvas;
            
            const copyCanvas = document.createElement('canvas');
            copyCanvas.width = tile.width;
            copyCanvas.height = tile.height;
            const ctx = copyCanvas.getContext('2d');
            ctx?.drawImage(tileCanvas, 0, 0);
            
            renderedTiles.push({ canvas: copyCanvas, info: tile });
            
            tileRenderer.dispose();
            tileP5.remove();
        }
        
        const finalCanvas = compositeTiles(renderedTiles, targetWidth, targetHeight);
        return finalCanvas.toDataURL('image/png');
    }

    p.setup = () => {
        p.setAttributes('version', true);  // Use WebGL 2 for built-in derivatives (fwidth)
        p.createCanvas(400, 300, p.WEBGL);
        p.pixelDensity(1);

        shaderRenderer = new ShaderRenderer(p);
        shaderRenderer.init();

        // Expose API for headless rendering
        window.cueAPI = {
            generateForAPI,
            isReady: true,
        };

        ui = new UI({
            onGenerate: (width, height, seededConfig, dimensions) => {
                generateArt(width, height, seededConfig, dimensions);
            },
            onExport: () => {
                exportFullResolution();
            },
        });
        ui.init();
        ui.showModal();
        
        p.noLoop();
    };

    p.draw = () => {

    };

    p.mousePressed = (event?: MouseEvent) => {
        const canvas = (p as unknown as { canvas: HTMLCanvasElement }).canvas;
        if (
            event?.target === canvas &&
            p.mouseX >= 0 && p.mouseX <= p.width &&
            p.mouseY >= 0 && p.mouseY <= p.height
        ) {
            generateArt(appState.targetWidth, appState.targetHeight);
        }
    };

    p.windowResized = () => {
        if (appState.targetWidth > 0 && appState.targetHeight > 0) {
            // Recalculate display scale for new window size
            const { displayScale } = calculatePreviewDimensions(appState.targetWidth, appState.targetHeight);
            appState.setDisplayScale(displayScale);
            applyDisplayScale(displayScale);
        }
    };
};

new p5(sketch);
