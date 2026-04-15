import { getGcpAccessToken } from './auth';
import { config } from '@/lib/config';
import type { StorageAlertSettings } from '@/types';

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
    const timeSeriesData: Record<string, any[]> = {};

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

    return data.timeSeries[0].points.map((p: any) => ({
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

        recommendations.push({
            type: 'downgrade',
            resource: 'cpu',
            currentTier,
            recommendedTier: isCloudSql ? recommendedTier : 'Lower Capacity Tier',
            reason: `Low CPU utilization (${metrics.cpuUtilization.toFixed(1)}%) detected consistently. Downgrading to a smaller tier will reduce infrastructure costs.`,
            estimatedSavings: '15-40%'
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
