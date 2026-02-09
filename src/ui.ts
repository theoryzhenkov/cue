/**
 * UI Module - Resolution picker, prompt input, and controls
 */

import { RESOLUTION_PRESETS, Resolution } from './config/constants';
import { analyzePrompt } from './llms/promptAnalyzer';
import { PromptDimensions, DEFAULT_DIMENSIONS, AppConfig } from './config/types';
import { resolveConfig } from './config/seedConfig';
import { createElement, HelpCircle, Settings, Download, Eye, EyeOff, ChevronDown } from 'lucide';
import './theme/ui.css';

/**
 * Create an SVG string from a Lucide icon
 */
function createIconSVG(icon: any, size: number = 18): string {
    const svg = createElement(icon);
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('fill', 'none');
    return svg.outerHTML;
}

const API_KEY_STORAGE_KEY = 'cue-anthropic-api-key';

export interface UICallbacks {
    onGenerate: (width: number, height: number, seededConfig: AppConfig, dimensions: PromptDimensions) => void;
    onExport: () => void;
}

/**
 * Creates and manages the UI overlay
 */
export class UI {
    private modal: HTMLElement | null = null;
    private apiDocsModal: HTMLElement | null = null;
    private controlsBar: HTMLElement | null = null;
    private selectedResolution: Resolution;
    private defaultPresetIndex: number;
    private customWidth: number = 1920;
    private customHeight: number = 1080;
    private isCustom: boolean = false;
    private callbacks: UICallbacks;
    private hasGeneratedOnce: boolean = false;

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
            <p class="cue-subtitle"></p>
            
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
                    <span class="cue-select-chevron">${createIconSVG(ChevronDown, 14)}</span>
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
                        ${createIconSVG(Eye, 16)}
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

        widthInput?.addEventListener('change', () => {
            this.customWidth = Math.max(100, Math.min(8192, parseInt(widthInput.value) || 1920));
            widthInput.value = String(this.customWidth);
        });

        heightInput?.addEventListener('change', () => {
            this.customHeight = Math.max(100, Math.min(8192, parseInt(heightInput.value) || 1080));
            heightInput.value = String(this.customHeight);
        });

        apiKeyToggle?.addEventListener('click', () => {
            const isPassword = apiKeyInput.type === 'password';
            apiKeyInput.type = isPassword ? 'text' : 'password';
            apiKeyToggle.classList.toggle('visible', isPassword);
            // Update icon
            apiKeyToggle.innerHTML = isPassword ? createIconSVG(EyeOff, 16) : createIconSVG(Eye, 16);
        });

        apiKeyInput?.addEventListener('blur', () => {
            this.storeApiKey(apiKeyInput.value.trim());
        });

        generateBtn?.addEventListener('click', async () => {
            const width = this.isCustom ? this.customWidth : this.selectedResolution.width;
            const height = this.isCustom ? this.customHeight : this.selectedResolution.height;
            const prompt = promptInput?.value.trim() || '';
            const apiKey = apiKeyInput?.value.trim() || '';

            this.storeApiKey(apiKey);

            generateBtn.disabled = true;
            generateBtn.textContent = 'Analyzing...';

            let dimensions: PromptDimensions;

            try {
                if (prompt && apiKey) {
                    dimensions = await analyzePrompt(prompt, apiKey);
                } else {
                    dimensions = { ...DEFAULT_DIMENSIONS };
                }
            } catch (error) {
                console.error('Prompt analysis failed:', error);
                dimensions = { ...DEFAULT_DIMENSIONS };
                generateBtn.textContent = 'Analysis failed, using defaults...';
                await new Promise(r => setTimeout(r, 1000));
            }

            const seededConfig = resolveConfig(undefined, dimensions);

            generateBtn.disabled = false;
            generateBtn.textContent = 'Send Cue';
            
            this.hideModal();
            this.showControls();
            this.updateResolutionDisplay(width, height);
            this.callbacks.onGenerate(width, height, seededConfig, dimensions);
            this.hasGeneratedOnce = true;
        });
    }

    private createControlsBar(): void {
        const controls = document.createElement('div');
        controls.className = 'cue-controls';

        controls.innerHTML = `
            <button class="cue-icon-btn" id="btn-api-docs" title="API documentation">
                ${createIconSVG(HelpCircle)}
            </button>
            <span class="resolution-label">0 × 0</span>
            <div class="cue-controls-divider"></div>
            <button class="cue-icon-btn" id="btn-settings" title="Change resolution">
                ${createIconSVG(Settings)}
            </button>
            <button class="cue-icon-btn" id="btn-download" title="Download image">
                ${createIconSVG(Download)}
            </button>
        `;

        document.body.appendChild(controls);
        this.controlsBar = controls;

        const apiDocsBtn = controls.querySelector('#btn-api-docs');
        apiDocsBtn?.addEventListener('click', () => {
            this.showApiDocs();
        });

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

    /**
     * Show API documentation modal
     */
    showApiDocs(): void {
        if (!this.apiDocsModal) {
            this.createApiDocsModal();
        }
        this.apiDocsModal?.classList.add('visible');
    }

    /**
     * Hide API documentation modal
     */
    hideApiDocs(): void {
        if (this.apiDocsModal) {
            this.apiDocsModal.classList.remove('visible');
        }
    }

    private createApiDocsModal(): void {
        const overlay = document.createElement('div');
        overlay.className = 'cue-modal-overlay';
        overlay.id = 'api-docs-overlay';

        const modal = document.createElement('div');
        modal.className = 'cue-modal cue-api-docs-modal';

        const baseUrl = 'https://cue.theor.net';

        modal.innerHTML = `
            <h1 class="cue-title">API Documentation</h1>
            
            <div class="cue-api-docs-content">
                <section class="cue-api-docs-section">
                    <h2 class="cue-api-docs-heading">Endpoint</h2>
                    <code class="cue-api-docs-code">GET ${baseUrl}/api/generate</code>
                </section>

                <section class="cue-api-docs-section">
                    <h2 class="cue-api-docs-heading">Parameters</h2>
                    <table class="cue-api-docs-table">
                        <thead>
                            <tr>
                                <th>Parameter</th>
                                <th>Type</th>
                                <th>Range</th>
                                <th>Default</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><code>width</code></td>
                                <td>number</td>
                                <td>100-8192</td>
                                <td>1920</td>
                                <td>Image width in pixels</td>
                            </tr>
                            <tr>
                                <td><code>height</code></td>
                                <td>number</td>
                                <td>100-8192</td>
                                <td>1080</td>
                                <td>Image height in pixels</td>
                            </tr>
                            <tr>
                                <td><code>valence</code></td>
                                <td>number</td>
                                <td>0-1</td>
                                <td>0.5</td>
                                <td>Emotional tone (0 = negative/dark, 1 = positive/bright)</td>
                            </tr>
                            <tr>
                                <td><code>arousal</code></td>
                                <td>number</td>
                                <td>0-1</td>
                                <td>0.5</td>
                                <td>Energy level (0 = calm/minimal, 1 = energetic/complex)</td>
                            </tr>
                            <tr>
                                <td><code>focus</code></td>
                                <td>number</td>
                                <td>0-1</td>
                                <td>0.5</td>
                                <td>Clarity/sharpness (0 = diffuse/dreamy, 1 = sharp/precise)</td>
                            </tr>
                        </tbody>
                    </table>
                </section>

                <section class="cue-api-docs-section">
                    <h2 class="cue-api-docs-heading">Response</h2>
                    <p>Returns a PNG image with:</p>
                    <ul class="cue-api-docs-list">
                        <li><strong>Content-Type:</strong> <code>image/png</code></li>
                        <li><strong>Content-Disposition:</strong> <code>inline; filename="cue-{width}x{height}.png"</code></li>
                        <li><strong>Cache-Control:</strong> <code>no-cache</code></li>
                    </ul>
                </section>

                <section class="cue-api-docs-section">
                    <h2 class="cue-api-docs-heading">Example</h2>
                    <pre class="cue-api-docs-pre"><code>${baseUrl}/api/generate?width=1920&height=1080&valence=0.7&arousal=0.6&focus=0.8</code></pre>
                </section>

                <section class="cue-api-docs-section">
                    <h2 class="cue-api-docs-heading">cURL Example</h2>
                    <pre class="cue-api-docs-pre"><code>curl "${baseUrl}/api/generate?width=1920&height=1080&valence=0.7&arousal=0.6&focus=0.8" \\
  --output cue-image.png</code></pre>
                </section>
            </div>

            <button class="cue-generate-btn" id="api-docs-close">Close</button>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        this.apiDocsModal = overlay;

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.hideApiDocs();
            }
        });

        const closeBtn = modal.querySelector('#api-docs-close');
        closeBtn?.addEventListener('click', () => {
            this.hideApiDocs();
        });
    }
}
