import * as crypto from 'crypto';
import { config } from '@/lib/config';
import type { GitHubPushEvent, GitHubPullRequestEvent } from '@/types';

// Rate limiter storage (in-memory for development, use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Rate limiter middleware
 */
export function checkRateLimit(
    identifier: string,
    limit: number = config.security.rateLimitRequests,
    windowMs: number = config.security.rateLimitWindowMs
): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const record = rateLimitStore.get(identifier);

    // Clean up expired entries periodically
    if (Math.random() < 0.01) {
        cleanupExpiredEntries();
    }

    if (!record || now > record.resetAt) {
        // New window
        const resetAt = now + windowMs;
        rateLimitStore.set(identifier, { count: 1, resetAt });
        return { allowed: true, remaining: limit - 1, resetAt };
    }

    if (record.count >= limit) {
        return { allowed: false, remaining: 0, resetAt: record.resetAt };
    }

    record.count++;
    return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt };
}

/**
 * Clean up expired rate limit entries
 */
function cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, value] of rateLimitStore.entries()) {
        if (now > value.resetAt) {
            rateLimitStore.delete(key);
        }
    }
}

/**
 * Verify GitHub webhook signature (HMAC-SHA256)
 */
export function verifyGitHubWebhookSignature(
    payload: string,
    signature: string | null
): boolean {
    if (!signature) {
        return false;
    }

    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', config.github.webhookSecret)
        .update(payload)
        .digest('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    } catch {
        return false;
    }
}

/**
 * Validate webhook timestamp to prevent replay attacks
 * Rejects webhooks older than 5 minutes
 */
export function validateWebhookTimestamp(timestamp: string | null): boolean {
    if (!timestamp) {
        return true; // GitHub doesn't always send timestamp, so we allow it
    }

    const hookTime = parseInt(timestamp, 10) * 1000;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    return Math.abs(now - hookTime) < fiveMinutes;
}

/**
 * Type guard for GitHub push events
 */
export function isPushEvent(event: unknown): event is GitHubPushEvent {
    return (
        typeof event === 'object' &&
        event !== null &&
        'ref' in event &&
        'head_commit' in event &&
        'repository' in event
    );
}

/**
 * Type guard for GitHub pull request events
 */
export function isPullRequestEvent(event: unknown): event is GitHubPullRequestEvent {
    return (
        typeof event === 'object' &&
        event !== null &&
        'action' in event &&
        'pull_request' in event &&
        'repository' in event
    );
}

/**
 * Security headers for API responses
 */
export const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-DNS-Prefetch-Control': 'off',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/**
 * Get security headers as Headers object
 */
export function getSecurityHeaders(): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(securityHeaders)) {
        headers.set(key, value);
    }
    return headers;
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Validate environment variable key format
 */
export function isValidEnvVarKey(key: string): boolean {
    // Must start with letter or underscore, contain only alphanumeric and underscores
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a value using SHA-256
 */
export function hashValue(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}
