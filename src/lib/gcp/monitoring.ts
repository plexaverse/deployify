import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';
import { getSecretValue } from './secrets';
import { calculateEWMA, isDegraded } from './health-utils';
import type { StorageAlertSettings, ResourceDormancy, WorkloadProfile, ConnectionLeakReport, ReliabilityMetrics, SaturationRisk } from '@/types';

const MONITORING_API = 'https://monitoring.googleapis.com/v3';

export interface ResourceMetrics {
    cpuUtilization: number;
    memoryUtilization: number;
    diskUtilization?: number;
    connectionSaturation?: number;
    poolingRecommendation?: string;
    timestamp: string;
}

export interface LongRunningQuery {
    query: string;
    durationMs: number;
    startTime: string;
    user?: string;
    database?: string;
}

export interface ScalingRecommendation {
    type: 'upgrade' | 'downgrade' | 'optimize';
    resource: 'cpu' | 'memory' | 'disk';
    currentTier: string;
    recommendedTier: string;
    reason: string;
    estimatedSavings?: string;
    savingsAmount?: number;
    performanceGain?: string;
}

export interface MaintenanceRecommendation {
    day: number; // 1-7 (Monday-Sunday)
    hour: number; // 0-23
    reason: string;
}

export interface AlertResult {
    triggered: boolean;
    reason?: string;
    metrics: ResourceMetrics;
}

export interface QueryImpactMetric {
    queryHash: string;
    avgLatency: number;
    maxLatency: number;
    requestCount: number;
    errorRate: number;
    impactScore: number; // Latency * Count
    hasSeqScan?: boolean;
    recommendation?: string;
}

export interface LogEntry {
    timestamp: string;
    severity: 'DEFAULT' | 'DEBUG' | 'INFO' | 'NOTICE' | 'WARNING' | 'ERROR' | 'CRITICAL' | 'ALERT' | 'EMERGENCY';
    textPayload: string;
    insertId: string;
}

export interface PerformanceRegressionReport {
    hasRegression: boolean;
    severity: 'high' | 'medium' | 'low' | 'none';
    metrics: {
        latencyDelta: number; // Percentage change in average latency
        errorRateDelta: number; // Percentage point change in error rate
        p99Delta: number; // Change in P99 latency in ms
    };
    regressedQueries: {
        queryHash: string;
        previousLatency: number;
        currentLatency: number;
        delta: number;
    }[];
    correlatedMigrations?: import('@/types').Migration[];
    deploymentId?: string;
    timestamp: string;
}

/**
 * Check if resource metrics exceed configured thresholds
 */
export function checkAlertThresholds(
    metrics: ResourceMetrics,
    settings: StorageAlertSettings
): { triggered: boolean; alerts: string[] } {
    if (!settings.enabled) return { triggered: false, alerts: [] };

    const alerts: string[] = [];

    if (settings.cpuThreshold && metrics.cpuUtilization >= settings.cpuThreshold) {
        alerts.push(`CPU usage (${metrics.cpuUtilization.toFixed(1)}%) exceeded threshold (${settings.cpuThreshold}%)`);
    }

    if (settings.memoryThreshold && metrics.memoryUtilization >= settings.memoryThreshold) {
        alerts.push(`Memory usage (${metrics.memoryUtilization.toFixed(1)}%) exceeded threshold (${settings.memoryThreshold}%)`);
    }

    if (metrics.diskUtilization !== undefined && settings.diskThreshold && metrics.diskUtilization >= settings.diskThreshold) {
        alerts.push(`Disk usage (${metrics.diskUtilization.toFixed(1)}%) exceeded threshold (${settings.diskThreshold}%)`);
    }

    return {
        triggered: alerts.length > 0,
        alerts
    };
}

/**
 * Fetch historical resource metrics for a Cloud SQL instance
 */
export async function getCloudSqlHistoricalMetrics(
    instanceId: string,
    days: number = 7
): Promise<ResourceMetrics[]> {
    if (process.env.MOCK_DB === 'true') {
        const points = [];
        const now = Date.now();
        for (let i = 0; i < days * 24; i++) {
            points.push({
                cpuUtilization: Math.floor(Math.random() * 30) + 5,
                memoryUtilization: Math.floor(Math.random() * 40) + 20,
                diskUtilization: Math.floor(Math.random() * 10) + 5,
                timestamp: new Date(now - i * 3600000).toISOString()
            });
        }
        return points.reverse();
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const metrics = ['cpu/utilization', 'memory/utilization', 'disk/utilization'];
    const timeSeriesData: Record<string, { value: number; timestamp: string }[]> = {};

    for (const metric of metrics) {
        const filter = `metric.type="cloudsql.googleapis.com/database/${metric}" AND resource.labels.database_id="${gcpProjectId}:${instanceId}"`;
        timeSeriesData[metric] = await fetchTimeSeriesData(gcpProjectId!, accessToken, filter, days);
    }

    // Align timestamps and aggregate
    // (Simplified for this implementation)
    return timeSeriesData['cpu/utilization'].map((point, index) => ({
        cpuUtilization: point.value * 100,
        memoryUtilization: (timeSeriesData['memory/utilization'][index]?.value || 0) * 100,
        diskUtilization: (timeSeriesData['disk/utilization'][index]?.value || 0) * 100,
        timestamp: point.timestamp
    }));
}

/**
 * Fetch historical resource metrics for a Memorystore (Redis) instance
 */
export async function getMemorystoreHistoricalMetrics(
    instanceId: string,
    region: string,
    days: number = 7
): Promise<ResourceMetrics[]> {
    if (process.env.MOCK_DB === 'true') {
        const points = [];
        const now = Date.now();
        for (let i = 0; i < days * 24; i++) {
            points.push({
                cpuUtilization: Math.floor(Math.random() * 20) + 2,
                memoryUtilization: Math.floor(Math.random() * 50) + 10,
                timestamp: new Date(now - i * 3600000).toISOString()
            });
        }
        return points.reverse();
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const metrics = ['stats/cpu/usage_time', 'stats/memory/usage_ratio'];
    const timeSeriesData: Record<string, { value: number; timestamp: string }[]> = {};

    for (const metric of metrics) {
        const filter = `metric.type="redis.googleapis.com/${metric}" AND resource.labels.instance_id="projects/${gcpProjectId}/locations/${region}/instances/${instanceId}"`;
        // For stats/cpu/usage_time, we need the rate to get utilization (0.0 to 1.0+)
        const aligner = metric.includes('cpu') ? 'ALIGN_RATE' : undefined;
        timeSeriesData[metric] = await fetchTimeSeriesData(gcpProjectId!, accessToken, filter, days, aligner);
    }

    return timeSeriesData['stats/cpu/usage_time'].map((point, index) => ({
        cpuUtilization: Math.min(100, point.value * 100), // Convert rate to percentage, cap at 100
        memoryUtilization: (timeSeriesData['stats/memory/usage_ratio'][index]?.value || 0) * 100,
        timestamp: point.timestamp
    }));
}

async function fetchTimeSeriesData(
    projectId: string,
    accessToken: string,
    filter: string,
    days: number,
    aligner?: string
): Promise<{ value: number; timestamp: string }[]> {
    const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const endTime = new Date().toISOString();

    let url = `${MONITORING_API}/projects/${projectId}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${startTime}&interval.endTime=${endTime}&view=FULL`;

    if (aligner) {
        url += `&aggregation.perSeriesAligner=${aligner}&aggregation.alignmentPeriod=3600s`;
    }

    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (!data.timeSeries || data.timeSeries.length === 0) return [];

    return data.timeSeries[0].points.map((p: { value: { doubleValue?: number; int64Value?: number | string }; interval: { endTime: string } }) => ({
        value: p.value.doubleValue !== undefined ? p.value.doubleValue : (typeof p.value.int64Value === 'string' ? parseInt(p.value.int64Value) : p.value.int64Value),
        timestamp: p.interval.endTime
    }));
}

const TIER_CONNECTION_LIMITS: Record<string, number> = {
    'micro': 25,
    'small': 50,
    'custom-1': 100,
    'custom-2': 200,
    'custom-4': 400,
    'standard-1': 100,
    'standard-2': 200,
    'standard-4': 400,
    'highmem-2': 200,
    'highmem-4': 400,
};

/**
 * Helper to get estimated max connections for a tier (Phase 114)
 */
export function getEstimatedMaxConnections(tier: string): number {
    const matchedKey = Object.keys(TIER_CONNECTION_LIMITS).find(key => tier.includes(key));
    return matchedKey ? TIER_CONNECTION_LIMITS[matchedKey] : 100; // Default fallback
}

/**
 * Fetch resource metrics for a Cloud SQL instance
 */
export async function getCloudSqlMetrics(
    instanceId: string,
    dbType: 'postgresql' | 'mysql' = 'postgresql',
    tier: string = 'db-f1-micro'
): Promise<ResourceMetrics> {
    if (process.env.MOCK_DB === 'true') {
        const saturation = Math.floor(Math.random() * 85) + 5;
        return {
            cpuUtilization: Math.floor(Math.random() * 30) + 5,
            memoryUtilization: Math.floor(Math.random() * 40) + 20,
            diskUtilization: Math.floor(Math.random() * 10) + 5,
            connectionSaturation: saturation,
            poolingRecommendation: (dbType === 'postgresql' && saturation > 80)
                ? 'High connection saturation detected. Deployify recommends enabling PgBouncer for optimal connection pooling.'
                : undefined,
            timestamp: new Date().toISOString()
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    const metrics = ['cpu/utilization', 'memory/utilization', 'disk/utilization'];
    const results: Record<string, number> = {};

    for (const metric of metrics) {
        const filter = `metric.type="cloudsql.googleapis.com/database/${metric}" AND resource.labels.database_id="${gcpProjectId}:${instanceId}"`;
        const value = await fetchLatestMetricValue(gcpProjectId!, accessToken, filter);
        results[metric] = value * 100; // Convert to percentage
    }

    // Fetch connection saturation (Postgres/MySQL)
    const saturationMetric = dbType === 'postgresql' ? 'network/active_connections' : 'mysql/net_connections';
    const saturationFilter = `metric.type="cloudsql.googleapis.com/database/${saturationMetric}" AND resource.labels.database_id="${gcpProjectId}:${instanceId}"`;
    const activeConnections = await fetchLatestMetricValue(gcpProjectId!, accessToken, saturationFilter);

    // Normalize saturation using tier-aware limits (Phase 114)
    const estimatedMax = getEstimatedMaxConnections(tier);
    const saturation = Math.min(100, (activeConnections / estimatedMax) * 100);

    // Connection Pooling Governance (Phase 114)
    let poolingRecommendation;
    if (dbType === 'postgresql' && saturation > 80) {
        poolingRecommendation = 'High connection saturation detected. Deployify recommends enabling PgBouncer for optimal connection pooling.';
    }

    return {
        cpuUtilization: parseFloat(results['cpu/utilization'].toFixed(2)),
        memoryUtilization: parseFloat(results['memory/utilization'].toFixed(2)),
        diskUtilization: parseFloat(results['disk/utilization'].toFixed(2)),
        connectionSaturation: parseFloat(saturation.toFixed(2)),
        poolingRecommendation,
        timestamp: new Date().toISOString()
    };
}

/**
 * Fetch resource metrics for a Memorystore (Redis) instance
 */
export async function getMemorystoreMetrics(instanceId: string, region: string): Promise<ResourceMetrics> {
    if (process.env.MOCK_DB === 'true') {
        return {
            cpuUtilization: Math.floor(Math.random() * 20) + 2,
            memoryUtilization: Math.floor(Math.random() * 50) + 10,
            timestamp: new Date().toISOString()
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    // CPU for Redis is more complex (usage_time), but we'll try to get a usable ratio or just usage
    const cpuFilter = `metric.type="redis.googleapis.com/stats/cpu/usage_time" AND resource.labels.instance_id="projects/${gcpProjectId}/locations/${region}/instances/${instanceId}"`;
    const memoryFilter = `metric.type="redis.googleapis.com/stats/memory/usage_ratio" AND resource.labels.instance_id="projects/${gcpProjectId}/locations/${region}/instances/${instanceId}"`;

    const cpuValue = await fetchLatestMetricValue(gcpProjectId!, accessToken, cpuFilter);
    const memoryValue = await fetchLatestMetricValue(gcpProjectId!, accessToken, memoryFilter);

    return {
        cpuUtilization: parseFloat((cpuValue * 100).toFixed(2)),
        memoryUtilization: parseFloat((memoryValue * 100).toFixed(2)),
        connectionSaturation: 0, // Memorystore connections are usually not the primary bottleneck
        timestamp: new Date().toISOString()
    };
}

/**
 * Analyze historical resource metrics to detect dormancy
 */
export async function getResourceDormancy(
    storageType: string,
    instanceId: string,
    region?: string
): Promise<ResourceDormancy> {
    const analysisPeriodDays = 7;
    const startTime = new Date(Date.now() - analysisPeriodDays * 24 * 60 * 60 * 1000).toISOString();
    const endTime = new Date().toISOString();

    if (process.env.MOCK_DB === 'true') {
        const isSupported = storageType.includes('cloud-sql') || storageType === 'memorystore-redis';
        const isDormant = isSupported ? Math.random() > 0.8 : false; // Only simulate dormancy for supported types
        return {
            isDormant,
            avgCpuUtilization: isDormant ? 0.2 : 5.4,
            avgMemoryUtilization: isDormant ? 12.0 : 45.2,
            avgDiskUtilization: storageType.includes('cloud-sql') ? (isDormant ? 5.0 : 12.5) : undefined,
            lastActiveAt: isDormant ? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() : endTime,
            analysisPeriodDays
        };
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    try {
        let cpuFilter = '';
        let memoryFilter = '';
        let diskFilter = '';

        if (storageType.includes('cloud-sql')) {
            cpuFilter = `metric.type="cloudsql.googleapis.com/database/cpu/utilization" AND resource.labels.database_id="${gcpProjectId}:${instanceId}"`;
            memoryFilter = `metric.type="cloudsql.googleapis.com/database/memory/utilization" AND resource.labels.database_id="${gcpProjectId}:${instanceId}"`;
            diskFilter = `metric.type="cloudsql.googleapis.com/database/disk/utilization" AND resource.labels.database_id="${gcpProjectId}:${instanceId}"`;
        } else if (storageType === 'memorystore-redis' && region) {
            cpuFilter = `metric.type="redis.googleapis.com/stats/cpu/usage_time" AND resource.labels.instance_id="projects/${gcpProjectId}/locations/${region}/instances/${instanceId}"`;
            memoryFilter = `metric.type="redis.googleapis.com/stats/memory/usage_ratio" AND resource.labels.instance_id="projects/${gcpProjectId}/locations/${region}/instances/${instanceId}"`;
        } else {
            return { isDormant: false, avgCpuUtilization: 0, avgMemoryUtilization: 0, analysisPeriodDays };
        }

        const [cpuAvg, memoryAvg, diskAvg] = await Promise.all([
            fetchMetricAverage(gcpProjectId!, accessToken, cpuFilter, startTime, endTime),
            fetchMetricAverage(gcpProjectId!, accessToken, memoryFilter, startTime, endTime),
            diskFilter ? fetchMetricAverage(gcpProjectId!, accessToken, diskFilter, startTime, endTime) : Promise.resolve(undefined)
        ]);

        const avgCpu = cpuAvg * 100;
        const avgMem = memoryAvg * 100;
        const avgDisk = diskAvg !== undefined ? diskAvg * 100 : undefined;

        // Dormancy logic: Extremely low CPU (< 0.5%) and Memory (< 15% for SQL, < 5% for Redis)
        const isDormant = avgCpu < 0.5 && (storageType.includes('cloud-sql') ? avgMem < 15 : avgMem < 5);

        return {
            isDormant,
            avgCpuUtilization: parseFloat(avgCpu.toFixed(2)),
            avgMemoryUtilization: parseFloat(avgMem.toFixed(2)),
            avgDiskUtilization: avgDisk !== undefined ? parseFloat(avgDisk.toFixed(2)) : undefined,
            lastActiveAt: isDormant ? undefined : endTime, // In a real scenario, we'd find the last peak
            analysisPeriodDays
        };
    } catch (error) {
        console.error(`Dormancy analysis failed for ${instanceId}:`, error);
        return { isDormant: false, avgCpuUtilization: 0, avgMemoryUtilization: 0, analysisPeriodDays };
    }
}

/**
 * Calculate estimated monthly cost for a storage resource based on its tier and size
 */
export function getEstimatedMonthlyCost(
    storageType: string,
    tier: string,
    diskSizeGb?: number,
    isHA?: boolean
): number {
    let cost = 0;
    const normalizedTier = tier.toUpperCase();

    if (storageType.includes('cloud-sql')) {
        // Compute Cost (Approximate Monthly)
        const computeCosts: Record<string, number> = {
            'db-f1-micro': 9.50,
            'db-g1-small': 25.50,
            'db-custom-1-3840': 52.00,
            'db-custom-2-7680': 104.00,
            'db-custom-4-15360': 208.00,
            'db-n1-standard-1': 50.00,
            'db-n1-standard-2': 100.00,
            'db-n1-standard-4': 200.00,
            'db-n1-highmem-2': 150.00,
            'db-n1-highmem-4': 300.00,
            'db-n1-highmem-8': 600.00,
        };

        cost = computeCosts[tier] || computeCosts['db-f1-micro'];

        // Storage Cost (~$0.17 per GB)
        if (diskSizeGb) {
            cost += diskSizeGb * 0.17;
        }

        // HA Multiplier (Double the cost for Regional HA)
        if (isHA) {
            cost *= 2;
        }
    } else if (storageType === 'memorystore-redis') {
        // Redis Cost (~$35 per GB for Basic, ~$70 for Standard/HA)
        const sizeGb = parseInt(tier) || 1;
        cost = sizeGb * (isHA ? 72.00 : 36.00);
    } else if (storageType === 'firestore') {
        // Firestore is usage-based, but we'll show a minimum platform overhead/estimated starting cost
        cost = 0; // Truly serverless/pay-as-you-go
    } else if (storageType === 'supabase') {
        if (normalizedTier.includes('FREE')) cost = 0;
        else if (normalizedTier.includes('PRO')) cost = 25;
        else if (normalizedTier.includes('TEAM')) cost = 599;
        else if (normalizedTier.includes('ENTERPRISE')) cost = 2000;
        else cost = 0;
    } else if (storageType === 'mongodb-atlas') {
        if (normalizedTier === 'M0' || normalizedTier === 'FREE') cost = 0;
        else if (normalizedTier === 'M2') cost = 9;
        else if (normalizedTier === 'M5') cost = 25;
        else if (normalizedTier.startsWith('M')) {
            const size = parseInt(normalizedTier.substring(1));
            if (size >= 10 && size < 30) cost = 60;
            else if (size >= 30) cost = 150;
            else cost = 40;
        } else cost = 0;
    } else if (storageType === 'planetscale') {
        if (normalizedTier.includes('FREE') || normalizedTier.includes('HOBBY')) cost = 0;
        else if (normalizedTier.includes('SCALER')) cost = 29;
        else if (normalizedTier.includes('PRO')) cost = 39;
        else if (normalizedTier.includes('TEAM')) cost = 599;
        else cost = 0;
    } else if (storageType === 'neon') {
        if (normalizedTier.includes('FREE')) cost = 0;
        else if (normalizedTier.includes('LAUNCH')) cost = 19;
        else if (normalizedTier.includes('SCALE')) cost = 69;
        else if (normalizedTier.includes('PRO')) cost = 49;
        else cost = 0;
    }

    return parseFloat(cost.toFixed(2));
}

/**
 * Fetch top slow queries from GCP Cloud SQL Query Insights
 */
/**
 * Fetch status and basic metrics from external providers
 */
export async function getExternalMetrics(
    storageType: string,
    metadata: Record<string, unknown>,
    providerApiKeySecretId?: string
): Promise<{ status: string; usage?: number; limit?: number; unit?: string; tier?: string }> {
    if (process.env.MOCK_DB === 'true') {
        const isNeon = storageType === 'neon';
        return {
            status: 'ACTIVE',
            usage: Math.floor(Math.random() * 40) + 10,
            limit: 100,
            unit: isNeon ? 'CU' : 'GB',
            tier: isNeon ? 'LAUNCH' : 'PRO'
        };
    }

    let providerApiKey = metadata.providerApiKey as string;

    if (!providerApiKey && providerApiKeySecretId) {
        try {
            providerApiKey = await getSecretValue(providerApiKeySecretId);
        } catch (e) {
            console.error(`[Monitoring] Failed to fetch API key for metrics:`, e);
        }
    }

    if (!providerApiKey) return { status: 'UNKNOWN' };

    try {
        if (storageType === 'neon') {
            const neonProjectId = metadata.neonProjectId as string;
            if (!neonProjectId) return { status: 'UNKNOWN' };

            const res = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}`, {
                headers: { 'Authorization': `Bearer ${providerApiKey}` }
            });

            if (res.ok) {
                const data = await res.json();

                // Fetch consumption metrics for compute unit utilization
                let usage = 0;
                try {
                    const consumptionRes = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}/consumption`, {
                        headers: { 'Authorization': `Bearer ${providerApiKey}` }
                    });
                    if (consumptionRes.ok) {
                        const consData = await consumptionRes.json();
                        // Estimate utilization based on active_compute_unit_seconds vs typical monthly limits
                        // (Simplified for this dashboard - normalized to 0-100 scale)
                        usage = Math.min(100, (consData.consumption?.active_compute_unit_seconds || 0) / 3600);
                    }
                } catch (e) {
                    console.warn(`[Monitoring] Failed to fetch Neon consumption:`, e);
                }

                return {
                    status: data.project?.status?.toUpperCase() || 'ACTIVE',
                    tier: (data.project?.plan_id || 'free').toUpperCase(),
                    usage,
                    unit: 'CU'
                };
            }
        } else if (storageType === 'mongodb-atlas') {
            const groupId = metadata.groupId as string;
            const clusterName = metadata.clusterName as string;
            if (!groupId || !clusterName) return { status: 'UNKNOWN' };

            // MongoDB Atlas API often uses Digest Auth, but some configurations support Bearer
            // We attempt with Bearer first as that's what's currently provided in metadata
            const res = await fetch(`https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${clusterName}`, {
                headers: {
                    'Authorization': `Bearer ${providerApiKey}`,
                    'Accept': 'application/json'
                }
            });

            if (res.ok) {
                const data = await res.json();
                return {
                    status: data.stateName === 'IDLE' ? 'ACTIVE' : (data.stateName || 'ACTIVE'),
                    tier: data.providerSettings?.instanceSizeName || 'M0',
                    usage: undefined
                };
            }
        } else if (storageType === 'supabase') {
            const supabaseId = metadata.supabaseId as string;
            if (!supabaseId) return { status: 'UNKNOWN' };

            const res = await fetch(`https://api.supabase.com/v1/projects/${supabaseId}`, {
                headers: { 'Authorization': `Bearer ${providerApiKey}` }
            });

            if (res.ok) {
                const data = await res.json();
                return {
                    status: data.status?.toUpperCase() || 'ACTIVE',
                    tier: data.plan?.toUpperCase() || 'FREE'
                };
            }
        }
    } catch (e) {
        console.warn(`[Monitoring] Failed to fetch external metrics for ${storageType}:`, e);
    }

    return { status: 'UNKNOWN' };
}

export async function getQueryInsights(
    instanceId: string,
    dbType: 'postgresql' | 'mysql' = 'postgresql',
    limit: number = 5
): Promise<{ query: string, avgLatency: number, count: number }[]> {
    if (process.env.MOCK_DB === 'true') {
        return [
            { query: 'SELECT * FROM products WHERE category = "electronics" ORDER BY price DESC', avgLatency: 1450, count: 24 },
            { query: 'SELECT u.name, COUNT(o.id) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.id', avgLatency: 920, count: 156 },
            { query: 'UPDATE inventory SET stock = stock - 1 WHERE product_id = ?', avgLatency: 450, count: 890 },
            { query: 'SELECT * FROM logs WHERE severity = "ERROR" AND timestamp > NOW() - INTERVAL 1 DAY', avgLatency: 320, count: 45 },
            { query: 'SELECT DISTINCT city FROM users', avgLatency: 150, count: 1200 }
        ].slice(0, limit);
    }

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    // In a real scenario, this would call the Cloud SQL Admin API or Cloud Monitoring API
    // to fetch query insights metrics.
    // For now, we simulate this with a structured response based on the instance.
    try {
        const metricType = `cloudsql.googleapis.com/database/${dbType}/insights/query_usage`;
        const response = await fetch(`${MONITORING_API}/projects/${gcpProjectId}/timeSeries?filter=metric.type%3D%22${encodeURIComponent(metricType)}%22%20AND%20resource.labels.database_id%3D%22${gcpProjectId}%3A${instanceId}%22&interval.startTime=${new Date(Date.now() - 3600000).toISOString()}&interval.endTime=${new Date().toISOString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) return [];
        const data = await response.json();

        // Transform complex GCP timeseries data into simplified hotspots
        if (!data.timeSeries) return [];

        return data.timeSeries.slice(0, limit).map((ts: { metric: { labels: { query_fingerprint?: string } }, points: { value: { doubleValue: number, int64Value: string } }[] }) => ({
            query: ts.metric.labels.query_fingerprint || 'Unknown Query',
            avgLatency: Math.round(ts.points[0].value.doubleValue * 1000) || 0,
            count: parseInt(ts.points[0].value.int64Value) || 1
        }));
    } catch (e) {
        console.error('Failed to fetch query insights:', e);
        return [];
    }
}

/**
 * Predict resource exhaustion by analyzing historical utilization trends (Phase 142)
 * Uses linear regression to forecast when a resource will hit 100% utilization.
 */
export function predictResourceExhaustion(
    historicalMetrics: ResourceMetrics[],
    resource: 'cpu' | 'memory' | 'disk' | 'connections'
): number {
    if (historicalMetrics.length < 5) return -1; // Not enough data for prediction

    const values = historicalMetrics.map(m => {
        if (resource === 'cpu') return m.cpuUtilization;
        if (resource === 'memory') return m.memoryUtilization;
        if (resource === 'disk') return m.diskUtilization || 0;
        if (resource === 'connections') return m.connectionSaturation || 0;
        return 0;
    });

    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // If slope is negative or zero, utilization is stable or declining
    if (slope <= 0) return -1;

    // Solve for x when y = 100: 100 = slope * x + intercept => x = (100 - intercept) / slope
    const exhaustionIndex = (100 - intercept) / slope;
    const pointsRemaining = exhaustionIndex - (n - 1);

    // Convert points (usually hourly) to days
    return Math.max(0, parseFloat((pointsRemaining / 24).toFixed(1)));
}

/**
 * Calculate reliability score (0-100) based on uptime and SLO targets (Phase 142)
 */
export function calculateReliabilityScore(
    healthHistory: import('./storage-validator').HealthResult[],
    sloTargets: { uptime: number; p99Latency: number } = { uptime: 99.9, p99Latency: 500 }
): ReliabilityMetrics {
    const total = healthHistory.length;
    if (total === 0) {
        return {
            score: 100,
            uptime: 100,
            avgLatency: 0,
            p99Latency: 0,
            sloViolations: 0,
            lastAnalyzedAt: new Date().toISOString()
        };
    }

    const healthy = healthHistory.filter(h => h.status === 'healthy' || h.status === 'degraded').length;
    const uptime = (healthy / total) * 100;

    const latencies = healthHistory.map(h => h.latency).sort((a, b) => a - b);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / total;
    const p99Latency = latencies[Math.floor(total * 0.99)] || latencies[total - 1];

    const availabilityViolations = healthHistory.filter(h => h.status === 'unhealthy').length;
    const latencyViolations = healthHistory.filter(h => h.latency > sloTargets.p99Latency).length;
    const totalViolations = availabilityViolations + latencyViolations;

    // Score calculation logic:
    // Availability accounts for 60% of the score
    // Latency SLO accounts for 40% of the score
    const availabilityScore = Math.max(0, 100 - (100 - uptime) * 20); // 1% downtime = -20 points
    const latencyScore = Math.max(0, 100 - (latencyViolations / total) * 100);

    const score = Math.round((availabilityScore * 0.6) + (latencyScore * 0.4));

    return {
        score,
        uptime: parseFloat(uptime.toFixed(3)),
        avgLatency: Math.round(avgLatency),
        p99Latency: Math.round(p99Latency),
        sloViolations: totalViolations,
        lastAnalyzedAt: new Date().toISOString()
    };
}

/**
 * Check for SLO violations and saturation risks (Phase 142)
 */
export function checkSLOViolations(
    storage: import('@/types').StorageConfig,
    metrics: ResourceMetrics,
    historicalMetrics: ResourceMetrics[] = []
): SaturationRisk | undefined {
    const resources: ('cpu' | 'memory' | 'disk' | 'connections')[] = ['cpu', 'memory', 'disk', 'connections'];

    for (const r of resources) {
        const daysToExhaustion = predictResourceExhaustion(historicalMetrics, r);
        const utilization = r === 'cpu' ? metrics.cpuUtilization :
                          r === 'memory' ? metrics.memoryUtilization :
                          r === 'disk' ? metrics.diskUtilization || 0 :
                          metrics.connectionSaturation || 0;

        if (daysToExhaustion >= 0 && daysToExhaustion <= 7) {
            return {
                hasRisk: true,
                resource: r,
                currentUtilization: utilization,
                predictedDaysToExhaustion: daysToExhaustion,
                recommendation: `Resource ${r.toUpperCase()} is predicted to reach 100% utilization in ${daysToExhaustion} days based on current growth trends. Immediate scaling is recommended.`,
                timestamp: new Date().toISOString()
            };
        }

        if (utilization > 90) {
            return {
                hasRisk: true,
                resource: r,
                currentUtilization: utilization,
                predictedDaysToExhaustion: 0.5,
                recommendation: `Resource ${r.toUpperCase()} utilization is critically high (${utilization.toFixed(1)}%). Performance degradation or service failure is imminent.`,
                timestamp: new Date().toISOString()
            };
        }
    }

    return undefined;
}

/**
 * Detect performance regressions by comparing telemetry before and after a deployment (Phase 139)
 */
export async function detectPerformanceRegressions(
    projectId: string,
    storageId: string,
    deploymentTimestamp: Date | string,
    options: {
        lookbackHours?: number;
        deploymentId?: string;
    } = {}
): Promise<PerformanceRegressionReport> {
    const { lookbackHours = 12, deploymentId } = options;
    const deployDate = new Date(deploymentTimestamp);
    const windowStart = new Date(deployDate.getTime() - lookbackHours * 60 * 60 * 1000);
    const windowEnd = new Date(deployDate.getTime() + lookbackHours * 60 * 60 * 1000);
    const now = new Date();
    const currentEnd = windowEnd > now ? now : windowEnd;

    if (process.env.MOCK_DB === 'true') {
        const hasRegression = Math.random() > 0.7;
        return {
            hasRegression,
            severity: hasRegression ? 'medium' : 'none',
            metrics: {
                latencyDelta: hasRegression ? 25.5 : 2.1,
                errorRateDelta: hasRegression ? 1.5 : 0.05,
                p99Delta: hasRegression ? 120 : 5
            },
            regressedQueries: hasRegression ? [
                { queryHash: 'SELECT * FROM users WHERE active = ?', previousLatency: 45, currentLatency: 85, delta: 88.8 }
            ] : [],
            correlatedMigrations: hasRegression ? [
                { id: 'mig-101', name: '20240701_add_active_index', appliedAt: new Date(deployDate.getTime() + 1000).toISOString(), status: 'SUCCESS', performanceImpact: 88.8, regressionSeverity: 'medium' }
            ] : [],
            deploymentId,
            timestamp: now.toISOString()
        };
    }

    try {
        const { getDb, Collections } = await import('@/lib/firebase');
        const db = getDb();

        // 1. Fetch baseline (Pre-deployment)
        const baselineSnapshot = await db.collection(Collections.RUNTIME_TELEMETRY)
            .where('projectId', '==', projectId)
            .where('storageId', '==', storageId)
            .where('timestamp', '>=', windowStart)
            .where('timestamp', '<', deployDate)
            .get();

        // 2. Fetch current (Post-deployment)
        const currentSnapshot = await db.collection(Collections.RUNTIME_TELEMETRY)
            .where('projectId', '==', projectId)
            .where('storageId', '==', storageId)
            .where('timestamp', '>=', deployDate)
            .where('timestamp', '<=', currentEnd)
            .get();

        const calculateStats = (docs: import('firebase-admin/firestore').QueryDocumentSnapshot<import('firebase-admin/firestore').DocumentData>[]) => {
            if (docs.length === 0) return { avg: 0, p99: 0, errorRate: 0, queryMap: new Map<string, { total: number, count: number }>() };
            const latencies = docs.map(d => Number(d.data().durationMs) || 0).sort((a, b) => a - b);
            const errors = docs.filter(d => !d.data().success).length;
            const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            const p99 = latencies[Math.floor(latencies.length * 0.99)] || latencies[latencies.length - 1];

            const queryMap = new Map<string, { total: number, count: number }>();
            docs.forEach(d => {
                const data = d.data();
                const hash = (data.queryHash as string) || 'unknown';
                const existing = queryMap.get(hash) || { total: 0, count: 0 };
                queryMap.set(hash, { total: existing.total + (Number(data.durationMs) || 0), count: existing.count + 1 });
            });

            return { avg, p99, errorRate: (errors / docs.length) * 100, queryMap };
        };

        const baseline = calculateStats(baselineSnapshot.docs);
        const current = calculateStats(currentSnapshot.docs);

        const latencyDelta = baseline.avg > 0 ? ((current.avg - baseline.avg) / baseline.avg) * 100 : 0;
        const errorRateDelta = current.errorRate - baseline.errorRate;
        const p99Delta = current.p99 - baseline.p99;

        const regressedQueries: PerformanceRegressionReport['regressedQueries'] = [];
        current.queryMap.forEach((stats, hash) => {
            const currentAvg = stats.total / stats.count;
            const baselineStats = baseline.queryMap.get(hash);
            if (baselineStats) {
                const baselineAvg = baselineStats.total / baselineStats.count;
                if (currentAvg > baselineAvg * 1.3) { // 30% regression
                    regressedQueries.push({
                        queryHash: hash,
                        previousLatency: Math.round(baselineAvg),
                        currentLatency: Math.round(currentAvg),
                        delta: parseFloat((((currentAvg - baselineAvg) / baselineAvg) * 100).toFixed(1))
                    });
                }
            }
        });

        // 3. Correlate with Migrations (Phase 140)
        const migrationsSnapshot = await db.collection(Collections.PROJECTS).doc(projectId).get();
        const projectData = migrationsSnapshot.data();
        const storageConfig = projectData?.storageConfigs?.find((s: import('@/types').StorageConfig) => s.id === storageId);
        const connectionString = storageConfig?.connectionStringSecretId ? await getSecretValue(storageConfig.connectionStringSecretId) : '';

        const { listMigrations } = await import('./migrations');
        const allMigrations = await listMigrations(connectionString, storageConfig?.type || 'cloud-sql-postgres');

        // Find migrations applied around the deployment window (within 1 hour of deployment)
        const oneHour = 60 * 60 * 1000;
        const correlatedMigrations = allMigrations.filter(m => {
            if (!m.appliedAt) return false;
            const appliedDate = new Date(m.appliedAt);
            return Math.abs(appliedDate.getTime() - deployDate.getTime()) < oneHour;
        });

        // Enrich migrations with impact data
        correlatedMigrations.forEach(m => {
            m.performanceImpact = parseFloat(latencyDelta.toFixed(1));
            m.regressionSeverity = (latencyDelta > 50) ? 'high' : (latencyDelta > 15 ? 'medium' : 'low');
        });

        const hasRegression = latencyDelta > 15 || errorRateDelta > 1 || p99Delta > 100 || regressedQueries.length > 0;
        const severity = (latencyDelta > 50 || errorRateDelta > 5) ? 'high' : (hasRegression ? 'medium' : 'none');

        return {
            hasRegression,
            severity,
            metrics: {
                latencyDelta: parseFloat(latencyDelta.toFixed(1)),
                errorRateDelta: parseFloat(errorRateDelta.toFixed(2)),
                p99Delta: Math.round(p99Delta)
            },
            regressedQueries: regressedQueries.sort((a, b) => b.delta - a.delta).slice(0, 5),
            correlatedMigrations: correlatedMigrations.length > 0 ? correlatedMigrations : undefined,
            deploymentId,
            timestamp: now.toISOString()
        };

    } catch (e) {
        console.error(`[Monitoring] Error detecting performance regressions:`, e);
        return {
            hasRegression: false,
            severity: 'none',
            metrics: { latencyDelta: 0, errorRateDelta: 0, p99Delta: 0 },
            regressedQueries: [],
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Detect long-running or resource-intensive queries (Performance Guardrails)
 */
export async function getLongRunningQueries(
    instanceId: string,

    thresholdMs: number = 1000
): Promise<LongRunningQuery[]> {
    if (process.env.MOCK_DB === 'true') {
        return [
            {
                query: 'SELECT * FROM users CROSS JOIN orders CROSS JOIN products',
                durationMs: 5400,
                startTime: new Date(Date.now() - 6000).toISOString(),
                user: 'deployify-sa',
                database: 'app_prod'
            },
            {
                query: 'SELECT COUNT(*) FROM audit_logs WHERE payload LIKE "%error%"',
                durationMs: 2100,
                startTime: new Date(Date.now() - 15000).toISOString(),
                user: 'reporting-sa',
                database: 'audit_db'
            }
        ].filter(q => q.durationMs >= thresholdMs);
    }

    // In production, this would leverage the Cloud SQL Admin API to list active processes
    // or fetch from Cloud Logging / Query Insights.
    return [];
}

/**
 * Detect performance anomalies in resource utilization using EWMA baselining
 * Returns true if current utilization significantly deviates from historical trend
 */
export function detectPerformanceAnomaly(
    currentValue: number,
    historicalPoints: number[],
    threshold = 2.5
): { isAnomaly: boolean; baseline: number; deviation: number } {
    if (historicalPoints.length === 0) {
        return { isAnomaly: false, baseline: currentValue, deviation: 0 };
    }

    // Calculate baseline using EWMA across historical data
    let baseline = historicalPoints[0];
    for (let i = 1; i < historicalPoints.length; i++) {
        baseline = calculateEWMA(historicalPoints[i], baseline, 0.15); // Use a stable alpha for baselining
    }

    const isAnomaly = isDegraded(currentValue, baseline, threshold, 15); // 15% min delta for utilization
    const deviation = currentValue - baseline;

    return { isAnomaly, baseline, deviation };
}

/**
 * Analyze resource metrics and provide scaling recommendations.
 * Enhanced in Phase 136 to incorporate application-runtime telemetry for deeper profiling.
 */
export async function getScalingRecommendations(
    storageType: string,
    metrics: ResourceMetrics,
    metadata?: Record<string, unknown>,
    telemetry?: { p90: number; p99: number; errorRate: number }
): Promise<ScalingRecommendation[]> {
    const recommendations: ScalingRecommendation[] = [];
    const isCloudSql = storageType.includes('cloud-sql');
    const isRedis = storageType === 'memorystore-redis';
    const isNeon = storageType === 'neon';

    const currentTier = (metadata?.tier as string) || (isCloudSql ? 'db-f1-micro' : isRedis ? '1GB' : isNeon ? 'FREE' : 'unknown');
    const diskSizeGb = (metadata?.diskSizeGb as number) || (metadata?.memorySizeGb as number) || 10;
    const isHA = !!metadata?.highAvailability;

    const currentCost = getEstimatedMonthlyCost(storageType, currentTier, diskSizeGb, isHA);

    // 1. CPU Analysis
    const cpuAnomaly = detectPerformanceAnomaly(
        metrics.cpuUtilization,
        (metadata?.historicalCpu as number[]) || []
    );

    if (metrics.cpuUtilization > 75 || cpuAnomaly.isAnomaly) {
        let recommendedTier = 'db-g1-small';
        if (isCloudSql) {
            if (currentTier === 'db-g1-small') recommendedTier = 'db-custom-1-3840';
            else if (currentTier.includes('custom-1')) recommendedTier = 'db-custom-2-7680';
            else if (currentTier.includes('custom-2')) recommendedTier = 'db-custom-4-15360';
        } else if (isRedis) {
            const currentSize = parseInt(currentTier) || 1;
            recommendedTier = `${currentSize + 1}GB`;
        } else if (isNeon) {
            if (currentTier === 'FREE') recommendedTier = 'LAUNCH';
            else if (currentTier === 'LAUNCH') recommendedTier = 'PRO';
            else if (currentTier === 'PRO') recommendedTier = 'SCALE';
            else recommendedTier = 'SCALE';
        }

        recommendations.push({
            type: 'upgrade',
            resource: 'cpu',
            currentTier,
            recommendedTier: (isCloudSql || isRedis || isNeon) ? recommendedTier : 'Next Capacity Tier',
            reason: cpuAnomaly.isAnomaly
                ? `Significant CPU performance anomaly detected (${metrics.cpuUtilization.toFixed(1)}% vs baseline ${cpuAnomaly.baseline.toFixed(1)}%). Upgrading is recommended to handle spiky workloads safely.`
                : (isNeon
                    ? `High compute unit utilization (${metrics.cpuUtilization.toFixed(1)}%) detected. Upgrading to ${recommendedTier} will provide more burst capacity and higher resource limits.`
                    : `High CPU utilization (${metrics.cpuUtilization.toFixed(1)}%) detected. Upgrading will improve query performance and overall stability.`),
            performanceGain: 'High'
        });
    } else if (metrics.cpuUtilization < 15 && currentTier !== 'db-f1-micro' && currentTier !== '1GB' && currentTier !== 'FREE' && currentTier !== 'unknown') {
        let recommendedTier = 'db-f1-micro';
        if (isCloudSql) {
            if (currentTier.includes('custom-4')) recommendedTier = 'db-custom-2-7680';
            else if (currentTier.includes('custom-2')) recommendedTier = 'db-custom-1-3840';
            else if (currentTier.includes('custom-1')) recommendedTier = 'db-g1-small';
        } else if (isRedis) {
            const currentSize = parseInt(currentTier) || 1;
            recommendedTier = `${Math.max(1, currentSize - 1)}GB`;
        } else if (isNeon) {
            if (currentTier === 'SCALE') recommendedTier = 'PRO';
            else if (currentTier === 'PRO') recommendedTier = 'LAUNCH';
            else if (currentTier === 'LAUNCH') recommendedTier = 'FREE';
            else recommendedTier = 'FREE';
        }

        const recommendedCost = getEstimatedMonthlyCost(storageType, recommendedTier, diskSizeGb, isHA);
        const savings = currentCost - recommendedCost;

        recommendations.push({
            type: 'downgrade',
            resource: 'cpu',
            currentTier,
            recommendedTier: (isCloudSql || isRedis || isNeon) ? recommendedTier : 'Lower Capacity Tier',
            reason: `Low CPU utilization (${metrics.cpuUtilization.toFixed(1)}%) detected consistently. Downgrading to a smaller tier will reduce infrastructure costs.`,
            estimatedSavings: savings > 0 ? `$${savings.toFixed(2)}/mo` : '15-40%',
            savingsAmount: savings > 0 ? parseFloat(savings.toFixed(2)) : undefined
        });
    }

    // 2. Memory Analysis
    if (metrics.memoryUtilization > 85) {
        recommendations.push({
            type: 'upgrade',
            resource: 'memory',
            currentTier,
            recommendedTier: isCloudSql ? 'Higher RAM Custom Tier' : 'Next Capacity Tier',
            reason: `Memory usage is near capacity (${metrics.memoryUtilization.toFixed(1)}%). Increasing memory prevents OOM errors and improves database caching performance.`,
            performanceGain: 'Medium'
        });
    }

    // 3. Disk Analysis (Cloud SQL)
    if (isCloudSql && metrics.diskUtilization !== undefined && metrics.diskUtilization > 80) {
        const currentSize = (metadata?.diskSizeGb as number) || 10;
        recommendations.push({
            type: 'upgrade',
            resource: 'disk',
            currentTier: `${currentSize}GB`,
            recommendedTier: `${currentSize + 20}GB`,
            reason: `Disk space is running low (${metrics.diskUtilization.toFixed(1)}%). Increasing storage capacity is essential to avoid write failures.`,
            performanceGain: 'Critical'
        });
    }

    // 4. Read Replica Suggestion (Cloud SQL)
    const workload = detectWorkloadProfile(metrics);
    const hasReplicas = (metadata?.replicas as unknown[])?.length > 0;

    if (isCloudSql && workload.type === 'READ_HEAVY' && !hasReplicas) {
        recommendations.push({
            type: 'optimize',
            resource: 'cpu',
            currentTier: 'Single Instance',
            recommendedTier: 'Primary + Read Replica',
            reason: 'Read-heavy workload detected with high memory utilization but moderate CPU. Offloading read traffic to a replica will improve primary instance stability and overall query performance.',
            performanceGain: 'High'
        });
    }

    // 5. Phase 119: Serverless Cold-Start Optimization (Neon/Firestore)
    if ((isNeon || storageType === 'firestore') && metadata?.health) {
        const health = metadata.health as { isColdStart?: boolean, status?: string };
        if (health.isColdStart || health.status === 'degraded') {
            recommendations.push({
                type: 'optimize',
                resource: 'cpu',
                currentTier: currentTier,
                recommendedTier: isNeon ? 'LAUNCH' : 'NATIVE',
                reason: 'Persistent serverless cold-starts or degraded latency detected. Upgrading to a provisioned or higher-performance tier will minimize request latency for critical paths.',
                performanceGain: 'Medium'
            });
        }
    }

    // 6. Phase 136: Application-Aware Scaling (Telemetry-driven)
    if (telemetry) {
        if (telemetry.p99 > 500 && isCloudSql && !hasReplicas) {
            recommendations.push({
                type: 'upgrade',
                resource: 'cpu',
                currentTier,
                recommendedTier: 'Higher Tier or Read Replica',
                reason: `Application P99 latency is high (${telemetry.p99}ms). GCP metrics show moderate load, but runtime telemetry indicates query queuing or index misses. Upgrading tier or adding replicas is recommended.`,
                performanceGain: 'High'
            });
        }

        if (telemetry.errorRate > 5 && storageType === 'memorystore-redis') {
            recommendations.push({
                type: 'optimize',
                resource: 'memory',
                currentTier,
                recommendedTier: 'Next Capacity Tier',
                reason: `High application-level error rate (${telemetry.errorRate.toFixed(1)}%) detected for Redis. This often indicates connection timeouts or memory pressure not yet reflected in 1m metrics.`,
                performanceGain: 'Medium'
            });
        }
    }

    return recommendations;
}

/**
 * Helper to fetch the average value for a specific metric filter over time
 */
async function fetchMetricAverage(
    projectId: string,
    accessToken: string,
    filter: string,
    startTime: string,
    endTime: string
): Promise<number> {
    // Aligns to 1 hour points for the historical average
    const url = `${MONITORING_API}/projects/${projectId}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=3600s&aggregation.perSeriesAligner=ALIGN_MEAN`;

    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
        console.error(`Failed to fetch average metric for ${filter}:`, await response.text());
        return 0;
    }

    const data = await response.json();
    if (!data.timeSeries || data.timeSeries.length === 0) return 0;

    const points = data.timeSeries[0].points;
    if (!points || points.length === 0) return 0;

    // Calculate average of all points in the range
    const sum = points.reduce((acc: number, point: { value: { doubleValue?: number; int64Value?: number | string } }) => {
        const val = point.value.doubleValue !== undefined ? point.value.doubleValue : point.value.int64Value;
        return acc + (typeof val === 'string' ? parseInt(val) : (val || 0));
    }, 0);

    return sum / points.length;
}

/**
 * Helper to fetch the latest value for a specific metric filter
 */
async function fetchLatestMetricValue(projectId: string, accessToken: string, filter: string): Promise<number> {
    const startTime = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // Last 5 minutes
    const endTime = new Date().toISOString();

    const url = `${MONITORING_API}/projects/${projectId}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${startTime}&interval.endTime=${endTime}&view=FULL`;

    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
        console.error(`Failed to fetch metric for ${filter}:`, await response.text());
        return 0;
    }

    const data = await response.json();
    if (!data.timeSeries || data.timeSeries.length === 0) return 0;

    const points = data.timeSeries[0].points;
    if (!points || points.length === 0) return 0;

    // Get the most recent point
    const latestPoint = points[0];
    const value = latestPoint.value.doubleValue !== undefined ? latestPoint.value.doubleValue : latestPoint.value.int64Value;

    return typeof value === 'string' ? parseInt(value) : (value || 0);
}

/**
 * Calculate infrastructure efficiency score (0-100)
 * Normalizes resource utilization against allocation costs
 */
export function calculateEfficiencyScore(
    metrics: ResourceMetrics,
    monthlyCost: number
): number {
    if (monthlyCost <= 0) return 100; // Free tiers are always "efficient" in cost

    const cpuWeight = 0.6;
    const memWeight = 0.4;

    // Ideal utilization is between 40% and 70%
    // Below 40% is over-provisioned (low efficiency)
    // Above 80% is risky but high efficiency (capped to avoid rewarding risk)

    const calculateDimScore = (val: number) => {
        if (val < 10) return 20;
        if (val < 40) return 50 + (val - 10);
        if (val <= 80) return 80 + (val - 40) * 0.5;
        return 95; // Diminishing returns for over-utilization risk
    };

    const cpuScore = calculateDimScore(metrics.cpuUtilization);
    const memScore = calculateDimScore(metrics.memoryUtilization);

    const rawScore = (cpuScore * cpuWeight) + (memScore * memWeight);

    // Cost Penalty: Higher absolute cost without high utilization reduces efficiency
    const costFactor = Math.max(0.7, 1 - (monthlyCost / 2000)); // Cap penalty for extreme costs

    return Math.round(rawScore * costFactor);
}

/**
 * Project 3-month storage costs based on current tiers and estimated growth.
 * Enhanced in Phase 119 to use historical trends if metrics are provided.
 */
export function getCostForecast(
    storageType: string,
    tier: string,
    diskSizeGb: number = 10,
    isHA: boolean = false,
    historicalMetrics: ResourceMetrics[] = []
): { month: string; cost: number }[] {
    const forecast = [];
    const now = new Date();

    // Phase 119: Calculate trend-based growth rate if historical data is available
    let growthRate = 0.05; // 5% default monthly
    if (historicalMetrics.length > 1) {
        const first = historicalMetrics[0].diskUtilization || 5;
        const last = historicalMetrics[historicalMetrics.length - 1].diskUtilization || 5;
        if (last > first) {
            // Calculate weekly growth and extrapolate to monthly
            const weeklyGrowth = (last - first) / first;
            growthRate = Math.min(0.2, weeklyGrowth * 4); // Cap at 20% monthly to avoid extreme outliers
        }
    }

    for (let i = 1; i <= 3; i++) {
        // Simple linear projection for storage growth
        const projectedDisk = diskSizeGb * Math.pow(1 + growthRate, i);
        const cost = getEstimatedMonthlyCost(storageType, tier, projectedDisk, isHA);
        const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);

        forecast.push({
            month: forecastDate.toLocaleString('default', { month: 'short' }),
            cost: parseFloat(cost.toFixed(2))
        });
    }

    return forecast;
}

/**
 * Detect serverless Cold-Starts (latency > 150ms for lightweight heartbeats)
 */
export function detectColdStart(latencyMs: number, storageType: string): boolean {
    if (!['neon', 'firestore'].includes(storageType)) return false;
    return latencyMs > 150;
}

/**
 * Intelligent Workload Profiling
 * Analyzes resource metrics to categorize the workload pattern
 */
export function detectWorkloadProfile(
    metrics: ResourceMetrics,
    dormancy?: ResourceDormancy
): WorkloadProfile {
    const now = new Date().toISOString();

    if (dormancy?.isDormant) {
        return { type: 'DORMANT', confidence: 0.95, lastAnalyzedAt: now };
    }

    const { cpuUtilization, memoryUtilization, connectionSaturation = 0 } = metrics;

    // READ_HEAVY: High memory (cache usage) but moderate CPU
    if (memoryUtilization > 60 && cpuUtilization < 40 && connectionSaturation < 50) {
        return { type: 'READ_HEAVY', confidence: 0.75, lastAnalyzedAt: now };
    }

    // WRITE_HEAVY: High connection saturation and moderate CPU/Memory
    if (connectionSaturation > 60 && cpuUtilization < 60) {
        return { type: 'WRITE_HEAVY', confidence: 0.7, lastAnalyzedAt: now };
    }

    // COMPUTE_INTENSIVE: Very high CPU utilization
    if (cpuUtilization > 70) {
        return { type: 'COMPUTE_INTENSIVE', confidence: 0.85, lastAnalyzedAt: now };
    }

    // Default to BALANCED
    return { type: 'BALANCED', confidence: 0.6, lastAnalyzedAt: now };
}

/**
 * Detect significant shifts in workload patterns (Phase 112)
 */
export function detectWorkloadShift(
    current: WorkloadProfile,
    previous?: WorkloadProfile
): { shifted: boolean; reason?: string; recommendation?: string } {
    if (!previous || current.type === previous.type) return { shifted: false };

    // High-confidence shifts that require attention
    if (current.confidence > 0.7) {
        if (previous.type === 'BALANCED' && current.type === 'READ_HEAVY') {
            return {
                shifted: true,
                reason: 'Workload shifted from BALANCED to READ_HEAVY',
                recommendation: 'Consider provisioning a read replica to offload query traffic.'
            };
        }

        if (previous.type === 'DORMANT' && current.type !== 'DORMANT') {
            return {
                shifted: true,
                reason: 'Dormant resource has become active',
                recommendation: 'Monitor resource utilization closely to ensure proper tiering.'
            };
        }

        if (current.type === 'COMPUTE_INTENSIVE' && previous.type !== 'COMPUTE_INTENSIVE') {
            return {
                shifted: true,
                reason: 'Significant increase in compute demand detected',
                recommendation: 'Evaluate if a CPU tier upgrade is necessary to maintain stability.'
            };
        }
    }

    return { shifted: false };
}

/**
 * Analyze workload patterns to recommend an optimal maintenance window (Phase 118)
 * Suggests a window during identified DORMANT or low-utilization periods.
 */
export function getMaintenanceRecommendation(
    metrics: ResourceMetrics[],
    dormancy?: ResourceDormancy
): MaintenanceRecommendation | null {
    if (dormancy?.isDormant) {
        // If dormant, any window is likely fine, but we'll suggest Sunday 03:00 AM
        return {
            day: 7,
            hour: 3,
            reason: 'Resource identified as dormant. Sunday 03:00 AM recommended for maintenance.'
        };
    }

    if (metrics.length === 0) return null;

    // In a real implementation, we would group metrics by day and hour to find the absolute minimum.
    // For this implementation, we analyze the provided historical metrics to find the lowest CPU/Conn period.
    const hourlyStats: Record<string, { cpu: number, count: number }> = {};

    metrics.forEach(m => {
        const date = new Date(m.timestamp);
        const day = date.getDay() || 7; // Convert 0 (Sun) to 7
        const hour = date.getHours();
        const key = `${day}-${hour}`;

        if (!hourlyStats[key]) hourlyStats[key] = { cpu: 0, count: 0 };
        hourlyStats[key].cpu += m.cpuUtilization;
        hourlyStats[key].count += 1;
    });

    let bestKey = '';
    let minAvgCpu = Infinity;

    Object.entries(hourlyStats).forEach(([key, stats]) => {
        const avgCpu = stats.cpu / stats.count;
        if (avgCpu < minAvgCpu) {
            minAvgCpu = avgCpu;
            bestKey = key;
        }
    });

    if (!bestKey) return null;

    const [day, hour] = bestKey.split('-').map(Number);
    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    return {
        day,
        hour,
        reason: `Lowest historical utilization detected on ${dayNames[day]}s around ${hour.toString().padStart(2, '0')}:00.`
    };
}

/**
 * Detect regressions in SQL execution plans (Plan Drift)
 */
export function detectPlanDrift(
    currentPlan: Record<string, unknown>[],
    historicalPlans: Record<string, unknown>[][]
): { drifted: boolean; reason?: string; impact?: 'high' | 'medium' | 'low' } {
    if (historicalPlans.length === 0) return { drifted: false };

    const getPlanSummary = (plan: Record<string, unknown>[]) => {
        const text = JSON.stringify(plan);
        return {
            hasSeqScan: text.includes('Seq Scan') || text.includes('"type": "ALL"'),
            totalCost: text.match(/cost=[\d\.]+..([\d\.]+)/)?.[1] || '0',
            rows: text.match(/rows=(\d+)/)?.[1] || '0'
        };
    };

    const current = getPlanSummary(currentPlan);
    const historicalSummaries = historicalPlans.map(getPlanSummary);

    // 1. Detection: Shift from Index to Seq Scan
    const historicallyUsedIndices = historicalSummaries.every(h => !h.hasSeqScan);
    if (current.hasSeqScan && historicallyUsedIndices) {
        return {
            drifted: true,
            reason: 'Execution plan shifted from Index Scan to Sequential Scan (Full Table Scan).',
            impact: 'high'
        };
    }

    // 2. Detection: Significant Cost Increase (> 50%)
    const avgHistoricalCost = historicalSummaries.reduce((acc, h) => acc + parseFloat(h.totalCost), 0) / historicalSummaries.length;
    if (parseFloat(current.totalCost) > avgHistoricalCost * 1.5) {
        return {
            drifted: true,
            reason: `Query execution cost increased by ${Math.round((parseFloat(current.totalCost) / avgHistoricalCost - 1) * 100)}% compared to baseline.`,
            impact: 'medium'
        };
    }

    return { drifted: false };
}

/**
 * Analyze telemetry and execution plans to correlate high-impact queries with bottlenecks (Phase 137)
 */
export async function getQueryImpactMetrics(
    projectId: string,
    storageId: string,
    options: {
        lookbackHours?: number;
    } = {}
): Promise<QueryImpactMetric[]> {
    const { lookbackHours = 24 } = options;

    if (process.env.MOCK_DB === 'true') {
        return [
            { queryHash: 'SELECT * FROM users WHERE email = ?', avgLatency: 450, maxLatency: 1200, requestCount: 1500, errorRate: 0.5, impactScore: 675000, hasSeqScan: true, recommendation: 'CREATE INDEX idx_users_email ON users(email);' },
            { queryHash: 'SELECT count(*) FROM orders', avgLatency: 850, maxLatency: 3500, requestCount: 200, errorRate: 1.2, impactScore: 170000, hasSeqScan: true, recommendation: 'Consider materialized view or aggregate table for count queries.' },
            { queryHash: 'UPDATE products SET stock = stock - 1', avgLatency: 45, maxLatency: 150, requestCount: 5000, errorRate: 0.1, impactScore: 225000, hasSeqScan: false }
        ];
    }

    try {
        const { getDb, Collections } = await import('@/lib/firebase');
        const db = getDb();
        const lookbackDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

        const snapshot = await db.collection(Collections.RUNTIME_TELEMETRY)
            .where('projectId', '==', projectId)
            .where('storageId', '==', storageId)
            .where('timestamp', '>=', lookbackDate)
            .get();

        if (snapshot.empty) return [];

        const queryMap: Record<string, { total: number, count: number, max: number, errors: number }> = {};
        snapshot.docs.forEach(doc => {
            const d = doc.data();
            const hash = d.queryHash || 'unknown';
            if (!queryMap[hash]) queryMap[hash] = { total: 0, count: 0, max: 0, errors: 0 };
            queryMap[hash].total += (Number(d.durationMs) || 0);
            queryMap[hash].count += 1;
            queryMap[hash].max = Math.max(queryMap[hash].max, Number(d.durationMs) || 0);
            if (!d.success) queryMap[hash].errors += 1;
        });

        const metrics: QueryImpactMetric[] = Object.entries(queryMap).map(([hash, stats]) => {
            const avgLatency = Math.round(stats.total / stats.count);
            const impactScore = avgLatency * stats.count;
            const errorRate = parseFloat(((stats.errors / stats.count) * 100).toFixed(2));

            return {
                queryHash: hash,
                avgLatency,
                maxLatency: stats.max,
                requestCount: stats.count,
                errorRate,
                impactScore
            };
        });

        // Sort by impact score descending
        return metrics.sort((a, b) => b.impactScore - a.impactScore).slice(0, 10);
    } catch (e) {
        console.error(`[Monitoring] Error calculating query impact metrics:`, e);
        return [];
    }
}

/**
 * Analyze a SQL execution plan to detect missing indexes or performance bottlenecks (Phase 137)
 */
export function analyzePlanForIndexes(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plan: any[],
    dbType: 'postgresql' | 'mysql' = 'postgresql'
): { recommendation?: string; hasSeqScan: boolean; impact: 'high' | 'medium' | 'low'; isComposite?: boolean; isDuplicate?: boolean } {
    const planText = JSON.stringify(plan);
    let hasSeqScan = false;
    let recommendation: string | undefined;
    let impact: 'high' | 'medium' | 'low' = 'low';
    let isComposite = false;
    let isDuplicate = false;

    if (dbType === 'postgresql') {
        hasSeqScan = planText.includes('Seq Scan');
        if (hasSeqScan) {
            const tableMatch = planText.match(/on ([a-zA-Z0-9_]+)/);
            const tableName = tableMatch ? tableMatch[1] : 'table';
            const filterMatch = planText.match(/Filter: \(([^)]+)\)/);

            if (filterMatch) {
                const filterText = filterMatch[1];
                // Detect multiple conditions for composite index
                const conditions = filterText.split(/ AND | OR /i);
                if (conditions.length > 1) {
                    const columns = conditions.map(c => c.trim().split(' ')[0].replace(/[()]/g, ''))
                        .filter(col => col && !col.includes("'") && !col.includes('"'));
                    const uniqueCols = Array.from(new Set(columns));
                    if (uniqueCols.length > 1) {
                        recommendation = `CREATE INDEX idx_${tableName}_composite_${uniqueCols.join('_')} ON ${tableName}(${uniqueCols.join(', ')});`;
                        impact = 'high';
                        isComposite = true;
                    }
                }

                if (!recommendation) {
                    const column = filterText.split(' ')[0].replace(/[()]/g, '');
                    recommendation = `CREATE INDEX idx_${tableName}_${column} ON ${tableName}(${column});`;
                    impact = 'high';
                }
            } else {
                recommendation = `Consider adding an index to ${tableName} to avoid sequential scan.`;
                impact = 'medium';
            }
        } else if (planText.includes('Index Scan') || planText.includes('Bitmap Index Scan')) {
            // Very basic duplicate detection logic: if we see an Index Scan but it's slow or redundant
            // For Phase 138, we'll flag it if the plan suggests suboptimal index usage
            if (planText.includes('Recheck Cond')) {
                isDuplicate = true; // Placeholder for redundant index logic
            }
        }
    } else {
        // MySQL
        hasSeqScan = planText.includes('"type": "ALL"') || planText.includes('"access_type": "ALL"');
        if (hasSeqScan) {
            const tableMatch = planText.match(/"table_name": "([a-zA-Z0-9_]+)"/);
            const tableName = tableMatch ? tableMatch[1] : 'table';

            // Detect multiple filtering columns in JSON plan
            const queryBlockMatch = planText.match(/"attached_condition": "([^"]+)"/);
            if (queryBlockMatch) {
                const condition = queryBlockMatch[1];
                const parts = condition.split(/ and /i);
                if (parts.length > 1) {
                    const columns = parts.map(p => p.trim().split(/[\s<>=]/)[0].replace(/[`()]/g, ''))
                        .filter(col => col && !col.includes("'") && !col.includes('"'));
                    const uniqueCols = Array.from(new Set(columns));
                    if (uniqueCols.length > 1) {
                        recommendation = `CREATE INDEX idx_${tableName}_composite_${uniqueCols.join('_')} ON ${tableName}(${uniqueCols.join(', ')});`;
                        impact = 'high';
                        isComposite = true;
                    }
                }
            }

            if (!recommendation) {
                recommendation = `CREATE INDEX idx_${tableName}_lookup ON ${tableName}(...); -- Identify filtered columns in WHERE clause`;
                impact = 'high';
            }
        }
    }

    return { hasSeqScan, recommendation, impact, isComposite, isDuplicate };
}

/**
 * Detect potential connection leaks by analyzing idle session distribution (Phase 141)
 */
export function detectConnectionLeaks(
    sessions: import('./cloudsql').DatabaseSession[]
): ConnectionLeakReport {
    const totalSessions = sessions.length;
    const idleSessions = sessions.filter(s => s.state === 'idle' || s.state === 'Sleep').length;

    const clientMap = new Map<string, { idleCount: number, oldestStart: string }>();

    sessions.forEach(s => {
        if (s.state === 'idle' || s.state === 'Sleep') {
            const existing = clientMap.get(s.clientAddress) || { idleCount: 0, oldestStart: s.startTime };
            clientMap.set(s.clientAddress, {
                idleCount: existing.idleCount + 1,
                oldestStart: new Date(s.startTime) < new Date(existing.oldestStart) ? s.startTime : existing.oldestStart
            });
        }
    });

    const leakedClients = Array.from(clientMap.entries())
        .filter(([, stats]) => stats.idleCount > 10) // Threshold for potential leak
        .map(([address, stats]) => ({
            address,
            idleCount: stats.idleCount,
            oldestSessionStart: stats.oldestStart
        }))
        .sort((a, b) => b.idleCount - a.idleCount);

    const hasLeak = leakedClients.length > 0 || (totalSessions > 50 && idleSessions / totalSessions > 0.8);

    let recommendation: string | undefined;
    if (hasLeak) {
        if (leakedClients.length > 0) {
            recommendation = `Detected ${leakedClients.length} clients with excessive idle connections. This typically indicates unclosed database connections in your application code.`;
        } else {
            recommendation = `High ratio of idle connections (${Math.round((idleSessions / totalSessions) * 100)}%) detected. Consider implementing a connection pooler or reducing your application's pool size.`;
        }
    }

    return {
        hasLeak,
        totalSessions,
        idleSessions,
        leakedClients,
        recommendation,
        timestamp: new Date().toISOString()
    };
}

/**
 * Generate schema optimization recommendations by correlating impact metrics with plans (Phase 137)
 */
export async function getSchemaOptimizations(
    projectId: string,
    storageId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _dbType: 'postgresql' | 'mysql' = 'postgresql'
): Promise<QueryImpactMetric[]> {
    const impactMetrics = await getQueryImpactMetrics(projectId, storageId);

    if (process.env.MOCK_DB === 'true') {
        return impactMetrics;
    }

    // In a real scenario, we would iterate through high-impact queries,
    // fetch or execute EXPLAIN, and then populate recommendations.
    // For now, we'll return the metrics which may already have mock recommendations if in mock mode.
    return impactMetrics;
}

export async function getDatabaseLogs(
    instanceId: string,
    options: {
        severity?: string;
        pageSize?: number;
        projectId?: string;
    } = {}
): Promise<LogEntry[]> {
    const { severity, pageSize = 50, projectId } = options;

    if (process.env.MOCK_DB === 'true') {
        const severities: LogEntry['severity'][] = ['INFO', 'WARNING', 'ERROR'];
        const logs: LogEntry[] = [];
        const now = Date.now();

        for (let i = 0; i < pageSize; i++) {
            const logSeverity = severity as LogEntry['severity'] || severities[Math.floor(Math.random() * severities.length)];
            let message = 'Database connection established';
            if (logSeverity === 'ERROR') message = 'Connection terminated unexpectedly: timeout';
            if (logSeverity === 'WARNING') message = 'Slow query detected: SELECT * FROM large_table';

            logs.push({
                timestamp: new Date(now - i * 60000).toISOString(),
                severity: logSeverity,
                textPayload: `[MOCK] ${message}`,
                insertId: `mock-log-${i}-${now}`
            });
        }
        return logs;
    }

    const gcpProjectId = projectId || config.gcp.projectId || process.env.GCP_PROJECT_ID;
    const accessToken = await getGcpAccessToken();

    let filter = `resource.type="cloudsql_database" AND resource.labels.database_id="${gcpProjectId}:${instanceId}"`;
    if (severity) {
        filter += ` AND severity >= "${severity}"`;
    }

    try {
        const response = await fetch('https://logging.googleapis.com/v2/entries:list', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                resourceNames: [`projects/${gcpProjectId}`],
                filter,
                orderBy: 'timestamp desc',
                pageSize
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch logs: ${await response.text()}`);
        }

        const data = await response.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data.entries || []).map((entry: any) => ({
            timestamp: entry.timestamp,
            severity: entry.severity || 'DEFAULT',
            textPayload: entry.textPayload || entry.jsonPayload?.message || JSON.stringify(entry.jsonPayload) || 'No content',
            insertId: entry.insertId
        }));
    } catch (e) {
        console.error(`[Monitoring] Error fetching database logs for ${instanceId}:`, e);
        return [];
    }
}
