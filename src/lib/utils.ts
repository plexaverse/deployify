import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Project } from '@/types';

// Utility function to merge Tailwind classes
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Generate a URL-safe slug from a string
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '-')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Generate a unique ID
export function generateId(prefix?: string): string {
    const id = Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
    return prefix ? `${prefix}_${id}` : id;
}

// Format date to relative time
export function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

    return date.toLocaleDateString().toUpperCase();
}

// Format duration in milliseconds to human-readable
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// Extract owner and repo from full repo name
export function parseRepoFullName(fullName: string): { owner: string; repo: string } {
    const [owner, repo] = fullName.split('/');
    return { owner, repo };
}

// Generate Cloud Run service name from a resource slug
export function generateServiceName(resourceSlug: string): string {
    // Cloud Run has 63 char limit. Prefix 'dfy-' is 4 chars. Max resourceSlug = 59.
    const baseName = resourceSlug.substring(0, 59);
    return `dfy-${baseName}`.replace(/-+$/, '');
}

// Truncate string with ellipsis
export function truncate(str: string, length: number): string {
    if (str.length <= length) return str;
    return str.substring(0, length - 3) + '...';
}

// Parse branch from git ref
export function parseBranchFromRef(ref: string): string {
    return ref.replace('refs/heads/', '');
}

// Check if deployment is in a terminal state
export function isDeploymentComplete(status: string): boolean {
    return ['ready', 'error', 'cancelled'].includes(status);
}

// Get the project slug used for GCP resources for a given deployment
export function getProjectSlugForDeployment(project: { slug: string }, deployment: { type: string; pullRequestNumber?: number; gitBranch: string }): string {
    let result = project.slug;
    if (deployment.type === 'preview' && deployment.pullRequestNumber) {
        result = `${project.slug}-pr-${deployment.pullRequestNumber}`;
    } else if (deployment.type === 'branch') {
        result = `${project.slug}-${slugify(deployment.gitBranch)}`;
    } else if (deployment.type === 'production') {
        result = project.slug;
    }

    // Cloud Run limit is 63. Prefix 'dfy-' is 4. Max slug length = 59.
    if (result.length > 59) {
        return result.substring(0, 59).replace(/-+$/, '');
    }
    return result;
}

// Get status color for UI
export function getStatusColor(status: string): string {
    switch (status) {
        case 'ready':
            return 'text-[var(--success)]';
        case 'error':
        case 'cancelled':
            return 'text-[var(--error)]';
        case 'building':
        case 'deploying':
            return 'text-[var(--warning)]';
        case 'queued':
        default:
            return 'text-[var(--muted-foreground)]';
    }
}

export function shouldAutoDeploy(project: Project, branch: string): boolean {
    if (branch === project.defaultBranch) return true;

    if (project.autodeployBranches && project.autodeployBranches.length > 0) {
        return project.autodeployBranches.includes(branch);
    }
    return false;
}

/**
 * Validate a user-supplied project rootDirectory before it is persisted.
 *
 * Two tiers, deliberately:
 *  - Always on: reject non-strings, control characters / newlines, and absurd lengths. No
 *    directory that builds today can contain a control character, so this can only reject
 *    values that are already broken or hostile.
 *  - STRICT_ROOT_DIRECTORY=true: additionally require the same narrow charset that
 *    generateCloudRunDeployConfig() uses for workDir, so the build path and the Dockerfile
 *    path can never disagree. Off by default so existing tenants are unaffected.
 */
export function validateRootDirectory(value: unknown): { valid: boolean; error?: string } {
    if (value === undefined || value === null || value === '') return { valid: true };

    if (typeof value !== 'string') {
        return { valid: false, error: 'Root directory must be a string' };
    }

    if (value.length > 255) {
        return { valid: false, error: 'Root directory must be 255 characters or fewer' };
    }

    if (/[\u0000-\u001F\u007F]/.test(value)) {
        return { valid: false, error: 'Root directory must not contain newlines or control characters' };
    }

    if (process.env.STRICT_ROOT_DIRECTORY === 'true') {
        if (!/^[a-zA-Z0-9_\-./]+$/.test(value) || value.includes('..')) {
            return { valid: false, error: 'Root directory may only contain letters, numbers, "_", "-", "." and "/" and must not contain ".."' };
        }
    }

    return { valid: true };
}

/**
 * Coerce a string into a legal GCP label value (lowercase alphanumerics, '-', '_', <=63).
 * Shared so the deploy path that WRITES deployify-project-id and the ownership guard
 * that READS it can never disagree on the value.
 */
export function sanitizeLabel(val: string): string {
    return val.toLowerCase().replace(/[^a-z0-9_-]/g, '-').substring(0, 63);
}

/**
 * GCP regions offered by the UI (src/components/RegionSettings.tsx is the superset).
 */
export const SUPPORTED_GCP_REGIONS = [
    'us-central1', 'us-east1', 'us-east4', 'us-west1',
    'europe-west1', 'europe-west2', 'europe-west4',
    'asia-east1', 'asia-northeast1', 'asia-southeast1', 'asia-south1',
    'australia-southeast1', 'southamerica-east1', 'me-west1', 'africa-south1',
];

/**
 * Validate a user-supplied project region before it is persisted.
 *
 * `region` is interpolated straight into GCP resource paths
 * (`projects/{p}/locations/${region}/services/...`) and into run.app hostnames, so an
 * arbitrary string is a path-injection primitive as well as a cross-region reach.
 *
 * Deliberately permissive: null/'' (meaning "platform default") is valid, and any
 * well-formed GCP region is accepted even if it is not in the UI list, so a tenant on a
 * region we have not enumerated is never locked out of saving. It rejects only values
 * that could not work against GCP anyway. Set VALIDATE_PROJECT_REGION=false to disable.
 */
export function isValidGcpRegion(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return true;
    if (process.env.VALIDATE_PROJECT_REGION === 'false') return true;
    if (typeof value !== 'string') return false;
    if (SUPPORTED_GCP_REGIONS.includes(value)) return true;
    return /^[a-z]{2,}-[a-z]+\d{1,2}$/.test(value);
}

/**
 * Validate connection strings for common databases
 */
export function validateConnectionString(url: string): { valid: boolean; type?: string; error?: string } {
    if (!url) return { valid: false, error: 'Connection string is empty' };

    // Postgres
    if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        const regex = /^postgres(ql)?:\/\/([^:]+(:[^@]+)?@)?[^:/]+(:\d+)?\/[^?]+(\?.*)?$/;
        return { valid: regex.test(url), type: 'PostgreSQL', error: regex.test(url) ? undefined : 'Invalid PostgreSQL connection string format' };
    }

    // Redis
    if (url.startsWith('redis://') || url.startsWith('rediss://')) {
        const regex = /^rediss?:\/\/([^:]+(:[^@]+)?@)?[^:/]+(:\d+)?(\/\d+)?(\?.*)?$/;
        return { valid: regex.test(url), type: 'Redis', error: regex.test(url) ? undefined : 'Invalid Redis connection string format' };
    }

    // MongoDB
    if (url.startsWith('mongodb://') || url.startsWith('mongodb+srv://')) {
        const regex = /^mongodb(\+srv)?:\/\/([^:]+(:[^@]+)?@)?[^:/]+(:\d+)?(\/[^?#]+)?(\?[^#]*)?(#.*)?$/;
        return { valid: regex.test(url), type: 'MongoDB', error: regex.test(url) ? undefined : 'Invalid MongoDB connection string format' };
    }

    // MySQL
    if (url.startsWith('mysql://')) {
        const regex = /^mysql:\/\/([^:]+(:[^@]+)?@)?[^:/]+(:\d+)?\/[^?]+(\?.*)?$/;
        return { valid: regex.test(url), type: 'MySQL', error: regex.test(url) ? undefined : 'Invalid MySQL connection string format' };
    }

    return { valid: true }; // Unknown type, skip validation
}

/**
 * Get the default or custom environment variable key for a storage connector
 */
export function getStorageEnvKey(config: { type: string; envKey?: string }): string {
    if (config.envKey) return config.envKey;
    if (config.type === 'memorystore-redis') return 'REDIS_URL';
    if (config.type === 'mongodb-atlas') return 'MONGODB_URI';
    return 'DATABASE_URL';
}

/**
 * Clean an object by removing all properties with undefined values.
 * Firestore does not allow undefined values in documents.
 */
export function cleanFirestoreData<T extends object>(data: T): T {
    const clean = {} as Partial<T>;
    Object.keys(data).forEach(key => {
        const value = (data as Record<string, unknown>)[key];
        if (value !== undefined) {
            clean[key as keyof T] = value as T[keyof T];
        }
    });
    return clean as T;
}
