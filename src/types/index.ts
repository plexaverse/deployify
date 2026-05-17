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
    lastUsageAlertKey?: string;
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

export interface Backup {
    id: string;
    status: 'SUCCESSFUL' | 'FAILED' | 'SKIPPED' | 'RUNNING' | string;
    description?: string;
    startTime: string;
    endTime?: string;
    type?: string;
}

export interface Migration {
    id: string;
    name: string;
    appliedAt: string;
    status: 'SUCCESS' | 'FAILED' | 'PENDING';
    durationMs?: number;
    checksum?: string;
    provider?: 'prisma' | 'drizzle' | 'typeorm' | 'knex' | 'manual';
    drifted?: boolean;
    performanceImpact?: number; // Avg latency shift in ms or percentage
    regressionSeverity?: 'high' | 'medium' | 'low';
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
    teamId: string | null;
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
    cloudArmorPolicy?: string; // Cloud Armor policy name
    autoDeployPrs?: boolean; // Whether to automatically deploy Pull Requests
    autodeployBranches?: string[]; // Branches to auto-deploy
    branchEnvironments?: {
        branch: string;
        envTarget: 'production' | 'preview';
    }[]; // Custom environment mapping for branches
    healthCheckPath?: string; // Custom path for health checks (startup/liveness probes)
    vpcNetwork?: string; // VPC Network name
    vpcSubnet?: string; // VPC Subnet name
    githubToken?: string | null; // Stored OAuth token for private repo access
    analyticsApiKey?: string; // API key for internal analytics collector
    resources?: {
        cpu?: number;
        memory?: string;
        minInstances?: number;
        maxInstances?: number;
    };
    crons?: CronJobConfig[];
    envVariables?: EnvVariable[];
    domains?: Domain[];
    storageConfigs?: StorageConfig[];
    ipRules?: {
        allow: string[];
        block: string[];
    };
    latestDeployment?: Deployment;
    globalIpAddress?: string | null;
    cloudArmorMode?: 'off' | 'detection' | 'prevention';
    autoScaling?: {
        enabled: boolean;
        maxConcurrency: number;
        minInstances: number;
        maxInstances: number;
    };
    metadata?: Record<string, any>;
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
    isEncrypted?: boolean; // If true, value is encrypted at rest
    target: EnvVariableTarget; // Where the variable is used
    environment?: 'production' | 'preview' | 'both'; // Scope of the variable
    group?: string; // Optional group name (e.g., "Database", "Auth")
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

export interface AuditEvent {
    id: string;
    teamId: string | null;
    userId: string;
    action: string;
    details: Record<string, unknown>;
    createdAt: Date;
    user?: {
        name: string | null;
        email: string | null;
        avatarUrl: string;
    } | null;
}

export interface DataLabAuditLog {
    id: string;
    userId: string;
    userEmail: string;
    query: string;
    timestamp: string;
    executionTimeMs: number;
    rowCount: number;
    success: boolean;
    error?: string;
    metadata?: {
        widgetId?: string;
        storageType: string;
    };
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

// Analytics event structure
export interface AnalyticsEvent {
    projectId: string;
    type: 'pageview' | 'vitals' | string;
    path: string;
    referrer: string;
    width?: number;
    metrics?: {
        lcp?: number;
        cls?: number;
        fid?: number;
        fcp?: number;
        ttfb?: number;
        [key: string]: number | undefined;
    } | null;
    ip: string;
    userAgent: string;
    timestamp: string | Date | { seconds: number; nanoseconds: number }; // Firestore Timestamp or ISO String
    source?: 'client' | 'edge';
}

// Tooltip entry for Recharts
export interface TooltipEntry {
    name: string;
    value: number | string;
    color: string;
    payload: Record<string, unknown>;
    dataKey: string;
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

// Cron Job Configuration
export interface CronJobConfig {
    path: string;
    schedule: string;
}

// Storage/Database Configuration
export type StorageType =
    | 'cloud-sql-postgres'
    | 'cloud-sql-mysql'
    | 'alloydb'
    | 'firestore'
    | 'memorystore-redis'
    | 'supabase'
    | 'mongodb-atlas'
    | 'planetscale'
    | 'neon'
    | 'cloud-spanner'
    | 'bigquery'
    | 'generic';

export type StorageStatus = 'provisioning' | 'active' | 'error' | 'disconnected';

export interface StorageAlertSettings {
    cpuThreshold?: number; // 0-100 percentage
    memoryThreshold?: number; // 0-100 percentage
    diskThreshold?: number; // 0-100 percentage
    enabled: boolean;
    emailNotifications?: boolean;
}

export interface StorageBranchingSettings {
    enabled: boolean;
    template?: string; // e.g., "db_{branch}" or "preview_{pr}"
    seedCommand?: string; // Optional command to seed newly created branch databases
}

export interface StorageAutoScalingSettings {
    enabled: boolean;
    minTier?: string;
    maxTier?: string;
    targetCpuUtilization?: number; // Target for scaling decisions
    targetMemoryUtilization?: number;
}

export interface FailoverSettings {
    enabled: boolean;
    heartbeatThreshold: number; // Number of failed heartbeats before failover
    autoPromote: boolean;
}

export interface ResourceDormancy {
    isDormant: boolean;
    avgCpuUtilization: number;
    avgMemoryUtilization: number;
    avgDiskUtilization?: number;
    lastActiveAt?: string;
    analysisPeriodDays: number;
}

export type WorkloadType = 'READ_HEAVY' | 'WRITE_HEAVY' | 'BALANCED' | 'DORMANT' | 'COMPUTE_INTENSIVE';

export interface WorkloadShift {
    shifted: boolean;
    reason?: string;
    recommendation?: string;
    detectedAt: string;
}

export interface WorkloadProfile {
    type: WorkloadType;
    confidence: number;
    lastAnalyzedAt: string;
    isColdStart?: boolean;
}

export interface ConnectivityTopology {
    injectionMethod: 'VPC' | 'PROXY' | 'SECRET' | 'DIRECT';
    path: string[]; // e.g., ["Cloud Run", "Direct VPC Egress", "Memorystore"]
    isEncrypted: boolean;
    lastVerifiedAt: string;
}

export interface StorageConfig {
    id: string;
    type: StorageType;
    name: string;
    status: StorageStatus;
    connectionStringSecretId?: string; // GCP Secret Manager ID
    envKey?: string; // Custom environment variable key for the connection string
    environment: 'production' | 'preview' | 'both';
    lastValidatedAt?: Date;
    lastRotatedAt?: Date;
    lastSyncedAt?: Date;
    lastAlertedAt?: Date;
    lastError?: string;
    alertSettings?: StorageAlertSettings;
    branchingSettings?: StorageBranchingSettings;
    autoScalingSettings?: StorageAutoScalingSettings;
    failoverSettings?: FailoverSettings;
    autoMigration?: boolean;
    migrationCommand?: string;
    rollbackCommand?: string;
    autoAlign?: boolean;
    autoMaintenanceWindow?: boolean;
    ssl?: boolean;
    connectionPoolerEnabled?: boolean;
    activeAlerts?: string[];
    readWeights?: Record<string, number>; // replicaId -> weight (0-100)
    dormancy?: ResourceDormancy;
    workloadProfile?: WorkloadProfile;
    workloadShift?: WorkloadShift;
    connectionSaturation?: number;
    topology?: ConnectivityTopology;
    labelingStatus?: 'PENDING' | 'SYNCED' | 'FAILED';
    sharedWithProjects?: string[]; // IDs of projects this connector is shared with
    reliability?: ReliabilityMetrics;
    saturationRisk?: SaturationRisk;
    deadlockReport?: DeadlockReport;
    unusedIndexReport?: UnusedIndexReport;
    antiPatternReport?: AntiPatternReport;
    noSqlSchemaReport?: NoSqlSchemaReport;
    benchmarkReport?: BenchmarkReport;
    bigqueryMetadata?: BigQueryMetadata;
    rbacSettings?: StorageRbacSettings;
    region?: string; // GCP region for provisioned resources (e.g., 'us-central1')
    providerProjectId?: string; // Project ID for cross-project connectors
    providerApiKeySecretId?: string; // GCP Secret Manager ID for external provider API keys
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export interface TelemetryData {
    summary?: {
        p90: number;
        p99: number;
        errorRate: number;
        totalRequests: number;
    };
    timeseries?: Array<{
        timestamp: string;
        avgLatency: number;
        requestCount: number;
    }>;
    insights?: Array<{
        queryHash: string;
        avgLatency: number;
        maxLatency: number;
        count: number;
    }>;
}

export interface TelemetryEvent {
    id: string;
    projectId: string;
    storageId: string;
    queryHash: string;
    durationMs: number;
    success: boolean;
    error: string | null;
    rowCount: number;
    timestamp: Date | string;
    source: string;
}

export interface ConnectionLeakReport {
    hasLeak: boolean;
    totalSessions: number;
    idleSessions: number;
    leakedClients: Array<{
        address: string;
        idleCount: number;
        oldestSessionStart: string;
    }>;
    recommendation?: string;
    timestamp: string;
}

export interface BigQueryMetadata {
    datasetId: string;
    location: string;
    totalBytesProcessedLast24H?: number;
    activeSlots?: number;
    tableCount?: number;
    storageUsageGb?: number;
    lastSyncedAt?: string;
}

export interface StorageRbacRule {
    id: string;
    type: 'COLUMN_MASK' | 'ROW_FILTER';
    entity: string; // Table name or Collection name
    field?: string;  // Column name for masking
    filterCondition?: string; // e.g. "userId = :currentUserId" or JSON for NoSQL
    maskingType?: 'FULL' | 'PARTIAL' | 'HASH';
    roles: TeamRole[]; // Roles this rule applies to
    enabled: boolean;
}

export interface StorageRbacSettings {
    enabled: boolean;
    rules: StorageRbacRule[];
    lastUpdated: string;
}

export interface NoSqlField {
    name: string;
    type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'MAP' | 'ARRAY' | 'TIMESTAMP' | 'GEOPOINT' | 'REFERENCE' | 'NULL' | 'UNKNOWN';
    frequency: number; // 0-1 percentage of sampled documents containing this field
}

export interface NoSqlEntitySchema {
    entity: string; // Collection name or MongoDB collection
    fields: NoSqlField[];
    totalSampled: number;
    lastScannedAt: string;
}

export interface NoSqlSchemaReport {
    hasSchema: boolean;
    entities: NoSqlEntitySchema[];
    lastScannedAt: string;
    hasDrift?: boolean;
}

export interface QueryAntiPattern {
    id: string;
    type: 'SELECT_STAR' | 'NON_SARGABLE_PREDICATE' | 'LEADING_WILDCARD' | 'OR_PREDICATE' | 'IMPLICIT_CONVERSION';
    queryHash: string;
    evidence: string;
    recommendation: string;
    optimizedRewrite: string;
    impactScore: number; // 0-100
    detectedAt: string;
}

export interface AntiPatternReport {
    hasAntiPatterns: boolean;
    patterns: QueryAntiPattern[];
    totalImpactScore: number;
    lastScannedAt: string;
}

export interface DeadlockIncident {
    id: string;
    queries: string[];
    detectedAt: string;
    impactScore: number;
    remediation: string;
}

export interface DeadlockReport {
    hasDeadlocks: boolean;
    incidents: DeadlockIncident[];
    totalDeadlocksLast24H: number;
    lastScannedAt: string;
}

export interface UnusedIndexCandidate {
    entity: string;
    indexName: string;
    sizeMb: number;
    lastScannedAt: string;
    reason: string;
    impactScore?: number;
    isRedundant?: boolean;
    redundantWith?: string;
}

export interface UnusedIndexReport {
    hasUnusedIndexes: boolean;
    candidates: UnusedIndexCandidate[];
    totalWastedMb: number;
    lastScannedAt: string;
}

export interface ComplianceRisk {
    type: 'EMAIL' | 'PHONE' | 'CREDIT_CARD' | 'SSN' | 'API_TOKEN';
    entity: string; // Table name or Collection name
    field: string;  // Column name or Field path
    sampleValue: string;
}

export interface ComplianceReport {
    hasRisk: boolean;
    risks: ComplianceRisk[];
    lastScannedAt: string;
}

export interface BenchmarkMetric {
    latencyMs: number;
    iops: number;
    throughputMbps: number;
}

export interface BenchmarkReport {
    read: BenchmarkMetric;
    write: BenchmarkMetric;
    totalDurationMs: number;
    lastScannedAt: string;
    score: number; // 0-100 performance score
}

export interface ReliabilityMetrics {
    score: number; // 0-100
    uptime: number; // Percentage
    avgLatency: number;
    p99Latency: number;
    sloViolations: number;
    lastAnalyzedAt: string;
}

export interface SecurityThreat {
    id: string;
    type: 'SQL_INJECTION' | 'BRUTE_FORCE' | 'UNAUTHORIZED_ACCESS' | 'SUSPICIOUS_IP';
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    sourceIp: string;
    targetDatabase: string;
    evidence: string;
    detectedAt: string;
    status: 'ACTIVE' | 'BLOCKED' | 'DISMISSED';
}

export interface SecurityReport {
    riskScore: number;
    activeThreats: SecurityThreat[];
    lastScannedAt: string;
}

export interface SaturationRisk {
    hasRisk: boolean;
    resource: 'cpu' | 'memory' | 'disk' | 'connections';
    currentUtilization: number;
    predictedDaysToExhaustion: number;
    recommendation?: string;
    timestamp: string;
}
