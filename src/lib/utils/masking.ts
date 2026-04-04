/**
 * PII Masking Utilities for Data Lab result sets
 */

// Common PII patterns
const PII_PATTERNS = {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    creditCard: /\b(?:\d[ -]*?){13,16}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    apiToken: /\b(?:key|token|auth|secret)[-_]?[a-zA-Z0-9_-]{12,}\b/gi,
};

/**
 * Mask a string if it matches common PII patterns
 */
export function maskString(value: string): string {
    let masked = value;

    // Mask Emails (keep first char and domain)
    masked = masked.replace(PII_PATTERNS.email, (match) => {
        const [user, domain] = match.split('@');
        return `${user[0]}***@${domain}`;
    });

    // Mask Credit Cards (keep last 4)
    masked = masked.replace(PII_PATTERNS.creditCard, (match) => {
        const digits = match.replace(/\D/g, '');
        return `****-****-****-${digits.slice(-4)}`;
    });

    // Mask SSN
    masked = masked.replace(PII_PATTERNS.ssn, '***-**-****');

    // Mask Phone numbers
    masked = masked.replace(PII_PATTERNS.phone, '***-***-****');

    // Mask API Tokens
    masked = masked.replace(PII_PATTERNS.apiToken, (match) => {
        return `${match.slice(0, 4)}****************`;
    });

    return masked;
}

/**
 * Mask an email address but keep first char and domain
 */
export function maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const [user, domain] = parts;
    if (!user) return email;
    return `${user[0]}***@${domain}`;
}

/**
 * Recursively mask PII in an object or array
 */
export function maskData<T>(data: T): T {
    if (data === null || data === undefined) return data;

    if (typeof data === 'string') {
        return maskString(data) as unknown as T;
    }

    if (Array.isArray(data)) {
        return data.map(item => maskData(item)) as unknown as T;
    }

    if (typeof data === 'object') {
        const maskedObj = {} as Record<string, unknown>;
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
            // Mask keys that look like they contain secrets
            const lowKey = key.toLowerCase();
            const isSecretKey = lowKey === 'password' ||
                               lowKey === 'secret' ||
                               lowKey === 'token' ||
                               lowKey === 'key' ||
                               lowKey.endsWith('_password') ||
                               lowKey.endsWith('_secret') ||
                               lowKey.endsWith('_token') ||
                               lowKey.endsWith('_key');

            if (isSecretKey && typeof value === 'string') {
                maskedObj[key] = '********';
            } else {
                maskedObj[key] = maskData(value);
            }
        }
        return maskedObj as unknown as T;
    }

    return data;
}
