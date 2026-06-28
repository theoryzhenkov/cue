/**
 * Tiled Rendering System
 * 
 * Renders high-resolution images in smaller tiles to work within
 * mobile WebGL texture size limits, then composites them together.
 */

import { MAX_TILE_SIZE } from '../config/constants';
import { RegionData } from './regionFiller';

export interface TileInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    tileX: number;
    tileY: number;
}

export interface TiledRenderConfig {
    fullWidth: number;
    fullHeight: number;
    tileSize: number;
}

/**
 * Calculate tile grid for a given resolution
 */
export function calculateTileGrid(
    fullWidth: number,
    fullHeight: number,
    maxTileSize: number = MAX_TILE_SIZE
): TileInfo[] {
    const tiles: TileInfo[] = [];
    
    const tilesX = Math.ceil(fullWidth / maxTileSize);
    const tilesY = Math.ceil(fullHeight / maxTileSize);
    
    for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
            const x = tx * maxTileSize;
            const y = ty * maxTileSize;
            const width = Math.min(maxTileSize, fullWidth - x);
            const height = Math.min(maxTileSize, fullHeight - y);
            
            tiles.push({ x, y, width, height, tileX: tx, tileY: ty });
        }
    }
    
    return tiles;
}

/**
 * Check if tiled rendering is needed based on resolution and device capabilities
 */
export function needsTiledRendering(width: number, height: number): boolean {
    // Check WebGL max texture size
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) {
        // No WebGL, assume we need tiling
        return true;
    }
    
    const maxTextureSize = (gl as WebGLRenderingContext).getParameter(
        (gl as WebGLRenderingContext).MAX_TEXTURE_SIZE
    );
    
    // Also consider practical memory limits
    // Mobile Safari often crashes above 4096 even if technically supported
    const practicalLimit = Math.min(maxTextureSize, 2048);
    
    return width > practicalLimit || height > practicalLimit;
}

/**
 * Composite multiple tile canvases into a single output canvas
 */
export function compositeTiles(
    tiles: { canvas: HTMLCanvasElement; info: TileInfo }[],
    fullWidth: number,
    fullHeight: number
): HTMLCanvasElement {
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = fullWidth;
    outputCanvas.height = fullHeight;
    
    const ctx = outputCanvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to get 2D context for compositing');
    }
    
    // Draw each tile at its position
    for (const { canvas, info } of tiles) {
        ctx.drawImage(canvas, info.x, info.y);
    }
    
    return outputCanvas;
}

/**
 * Extract a tile region from full-resolution data arrays.
 * Only extracts region IDs - distance is computed analytically in shader.
 */
export function extractTileRegionData(
    fullRegionData: RegionData,
    tile: TileInfo,
    fullWidth: number,
    fullHeight: number
): RegionData {
    const tileSize = tile.width * tile.height;
    const tileIds = new Uint8Array(tileSize);
    
    // Copy region IDs for this tile
    for (let localY = 0; localY < tile.height; localY++) {
        for (let localX = 0; localX < tile.width; localX++) {
            const globalX = tile.x + localX;
            const globalY = tile.y + localY;
            
            const localIdx = localY * tile.width + localX;
            const globalIdx = globalY * fullWidth + globalX;
            
            tileIds[localIdx] = fullRegionData.ids[globalIdx];
        }
    }
    
    return {
        ids: tileIds,
        colors: fullRegionData.colors, // Colors are shared (indexed by region ID)
        glass: fullRegionData.glass,   // Glass flags are shared (indexed by region ID)
    };
}

/**
 * Download canvas as PNG
 */
export function downloadCanvas(canvas: HTMLCanvasElement, filename: string = 'cue-artwork.png'): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
}


