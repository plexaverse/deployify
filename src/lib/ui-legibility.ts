// UI legibility rollout flag (defect product-ux-7).
//
// A historical sed cascade (update_typography*.sh at the repo root) rewrote every
// named Tailwind text utility into two arbitrary values: `text-[8px]` (1209 uses)
// and `text-[10px]` (331 uses). The whole product therefore renders at 8-10px, and
// in the LIGHT theme the status colours sit at 1.79-3.29:1 contrast.
//
// The remedy lives entirely in src/app/globals.css as unlayered overrides of those
// generated utility classes. This module only decides which gate attributes the
// root <html> element carries, so the CSS is inert until an operator opts in.
//
// Mirrors the CSRF_ORIGIN_MODE staged-flag convention already used in this repo.
//   off      - today's behaviour exactly. Default.
//   contrast - light-theme status-text colours only. No metrics change, so no reflow.
//   full     - contrast + the 8px/10px -> 13px/16px type remap.

export type UiLegibilityMode = 'off' | 'contrast' | 'full';

/** Only plain integer pixel values from 8px to 24px may reach the style attribute. */
const SIZE_PATTERN = /^(?:[89]|1\d|2[0-4])px$/;

export function resolveUiLegibilityMode(
    raw: string | undefined = process.env.UI_LEGIBILITY_MODE
): UiLegibilityMode {
    switch ((raw ?? '').trim().toLowerCase()) {
        case 'contrast':
            return 'contrast';
        case 'full':
            return 'full';
        default:
            // Unset, empty, 'off', or anything unrecognised -> today's behaviour.
            return 'off';
    }
}

/**
 * A size override is honoured only when it is a well-formed 8-24px value.
 * Anything else falls back to the stylesheet default rather than being
 * interpolated into the style attribute.
 */
export function resolveTypeSize(raw: string | undefined, fallback: string): string {
    const value = (raw ?? '').trim().toLowerCase();
    return SIZE_PATTERN.test(value) ? value : fallback;
}

export interface UiLegibilityAttrs {
    /** Gate for the light-theme status-colour overrides. */
    contrast?: 'v2';
    /** Gate for the font-size remap. */
    scale?: 'v2';
    /** Optional per-environment tuning of the two font sizes. */
    style?: Record<string, string>;
}

/**
 * Build the attributes for <html>. Returns an empty object in 'off' mode so the
 * rendered markup is identical to today's, byte for byte.
 */
export function uiLegibilityAttrs(
    mode: UiLegibilityMode = resolveUiLegibilityMode(),
    baseSize: string | undefined = process.env.UI_TYPE_SCALE_BASE,
    largeSize: string | undefined = process.env.UI_TYPE_SCALE_LG
): UiLegibilityAttrs {
    if (mode === 'off') return {};
    if (mode === 'contrast') return { contrast: 'v2' };

    return {
        contrast: 'v2',
        scale: 'v2',
        style: {
            '--ui-fs-1': resolveTypeSize(baseSize, '13px'),
            '--ui-fs-2': resolveTypeSize(largeSize, '16px'),
        },
    };
}
