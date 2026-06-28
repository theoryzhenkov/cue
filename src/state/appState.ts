/**
 * AppState - Single source of truth for application state
 */

import { LineConfig, CircleConfig, CurveConfig } from '../sketch/generators';
import { AppConfig, PromptDimensions, DEFAULT_DIMENSIONS } from '../config/types';
import { resolveConfig } from '../config/seedConfig';

export interface GenerationState {
    targetWidth: number;
    targetHeight: number;
    previewWidth: number;
    previewHeight: number;
    displayScale: number;
    lines: LineConfig[];
    circles: CircleConfig[];
    curves: CurveConfig[];
    noiseSeed: number;
    activeConfig: AppConfig;
    promptDimensions: PromptDimensions;
}

/**
 * Centralized application state manager
 */
export class AppState {
    private state: GenerationState;

    constructor() {
        this.state = {
            targetWidth: 1920,
            targetHeight: 1080,
            previewWidth: 1920,
            previewHeight: 1080,
            displayScale: 1,
            lines: [],
            circles: [],
            curves: [],
            noiseSeed: 0,
            activeConfig: resolveConfig(),
            promptDimensions: DEFAULT_DIMENSIONS,
        };
    }

    // Getters for read-only access
    get targetWidth(): number {
        return this.state.targetWidth;
    }

    get targetHeight(): number {
        return this.state.targetHeight;
    }

    get previewWidth(): number {
        return this.state.previewWidth;
    }

    get previewHeight(): number {
        return this.state.previewHeight;
    }

    get displayScale(): number {
        return this.state.displayScale;
    }

    get lines(): LineConfig[] {
        return this.state.lines;
    }

    get circles(): CircleConfig[] {
        return this.state.circles;
    }

    get curves(): CurveConfig[] {
        return this.state.curves;
    }

    get noiseSeed(): number {
        return this.state.noiseSeed;
    }

    get activeConfig(): AppConfig {
        return this.state.activeConfig;
    }

    get promptDimensions(): PromptDimensions {
        return this.state.promptDimensions;
    }

    // Get full state snapshot (for destructuring)
    getState(): GenerationState {
        return { ...this.state };
    }

    // Setters for controlled updates
    setDimensions(targetWidth: number, targetHeight: number, previewWidth: number, previewHeight: number, displayScale: number): void {
        this.state.targetWidth = targetWidth;
        this.state.targetHeight = targetHeight;
        this.state.previewWidth = previewWidth;
        this.state.previewHeight = previewHeight;
        this.state.displayScale = displayScale;
    }

    setShapes(lines: LineConfig[], circles: CircleConfig[], curves: CurveConfig[] = []): void {
        this.state.lines = lines;
        this.state.circles = circles;
        this.state.curves = curves;
    }

    setNoiseSeed(seed: number): void {
        this.state.noiseSeed = seed;
    }

    setConfig(config: AppConfig, dimensions?: PromptDimensions): void {
        this.state.activeConfig = config;
        if (dimensions) {
            this.state.promptDimensions = dimensions;
        }
    }

    setDisplayScale(scale: number): void {
        this.state.displayScale = scale;
    }
}

// Export singleton instance
export const appState = new AppState();
