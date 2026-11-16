import type { EnvVariable } from '@/types';

/**
 * Shared rules for project environment variables.
 *
 * POST (create) already enforced the key format and rejected duplicates, but PUT
 * (update) wrote `updatedEnv.key = key` unconditionally. That was invisible while
 * the UI had no edit affordance; once a project owner can rename a key, an
 * unvalidated rename can produce a key the deployment pipeline cannot export
 * (`MY KEY`) or a second variable with an existing name, where
 * getEnvVarsForDeployment() silently keeps whichever one it iterates last.
 * Both paths now go through the same helpers.
 */

/** Must start with a letter; uppercase letters, digits and underscores only. */
export const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export const ENV_KEY_ERROR = 'Key must be uppercase and start with a letter (e.g., DATABASE_URL)';

/**
 * Descriptions are a human note about what a variable is for. They are stored on
 * the project document alongside the variable, so they are bounded to keep a
 * pathological value from bloating every read of the project.
 */
export const MAX_ENV_DESCRIPTION_LENGTH = 200;

export type ValidationResult =
    | { valid: true }
    | { valid: false; error: string };

export function validateEnvKey(key: unknown): ValidationResult {
    if (typeof key !== 'string' || key.length === 0) {
        return { valid: false, error: 'Key is required' };
    }
    if (!ENV_KEY_PATTERN.test(key)) {
        return { valid: false, error: ENV_KEY_ERROR };
    }
    return { valid: true };
}

/**
 * True when `key` is already taken by a *different* variable. `exceptId` is the
 * variable being updated, so that saving a variable without renaming it is not
 * reported as a clash with itself.
 */
export function isDuplicateEnvKey(
    envVariables: Pick<EnvVariable, 'id' | 'key'>[],
    key: string,
    exceptId?: string
): boolean {
    return envVariables.some(env => env.key === key && env.id !== exceptId);
}

export type DescriptionResult =
    | { valid: true; value: string | undefined }
    | { valid: false; error: string };

/**
 * Normalizes a description into either a trimmed string or `undefined`.
 *
 * `undefined` means "no description" and the caller omits the field rather than
 * writing an empty string, so a variable that never had one keeps a clean
 * document. Clearing an existing description is expressed by sending `''`, which
 * also normalizes to `undefined` — the update path deletes the field for it.
 */
export function normalizeEnvDescription(raw: unknown): DescriptionResult {
    if (raw === undefined || raw === null) {
        return { valid: true, value: undefined };
    }
    if (typeof raw !== 'string') {
        return { valid: false, error: 'Description must be text' };
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return { valid: true, value: undefined };
    }
    if (trimmed.length > MAX_ENV_DESCRIPTION_LENGTH) {
        return {
            valid: false,
            error: `Description must be at most ${MAX_ENV_DESCRIPTION_LENGTH} characters`,
        };
    }
    return { valid: true, value: trimmed };
}

export interface EnvValueCodec {
    encrypt: (plaintext: string) => string;
    decrypt: (ciphertext: string) => string;
}

export interface EnvValueUpdate {
    /** The value currently stored on the variable (ciphertext when wasEncrypted). */
    currentValue: string;
    /** Whether the stored value is currently encrypted at rest. */
    wasEncrypted: boolean;
    /** Whether the saved value should be encrypted at rest. */
    willEncrypt: boolean;
    /** New plaintext from the client, or undefined to keep the current value. */
    newValue?: string;
}

/**
 * Resolves what to persist as the variable's value for an update.
 *
 * The interesting case is a save that does not carry a new value — which is what
 * the UI sends when a secret is edited without retyping it, since the client only
 * ever sees a mask. The stored ciphertext must then survive the save, and only be
 * re-encoded if the secret toggle itself flipped.
 */
export function resolveEnvValueUpdate(update: EnvValueUpdate, codec: EnvValueCodec): string {
    const { currentValue, wasEncrypted, willEncrypt, newValue } = update;

    if (newValue !== undefined) {
        return willEncrypt ? codec.encrypt(newValue) : newValue;
    }

    if (!wasEncrypted && willEncrypt) {
        // Turned secret on: encrypt what is there, unless it somehow already is.
        return currentValue.startsWith('enc:') ? currentValue : codec.encrypt(currentValue);
    }

    if (wasEncrypted && !willEncrypt) {
        // Turned secret off: the value becomes readable, so store it as plaintext.
        return currentValue.startsWith('enc:') ? codec.decrypt(currentValue) : currentValue;
    }

    return currentValue;
}
