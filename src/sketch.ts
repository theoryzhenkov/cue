import p5 from 'p5';
import {
    generateLines,
    drawLineToBuffer,
    LineConfig,
    generateCircles,
    drawCircleToBuffer,
    CircleConfig,
} from './generators';
import { detectRegions } from './regionFiller';
import { ShaderRenderer, StainedGlassConfig } from './shaderRenderer';
import { CANVAS, LINES, CIRCLES, STAINED_GLASS } from './config';

const sketch = (p: p5) => {
    let shapeBuffer: p5.Graphics;
    let shaderRenderer: ShaderRenderer;
    let isGenerating = false;

    function generateArt() {
        if (isGenerating) return;
        isGenerating = true;

        // Clear shape buffer with white background
        shapeBuffer.background(255);

        // Generate lines
        const numLines = Math.floor(p.random(LINES.min, LINES.max));
        const lines: LineConfig[] = generateLines(p, numLines, CANVAS.width, CANVAS.height);

        // Generate circles
        const numCircles = Math.floor(p.random(CIRCLES.min, CIRCLES.max));
        const circles: CircleConfig[] = generateCircles(p, numCircles, CANVAS.width, CANVAS.height);

        // Draw all shapes to buffer (black strokes for boundary detection)
        for (const line of lines) {
            drawLineToBuffer(shapeBuffer, line);
        }
        for (const circle of circles) {
            drawCircleToBuffer(shapeBuffer, circle);
        }

        // Detect regions from shape buffer (CPU)
        shapeBuffer.loadPixels();
        // p5's type definitions incorrectly type pixels as number[], but it's actually Uint8ClampedArray
        const regionData = detectRegions(shapeBuffer.pixels as unknown as Uint8ClampedArray, CANVAS.width, CANVAS.height);

        // Build config with randomized noise seed
        const config: StainedGlassConfig = {
            ...STAINED_GLASS,
            noiseSeed: p.random(1000),
        };

        // Render regions with stained glass effect and rounded leading (GPU)
        p.background(255);
        shaderRenderer.render(regionData, config, lines, circles);

        isGenerating = false;
    }

    p.setup = () => {
        p.createCanvas(CANVAS.width, CANVAS.height, p.WEBGL);
        p.pixelDensity(1);

        // Create off-screen buffer for shape detection
        shapeBuffer = p.createGraphics(CANVAS.width, CANVAS.height);
        shapeBuffer.pixelDensity(1);

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
