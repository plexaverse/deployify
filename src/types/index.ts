// TypeScript types for Deployify

// User type from GitHub OAuth
export interface AnalyticsStats {
    aggregate: {
        visitors: { value: number };
        pageviews: { value: number };
        bounce_rate: { value: number };
        visit_duration: { value: number };
    };
    timeseries: Array<{
        date: string;
        visitors: number;
        pageviews: number;
    }>;
    sources: Array<{
        source: string;
        visitors: number;
    }>;
    locations: Array<{
        country: string;
        visitors: number;
        country_code?: string;
    }>;
    performance: {
        lcp: number;
        cls: number;
        fid: number;
        fcp: number;
        ttfb: number;
    };
}

export interface User {
    id: string;
    githubId: number;
    githubUsername: string;
    email: string | null;
    avatarUrl: string;
    name: string | null;
    stripeCustomerId?: string;
    subscription?: {
        tier: 'free' | 'pro' | 'team' | 'enterprise';
        status?: 'active' | 'past_due' | 'canceled' | 'unpaid';
        expiresAt?: Date;
        currentPeriodStart?: Date;
        currentPeriodEnd?: Date;
        razorpaySubscriptionId?: string;
    };
    createdAt: Date;
    updatedAt: Date;
}

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Team {
    id: string;
    name: string;
    slug: string;
    avatarUrl?: string | null;
    subscription?: {
        tier: 'free' | 'pro' | 'team' | 'enterprise';
        expiresAt: Date;
    };
    createdAt: Date;
    updatedAt: Date;
}

export interface TeamWithRole extends Team {
    membership: TeamMembership;
}

export interface TeamMembership {
    id: string;
    teamId: string;
    userId: string;
    role: TeamRole;
    joinedAt: Date;
}

export interface TeamInvite {
    id: string;
    teamId: string;
    email: string;
    role: TeamRole;
    token: string;
    inviterId: string;
    expiresAt: Date;
    createdAt: Date;
}

// Project configuration
export interface Project {
    id: string;
    userId: string;
    teamId?: string;
    name: string;
    slug: string;
    repoFullName: string; // owner/repo
    repoUrl: string;
    defaultBranch: string;
    framework: 'nextjs' | 'vite' | 'remix' | 'astro' | 'docker';
    buildCommand: string;
    installCommand: string;
    outputDirectory: string;
    rootDirectory: string;
    cloudRunServiceId: string | null;
    productionUrl: string | null;
    region: string | null; // GCP region for Cloud Run deployment (e.g., 'us-central1', 'asia-south1')
    customDomain: string | null;
    buildTimeout?: number; // Custom build timeout in seconds
    webhookUrl?: string | null; // Webhook URL for build notifications
    emailNotifications?: boolean; // Send email notifications on deployment
    cloudArmorEnabled?: boolean; // Enable Cloud Armor WAF
    autodeployBranches?: string[]; // Branches to auto-deploy
    branchEnvironments?: {
        branch: string;
        envTarget: 'production' | 'preview';
    }[]; // Custom environment mapping for branches
    healthCheckPath?: string; // Custom path for health checks (startup/liveness probes)
    githubToken?: string | null; // Stored OAuth token for private repo access
    analyticsApiKey?: string; // API key for internal analytics collector
    resources?: {
        cpu?: number;
        memory?: string;
        minInstances?: number;
        maxInstances?: number;
    };
    envVariables?: EnvVariable[];
    domains?: Domain[];
    ipRules?: {
        allow: string[];
        block: string[];
    };
    latestDeployment?: Deployment;
    createdAt: Date;
    updatedAt: Date;
}

// Environment variable for a project
export type EnvVariableTarget = 'build' | 'runtime' | 'both';

export interface EnvVariable {
    id: string;
    key: string;
    value: string;
    isSecret: boolean; // If true, value is masked in UI
    target: EnvVariableTarget; // Where the variable is used
    environment?: 'production' | 'preview' | 'both'; // Scope of the variable
    group?: string; // Group/Category for organization
}

// Custom domain for a project
export type DomainStatus = 'pending' | 'active' | 'error';

export interface Domain {
    id: string;
    domain: string;
    status: DomainStatus;
    errorMessage?: string;
    createdAt: Date;
    verifiedAt?: Date;
}

// Deployment status
export type DeploymentStatus =
    | 'queued'
    | 'building'
    | 'deploying'
    | 'ready'
    | 'error'
    | 'cancelled';

export type DeploymentType = 'production' | 'preview' | 'branch';

// Deployment record
export interface LighthouseMetrics {
    performanceScore: number; // 0-1
    lcp: number; // Largest Contentful Paint (ms)
    cls: number; // Cumulative Layout Shift
    fid: number | null; // First Input Delay (ms) - may be null for new deployments
    tbt: number; // Total Blocking Time (ms) - lab proxy for FID
}

export interface Deployment {
    id: string;
    projectId: string;
    type: DeploymentType;
    status: DeploymentStatus;
    gitBranch: string;
    gitCommitSha: string;
    gitCommitMessage: string;
    gitCommitAuthor: string;
    pullRequestNumber?: number;
    cloudBuildId?: string;
    cloudRunRevision?: string;
    url?: string;
    aliases?: string[];
    errorMessage?: string;
    buildLogs?: string[];
    buildDurationMs?: number;
    performanceMetrics?: LighthouseMetrics;
    createdAt: Date;
    updatedAt: Date;
    readyAt?: Date;
}

// Environment variable
export interface EnvVar {
    id: string;
    projectId: string;
    key: string;
    value: string; // Encrypted reference
    secretName: string; // Secret Manager reference
    target: 'production' | 'preview' | 'all';
    createdAt: Date;
    updatedAt: Date;
}

export interface AuditEvent {
    id: string;
    teamId: string | null;
    userId: string;
    action: string;
    details: Record<string, any>;
    createdAt: Date;
    user?: {
        name: string | null;
        email: string | null;
        avatarUrl: string;
    } | null;
}

// GitHub repository from API
export interface GitHubRepo {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    html_url: string;
    description: string | null;
    default_branch: string;
    language: string | null;
    updated_at: string;
    pushed_at: string;
}

// GitHub webhook events
export interface GitHubPushEvent {
    ref: string;
    before: string;
    after: string;
    repository: {
        id: number;
        full_name: string;
        default_branch: string;
    };
    pusher: {
        name: string;
        email: string;
    };
    head_commit: {
        id: string;
        message: string;
        author: {
            name: string;
            email: string;
            username: string;
        };
    };
}

export interface GitHubPullRequestEvent {
    action: 'opened' | 'synchronize' | 'closed' | 'reopened';
    number: number;
    pull_request: {
        id: number;
        number: number;
        title: string;
        head: {
            ref: string;
            sha: string;
        };
        base: {
            ref: string;
        };
        user: {
            login: string;
        };
    };
    repository: {
        id: number;
        full_name: string;
    };
}

// API Response types
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}

// Session type
export interface Session {
    user: User;
    accessToken: string;
    expiresAt: number;
}

// Build configuration
export interface BuildConfig {
    projectId: string;
    repoUrl: string;
    branch: string;
    commitSha: string;
    envVars: Record<string, string>;
    buildCommand: string;
    installCommand: string;
    outputDirectory: string;
    rootDirectory: string;
}

// Cloud Run service configuration
export interface CloudRunConfig {
    serviceName: string;
    region: string;
    imageUrl: string;
    envVars: Record<string, string>;
    minInstances: number;
    maxInstances: number;
    memory: string;
    cpu: string;
    port: number;
}

// Usage tracking
export interface Usage {
    id: string; // projectId
    totalDeployments: number;
    totalBuildMinutes: number;
    lastUpdated: Date;
}
