import p5 from 'p5';
import {
    generateLines,
    drawLineToBuffer,
    LineConfig,
    generateCircles,
    drawCircleToBuffer,
    CircleConfig,
    getResolutionScale,
} from './sketch/generators';
import { detectRegions, RegionData } from './sketch/regionFiller';
import { ShaderRenderer, TileConfig } from './sketch/shaderRenderer';
import { MAX_TILE_SIZE, PREVIEW_MAX_RESOLUTION } from './config/constants';
import { generateDefaultConfig } from './config/seedConfig';
import { AppConfig } from './config/types';
import { UI } from './ui';
import {
    calculateTileGrid,
    needsTiledRendering,
    compositeTiles,
    extractTileRegionData,
    scaleShapesForTile,
    downloadCanvas,
    TileInfo,
} from './sketch/tiledRenderer';

// Generation state - preserved for regeneration and export
interface GenerationState {
    targetWidth: number;
    targetHeight: number;
    previewWidth: number;
    previewHeight: number;
    displayScale: number;
    lines: LineConfig[];
    circles: CircleConfig[];
    noiseSeed: number;
    activeConfig: AppConfig;
}

const sketch = (p: p5) => {
    let shaderRenderer: ShaderRenderer;
    let ui: UI;
    let isGenerating = false;
    let state: GenerationState = {
        targetWidth: 1920,
        targetHeight: 1080,
        previewWidth: 1920,
        previewHeight: 1080,
        displayScale: 1,
        lines: [],
        circles: [],
        noiseSeed: 0,
        activeConfig: generateDefaultConfig(),
    };

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
     * Scale shapes from target resolution to preview resolution
     */
    function scaleShapesToPreview(
        lines: LineConfig[],
        circles: CircleConfig[],
        targetWidth: number,
        targetHeight: number,
        previewWidth: number,
        previewHeight: number
    ): { lines: LineConfig[]; circles: CircleConfig[] } {
        const scaleX = previewWidth / targetWidth;
        const scaleY = previewHeight / targetHeight;
        // Use uniform scale (should be the same due to aspect ratio preservation)
        const scale = scaleX;
        
        const scaledLines = lines.map(line => ({
            ...line,
            start: { x: line.start.x * scale, y: line.start.y * scale },
            end: { x: line.end.x * scale, y: line.end.y * scale },
            weight: line.weight * scale,
        }));
        
        const scaledCircles = circles.map(circle => ({
            ...circle,
            center: { x: circle.center.x * scale, y: circle.center.y * scale },
            radius: circle.radius * scale,
            weight: circle.weight * scale,
        }));
        
        return { lines: scaledLines, circles: scaledCircles };
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
     * Generate shapes at target resolution using resolved config.
     * Shape counts are already resolved in the config, scale with area for larger images.
     */
    function generateShapes(width: number, height: number, config: AppConfig): { lines: LineConfig[]; circles: CircleConfig[] } {
        // Get resolution-based scale factors
        const { countScale, sizeScale } = getResolutionScale(width, height, config.referenceResolution);
        
        const { lines: lineConfig, circles: circleConfig, colors: colorConfig } = config;
        
        // Use resolved shape counts (already determined by beta sampling + sentiment)
        // Scale by resolution for larger/smaller images
        const numLines = Math.max(1, Math.round(lineConfig.count * countScale));
        const numCircles = Math.round(circleConfig.count * countScale);
        
        // Generate shapes with scaled sizes
        const lines = generateLines(p, numLines, width, height, lineConfig, colorConfig);
        const circles = generateCircles(p, numCircles, width, height, circleConfig, colorConfig, sizeScale);
        
        return { lines, circles };
    }

    /**
     * Compute region data from shapes with seeded color parameters
     */
    function computeRegionData(
        lines: LineConfig[],
        circles: CircleConfig[],
        width: number,
        height: number,
        config: AppConfig
    ): RegionData {
        const buffer = p.createGraphics(width, height);
        buffer.pixelDensity(1);
        buffer.background(255);
        
        for (const line of lines) {
            drawLineToBuffer(buffer, line);
        }
        for (const circle of circles) {
            drawCircleToBuffer(buffer, circle);
        }
        
        buffer.loadPixels();
        const regionData = detectRegions(buffer.pixels as unknown as Uint8ClampedArray, width, height, config.colors);
        buffer.remove();
        
        return regionData;
    }

    /**
     * Render preview at capped resolution
     */
    function renderPreview(): void {
        const { previewWidth, previewHeight, targetWidth, targetHeight, lines, circles, noiseSeed, activeConfig } = state;
        
        // Scale shapes from target to preview resolution
        const { lines: previewLines, circles: previewCircles } = scaleShapesToPreview(
            lines, circles, targetWidth, targetHeight, previewWidth, previewHeight
        );
        
        // Compute region data at preview resolution with seeded colors
        const regionData = computeRegionData(previewLines, previewCircles, previewWidth, previewHeight, activeConfig);
        
        // Calculate preview scale (ratio of preview to target resolution)
        // This scales effect parameters so preview looks like a scaled-down final image
        const previewScale = previewWidth / targetWidth;
        
        // Render with preview scale for accurate visual representation
        p.background(255);
        shaderRenderer.render(regionData, activeConfig, noiseSeed, previewLines, previewCircles, previewScale);
    }

    /**
     * Generate new artwork with the given target resolution and seeded config
     */
    function generateArt(targetWidth: number, targetHeight: number, seededConfig?: AppConfig): void {
        if (isGenerating) return;
        isGenerating = true;
        
        // Use provided config or generate a new default one
        state.activeConfig = seededConfig ?? generateDefaultConfig();
        
        // Calculate preview dimensions and display scale
        const { renderWidth, renderHeight, displayScale } = calculatePreviewDimensions(targetWidth, targetHeight);
        
        // Resize canvas to preview resolution
        if (p.width !== renderWidth || p.height !== renderHeight) {
            p.resizeCanvas(renderWidth, renderHeight);
        }
        
        // Update state
        state.targetWidth = targetWidth;
        state.targetHeight = targetHeight;
        state.previewWidth = renderWidth;
        state.previewHeight = renderHeight;
        state.displayScale = displayScale;
        
        // Generate new shapes at target resolution using seeded config
        const { lines, circles } = generateShapes(targetWidth, targetHeight, state.activeConfig);
        state.lines = lines;
        state.circles = circles;
        state.noiseSeed = p.random(1000);
        
        // Render preview
        renderPreview();
        
        // Apply CSS scaling for display
        applyDisplayScale(displayScale);
        
        // Show canvas with fade-in
        const canvas = (p as unknown as { canvas: HTMLCanvasElement }).canvas;
        canvas.classList.add('visible');
        
        // Update resolution display
        ui.updateResolutionDisplay(targetWidth, targetHeight);
        
        isGenerating = false;
    }

    /**
     * Export full resolution image using tiled rendering if needed
     */
    async function exportFullResolution(): Promise<void> {
        const { targetWidth, targetHeight, lines, circles, noiseSeed, activeConfig } = state;
        
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
            
            const { lines: tileLines, circles: tileCircles } = scaleShapesForTile(
                lines, circles, tile, targetWidth, targetHeight
            );
            
            const tileRenderer = new ShaderRenderer(tileP5, p);
            tileRenderer.init();
            
            const tileConfig: TileConfig = {
                tileOffset: { x: tile.x, y: tile.y },
                fullResolution: { width: targetWidth, height: targetHeight },
            };
            
            // Scale = 1.0 for full resolution export
            tileRenderer.render(tileRegionData, activeConfig, noiseSeed, tileLines, tileCircles, 1.0, tileConfig);
            
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
        downloadCanvas(finalCanvas, `cue-${targetWidth}x${targetHeight}.png`);
        
        ui.hideProgress();
    }

    p.setup = () => {
        p.createCanvas(400, 300, p.WEBGL);
        p.pixelDensity(1);

        shaderRenderer = new ShaderRenderer(p);
        shaderRenderer.init();

        ui = new UI({
            onGenerate: (width, height, seededConfig) => {
                generateArt(width, height, seededConfig);
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
        // Drawing is handled by generateArt
    };

    p.mousePressed = (event?: MouseEvent) => {
        const canvas = (p as unknown as { canvas: HTMLCanvasElement }).canvas;
        
        // Only regenerate if the click was directly on the canvas element
        if (
            event?.target === canvas &&
            p.mouseX >= 0 && p.mouseX <= p.width &&
            p.mouseY >= 0 && p.mouseY <= p.height
        ) {
            generateArt(state.targetWidth, state.targetHeight);
        }
    };

    p.windowResized = () => {
        if (state.targetWidth > 0 && state.targetHeight > 0) {
            // Recalculate display scale for new window size
            const { displayScale } = calculatePreviewDimensions(state.targetWidth, state.targetHeight);
            state.displayScale = displayScale;
            applyDisplayScale(displayScale);
        }
    };
};

new p5(sketch);
