import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';
import type { StorageAlertSettings, ResourceDormancy } from '@/types';

const MONITORING_API = 'https://monitoring.googleapis.com/v3';

export interface ResourceMetrics {
    cpuUtilization: number;
    memoryUtilization: number;
    diskUtilization?: number;
    timestamp: string;
}

export interface ScalingRecommendation {
    type: 'upgrade' | 'downgrade' | 'optimize';
    resource: 'cpu' | 'memory' | 'disk';
    currentTier: string;
    recommendedTier: string;
    reason: string;
    estimatedSavings?: string;
    performanceGain?: string;
}

export interface AlertResult {
    triggered: boolean;
    reason?: string;
    metrics: ResourceMetrics;
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

async function fetchTimeSeriesData(
    projectId: string,
    accessToken: string,
    filter: string,
    days: number
): Promise<{ value: number; timestamp: string }[]> {
    const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const endTime = new Date().toISOString();

    const url = `${MONITORING_API}/projects/${projectId}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${startTime}&interval.endTime=${endTime}&view=FULL`;

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

/**
 * Fetch resource metrics for a Cloud SQL instance
 */
export async function getCloudSqlMetrics(instanceId: string): Promise<ResourceMetrics> {
    if (process.env.MOCK_DB === 'true') {
        return {
            cpuUtilization: Math.floor(Math.random() * 30) + 5,
            memoryUtilization: Math.floor(Math.random() * 40) + 20,
            diskUtilization: Math.floor(Math.random() * 10) + 5,
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

    return {
        cpuUtilization: parseFloat(results['cpu/utilization'].toFixed(2)),
        memoryUtilization: parseFloat(results['memory/utilization'].toFixed(2)),
        diskUtilization: parseFloat(results['disk/utilization'].toFixed(2)),
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
        const isDormant = Math.random() > 0.8; // 20% chance of being dormant in mock
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

    if (storageType.includes('cloud-sql')) {
        // Compute Cost (Approximate Monthly)
        const computeCosts: Record<string, number> = {
            'db-f1-micro': 9.50,
            'db-g1-small': 25.50,
            'db-custom-1-3840': 52.00,
            'db-custom-2-7680': 104.00,
            'db-custom-4-15360': 208.00,
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
    } else if (['supabase', 'mongodb-atlas', 'planetscale'].includes(storageType)) {
        // External providers vary, we'll show a 'Starting from' estimate if tier matches
        if (tier === 'FREE') cost = 0;
        else if (tier === 'PRO') cost = 25;
        else cost = 0;
    }

    return parseFloat(cost.toFixed(2));
}

/**
 * Analyze resource metrics and provide scaling recommendations
 */
export async function getScalingRecommendations(
    storageType: string,
    metrics: ResourceMetrics,
    metadata?: Record<string, unknown>
): Promise<ScalingRecommendation[]> {
    const recommendations: ScalingRecommendation[] = [];
    const isCloudSql = storageType.includes('cloud-sql');
    const isRedis = storageType === 'memorystore-redis';

    const currentTier = (metadata?.tier as string) || (isCloudSql ? 'db-f1-micro' : isRedis ? '1GB' : 'unknown');
    const diskSizeGb = (metadata?.diskSizeGb as number) || (metadata?.memorySizeGb as number) || 10;
    const isHA = !!metadata?.highAvailability;

    const currentCost = getEstimatedMonthlyCost(storageType, currentTier, diskSizeGb, isHA);

    // 1. CPU Analysis
    if (metrics.cpuUtilization > 75) {
        let recommendedTier = 'db-g1-small';
        if (currentTier === 'db-g1-small') recommendedTier = 'db-custom-1-3840';
        else if (currentTier.includes('custom-1')) recommendedTier = 'db-custom-2-7680';
        else if (currentTier.includes('custom-2')) recommendedTier = 'db-custom-4-15360';

        recommendations.push({
            type: 'upgrade',
            resource: 'cpu',
            currentTier,
            recommendedTier: isCloudSql ? recommendedTier : 'Next Capacity Tier',
            reason: `High CPU utilization (${metrics.cpuUtilization.toFixed(1)}%) detected. Upgrading will improve query performance and overall stability.`,
            performanceGain: 'High'
        });
    } else if (metrics.cpuUtilization < 15 && currentTier !== 'db-f1-micro' && currentTier !== '1GB' && currentTier !== 'unknown') {
        let recommendedTier = 'db-f1-micro';
        if (currentTier.includes('custom-4')) recommendedTier = 'db-custom-2-7680';
        else if (currentTier.includes('custom-2')) recommendedTier = 'db-custom-1-3840';
        else if (currentTier.includes('custom-1')) recommendedTier = 'db-g1-small';

        const recommendedCost = getEstimatedMonthlyCost(storageType, recommendedTier, diskSizeGb, isHA);
        const savings = currentCost - recommendedCost;

        recommendations.push({
            type: 'downgrade',
            resource: 'cpu',
            currentTier,
            recommendedTier: isCloudSql ? recommendedTier : 'Lower Capacity Tier',
            reason: `Low CPU utilization (${metrics.cpuUtilization.toFixed(1)}%) detected consistently. Downgrading to a smaller tier will reduce infrastructure costs.`,
            estimatedSavings: savings > 0 ? `$${savings.toFixed(2)}/mo` : '15-40%'
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
