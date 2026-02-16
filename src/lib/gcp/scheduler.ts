import { config } from '@/lib/config';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import { getProductionServiceName, getService } from '@/lib/gcp/cloudrun';
import { Project } from '@/types';
import crypto from 'crypto';
import { CronExpressionParser } from 'cron-parser';

const CLOUD_SCHEDULER_API = 'https://cloudscheduler.googleapis.com/v1';

// Renamed from HEAD's CronJob to avoid collision with Incoming's CronJob
export interface CronJobConfig {
    path: string;
    schedule: string;
}

// From Incoming (UI representation)
export interface CronJob {
    name: string; // The short name (ID)
    schedule: string;
    timeZone: string;
    path: string;
    lastRunStatus: 'success' | 'failure' | 'unknown';
    lastRunTime?: Date;
    nextRunTime?: Date;
    state: 'ENABLED' | 'PAUSED' | 'DISABLED' | 'UPDATE_FAILED' | 'state_unspecified';
}

// Internal interface for creating/updating jobs (from HEAD)
interface SchedulerJobPayload {
    name?: string;
    description?: string;
    schedule: string;
    timeZone?: string;
    httpTarget: {
        uri: string;
        httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
        oidcToken?: {
            serviceAccountEmail: string;
            audience?: string;
        };
    };
}

// Internal interface for parsing GCP responses (from Incoming)
interface GcpSchedulerJob {
    name: string;
    schedule: string;
    timeZone: string;
    state: string;
    httpTarget?: {
        uri: string;
        httpMethod: string;
    };
    status?: {
        code: number;
        message?: string;
        lastAttemptTime?: string;
    };
    userUpdateTime?: string;
}

export interface SchedulerDependencies {
    getProjectById: (id: string) => Promise<Project | null>;
    getGcpAccessToken: () => Promise<string>;
    fetch: typeof fetch;
    getService: typeof getService;
}

/**
 * List existing Cloud Scheduler jobs for a project location with a specific prefix
 * Used by syncCronJobs
 */
async function listProjectJobs(
    region: string,
    prefix: string,
    accessToken: string,
    fetchFn: typeof fetch
): Promise<GcpSchedulerJob[]> {
    const parent = `projects/${config.gcp.projectId}/locations/${region}`;
    const url = `${CLOUD_SCHEDULER_API}/${parent}/jobs`;

    const response = await fetchFn(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to list scheduler jobs: ${await response.text()}`);
    }

    const data = await response.json() as { jobs?: GcpSchedulerJob[] };
    const jobs = data.jobs || [];

    return jobs.filter((job) => {
        const parts = job.name.split('/');
        const jobId = parts[parts.length - 1];
        return jobId.startsWith(prefix);
    });
}

/**
 * List Cron Jobs for UI (From Incoming)
 */
export async function listCronJobs(slug: string, accessToken: string): Promise<CronJob[]> {
    const parent = `projects/${config.gcp.projectId}/locations/${config.gcp.region}`;

    const response = await fetch(`${CLOUD_SCHEDULER_API}/${parent}/jobs`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to list cron jobs: ${response.statusText}`);
    }

    const data = await response.json();
    const jobs: GcpSchedulerJob[] = data.jobs || [];

    // Filter jobs for this project slug
    // Naming convention: dfy-{slug}-cron-{hash} or similar
    // We check if the job ID starts with dfy-{slug}-
    const filtered = jobs.filter((job) => {
        const jobName = job.name.split('/').pop() || '';
        return jobName.startsWith(`dfy-${slug}-`);
    });

    return filtered.map((job) => {
        const jobName = job.name.split('/').pop() || '';

        // Extract path from httpTarget URI
        let path = '';
        if (job.httpTarget?.uri) {
            try {
                const url = new URL(job.httpTarget.uri);
                path = url.pathname;
            } catch {
                path = job.httpTarget.uri;
            }
        }

        // Calculate next run time
        let nextRunTime: Date | undefined;
        try {
            const interval = CronExpressionParser.parse(job.schedule, {
                tz: job.timeZone || 'UTC',
            });
            nextRunTime = interval.next().toDate();
        } catch (e) {
            console.warn(`Failed to parse schedule ${job.schedule} for job ${jobName}`, e);
        }

        // Determine last run status
        let lastRunStatus: CronJob['lastRunStatus'] = 'unknown';
        if (job.status) {
            if (job.status.code === 0) {
                lastRunStatus = 'success';
            } else {
                lastRunStatus = 'failure';
            }
        } else {
             // If status is missing, it might have never run
             lastRunStatus = 'unknown';
        }

        return {
            name: jobName,
            schedule: job.schedule,
            timeZone: job.timeZone,
            path,
            lastRunStatus,
            lastRunTime: job.status?.lastAttemptTime ? new Date(job.status.lastAttemptTime) : undefined,
            nextRunTime,
            state: job.state as CronJob['state'],
        };
    });
}

/**
 * Create a new Cloud Scheduler job
 */
async function createSchedulerJob(
    region: string,
    job: SchedulerJobPayload,
    accessToken: string,
    fetchFn: typeof fetch
): Promise<void> {
    const parent = `projects/${config.gcp.projectId}/locations/${region}`;
    const url = `${CLOUD_SCHEDULER_API}/${parent}/jobs`;

    const response = await fetchFn(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(job),
    });

    if (!response.ok) {
        throw new Error(`Failed to create scheduler job: ${await response.text()}`);
    }
}

/**
 * Update an existing Cloud Scheduler job
 */
async function updateSchedulerJob(
    name: string,
    job: SchedulerJobPayload,
    accessToken: string,
    fetchFn: typeof fetch
): Promise<void> {
    const url = `${CLOUD_SCHEDULER_API}/${name}`;

    const response = await fetchFn(url, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(job),
    });

    if (!response.ok) {
        throw new Error(`Failed to update scheduler job: ${await response.text()}`);
    }
}

/**
 * Delete a Cloud Scheduler job
 */
async function deleteSchedulerJob(
    name: string,
    accessToken: string,
    fetchFn: typeof fetch
): Promise<void> {
    const url = `${CLOUD_SCHEDULER_API}/${name}`;

    const response = await fetchFn(url, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete scheduler job: ${await response.text()}`);
    }
}

/**
 * Sync cron jobs for a project to Cloud Scheduler
 */
export async function syncCronJobs(
    projectId: string,
    crons: CronJobConfig[],
    deps: Partial<SchedulerDependencies> = {}
): Promise<void> {
    let { getProjectById: _getProjectById } = deps;
    const {
        getGcpAccessToken: _getGcpAccessToken = getGcpAccessToken,
        fetch: _fetch = fetch,
        getService: _getService = getService,
    } = deps;

    if (!_getProjectById) {
        const db = await import('@/lib/db');
        _getProjectById = db.getProjectById;
    }

    const project = await _getProjectById(projectId);
    if (!project) {
        throw new Error(`Project not found: ${projectId}`);
    }

    const accessToken = await _getGcpAccessToken();
    const region = project.region || config.gcp.region;
    const serviceName = getProductionServiceName(project.slug);

    // Fetch service details to get the correct URL
    const service = await _getService(serviceName, accessToken, region);
    if (!service) {
        throw new Error(`Cloud Run service not found: ${serviceName}`);
    }
    const serviceUrl = service.uri;

    const jobPrefix = `dfy-${project.slug}-cron-`;
    const locationParent = `projects/${config.gcp.projectId}/locations/${region}/jobs`;

    // 1. List existing jobs
    const existingJobs = await listProjectJobs(region, jobPrefix, accessToken, _fetch);
    const existingJobNames = new Set(existingJobs.map((j: GcpSchedulerJob) => j.name));

    // 2. Prepare desired jobs
    const desiredJobs = crons.map(cron => {
        const pathHash = crypto.createHash('sha256').update(cron.path).digest('hex').substring(0, 8);
        const jobId = `${jobPrefix}${pathHash}`;
        const jobName = `${locationParent}/${jobId}`;
        const fullPath = cron.path.startsWith('/') ? cron.path : `/${cron.path}`;

        return {
            name: jobName,
            description: `Cron job for ${project.slug} at ${cron.path}`,
            schedule: cron.schedule,
            timeZone: 'UTC',
            httpTarget: {
                uri: `${serviceUrl}${fullPath}`,
                httpMethod: 'GET' as const,
            }
        };
    });

    const desiredJobNames = new Set(desiredJobs.map(j => j.name));

    // 3. Create or Update jobs
    for (const job of desiredJobs) {
        if (existingJobNames.has(job.name)) {
            await updateSchedulerJob(job.name!, job, accessToken, _fetch);
        } else {
            await createSchedulerJob(region, job, accessToken, _fetch);
        }
    }

    // 4. Delete removed jobs
    for (const existingJob of existingJobs) {
        if (!desiredJobNames.has(existingJob.name)) {
            await deleteSchedulerJob(existingJob.name, accessToken, _fetch);
        }
    }
}
