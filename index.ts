import index from "./index.html";
import { renderWithBrowser, initBrowserPool } from "./src/api/renderer";
import { PromptDimensions, DEFAULT_DIMENSIONS } from "./src/config/types";

/**
 * Parse numeric query parameter with bounds checking
 */
function parseNumber(value: string | null, defaultValue: number, min: number, max: number): number {
  if (!value) return defaultValue;
  const num = parseFloat(value);
  if (isNaN(num)) return defaultValue;
  return Math.max(min, Math.min(max, num));
}

/**
 * Parse API request parameters
 */
function parseGenerateParams(url: URL): { 
  width: number; 
  height: number; 
  dimensions: PromptDimensions;
} {
  const width = parseNumber(url.searchParams.get('width'), 1920, 100, 8192);
  const height = parseNumber(url.searchParams.get('height'), 1080, 100, 8192);
  
  const dimensions: PromptDimensions = {
    valence: parseNumber(url.searchParams.get('valence'), DEFAULT_DIMENSIONS.valence, 0, 1),
    arousal: parseNumber(url.searchParams.get('arousal'), DEFAULT_DIMENSIONS.arousal, 0, 1),
    focus: parseNumber(url.searchParams.get('focus'), DEFAULT_DIMENSIONS.focus, 0, 1),
  };
  
  return { width, height, dimensions };
}

Bun.serve({
  idleTimeout: 120,
  routes: {
    "/": index,
    
    "/api/generate": async (req) => {
      const url = new URL(req.url);
      const { width, height, dimensions } = parseGenerateParams(url);
      
      try {
        const imageBuffer = await renderWithBrowser(width, height, dimensions);
        
        return new Response(imageBuffer as unknown as BodyInit, {
          headers: {
            "Content-Type": "image/png",
            "Content-Disposition": `inline; filename="cue-${width}x${height}.png"`,
            "Cache-Control": "no-cache",
          },
        });
      } catch (error) {
        console.error("Failed to generate image:", error);
        return new Response(
          JSON.stringify({ error: "Failed to generate image" }),
          { 
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    },
  },
  development: {
    hmr: true,
  },
});

// Initialize browser pool in background (don't block server startup)
initBrowserPool().catch(console.error);

console.log(`Listening on http://localhost:3000`);
console.log(`API endpoint: http://localhost:3000/api/generate?width=1920&height=1080`);
