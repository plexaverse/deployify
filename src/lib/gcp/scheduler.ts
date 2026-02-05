import { CronExpressionParser } from 'cron-parser';
import { config } from '@/lib/config';

const SCHEDULER_API = 'https://cloudscheduler.googleapis.com/v1';

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

interface SchedulerJob {
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

export async function listCronJobs(slug: string, accessToken: string): Promise<CronJob[]> {
    const parent = `projects/${config.gcp.projectId}/locations/${config.gcp.region}`;

    const response = await fetch(`${SCHEDULER_API}/${parent}/jobs`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to list cron jobs: ${response.statusText}`);
    }

    const data = await response.json();
    const jobs: SchedulerJob[] = data.jobs || [];

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
