/**
 * Configuration Template
 * 
 * Defines how each parameter is generated:
 * - range: [min, max] bounds
 * - beta: [alpha, beta] distribution shape (higher = tighter clustering)
 * - seed: { dimension, influence } - how sentiment affects the value
 */

import { ConfigTemplate, ConfigValueType } from './types';

export const CONFIG_TEMPLATE: ConfigTemplate = {
    lines: {
        density: {
            type: ConfigValueType.SEEDED,
            range: [0.2, 1],
            beta: [2, 2],
            seed: { dimension: 'arousal', influence: 0.7 }
        },
        weight: {
            type: ConfigValueType.SEEDED,
            range: [8, 10],
            beta: [1.5, 1.5]
        }
    },

    circles: {
        density: {
            type: ConfigValueType.SEEDED,
            range: [0.05, 0.3],
            beta: [2, 2],
            seed: { dimension: 'arousal', influence: 0.6 }
        },
        weight: {
            type: ConfigValueType.SEEDED,
            range: [8, 10],
            beta: [1.5, 1.5]
        },
        radius: {
            type: ConfigValueType.SEEDED,
            range: [0.18, 0.55],  // fraction of smaller screen dimension (for example, 0.18 = 18% of smaller screen dimension, if screen is 1920x1080, radius will be 0.18 * 1080 = 194.4) (made to be consistent with other values expressed in density)
            beta: [1.5, 1.5]
        }
    },

    colors: {
        hueBase: {
            type: ConfigValueType.SEEDED,
            range: [0, 1],
            beta: [1.5, 1.5],
            seed: { dimension: 'valence', influence: 0.8 }
        },
        hueRange: {
            type: ConfigValueType.SEEDED,
            range: [0.1, 0.3],
            beta: [2, 2],
            seed: { dimension: 'valence', influence: 0.4 }
        },
        saturation: {
            type: ConfigValueType.SEEDED,
            range: [0.35, 0.85],
            beta: [2, 2],
            seed: { dimension: 'valence', influence: 0.6 }
        },
        brightness: {
            type: ConfigValueType.SEEDED,
            range: [0.7, 0.9],
            beta: [2, 2],
            seed: { dimension: 'valence', influence: 0.5 }
        }
    },

    stainedGlass: {
        centerGlow: {
            type: ConfigValueType.SEEDED,
            range: [0.15, 0.45],
            beta: [2, 2],
            seed: { dimension: 'focus', influence: 0.5 }
        },
        edgeDarken: {
            type: ConfigValueType.SEEDED,
            range: [0.03, 0.18],
            beta: [2, 2],
            seed: { dimension: 'focus', influence: 0.4 }
        },
        glowFalloff: 100,
        noiseScale: 2.5,
        noiseIntensity: {
            type: ConfigValueType.SEEDED,
            range: [0.05, 0.1],
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
            type: ConfigValueType.SEEDED,
            range: [0.008, 0.05],
            beta: [2, 2],
            seed: { dimension: 'focus', influence: 0.4 }
        },
        colorBleed: {
            type: ConfigValueType.SEEDED,
            range: [0.02, 0.25],
            beta: [2, 2],
            seed: { dimension: 'focus', influence: 0.5 }
        },
        saturationBleed: {
            type: ConfigValueType.SEEDED,
            range: [0.03, 0.25],
            beta: [2, 2],
            seed: { dimension: 'focus', influence: 0.4 }
        },
        bleedScale: 0.0005
    }
};
