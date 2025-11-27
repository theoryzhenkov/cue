import p5 from 'p5';
import { generateLines, drawLineToBuffer, LineConfig } from './generators';
import { detectRegions } from './regionFiller';
import { ShaderRenderer, StainedGlassConfig } from './shaderRenderer';
import { CANVAS, LINES, STAINED_GLASS } from './config';

const sketch = (p: p5) => {
    let lineBuffer: p5.Graphics;
    let shaderRenderer: ShaderRenderer;
    let isGenerating = false;

    function generateArt() {
        if (isGenerating) return;
        isGenerating = true;

        // Clear line buffer with white background
        lineBuffer.background(255);

        // Generate lines
        const numLines = Math.floor(p.random(LINES.min, LINES.max));
        const lines: LineConfig[] = generateLines(p, numLines, CANVAS.width, CANVAS.height);

        // Draw lines to buffer (black lines for boundary detection)
        for (const line of lines) {
            drawLineToBuffer(lineBuffer, line);
        }

        // Detect regions from line buffer (CPU)
        lineBuffer.loadPixels();
        // p5's type definitions incorrectly type pixels as number[], but it's actually Uint8ClampedArray
        const regionData = detectRegions(lineBuffer.pixels as unknown as Uint8ClampedArray, CANVAS.width, CANVAS.height);

        // Build config with randomized noise seed
        const config: StainedGlassConfig = {
            ...STAINED_GLASS,
            noiseSeed: p.random(1000),
        };

        // Render regions with stained glass effect and rounded leading (GPU)
        p.background(255);
        shaderRenderer.render(regionData, config, lines);

        isGenerating = false;
    }

    p.setup = () => {
        p.createCanvas(CANVAS.width, CANVAS.height, p.WEBGL);
        p.pixelDensity(1);

        // Create off-screen buffer for line detection
        lineBuffer = p.createGraphics(CANVAS.width, CANVAS.height);
        lineBuffer.pixelDensity(1);

        // Initialize shader renderer
        shaderRenderer = new ShaderRenderer(p);
        shaderRenderer.init();

        generateArt();
    };

    p.draw = () => {
        p.noLoop();
    };

    p.mousePressed = () => {
        generateArt();
    };
};

new p5(sketch);
