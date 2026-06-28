/**
 * Server-side LLM proxy.
 *
 * Browser→third-party-API calls are blocked by CORS when the API server doesn't
 * handle the OPTIONS preflight (e.g. vLLM/uvicorn inference endpoints). This
 * module runs on the Bun server, which can call those APIs directly — server-to-
 * server fetch is not subject to CORS — and return the result to the browser
 * same-origin via /api/analyze.
 */

import type { LlmConfig } from '../llms/promptAnalyzer';
import { PromptDimensions, DEFAULT_DIMENSIONS } from '../config/types';
import { clamp } from '../utility/math';
// @ts-ignore
import ANALYSIS_PROMPT_TEMPLATE from '../config/prompt.txt' with { type: 'text' };

function extractJson(content: string): { valence?: number; arousal?: number; focus?: number } {
    // The expected payload is a flat {"valence":..,"arousal":..,"focus":..} object.
    // Match flat {...} regions (no nesting) so stray braces in surrounding prose
    // (e.g. a reasoning model's chain-of-thought) don't corrupt extraction.
    const candidates = content.match(/\{[^{}]*\}/g) || [];
    for (const c of candidates) {
        try {
            const obj = JSON.parse(c);
            if (obj && typeof obj === 'object') return obj;
        } catch { /* try next */ }
    }
    return JSON.parse(content);
}

/**
 * Call the configured LLM endpoint server-side and return the parsed dimensions.
 * Not subject to browser CORS. Returns DEFAULT_DIMENSIONS if config is incomplete.
 */
export async function runLlmRequest(prompt: string, config: LlmConfig): Promise<PromptDimensions> {
    if (!config.apiKey || !config.model || !config.endpoint) {
        return { ...DEFAULT_DIMENSIONS };
    }

    const userContent = ANALYSIS_PROMPT_TEMPLATE.replace('{PROMPT}', prompt);
    // Accept either a base URL (https://api.openai.com/v1) or the full path
    // (.../v1/chat/completions); don't double the suffix.
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
        };
        body = {
            model: config.model,
            max_tokens: 4096,
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
            max_tokens: 4096,
            messages: [{ role: 'user', content: userContent }],
            response_format: { type: 'json_object' },
        };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} ${response.statusText} — ${url}\n${error}`);
    }

    const data = await response.json();

    let content: string | undefined;
    if (config.provider === 'anthropic') {
        content = data.content?.[0]?.text;
    } else {
        const message = data.choices?.[0]?.message;
        // Reasoning models (e.g. GLM/Qwen) may leave `content` empty and put their
        // chain-of-thought in `reasoning_content`; fall back to it.
        content = message?.content || message?.reasoning_content;
    }

    if (!content) {
        throw new Error(
            'The model returned an empty response. If it is a reasoning model, ' +
            'it may have exhausted the token budget before producing an answer — ' +
            'try a non-reasoning model.'
        );
    }

    const parsed = extractJson(content);

    return {
        valence: clamp(parsed.valence ?? 0.5),
        arousal: clamp(parsed.arousal ?? 0.5),
        focus: clamp(parsed.focus ?? 0.5),
    };
}
