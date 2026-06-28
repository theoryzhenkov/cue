/**
 * Prompt Analyzer (browser-side).
 *
 * The browser calls the same-origin Bun route /api/analyze, which forwards the
 * request to the configured LLM endpoint server-side (see src/api/llmProxy.ts).
 * This sidesteps browser CORS entirely: many LLM inference servers (vLLM/
 * uvicorn) don't handle the OPTIONS preflight, so a direct browser fetch is
 * always blocked. The Bun server has no such restriction.
 *
 * Analyzes prompts on three dimensions:
 * - Valence: Emotional tone (0 = negative/dark, 1 = positive/bright)
 * - Arousal: Energy level (0 = calm/minimal, 1 = energetic/complex)
 * - Focus: Clarity/sharpness (0 = diffuse/dreamy, 1 = sharp/precise)
 */

import { PromptDimensions, DEFAULT_DIMENSIONS } from '../config/types';

export type LlmProvider = 'anthropic' | 'openai';

export interface LlmConfig {
    provider: LlmProvider;
    /** Base URL, e.g. https://api.anthropic.com/v1 or https://api.openai.com/v1 */
    endpoint: string;
    /** Model name, e.g. claude-sonnet-4-20250514 or gpt-4o-mini */
    model: string;
    apiKey: string;
}

/**
 * Sensible defaults per provider, used when the user switches provider in the UI
 * (or when nothing is stored yet).
 */
export const LLM_DEFAULTS: Record<LlmProvider, { endpoint: string; model: string }> = {
    anthropic: { endpoint: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
    openai: { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
};

/**
 * Analyze a prompt via the server-side proxy (/api/analyze).
 * Returns DEFAULT_DIMENSIONS if the config is incomplete. Throws on API errors.
 */
export async function analyzePrompt(prompt: string, config: LlmConfig): Promise<PromptDimensions> {
    if (!config.apiKey || !config.model || !config.endpoint) {
        return { ...DEFAULT_DIMENSIONS };
    }

    const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...config }),
    });

    if (!response.ok) {
        let message = `Analysis failed (HTTP ${response.status})`;
        try {
            const err = await response.json();
            if (err?.error) message = err.error;
        } catch { /* keep default */ }
        throw new Error(message);
    }

    return response.json();
}
