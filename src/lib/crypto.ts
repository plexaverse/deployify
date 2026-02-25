import * as crypto from 'crypto';
import { config } from './config';

const ENCRYPTION_KEY = config.security.encryptionKey;
const ALGORITHM = 'aes-256-gcm';

if (!ENCRYPTION_KEY) {
    console.warn('WARNING: ENCRYPTION_KEY or JWT_SECRET not set. Secrets encryption will fail.');
}
const IV_LENGTH = 16;

/**
 * Encrypt a string using AES-256-GCM
 */
export function encrypt(text: string): string {
    if (!ENCRYPTION_KEY) {
        throw new Error('Encryption failed: ENCRYPTION_KEY not set');
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    // Ensure key is 32 bytes
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    // Format: enc:iv:tag:encrypted
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string using AES-256-GCM
 */
export function decrypt(text: string): string {
    if (!ENCRYPTION_KEY) {
        throw new Error('Decryption failed: ENCRYPTION_KEY not set');
    }
    if (!text.startsWith('enc:')) {
        return text;
    }

    const parts = text.split(':');
    if (parts.length !== 4) {
        return text; // Or throw error
    }

    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const encryptedText = parts[3];

    // Ensure key is 32 bytes
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
