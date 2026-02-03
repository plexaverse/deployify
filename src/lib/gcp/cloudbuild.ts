import { config } from '@/lib/config';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import type { BuildConfig, Deployment } from '@/types';

const CLOUD_BUILD_API = 'https://cloudbuild.googleapis.com/v1';

interface BuildSubmissionConfig {
    projectSlug: string;
    repoFullName: string;
    branch: string;
    commitSha: string;
    envVars?: Record<string, string>;  // Deprecated, use build/runtimeEnvVars
    buildEnvVars?: Record<string, string>;  // Env vars for build time (Docker build)
    runtimeEnvVars?: Record<string, string>;  // Env vars for runtime (Cloud Run)
    buildCommand?: string;
    installCommand?: string;
    rootDirectory?: string;
    gitToken?: string; // GitHub OAuth token for private repo cloning
    projectRegion?: string | null; // Per-project region, falls back to config.gcp.region if not set
}

/**
 * Generate Cloud Build configuration for a Next.js project
 * Uses connected GitHub repository for private repo support
 */
export function generateCloudRunDeployConfig(buildConfig: BuildSubmissionConfig): object {
    const {
        projectSlug,
        repoFullName,
        branch,
        commitSha,
        envVars = {},  // Legacy support
        buildEnvVars = {},
        runtimeEnvVars = {},
        gitToken,
        projectRegion,
    } = buildConfig;

    // Use project-specific region if set, otherwise fall back to global config
    const region = projectRegion || config.gcp.region;

    const serviceName = `dfy-${projectSlug}`.substring(0, 63); // Cloud Run name limit
    const imageName = `${region}-docker.pkg.dev/${config.gcp.projectId}/${config.gcp.artifactRegistry}/${serviceName}:${commitSha.substring(0, 7)}`;

    // Get repository name from full name (owner/repo -> repo)
    const repoName = repoFullName.split('/')[1] || repoFullName;

    // Merge runtime env vars with legacy envVars
    const allRuntimeEnvVars = { ...envVars, ...runtimeEnvVars };

    // Build env vars as args for Cloud Run
    // Use custom delimiter (^|||^) to handle commas and special chars in values
    const envArgs: string[] = [];
    const envEntries = Object.entries(allRuntimeEnvVars);
    if (envEntries.length > 0) {
        // Format: ^|||^KEY1=VALUE1|||KEY2=VALUE2 (using ||| as separator instead of comma)
        const envVarString = envEntries
            .map(([key, value]) => `${key}=${value}`)
            .join('|||');
        envArgs.push('--update-env-vars', `^|||^${envVarString}`);
    }

    // Generate Docker ARGs for build-time env vars
    const dockerBuildArgs: string[] = [];
    const dockerArgDeclarations: string[] = [];
    const dockerEnvFromArgs: string[] = [];
    Object.entries(buildEnvVars).forEach(([key, value]) => {
        dockerBuildArgs.push('--build-arg', `${key}=${value}`);
        dockerArgDeclarations.push(`ARG ${key}`);
        // ENV references the ARG value using $$VAR syntax (escaped for Cloud Build)
        // Cloud Build will convert $$ to a single $, which Docker will then use to reference the ARG
        dockerEnvFromArgs.push(`ENV ${key}=$$${key}`);
    });

    // Generate build-time env vars section for Dockerfile
    let buildEnvSection: string;
    if (dockerArgDeclarations.length > 0) {
        // Use actual newlines for Dockerfile content
        buildEnvSection = '# Build-time environment variables (from Docker --build-arg)\n' +
            dockerArgDeclarations.join('\n') + '\n' +
            dockerEnvFromArgs.join('\n');
    } else {
        buildEnvSection = '# Placeholder DATABASE_URL for Prisma generate during build (not used at runtime)\nENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"';
    }

    // Generate the Dockerfile content
    const dockerfileContent = `FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN if [ -f yarn.lock ]; then yarn --frozen-lockfile; \\
    elif [ -f package-lock.json ]; then npm ci; \\
    elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \\
    else npm install; fi

FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
${buildEnvSection}
# Generate Prisma client if prisma folder exists
RUN if [ -d "prisma" ]; then npx prisma generate; fi
RUN npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
RUN mkdir .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]`;

    // Define common steps shared between both deployment methods
    const commonSteps = [
        // Create a Dockerfile for Next.js if it doesn't exist
        {
            name: 'gcr.io/cloud-builders/docker',
            entrypoint: 'bash',
            args: [
                '-c',
                `if [ ! -f /workspace/Dockerfile ]; then cat > /workspace/Dockerfile << 'EOFMARKER'
${dockerfileContent}
EOFMARKER
fi`,
            ],
        },
        // Check if next.config has output: 'standalone'
        {
            name: 'node:20-alpine',
            entrypoint: 'sh',
            args: [
                '-c',
                `cd /workspace && if ! grep -q "output.*standalone" next.config.* 2>/dev/null; then
        echo "Adding standalone output to next.config..."
        if [ -f next.config.ts ]; then
          sed -i "s/const nextConfig.*=.*{/const nextConfig = { output: 'standalone',/" next.config.ts
        elif [ -f next.config.js ]; then
          sed -i "s/const nextConfig.*=.*{/const nextConfig = { output: 'standalone',/" next.config.js
        elif [ -f next.config.mjs ]; then
          sed -i "s/const nextConfig.*=.*{/const nextConfig = { output: 'standalone',/" next.config.mjs
        fi
      fi`,
            ],
        },
        // Build the Docker image with build-time env vars
        {
            name: 'gcr.io/cloud-builders/docker',
            args: ['build', '-t', imageName, ...dockerBuildArgs, '.'],
            dir: '/workspace',
        },
        // Push to Artifact Registry
        {
            name: 'gcr.io/cloud-builders/docker',
            args: ['push', imageName],
        },
        // Deploy to Cloud Run
        {
            name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
            entrypoint: 'gcloud',
            args: [
                'run', 'deploy', serviceName,
                '--image', imageName,
                '--region', region,
                '--platform', 'managed',
                '--allow-unauthenticated',
                '--memory', config.cloudRun.memory,
                '--cpu', config.cloudRun.cpu,
                '--min-instances', config.cloudRun.minInstances.toString(),
                '--max-instances', config.cloudRun.maxInstances.toString(),
                '--port', config.cloudRun.port.toString(),
                '--timeout', `${config.cloudRun.timeout}s`,
                ...envArgs,
            ],
        },
        // Route 100% traffic to the latest revision
        // This is critical - without this, traffic may stay on old revisions
        {
            name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
            entrypoint: 'gcloud',
            args: [
                'run', 'services', 'update-traffic', serviceName,
                '--region', region,
                '--to-latest',
            ],
        },
        // Explicitly set IAM policy to allow unauthenticated access
        // Using longer delays and multiple retries for reliability
        {
            name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
            entrypoint: 'bash',
            args: [
                '-c',
                `echo "Waiting for service to be ready..." && sleep 15 && gcloud run services add-iam-policy-binding ${serviceName} --region=${region} --project=${config.gcp.projectId} --member="allUsers" --role="roles/run.invoker" --quiet || (echo "Retry 1..." && sleep 10 && gcloud run services add-iam-policy-binding ${serviceName} --region=${region} --project=${config.gcp.projectId} --member="allUsers" --role="roles/run.invoker" --quiet) || (echo "Retry 2..." && sleep 10 && gcloud run services add-iam-policy-binding ${serviceName} --region=${region} --project=${config.gcp.projectId} --member="allUsers" --role="roles/run.invoker" --quiet) || echo "Warning: Could not set IAM policy - you may need to set it manually"`,
            ],
        },
        // Get the service URL
        {
            name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
            entrypoint: 'bash',
            args: [
                '-c',
                `gcloud run services describe ${serviceName} --region=${region} --format='value(status.url)' > /workspace/service_url.txt && echo "Deployed to: $(cat /workspace/service_url.txt)"`,
            ],
        },
    ];

    // If gitToken is provided, use manual clone step instead of connectedRepository
    if (gitToken) {
        return {
            steps: [
                // Step 0: Clone repository using token
                {
                    name: 'gcr.io/cloud-builders/git',
                    entrypoint: 'bash',
                    args: [
                        '-c',
                        `git clone https://x-access-token:${gitToken}@github.com/${repoFullName} . && git checkout ${commitSha}`,
                    ],
                },
                ...commonSteps
            ],
            images: [imageName],
            options: {
                logging: 'CLOUD_LOGGING_ONLY',
                machineType: 'UNSPECIFIED',
            },
            timeout: '1800s',
            tags: ['deployify', projectSlug, branch],
        };
    }

    return {
        // Use connected GitHub repository (2nd-gen Cloud Build repos)
        source: {
            connectedRepository: {
                // Format: projects/{project}/locations/{location}/connections/{connection}/repositories/{repo}
                repository: `projects/${config.gcp.projectId}/locations/${region}/connections/deployify-github/repositories/${repoName}`,
                revision: commitSha,
            },
        },
        steps: commonSteps,
        images: [imageName],
        options: {
            logging: 'CLOUD_LOGGING_ONLY',
            // Use UNSPECIFIED (default) machine type for better quota availability
            machineType: 'UNSPECIFIED',
        },
        timeout: '1800s', // 30 minutes
        tags: ['deployify', projectSlug, branch],
    };
}

/**
 * Submit a build to Cloud Build using service account credentials
 */
export async function submitCloudBuild(
    buildConfig: object,
    projectRegion?: string | null
): Promise<{ buildId: string; logUrl: string; operationName: string }> {
    let accessToken: string;
    try {
        accessToken = await getGcpAccessToken();
    } catch {
        throw new Error('Cloud Build submission requires running on GCP or having application default credentials configured. For local testing, use the simulation mode.');
    }

    // Use project-specific region or fall back to global config
    const region = projectRegion || config.gcp.region;

    // Use regional endpoint for connected repositories
    // Format: /projects/{project}/locations/{location}/builds
    const response = await fetch(
        `${CLOUD_BUILD_API}/projects/${config.gcp.projectId}/locations/${region}/builds`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(buildConfig),
        }
    );

    if (!response.ok) {
        const error = await response.text();
        console.error('Cloud Build error:', error);
        throw new Error(`Cloud Build submission failed: ${error}`);
    }

    const data = await response.json();

    return {
        buildId: data.metadata?.build?.id || data.name?.split('/').pop() || 'unknown',
        logUrl: data.metadata?.build?.logUrl || `https://console.cloud.google.com/cloud-build/builds?project=${config.gcp.projectId}`,
        operationName: data.name,
    };
}

/**
 * Get build status from Cloud Build
 */
export async function getBuildStatus(
    buildId: string,
    projectRegion?: string | null
): Promise<{
    status: 'QUEUED' | 'WORKING' | 'SUCCESS' | 'FAILURE' | 'TIMEOUT' | 'CANCELLED' | 'STATUS_UNKNOWN';
    logUrl: string;
    finishTime?: string;
    serviceUrl?: string;
}> {
    // Get access token
    const accessToken = await getGcpAccessToken();

    // Use project-specific region or fall back to global config
    const region = projectRegion || config.gcp.region;

    // Use regional endpoint for builds in a specific region
    const response = await fetch(
        `${CLOUD_BUILD_API}/projects/${config.gcp.projectId}/locations/${region}/builds/${buildId}`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error('Failed to get build status');
    }

    const data = await response.json();

    return {
        status: data.status || 'STATUS_UNKNOWN',
        logUrl: data.logUrl || '',
        finishTime: data.finishTime,
        serviceUrl: undefined, // Would need to parse from build logs
    };
}

/**
 * Map Cloud Build status to Deployment status
 */
export function mapBuildStatusToDeploymentStatus(
    buildStatus: string
): Deployment['status'] {
    switch (buildStatus) {
        case 'QUEUED':
        case 'PENDING':
            return 'queued';
        case 'WORKING':
            return 'building';
        case 'SUCCESS':
            return 'ready';
        case 'FAILURE':
        case 'TIMEOUT':
        case 'INTERNAL_ERROR':
            return 'error';
        case 'CANCELLED':
            return 'cancelled';
        default:
            return 'queued';
    }
}

/**
 * Cancel a running build
 */
export async function cancelBuild(buildId: string, projectRegion?: string | null): Promise<void> {
    const accessToken = await getGcpAccessToken();

    // Use project-specific region or fall back to global config
    const region = projectRegion || config.gcp.region;

    // Use regional endpoint
    const response = await fetch(
        `${CLOUD_BUILD_API}/projects/${config.gcp.projectId}/locations/${region}/builds/${buildId}:cancel`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error('Failed to cancel build');
    }
}

/**
 * Get Cloud Run service URL
 */
export async function getCloudRunServiceUrl(serviceName: string, projectRegion?: string | null): Promise<string | null> {
    let accessToken: string;
    try {
        accessToken = await getGcpAccessToken();
    } catch {
        return null;
    }

    // Use project-specific region or fall back to global config
    const region = projectRegion || config.gcp.region;

    const response = await fetch(
        `https://run.googleapis.com/v2/projects/${config.gcp.projectId}/locations/${region}/services/${serviceName}`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }
    );

    if (!response.ok) {
        return null;
    }

    const data = await response.json();
    return data.uri || null;
}

/**
 * Fetch build logs content from GCS
 */
export async function getBuildLogsContent(buildId: string, projectRegion?: string | null): Promise<string | null> {
    try {
        const accessToken = await getGcpAccessToken();
        const region = projectRegion || config.gcp.region;

        // 1. Get Build details to find logsBucket
        const buildResponse = await fetch(
            `${CLOUD_BUILD_API}/projects/${config.gcp.projectId}/locations/${region}/builds/${buildId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!buildResponse.ok) return null;
        const buildData = await buildResponse.json();

        // logsBucket is like "gs://project_id_cloudbuild/logs"
        // We need the bucket name.
        // It seems logsBucket usually points to the folder?
        // Actually, the logsBucket field in Build resource is the Google Cloud Storage bucket where logs are written.
        // Example: "gs://[PROJECT_ID].cloudbuild-logs.googleusercontent.com"
        // The log file is usually at log-[BUILD_ID].txt

        let logsBucket = buildData.logsBucket;
        if (!logsBucket) return null;

        if (logsBucket.startsWith('gs://')) {
            logsBucket = logsBucket.replace('gs://', '');
        }

        // 2. Fetch log content from Storage JSON API
        const logFilename = `log-${buildId}.txt`;
        const storageResponse = await fetch(
            `https://storage.googleapis.com/storage/v1/b/${logsBucket}/o/${logFilename}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!storageResponse.ok) {
            console.error('Failed to fetch logs from storage:', await storageResponse.text());
            return null;
        }

        return await storageResponse.text();
    } catch (e) {
        console.error('Error fetching build logs:', e);
        return null;
    }
}
