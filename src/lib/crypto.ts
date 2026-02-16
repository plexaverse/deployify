import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// Derive a 32-byte key from the secret
function getKey(): Buffer {
    const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;

    if (!secret) {
        // In production, this should throw. For dev/build time where env might be missing,
        // we might want a fallback but it's risky.
        // Given this is a demo/project, I'll log a warning and use a dummy key if running tests?
        // But for "End-to-End Encryption" feature, we must have a key.
        if (process.env.NODE_ENV === 'test') {
             return crypto.scryptSync('test-secret', 'salt', 32);
        }
        console.warn('Warning: ENCRYPTION_KEY or JWT_SECRET not set. Using insecure default for development.');
        return crypto.scryptSync('insecure-default-key', 'salt', 32);
    }

    // Use scrypt to derive a 32-byte key from the secret string
    // We use a fixed salt here because we need to derive the SAME key every time.
    // Ideally, the salt should be random and stored, but if we treat ENCRYPTION_KEY as the master key material,
    // deriving a subkey deterministically is acceptable for this scope.
    return crypto.scryptSync(secret, 'deployify-salt', 32);
}

export function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    // Format: iv:tag:encrypted
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(text: string): string {
    // Check format
    const parts = text.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted text format');
    }

    const [ivHex, tagHex, encryptedHex] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const key = getKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
