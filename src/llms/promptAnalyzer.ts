/**
 * Prompt Analyzer - Uses an LLM to extract emotional dimensions from text.
 *
 * Supports any Anthropic or OpenAI-compatible chat-completions endpoint:
 * the caller supplies the provider, base URL, model name, and API key.
 *
 * Analyzes prompts on three dimensions:
 * - Valence: Emotional tone (0 = negative/dark, 1 = positive/bright)
 * - Arousal: Energy level (0 = calm/minimal, 1 = energetic/complex)
 * - Focus: Clarity/sharpness (0 = diffuse/dreamy, 1 = sharp/precise)
 */

import { PromptDimensions, DEFAULT_DIMENSIONS } from '../config/types';
import { clamp } from '../utility/math';
// @ts-ignore
import ANALYSIS_PROMPT_TEMPLATE from '../config/prompt.txt' with { type: 'text' };

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

function extractJson(content: string): { valence?: number; arousal?: number; focus?: number } {
    // The model is asked for JSON only, but be defensive: pull the first {...} block.
    const match = content.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : content);
}

/**
 * Analyze a prompt using the configured LLM endpoint.
 * Returns DEFAULT_DIMENSIONS if the config is incomplete.
 */
export async function analyzePrompt(prompt: string, config: LlmConfig): Promise<PromptDimensions> {
    if (!config.apiKey || !config.model || !config.endpoint) {
        return { ...DEFAULT_DIMENSIONS };
    }

    const userContent = ANALYSIS_PROMPT_TEMPLATE.replace('{PROMPT}', prompt);
    // Accept either a base URL (e.g. https://api.openai.com/v1) or the full
    // path (e.g. .../v1/chat/completions); don't double the suffix.
    const base = config.endpoint.replace(/\/+$/, '');

    let url: string;
    let headers: Record<string, string>;
    let body: Record<string, unknown>;

    if (config.provider === 'anthropic') {
        url = /\/messages$/.test(base) ? base : `${base}/messages`;
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        };
        body = {
            model: config.model,
            max_tokens: 100,
            messages: [{ role: 'user', content: userContent }],
        };
    } else {
        url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
        headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        };
        body = {
            model: config.model,
            max_tokens: 100,
            messages: [{ role: 'user', content: userContent }],
            response_format: { type: 'json_object' },
        };
    }

    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
    } catch (err) {
        // Browser fetch rejects (TypeError) on network failure or CORS block.
        throw new Error(
            `Could not reach ${url}. Check the endpoint URL and that the ` +
            `server allows browser requests (CORS). (${(err as Error).message})`
        );
    }

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content =
        config.provider === 'anthropic'
            ? data.content?.[0]?.text
            : data.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error('No response content from API');
    }

    const parsed = extractJson(content);

    return {
        valence: clamp(parsed.valence ?? 0.5),
        arousal: clamp(parsed.arousal ?? 0.5),
        focus: clamp(parsed.focus ?? 0.5),
    };
}
