/**
 * UI Module - Resolution picker, prompt input, and controls
 */

import { RESOLUTION_PRESETS, Resolution } from './config/constants';
import { analyzePrompt, PromptDimensions, getDefaultDimensions } from './llms/promptAnalyzer';
import { generateSeededConfig } from './config/seedConfig';
import { AppConfig } from './config/types';
import './theme/ui.css';

const API_KEY_STORAGE_KEY = 'cue-anthropic-api-key';

export interface UICallbacks {
    onGenerate: (width: number, height: number, seededConfig: AppConfig) => void;
    onExport: () => void;
}

/**
 * Creates and manages the UI overlay
 */
export class UI {
    private modal: HTMLElement | null = null;
    private controlsBar: HTMLElement | null = null;
    private selectedResolution: Resolution;
    private defaultPresetIndex: number;
    private customWidth: number = 1920;
    private customHeight: number = 1080;
    private isCustom: boolean = false;
    private callbacks: UICallbacks;
    private hasGeneratedOnce: boolean = false;
    private lastSeededConfig: AppConfig | null = null;

    constructor(callbacks: UICallbacks) {
        this.callbacks = callbacks;
        this.defaultPresetIndex = this.getDefaultPresetIndex();
        this.selectedResolution = RESOLUTION_PRESETS[this.defaultPresetIndex];
    }

    /**
     * Detect if device is mobile and return appropriate default preset index
     */
    private getDefaultPresetIndex(): number {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            || (window.innerWidth <= 768);
        
        if (isMobile) {
            const phoneIndex = RESOLUTION_PRESETS.findIndex(p => p.name === 'Phone Portrait');
            return phoneIndex >= 0 ? phoneIndex : 0;
        }
        
        return 0;
    }

    /**
     * Initialize the UI - creates modal and attaches to DOM
     */
    init(): void {
        this.createModal();
    }

    /**
     * Show the resolution picker modal
     */
    showModal(): void {
        if (this.modal) {
            this.modal.classList.add('visible');
        }
    }

    /**
     * Hide the modal
     */
    hideModal(): void {
        if (this.modal) {
            this.modal.classList.remove('visible');
        }
    }

    /**
     * Show the controls bar (after generation)
     */
    showControls(): void {
        if (!this.controlsBar) {
            this.createControlsBar();
        }
        this.controlsBar?.classList.add('visible');
    }

    /**
     * Update controls bar with current resolution info
     */
    updateResolutionDisplay(width: number, height: number): void {
        const resLabel = this.controlsBar?.querySelector('.resolution-label');
        if (resLabel) {
            resLabel.textContent = `${width} × ${height}`;
        }
    }

    /**
     * Get the last seeded config (for regeneration with same mood)
     */
    getLastSeededConfig(): AppConfig | null {
        return this.lastSeededConfig;
    }

    private getStoredApiKey(): string {
        return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
    }

    private storeApiKey(key: string): void {
        if (key) {
            localStorage.setItem(API_KEY_STORAGE_KEY, key);
        } else {
            localStorage.removeItem(API_KEY_STORAGE_KEY);
        }
    }

    private createModal(): void {
        const overlay = document.createElement('div');
        overlay.className = 'cue-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'cue-modal';

        const storedApiKey = this.getStoredApiKey();

        modal.innerHTML = `
            <h1 class="cue-title">Cue</h1>
            <p class="cue-subtitle">Generative stained glass</p>
            
            <div class="cue-prompt-section">
                <textarea 
                    class="cue-prompt" 
                    id="prompt-input" 
                    placeholder="Describe a mood, scene, or feeling..."
                    rows="3"
                ></textarea>
                <p class="cue-prompt-hint">Valence → colors · Arousal → complexity · Focus → sharpness</p>
            </div>
            
            <div class="cue-dimension-row">
                <div class="cue-dimension-selector">
                    <select class="cue-select" id="preset-select">
                        ${RESOLUTION_PRESETS.map((preset, i) => `
                            <option value="${i}" ${i === this.defaultPresetIndex ? 'selected' : ''}>
                                ${preset.name} — ${preset.width}×${preset.height}
                            </option>
                        `).join('')}
                        <option value="custom">Custom</option>
                    </select>
                    <svg class="cue-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </div>
                
                <div class="cue-custom-inputs">
                    <input type="number" class="cue-input" id="custom-width" placeholder="W" value="1920" min="100" max="8192">
                    <span class="cue-times">×</span>
                    <input type="number" class="cue-input" id="custom-height" placeholder="H" value="1080" min="100" max="8192">
                </div>
            </div>

            <div class="cue-api-key-section">
                <div class="cue-api-key-row">
                    <input 
                        type="password" 
                        class="cue-api-key" 
                        id="api-key-input" 
                        placeholder="Anthropic API key (optional)"
                        value="${storedApiKey}"
                    >
                    <button class="cue-api-key-toggle" id="api-key-toggle" type="button">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                </div>
            </div>

            <button class="cue-generate-btn" id="generate-btn">Send Cue</button>
            
            <p class="cue-hint">Click the canvas to regenerate with new colors</p>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        this.modal = overlay;

        this.attachModalEvents(modal);
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && this.hasGeneratedOnce) {
                this.hideModal();
            }
        });
    }

    private attachModalEvents(modal: HTMLElement): void {
        const presetSelect = modal.querySelector('#preset-select') as HTMLSelectElement;
        const customInputs = modal.querySelector('.cue-custom-inputs');
        const widthInput = modal.querySelector('#custom-width') as HTMLInputElement;
        const heightInput = modal.querySelector('#custom-height') as HTMLInputElement;
        const promptInput = modal.querySelector('#prompt-input') as HTMLTextAreaElement;
        const apiKeyInput = modal.querySelector('#api-key-input') as HTMLInputElement;
        const apiKeyToggle = modal.querySelector('#api-key-toggle') as HTMLButtonElement;
        const generateBtn = modal.querySelector('#generate-btn') as HTMLButtonElement;

        // Preset selection via dropdown
        presetSelect?.addEventListener('change', () => {
            const value = presetSelect.value;
            if (value === 'custom') {
                this.isCustom = true;
                customInputs?.classList.add('active');
                widthInput?.focus();
            } else {
                this.isCustom = false;
                const index = parseInt(value);
                this.selectedResolution = RESOLUTION_PRESETS[index];
                customInputs?.classList.remove('active');
            }
        });

        // Custom input changes
        widthInput?.addEventListener('change', () => {
            this.customWidth = Math.max(100, Math.min(8192, parseInt(widthInput.value) || 1920));
            widthInput.value = String(this.customWidth);
        });

        heightInput?.addEventListener('change', () => {
            this.customHeight = Math.max(100, Math.min(8192, parseInt(heightInput.value) || 1080));
            heightInput.value = String(this.customHeight);
        });

        // API key visibility toggle
        apiKeyToggle?.addEventListener('click', () => {
            const isPassword = apiKeyInput.type === 'password';
            apiKeyInput.type = isPassword ? 'text' : 'password';
            apiKeyToggle.classList.toggle('visible', isPassword);
        });

        // Store API key on blur
        apiKeyInput?.addEventListener('blur', () => {
            this.storeApiKey(apiKeyInput.value.trim());
        });

        // Generate button
        generateBtn?.addEventListener('click', async () => {
            const width = this.isCustom ? this.customWidth : this.selectedResolution.width;
            const height = this.isCustom ? this.customHeight : this.selectedResolution.height;
            const prompt = promptInput?.value.trim() || '';
            const apiKey = apiKeyInput?.value.trim() || '';

            // Store API key
            this.storeApiKey(apiKey);

            // Disable button during processing
            generateBtn.disabled = true;
            generateBtn.textContent = 'Analyzing...';

            let dimensions: PromptDimensions;

            try {
                if (prompt && apiKey) {
                    dimensions = await analyzePrompt(prompt, apiKey);
                } else {
                    dimensions = getDefaultDimensions();
                }
            } catch (error) {
                console.error('Prompt analysis failed:', error);
                dimensions = getDefaultDimensions();
                // Brief error indication
                generateBtn.textContent = 'Analysis failed, using defaults...';
                await new Promise(r => setTimeout(r, 1000));
            }

            const seededConfig = generateSeededConfig(dimensions);
            this.lastSeededConfig = seededConfig;

            generateBtn.disabled = false;
            generateBtn.textContent = 'Send Cue';
            
            this.hideModal();
            this.showControls();
            this.updateResolutionDisplay(width, height);
            this.callbacks.onGenerate(width, height, seededConfig);
            this.hasGeneratedOnce = true;
        });
    }

    private createControlsBar(): void {
        const controls = document.createElement('div');
        controls.className = 'cue-controls';

        controls.innerHTML = `
            <span class="resolution-label">0 × 0</span>
            <div class="cue-controls-divider"></div>
            <button class="cue-icon-btn" id="btn-settings" title="Change resolution">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                </svg>
            </button>
            <button class="cue-icon-btn" id="btn-download" title="Download image">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7,10 12,15 17,10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
            </button>
        `;

        document.body.appendChild(controls);
        this.controlsBar = controls;

        const settingsBtn = controls.querySelector('#btn-settings');
        settingsBtn?.addEventListener('click', () => {
            this.showModal();
        });

        const downloadBtn = controls.querySelector('#btn-download');
        downloadBtn?.addEventListener('click', () => {
            this.callbacks.onExport();
        });
    }

    /**
     * Show a progress indicator during export
     */
    showProgress(text: string): HTMLElement {
        let progress = document.querySelector('.cue-progress') as HTMLElement;
        if (!progress) {
            progress = document.createElement('div');
            progress.className = 'cue-progress';
            progress.innerHTML = `<p class="cue-progress-text">${text}</p>`;
            document.body.appendChild(progress);
        } else {
            const textEl = progress.querySelector('.cue-progress-text');
            if (textEl) textEl.textContent = text;
        }
        progress.classList.add('visible');
        return progress;
    }

    /**
     * Update progress text
     */
    updateProgress(text: string): void {
        const progress = document.querySelector('.cue-progress');
        const textEl = progress?.querySelector('.cue-progress-text');
        if (textEl) textEl.textContent = text;
    }

    /**
     * Hide progress indicator
     */
    hideProgress(): void {
        const progress = document.querySelector('.cue-progress');
        progress?.classList.remove('visible');
    }
}
