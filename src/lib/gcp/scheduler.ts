import { config } from '@/lib/config';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import { getProductionServiceName, getService } from '@/lib/gcp/cloudrun';
import { Project } from '@/types';
import crypto from 'crypto';

const CLOUD_SCHEDULER_API = 'https://cloudscheduler.googleapis.com/v1';

export interface CronJob {
    path: string;
    schedule: string;
}

interface SchedulerJob {
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

export interface SchedulerDependencies {
    getProjectById: (id: string) => Promise<Project | null>;
    getGcpAccessToken: () => Promise<string>;
    fetch: typeof fetch;
    getService: typeof getService;
}

/**
 * List existing Cloud Scheduler jobs for a project location with a specific prefix
 */
async function listProjectJobs(
    region: string,
    prefix: string,
    accessToken: string,
    fetchFn: typeof fetch
): Promise<any[]> {
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

    const data = await response.json() as any;
    const jobs = data.jobs || [];

    return jobs.filter((job: any) => {
        const parts = job.name.split('/');
        const jobId = parts[parts.length - 1];
        return jobId.startsWith(prefix);
    });
}

/**
 * Create a new Cloud Scheduler job
 */
async function createSchedulerJob(
    region: string,
    job: SchedulerJob,
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
    job: SchedulerJob,
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
    crons: CronJob[],
    deps: Partial<SchedulerDependencies> = {}
): Promise<void> {
    let {
        getProjectById: _getProjectById,
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
    const existingJobNames = new Set(existingJobs.map((j: any) => j.name));

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
