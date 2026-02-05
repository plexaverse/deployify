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
        .replace(/[^\w\s-]/g, '')
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

// Generate Cloud Run service name from project
export function generateServiceName(projectSlug: string, type: 'production' | 'preview', prNumber?: number): string {
    const baseName = projectSlug.substring(0, 40); // Cloud Run has 63 char limit
    if (type === 'production') {
        return `dfy-${baseName}`;
    }
    return `dfy-${baseName}-pr-${prNumber}`;
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

// Get status color for UI
export function getStatusColor(status: string): string {
    switch (status) {
        case 'ready':
            return 'text-green-500';
        case 'error':
        case 'cancelled':
            return 'text-red-500';
        case 'building':
        case 'deploying':
            return 'text-yellow-500';
        case 'queued':
        default:
            return 'text-gray-500';
    }
}

export function shouldAutoDeploy(project: Project, branch: string): boolean {
    if (project.autodeployBranches && project.autodeployBranches.length > 0) {
        return project.autodeployBranches.includes(branch);
    }
    return branch === project.defaultBranch;
}
