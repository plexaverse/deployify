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

export interface ListLogEntriesOptions {
  pageSize?: number;
  pageToken?: string;
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
  // Simulation mode
  if (!isRunningOnGCP()) {
    console.log(`[Simulation] Fetching logs for ${serviceName}`);
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
  const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}"`;

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
