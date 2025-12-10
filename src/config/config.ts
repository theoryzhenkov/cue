/**
 * Configuration Template
 * 
 * Defines how each parameter is generated:
 * - range: [min, max] bounds
 * - beta: [alpha, beta] distribution shape (higher = tighter clustering)
 * - seed: { dimension, influence } - how sentiment affects the value
 */

import { ConfigTemplate } from './types';
import { REFERENCE_RESOLUTION } from './constants';

export const CONFIG_TEMPLATE: ConfigTemplate = {
    lines: {
        count: {
            range: [2, 8],
            beta: [2, 2],
            seed: { dimension: 'arousal', influence: 0.7 }
        },
        weight: {
            range: [6, 12],
            beta: [1.5, 1.5]
        }
    },

    circles: {
        count: {
            range: [0, 4],
            beta: [2, 2],
            seed: { dimension: 'arousal', influence: 0.6 }
        },
        weight: {
            range: [6, 12],
            beta: [1.5, 1.5]
        },
        radiusMin: 200,
        radiusMax: 600
    },

    colors: {
        hueBase: {
            range: [0, 1],
            beta: [1.5, 1.5],
            seed: { dimension: 'valence', influence: 0.8 }
        },
        hueRange: {
            range: [0.1, 0.3],
            beta: [2, 2],
            seed: { dimension: 'valence', influence: 0.4 }
        },
        saturation: {
            range: [0.35, 0.85],
            beta: [2, 2],
            seed: { dimension: 'valence', influence: 0.6 }
        },
        brightness: {
            range: [0.5, 0.95],
            beta: [2, 2],
            seed: { dimension: 'valence', influence: 0.5 }
        }
    },

    stainedGlass: {
        centerGlow: {
            range: [0.15, 0.45],
            beta: [2, 2],
            seed: { dimension: 'focus', influence: 0.5 }
        },
        edgeDarken: {
            range: [0.03, 0.18],
            beta: [2, 2],
            seed: { dimension: 'focus', influence: 0.4 }
        },
        glowFalloff: 100,
        noiseScale: 2.5,
        noiseIntensity: {
            range: [0.05, 0.3],
            beta: [2, 2],
            seed: { dimension: 'focus', influence: 0.5 }
        }
    },

    leading: {
        color: { r: 0.08, g: 0.06, b: 0.04 },
        roundingRadius: 15,
        thickness: 4
    },

    watercolor: {
        grainIntensity: {
            range: [0.008, 0.05],
            beta: [2, 2],
            seed: { dimension: 'focus', influence: 0.4 }
        },
        wobbleAmount: {
            range: [1, 10],
            beta: [2, 2],
            seed: { dimension: 'focus', influence: 0.6 }
        },
        wobbleScale: {
            range: [0.001, 0.005],
            beta: [1.5, 1.5],
            seed: { dimension: 'focus', influence: 0.3 }
        },
        colorBleed: {
            range: [0.02, 0.25],
            beta: [2, 2],
            seed: { dimension: 'focus', influence: 0.5 }
        },
        saturationBleed: {
            range: [0.03, 0.25],
            beta: [2, 2],
            seed: { dimension: 'focus', influence: 0.4 }
        },
        bleedScale: 0.0005,
        edgeIrregularity: 0.0
    },

    referenceResolution: REFERENCE_RESOLUTION
};
