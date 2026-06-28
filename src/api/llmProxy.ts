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
    // The model is asked for JSON only, but be defensive: pull the first {...} block.
    const match = content.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : content);
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

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

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
