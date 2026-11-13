/**
 * Content-Security-Policy for the Deployify dashboard.
 *
 * Ships in **Report-Only** mode by default. A CSP that is wrong breaks the whole app —
 * blank panels, dead buttons, no error the user can act on — and this codebase has never
 * run one, so the directive list is a first estimate rather than a verified one.
 * Report-Only emits the same violations to the console without blocking anything, which
 * lets the policy be tuned against real traffic first.
 *
 *   CSP_MODE=enforce   send Content-Security-Policy (blocking)
 *   CSP_MODE=report    send Content-Security-Policy-Report-Only (default)
 *   CSP_MODE=off       send nothing
 *
 * Note `'unsafe-inline'` on script-src: Next.js injects inline bootstrap scripts and
 * src/app/dashboard/layout.tsx still renders an inline redirect script. Removing it needs
 * a nonce plumbed through the app, which is a separate change.
 */
export type CspMode = 'enforce' | 'report' | 'off';

export function getCspMode(): CspMode {
    const raw = (process.env.CSP_MODE || '').trim().toLowerCase();
    if (raw === 'enforce' || raw === 'report' || raw === 'off') return raw;
    return 'report';
}

const DIRECTIVES: Array<[string, string]> = [
    ['default-src', "'self'"],
    ['base-uri', "'self'"],
    ['object-src', "'none'"],
    ['frame-ancestors', "'none'"],
    ['form-action', "'self'"],
    // Next.js emits inline bootstrap/hydration scripts.
    ['script-src', "'self' 'unsafe-inline'"],
    // Tailwind and next/font emit inline styles.
    ['style-src', "'self' 'unsafe-inline' https://fonts.googleapis.com"],
    ['font-src', "'self' https://fonts.gstatic.com data:"],
    // GitHub avatars (next.config.ts remotePatterns) plus data/blob for generated charts.
    ['img-src', "'self' data: blob: https://avatars.githubusercontent.com"],
    // Razorpay checkout, and same-origin API calls.
    ['connect-src', "'self' https://api.razorpay.com https://lumberjack.razorpay.com"],
    ['frame-src', "'self' https://api.razorpay.com https://checkout.razorpay.com"],
];

export function buildCspValue(): string {
    return DIRECTIVES.map(([k, v]) => `${k} ${v}`).join('; ');
}

/** Header name/value for the current mode, or null when disabled. */
export function cspHeader(): { name: string; value: string } | null {
    const mode = getCspMode();
    if (mode === 'off') return null;
    return {
        name: mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only',
        value: buildCspValue(),
    };
}
