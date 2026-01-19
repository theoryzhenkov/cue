/**
 * Browser-based renderer for API endpoint
 * Uses Puppeteer with SwiftShader for CPU-based WebGL rendering
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { PromptDimensions, DEFAULT_DIMENSIONS } from '../config/types';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const MAX_POOL_SIZE = 2;
const PAGE_TIMEOUT = 60000; // 60 seconds for SwiftShader rendering

interface PooledPage {
    page: Page;
    inUse: boolean;
}

/**
 * Simple browser pool to reuse browser instances across requests
 */
class BrowserPool {
    private browser: Browser | null = null;
    private pages: PooledPage[] = [];
    private initializing: Promise<void> | null = null;

    async init(): Promise<void> {
        if (this.browser) return;
        if (this.initializing) {
            await this.initializing;
            return;
        }

        this.initializing = this.doInit();
        await this.initializing;
        this.initializing = null;
    }

    private async doInit(): Promise<void> {
        this.browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                // SwiftShader is used automatically when no GPU is available
                // These flags help with headless WebGL rendering
                '--use-gl=swiftshader',
                '--enable-webgl',
                '--ignore-gpu-blocklist',
            ],
        });

        // Pre-warm one page
        await this.createPage();
    }

    private async createPage(): Promise<PooledPage> {
        if (!this.browser) throw new Error('Browser not initialized');
        
        const page = await this.browser.newPage();
        
        // Set viewport for consistent rendering
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Navigate to the app and wait for it to be ready
        await page.goto(SERVER_URL, { waitUntil: 'networkidle0', timeout: PAGE_TIMEOUT });
        
        // Wait for the Cue API to be ready
        await page.waitForFunction('window.cueAPI && window.cueAPI.isReady', {
            timeout: PAGE_TIMEOUT,
        });
        
        const pooledPage: PooledPage = { page, inUse: false };
        this.pages.push(pooledPage);
        return pooledPage;
    }

    async acquire(): Promise<Page> {
        await this.init();
        
        // Find an available page
        let pooledPage = this.pages.find(p => !p.inUse);
        
        // Create a new page if none available and under limit
        if (!pooledPage && this.pages.length < MAX_POOL_SIZE) {
            pooledPage = await this.createPage();
        }
        
        // Wait for a page to become available
        if (!pooledPage) {
            await new Promise<void>(resolve => {
                const interval = setInterval(() => {
                    const available = this.pages.find(p => !p.inUse);
                    if (available) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 100);
            });
            pooledPage = this.pages.find(p => !p.inUse)!;
        }
        
        pooledPage.inUse = true;
        return pooledPage.page;
    }

    release(page: Page): void {
        const pooledPage = this.pages.find(p => p.page === page);
        if (pooledPage) {
            pooledPage.inUse = false;
        }
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.pages = [];
        }
    }
}

// Singleton browser pool
const browserPool = new BrowserPool();

/**
 * Render an image using headless browser
 * @param width - Image width in pixels
 * @param height - Image height in pixels  
 * @param dimensions - Prompt dimensions (valence, arousal, focus)
 * @returns Base64 encoded PNG image data
 */
export async function renderWithBrowser(
    width: number,
    height: number,
    dimensions: PromptDimensions = DEFAULT_DIMENSIONS
): Promise<Buffer> {
    const page = await browserPool.acquire();
    
    try {
        // Call the API function exposed on window
        const dataUrl = await page.evaluate(
            async (w, h, dims) => {
                return await window.cueAPI.generateForAPI(w, h, dims);
            },
            width,
            height,
            dimensions
        );
        
        // Convert data URL to buffer
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
        return Buffer.from(base64Data, 'base64');
    } finally {
        browserPool.release(page);
    }
}

/**
 * Initialize the browser pool (call during server startup for faster first request)
 */
export async function initBrowserPool(): Promise<void> {
    await browserPool.init();
}

/**
 * Close the browser pool (call during server shutdown)
 */
export async function closeBrowserPool(): Promise<void> {
    await browserPool.close();
}
