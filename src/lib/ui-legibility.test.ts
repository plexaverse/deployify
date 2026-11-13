import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
    resolveUiLegibilityMode,
    resolveTypeSize,
    uiLegibilityAttrs,
} from './ui-legibility';

const ENV_KEYS = ['UI_LEGIBILITY_MODE', 'UI_TYPE_SCALE_BASE', 'UI_TYPE_SCALE_LG'] as const;
const saved: Record<string, string | undefined> = {};

describe('UI legibility rollout flag', () => {
    beforeEach(() => {
        for (const k of ENV_KEYS) saved[k] = process.env[k];
        for (const k of ENV_KEYS) delete process.env[k];
    });

    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    });

    // The single most important guarantee: an unconfigured deploy is unchanged.
    test('defaults to off when the env var is absent', () => {
        assert.strictEqual(resolveUiLegibilityMode(undefined), 'off');
        assert.deepStrictEqual(uiLegibilityAttrs('off'), {});
    });

    test('off mode emits no attributes at all', () => {
        const attrs = uiLegibilityAttrs(resolveUiLegibilityMode(undefined));
        assert.deepStrictEqual(attrs, {});
        assert.strictEqual(attrs.contrast, undefined);
        assert.strictEqual(attrs.scale, undefined);
        assert.strictEqual(attrs.style, undefined);
    });

    test('unrecognised values fall back to off rather than throwing', () => {
        for (const raw of ['', '   ', 'yes', 'true', '1', 'FULLY', 'enforce']) {
            assert.strictEqual(resolveUiLegibilityMode(raw), 'off', `for ${JSON.stringify(raw)}`);
        }
    });

    test('mode parsing is case- and whitespace-insensitive', () => {
        assert.strictEqual(resolveUiLegibilityMode(' Contrast '), 'contrast');
        assert.strictEqual(resolveUiLegibilityMode('FULL'), 'full');
        assert.strictEqual(resolveUiLegibilityMode('off'), 'off');
    });

    // Stage 1 must not change any box metric, so it must not emit the scale gate.
    test('contrast mode gates colour only, never the type scale', () => {
        const attrs = uiLegibilityAttrs('contrast');
        assert.deepStrictEqual(attrs, { contrast: 'v2' });
        assert.strictEqual(attrs.scale, undefined);
    });

    test('full mode gates both and carries the default sizes', () => {
        assert.deepStrictEqual(uiLegibilityAttrs('full', undefined, undefined), {
            contrast: 'v2',
            scale: 'v2',
            style: { '--ui-fs-1': '13px', '--ui-fs-2': '16px' },
        });
    });

    test('sizes are tunable per environment without a code change', () => {
        assert.deepStrictEqual(uiLegibilityAttrs('full', '11px', '14px').style, {
            '--ui-fs-1': '11px',
            '--ui-fs-2': '14px',
        });
    });

    // The size value is interpolated into a style attribute, so it is validated.
    test('malformed or hostile size values fall back to the defaults', () => {
        const hostile = [
            'red;background:url(javascript:alert(1))',
            '13px;}html{display:none',
            '99px',
            '7px',
            '1rem',
            '13',
            'expression(1)',
            '-13px',
            '',
        ];
        for (const raw of hostile) {
            assert.strictEqual(resolveTypeSize(raw, '13px'), '13px', `for ${JSON.stringify(raw)}`);
        }
    });

    test('accepts the full supported 8px-24px range and nothing outside it', () => {
        for (const ok of ['8px', '9px', '10px', '13px', '16px', '24px', ' 14PX ']) {
            assert.notStrictEqual(resolveTypeSize(ok, 'FALLBACK'), 'FALLBACK', `for ${ok}`);
        }
        for (const bad of ['25px', '7px', '0px', '100px']) {
            assert.strictEqual(resolveTypeSize(bad, 'FALLBACK'), 'FALLBACK', `for ${bad}`);
        }
    });
});
