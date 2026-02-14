import { Octokit } from '@octokit/rest';
import type { GitHubRepo } from '@/types';
import { config } from '@/lib/config';

/**
 * Create an authenticated Octokit client
 */
export function createGitHubClient(accessToken: string): Octokit {
    return new Octokit({
        auth: accessToken,
    });
}

/**
 * Get authenticated user information
 */
export async function getGitHubUser(accessToken: string) {
    const octokit = createGitHubClient(accessToken);
    const { data } = await octokit.users.getAuthenticated();
    return data;
}

/**
 * Get user's email (primary email)
 */
export async function getGitHubUserEmail(accessToken: string): Promise<string | null> {
    const octokit = createGitHubClient(accessToken);

    try {
        const { data } = await octokit.users.listEmailsForAuthenticatedUser();
        const primaryEmail = data.find(email => email.primary);
        return primaryEmail?.email || data[0]?.email || null;
    } catch {
        return null;
    }
}

/**
 * List user's repositories
 */
export async function listUserRepos(
    accessToken: string,
    options: { page?: number; perPage?: number; sort?: 'updated' | 'pushed' | 'full_name' } = {}
): Promise<GitHubRepo[]> {
    const octokit = createGitHubClient(accessToken);

    const { data } = await octokit.repos.listForAuthenticatedUser({
        visibility: 'all',
        sort: options.sort || 'updated',
        direction: 'desc',
        per_page: options.perPage || 30,
        page: options.page || 1,
    });

    return data.map(repo => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        html_url: repo.html_url,
        description: repo.description,
        default_branch: repo.default_branch,
        language: repo.language,
        updated_at: repo.updated_at || '',
        pushed_at: repo.pushed_at || '',
    }));
}

/**
 * Get a specific repository
 */
export async function getRepo(
    accessToken: string,
    owner: string,
    repo: string
): Promise<GitHubRepo> {
    if (accessToken === 'mock-access-token') {
        return {
            id: Math.floor(Math.random() * 100000),
            name: repo,
            full_name: `${owner}/${repo}`,
            private: false,
            html_url: `https://github.com/${owner}/${repo}`,
            description: 'Mock repository',
            default_branch: 'main',
            language: 'TypeScript',
            updated_at: new Date().toISOString(),
            pushed_at: new Date().toISOString(),
        };
    }

    const octokit = createGitHubClient(accessToken);

    const { data } = await octokit.repos.get({
        owner,
        repo,
    });

    return {
        id: data.id,
        name: data.name,
        full_name: data.full_name,
        private: data.private,
        html_url: data.html_url,
        description: data.description,
        default_branch: data.default_branch,
        language: data.language,
        updated_at: data.updated_at || '',
        pushed_at: data.pushed_at || '',
    };
}

/**
 * Create a webhook for a repository
 */
export async function createRepoWebhook(
    accessToken: string,
    owner: string,
    repo: string
): Promise<number> {
    if (accessToken === 'mock-access-token') {
        return Math.floor(Math.random() * 100000);
    }

    const octokit = createGitHubClient(accessToken);

    const { data } = await octokit.repos.createWebhook({
        owner,
        repo,
        config: {
            url: `${config.appUrl}/api/webhooks/github`,
            content_type: 'json',
            secret: config.github.webhookSecret,
        },
        events: ['push', 'pull_request'],
        active: true,
    });

    return data.id;
}

/**
 * Delete a webhook from a repository
 */
export async function deleteRepoWebhook(
    accessToken: string,
    owner: string,
    repo: string,
    hookId: number
): Promise<void> {
    const octokit = createGitHubClient(accessToken);

    await octokit.repos.deleteWebhook({
        owner,
        repo,
        hook_id: hookId,
    });
}

/**
 * Exchange OAuth code for access token
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
    const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: config.github.clientId,
            client_secret: config.github.clientSecret,
            code,
        }),
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error_description || data.error);
    }

    return data.access_token;
}

/**
 * Get repository contents (for detecting framework)
 */
export async function getRepoContents(
    accessToken: string,
    owner: string,
    repo: string,
    path: string = ''
): Promise<{ name: string; type: string }[]> {
    const octokit = createGitHubClient(accessToken);

    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path,
        });

        if (Array.isArray(data)) {
            return data.map(item => ({
                name: item.name,
                type: item.type,
            }));
        }

        return [];
    } catch {
        return [];
    }
}

/**
 * Get file content from a repository
 */
export async function getFileContent(
    accessToken: string,
    owner: string,
    repo: string,
    path: string
): Promise<string | null> {
    const octokit = createGitHubClient(accessToken);
    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path,
        });

        if ('content' in data && data.content) {
            return Buffer.from(data.content, 'base64').toString('utf-8');
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Detect the framework of a repository
 * Returns the detected framework type or null if unknown
 */
export async function detectFramework(
    accessToken: string,
    owner: string,
    repo: string,
    rootDir: string = ''
): Promise<'nextjs' | 'vite' | 'astro' | 'remix' | null> {
    if (accessToken === 'mock-access-token') {
        return 'nextjs';
    }

    const contents = await getRepoContents(accessToken, owner, repo, rootDir);

    // Helper to check file existence
    const hasFile = (pattern: RegExp) => contents.some(item => pattern.test(item.name));

    // Try to read package.json for dependencies
    let dependencies: Record<string, string> = {};
    let devDependencies: Record<string, string> = {};

    const packageJsonItem = contents.find(item => item.name === 'package.json');
    if (packageJsonItem) {
        try {
            const path = rootDir ? `${rootDir}/package.json` : 'package.json';
            const content = await getFileContent(accessToken, owner, repo, path);

            if (content) {
                const pkg = JSON.parse(content);
                dependencies = pkg.dependencies || {};
                devDependencies = pkg.devDependencies || {};
            }
        } catch (e) {
            console.error('Failed to read package.json:', e);
        }
    }

    const allDeps = { ...dependencies, ...devDependencies };

    // Next.js
    if (hasFile(/^next\.config\.(js|ts|mjs)$/) || allDeps['next']) {
        return 'nextjs';
    }

    // Astro
    if (hasFile(/^astro\.config\.(js|ts|mjs)$/) || allDeps['astro']) {
        return 'astro';
    }

    // Remix
    if (hasFile(/^remix\.config\.(js|ts)$/) || allDeps['@remix-run/react'] || allDeps['@remix-run/node']) {
        return 'remix';
    }

    // Vite
    if (hasFile(/^vite\.config\.(js|ts)$/) || allDeps['vite']) {
        return 'vite';
    }

    return null;
}

/**
 * Detect if repository is an Astro project (legacy helper, uses detectFramework internally)
 */
export async function detectAstroProject(
    accessToken: string,
    owner: string,
    repo: string,
    rootDir: string = ''
): Promise<boolean> {
    const framework = await detectFramework(accessToken, owner, repo, rootDir);
    return framework === 'astro';
}

/**
 * Get the latest commit from a branch
 */
export async function getBranchLatestCommit(
    accessToken: string,
    owner: string,
    repo: string,
    branch: string
): Promise<{ sha: string; message: string; author: string }> {
    const octokit = createGitHubClient(accessToken);

    const { data } = await octokit.repos.getBranch({
        owner,
        repo,
        branch,
    });

    return {
        sha: data.commit.sha,
        message: data.commit.commit.message,
        author: data.commit.commit.author?.name || data.commit.author?.login || 'unknown',
    };
}

/**
 * Create a deployment status on GitHub
 */
export async function createDeploymentStatus(
    accessToken: string,
    owner: string,
    repo: string,
    sha: string,
    state: 'pending' | 'success' | 'failure',
    targetUrl?: string,
    description?: string
): Promise<void> {
    const octokit = createGitHubClient(accessToken);

    try {
        // First create a deployment
        const { data: deployment } = await octokit.repos.createDeployment({
            owner,
            repo,
            ref: sha,
            environment: 'production',
            auto_merge: false,
            required_contexts: [],
        });

        if ('id' in deployment) {
            // Then create the status
            await octokit.repos.createDeploymentStatus({
                owner,
                repo,
                deployment_id: deployment.id,
                state,
                target_url: targetUrl,
                description: description || `Deployment ${state}`,
            });
        }
    } catch (error) {
        console.error('Failed to create deployment status:', error);
    }
}

/**
 * Create a comment on a Pull Request (Issue)
 */
export async function createPRComment(
    accessToken: string,
    owner: string,
    repo: string,
    prNumber: number,
    body: string
): Promise<void> {
    const octokit = createGitHubClient(accessToken);

    try {
        await octokit.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body,
        });
    } catch (error) {
        console.error('Failed to create PR comment:', error);
    }
}
