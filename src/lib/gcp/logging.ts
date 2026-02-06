import { config } from '@/lib/config';
import { getGcpAccessToken, isRunningOnGCP } from '@/lib/gcp/auth';

export interface LogEntry {
  timestamp: string;
  severity: string;
  textPayload?: string;
  jsonPayload?: Record<string, unknown>;
  resource: {
    type: string;
    labels: Record<string, string>;
  };
  logName: string;
  insertId?: string;
}

export function formatLogEntry(entry: {
  timestamp: string;
  severity?: string;
  textPayload?: string;
  jsonPayload?: Record<string, unknown>;
  resource: {
    type: string;
    labels: Record<string, string>;
  };
  logName: string;
  insertId?: string;
}): LogEntry {
  return {
    timestamp: entry.timestamp,
    severity: entry.severity || 'DEFAULT',
    textPayload: entry.textPayload,
    jsonPayload: entry.jsonPayload,
    resource: entry.resource,
    logName: entry.logName,
    insertId: entry.insertId,
  };
}

export type LogType = 'runtime' | 'system' | 'build';

export interface ListLogEntriesOptions {
  pageSize?: number;
  pageToken?: string;
  revisionName?: string;
  logType?: LogType;
  buildId?: string;
}

export interface ListLogEntriesResponse {
  entries: LogEntry[];
  nextPageToken?: string;
}

export async function listLogEntries(
  serviceName: string,
  options: ListLogEntriesOptions = {},
  projectRegion?: string | null
): Promise<ListLogEntriesResponse> {
  const { logType = 'runtime', buildId } = options;

  // Simulation mode
  if (!isRunningOnGCP()) {
    console.log(`[Simulation] Fetching ${logType} logs for ${serviceName}`);

    if (logType === 'build') {
      return {
        entries: [
          {
            timestamp: new Date().toISOString(),
            severity: 'INFO',
            textPayload: `[Simulation] Building image for ${serviceName}...`,
            resource: { type: 'build', labels: { build_id: 'sim-build' } },
            logName: `projects/${config.gcp.projectId}/logs/cloudbuild`,
            insertId: 'sim-b-1',
          },
          {
            timestamp: new Date(Date.now() - 5000).toISOString(),
            severity: 'INFO',
            textPayload: `[Simulation] Step 1/5 : FROM node:20-alpine`,
            resource: { type: 'build', labels: { build_id: 'sim-build' } },
            logName: `projects/${config.gcp.projectId}/logs/cloudbuild`,
            insertId: 'sim-b-2',
          },
        ]
      };
    }

    if (logType === 'system') {
      return {
        entries: [
          {
            timestamp: new Date().toISOString(),
            severity: 'NOTICE',
            textPayload: `[Simulation] Service ${serviceName} has reached a steady state.`,
            resource: {
              type: 'cloud_run_revision',
              labels: { service_name: serviceName },
            },
            logName: `projects/${config.gcp.projectId}/logs/run.googleapis.com%2Fvar.log%2Fsystem`,
            insertId: 'sim-s-1',
          }
        ]
      };
    }

    // Runtime logs
    return {
      entries: [
        {
          timestamp: new Date().toISOString(),
          severity: 'INFO',
          textPayload: `[Simulation] Starting service ${serviceName}...`,
          resource: {
            type: 'cloud_run_revision',
            labels: { service_name: serviceName },
          },
          logName: `projects/${config.gcp.projectId}/logs/run.googleapis.com%2Fstdout`,
          insertId: 'sim-1',
        },
        {
          timestamp: new Date(Date.now() - 1000).toISOString(),
          severity: 'DEBUG',
          jsonPayload: { message: 'Configuration loaded', config: { env: 'dev' } },
          resource: {
            type: 'cloud_run_revision',
            labels: { service_name: serviceName },
          },
          logName: `projects/${config.gcp.projectId}/logs/run.googleapis.com%2Fstdout`,
          insertId: 'sim-2',
        },
      ],
    };
  }

  const accessToken = await getGcpAccessToken();

  let filter = '';

  if (logType === 'build') {
    if (buildId) {
      filter = `resource.type="build" AND resource.labels.build_id="${buildId}"`;
    } else {
      // If no buildId provided, this is likely an error or we just return nothing/generic logs
      // But let's fallback to filtering by generic build logs if needed, though hazardous.
      // Better to return empty or error if strict.
      // For now, let's filter by a likely label if possible, or just build type.
      filter = `resource.type="build"`;
    }
  } else if (logType === 'system') {
    // System logs: Cloud Run logs that are NOT stdout/stderr
    filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}" AND NOT logName:"run.googleapis.com%2Fstdout" AND NOT logName:"run.googleapis.com%2Fstderr"`;
  } else {
    // Runtime logs (default): Cloud Run stdout/stderr
    filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}" AND (logName:"run.googleapis.com%2Fstdout" OR logName:"run.googleapis.com%2Fstderr")`;
  }

  if (options.revisionName && logType !== 'build') {
    filter += ` AND resource.labels.revision_name="${options.revisionName}"`;
  }

  const body: {
    resourceNames: string[];
    filter: string;
    orderBy: string;
    pageSize: number;
    pageToken?: string;
  } = {
    resourceNames: [`projects/${config.gcp.projectId}`],
    filter,
    orderBy: 'timestamp desc',
    pageSize: options.pageSize || 50,
  };

  if (options.pageToken) {
    body.pageToken = options.pageToken;
  }

  const response = await fetch('https://logging.googleapis.com/v2/entries:list', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to list log entries: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();

  return {
    entries: (data.entries || []).map(formatLogEntry),
    nextPageToken: data.nextPageToken,
  };
}

export async function getErrorRate(
  serviceName: string,
  hours: number = 24,
  projectRegion?: string | null
): Promise<number> {
  // Simulation mode
  if (!isRunningOnGCP()) {
    console.log(`[Simulation] Fetching error rate for ${serviceName}`);
    return Math.floor(Math.random() * 10); // Random count for simulation
  }

  const accessToken = await getGcpAccessToken();
  // Filter for errors in the last X hours
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}" AND severity="ERROR" AND timestamp >= "${startTime}"`;

  let totalErrors = 0;
  let pageToken: string | undefined;

  do {
    const body: {
      resourceNames: string[];
      filter: string;
      pageSize: number;
      pageToken?: string;
    } = {
      resourceNames: [`projects/${config.gcp.projectId}`],
      filter,
      pageSize: 1000, // Max page size to minimize requests
    };

    if (pageToken) {
      body.pageToken = pageToken;
    }

    const response = await fetch('https://logging.googleapis.com/v2/entries:list', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list log entries for error rate: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const entries = data.entries || [];
    totalErrors += entries.length;
    pageToken = data.nextPageToken;

  } while (pageToken);

  return totalErrors;
}
