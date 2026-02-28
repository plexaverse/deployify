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

    return date.toLocaleDateString();
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
        const regex = /^mongodb(\+srv)?:\/\/([^:]+(:[^@]+)?@)?[^:/]+(:\d+)?(\/[^?]+)?(\?.*)?$/;
        return { valid: regex.test(url), type: 'MongoDB', error: regex.test(url) ? undefined : 'Invalid MongoDB connection string format' };
    }

    return { valid: true }; // Unknown type, skip validation
}
