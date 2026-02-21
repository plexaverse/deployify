import { config } from '@/lib/config';
import { getGcpAccessToken, isRunningOnGCP } from '@/lib/gcp/auth';

export interface MetricOptions {
  startTime?: Date;
  endTime?: Date;
}

interface TimeSeriesResponse {
  timeSeries?: Array<{
    metric: {
      labels: Record<string, string>;
      type: string;
    };
    resource: {
      type: string;
      labels: Record<string, string>;
    };
    points: Array<{
      interval: {
        startTime: string;
        endTime: string;
      };
      value: {
        doubleValue?: number;
        int64Value?: string;
      };
    }>;
  }>;
}

async function getMetricSum(
  metricType: string,
  serviceName: string,
  projectRegion?: string | null,
  options: MetricOptions = {}
): Promise<number> {
  // Default to last 1 hour if not specified
  const endTime = options.endTime || new Date();
  const startTime = options.startTime || new Date(endTime.getTime() - 60 * 60 * 1000);

  // Simulation mode
  if (!isRunningOnGCP()) {
    console.log(`[Simulation] Fetching metric ${metricType} for ${serviceName}`);
    // Return a random number between 100 and 10000
    return Math.floor(Math.random() * 9900) + 100;
  }

  const region = projectRegion || config.gcp.region || process.env.GCP_REGION || 'asia-south1';
  const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
  const accessToken = await getGcpAccessToken();

  const filter = `metric.type="${metricType}" AND resource.labels.service_name="${serviceName}" AND resource.labels.location="${region}"`;

  // Calculate alignment period in seconds
  // Ensure minimum alignment period of 60s
  let durationSeconds = Math.ceil((endTime.getTime() - startTime.getTime()) / 1000);
  if (durationSeconds < 60) durationSeconds = 60;

  const alignmentPeriod = `${durationSeconds}s`;

  const queryParams = new URLSearchParams({
    filter,
    'interval.startTime': startTime.toISOString(),
    'interval.endTime': endTime.toISOString(),
    'aggregation.alignmentPeriod': alignmentPeriod,
    'aggregation.perSeriesAligner': 'ALIGN_SUM',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
  });

  const url = `https://monitoring.googleapis.com/v3/projects/${gcpProjectId}/timeSeries?${queryParams.toString()}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch metric ${metricType}: ${response.statusText} - ${errorText}`);
  }

  const data: TimeSeriesResponse = await response.json();

  if (!data.timeSeries || data.timeSeries.length === 0 || !data.timeSeries[0].points || data.timeSeries[0].points.length === 0) {
    return 0;
  }

  const value = data.timeSeries[0].points[0].value;

  if (value.doubleValue !== undefined) {
    return value.doubleValue;
  }

  if (value.int64Value !== undefined) {
    return parseInt(value.int64Value, 10);
  }

  return 0;
}

/**
 * Get network egress (bandwidth) usage in bytes
 */
export async function getBandwidthUsage(
  serviceName: string,
  projectRegion?: string | null,
  options?: MetricOptions
): Promise<number> {
  return getMetricSum(
    'run.googleapis.com/container/network/sent_bytes_count',
    serviceName,
    projectRegion,
    options
  );
}

/**
 * Get billable instance time in seconds
 */
export async function getBillableInstanceTime(
  serviceName: string,
  projectRegion?: string | null,
  options?: MetricOptions
): Promise<number> {
  return getMetricSum(
    'run.googleapis.com/container/billable_instance_time',
    serviceName,
    projectRegion,
    options
  );
}
