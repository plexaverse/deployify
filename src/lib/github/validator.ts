import { getRepoContents } from '@/lib/github';

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

interface RepoContent {
    name: string;
    type: string;
}

/**
 * Validates repository contents based on rules.
 * Pure function for easier testing.
 */
export function validateRepoContents(contents: RepoContent[], framework?: string | null): ValidationResult {
    const fileNames = new Set(contents.map(c => c.name));

    // 1. Check if package.json exists
    if (!fileNames.has('package.json')) {
        return { valid: false, error: 'Missing package.json file. Please ensure this is a valid Node.js project.' };
    }

    // 2. Check for conflicting lock files
    const lockFiles = [
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml',
        'bun.lockb'
    ];

    const presentLockFiles = lockFiles.filter(file => fileNames.has(file));

    if (presentLockFiles.length > 1) {
        return {
            valid: false,
            error: `Conflicting lock files found: ${presentLockFiles.join(', ')}. Please keep only one lock file to ensure consistent dependencies.`
        };
    }

    // 3. Check for Next.js specific config if framework is detected/set as nextjs
    if (framework === 'nextjs') {
        const hasNextConfig =
            fileNames.has('next.config.js') ||
            fileNames.has('next.config.ts') ||
            fileNames.has('next.config.mjs');

        if (!hasNextConfig) {
            return {
                valid: false,
                error: 'Missing next.config.js (or .ts/.mjs) for Next.js project. Please ensure the configuration file exists in the root directory.'
            };
        }
    }

    // 4. Check for Nuxt specific config
    if (framework === 'nuxt') {
        const hasNuxtConfig =
            fileNames.has('nuxt.config.js') ||
            fileNames.has('nuxt.config.ts') ||
            fileNames.has('nuxt.config.mjs');

        if (!hasNuxtConfig) {
            return {
                valid: false,
                error: 'Missing nuxt.config.js (or .ts/.mjs) for Nuxt project. Please ensure the configuration file exists in the root directory.'
            };
        }
    }

    // 5. Check for SvelteKit specific config
    if (framework === 'sveltekit') {
        const hasSvelteConfig =
            fileNames.has('svelte.config.js') ||
            fileNames.has('svelte.config.ts');

        if (!hasSvelteConfig) {
            return {
                valid: false,
                error: 'Missing svelte.config.js (or .ts) for SvelteKit project. Please ensure the configuration file exists in the root directory.'
            };
        }
    }

    return { valid: true };
}

/**
 * Fetches repository contents and validates them.
 */
export async function validateRepository(
    accessToken: string,
    owner: string,
    repo: string,
    framework?: string | null,
    rootDirectory: string = ''
): Promise<ValidationResult> {
    try {
        const contents = await getRepoContents(accessToken, owner, repo, rootDirectory);

        if (!contents || contents.length === 0) {
             return { valid: false, error: 'Repository directory is empty or could not be accessed.' };
        }

        return validateRepoContents(contents, framework);
    } catch (error) {
        console.error('Error validating repository:', error);
        return { valid: false, error: 'Failed to validate repository contents. Please check your permissions.' };
    }
}
