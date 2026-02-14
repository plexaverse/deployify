import { config } from '@/lib/config';
import { getGcpAccessToken } from '@/lib/gcp/auth';
import { getDockerfile } from '@/lib/dockerfiles';
import type { BuildConfig, Deployment } from '@/types';

const CLOUD_BUILD_API = 'https://cloudbuild.googleapis.com/v1';
const CACHE_BUCKET = `${config.gcp.projectId}_deployify_cache`;

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
    outputDirectory?: string;
    rootDirectory?: string;
    gitToken?: string; // GitHub OAuth token for private repo cloning
    projectRegion?: string | null; // Per-project region, falls back to config.gcp.region if not set
    framework?: string;
    buildTimeout?: number;
    healthCheckPath?: string;
    resources?: {
        cpu?: number;
        memory?: string;
        minInstances?: number;
        maxInstances?: number;
    };
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
        framework = 'nextjs',
        buildCommand,
        installCommand,
        outputDirectory,
        rootDirectory,
        buildTimeout,
        healthCheckPath,
        resources,
    } = buildConfig;

    // Validate rootDirectory to prevent command injection
    let safeRootDirectory = '';
    if (rootDirectory && /^[a-zA-Z0-9_\-./]+$/.test(rootDirectory) && !rootDirectory.includes('..')) {
        safeRootDirectory = rootDirectory.replace(/^\/+|\/+$/g, ''); // Trim slashes
    } else if (rootDirectory) {
        console.warn(`Invalid rootDirectory provided: "${rootDirectory}". Defaulting to root.`);
    }

    // Determine the working directory (defaults to /workspace)
    // Avoid path.join to reduce dependencies, simple slash check is enough
    const workDir = safeRootDirectory ? `/workspace/${safeRootDirectory}` : '/workspace';

    // Use project-specific region if set, otherwise fall back to global config
    const region = projectRegion || config.gcp.region;

    const serviceName = `dfy-${projectSlug}`.substring(0, 63); // Cloud Run name limit
    const imageName = `${region}-docker.pkg.dev/${config.gcp.projectId}/${config.gcp.artifactRegistry}/${serviceName}:${commitSha.substring(0, 7)}`;
    const latestImageName = `${region}-docker.pkg.dev/${config.gcp.projectId}/${config.gcp.artifactRegistry}/${serviceName}:latest`;

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

    // Generate the Dockerfile content (only if not 'docker' framework)
    let dockerfileContent = '';
    if (framework !== 'docker') {
        dockerfileContent = getDockerfile({
            framework,
            buildEnvSection,
            outputDirectory,
            buildCommand,
            installCommand,
            restoreCache: true,
            rootDirectory,
        });
    }

    // Define common steps shared between both deployment methods
    const commonSteps: any[] = [];

    // 1. Restore cache from GCS (Skip for docker)
    if (framework !== 'docker') {
        commonSteps.push({
            name: 'gcr.io/cloud-builders/gsutil',
            entrypoint: 'bash',
            args: [
                '-c',
                `mkdir -p ${workDir}/restore_cache && (gsutil cp gs://${CACHE_BUCKET}/${projectSlug}.tgz cache.tgz && tar -xzf cache.tgz -C ${workDir}/restore_cache || echo "No cache found or restore failed")`,
            ],
        });
    }

    // 2. Create a Dockerfile for Next.js if it doesn't exist (Skip for docker)
    if (framework !== 'docker') {
        commonSteps.push({
            name: 'gcr.io/cloud-builders/docker',
            entrypoint: 'bash',
            args: [
                '-c',
                `if [ ! -f ${workDir}/Dockerfile ]; then cat > ${workDir}/Dockerfile << 'EOFMARKER'
${dockerfileContent}
EOFMARKER
fi`,
            ],
        });
    }

    // 3. Check if next.config has output: 'standalone' (Next.js only)
    if (framework === 'nextjs') {
        commonSteps.push({
            name: 'node:20-alpine',
            entrypoint: 'sh',
            args: [
                '-c',
                `cd ${workDir} && if ! grep -q "output.*standalone" next.config.* 2>/dev/null; then
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
        });
    }

    // 4. Pull the latest image for caching
    commonSteps.push({
        name: 'gcr.io/cloud-builders/docker',
        entrypoint: 'bash',
        args: ['-c', `docker pull ${latestImageName} || exit 0`],
    });

    // 5. Build the Docker image with build-time env vars and caching
    commonSteps.push({
        name: 'gcr.io/cloud-builders/docker',
        args: [
            'build',
            '-t', imageName,
            '-t', latestImageName,
            '--cache-from', latestImageName,
            ...dockerBuildArgs,
            '.'
        ],
        dir: workDir,
    });

    // 6. Push to Artifact Registry (commit SHA tag)
    commonSteps.push({
        name: 'gcr.io/cloud-builders/docker',
        args: ['push', imageName],
    });

    // 7. Push to Artifact Registry (latest tag)
    commonSteps.push({
        name: 'gcr.io/cloud-builders/docker',
        args: ['push', latestImageName],
    });

    // 8. Build 'builder' target to extract cache (Skip for docker)
    if (framework !== 'docker') {
        commonSteps.push({
            name: 'gcr.io/cloud-builders/docker',
            args: [
                'build',
                '--target', 'builder',
                '-t', `${imageName}-builder`,
                ...dockerBuildArgs,
                '.'
            ],
            dir: workDir,
        });

        // 9. Extract and Save Cache to GCS (Non-blocking)
        // Note: Running in dir: workDir, so relative paths work as expected
        commonSteps.push({
            name: 'gcr.io/cloud-builders/docker',
            entrypoint: 'bash',
            dir: workDir,
            args: [
                '-c',
                `{
  docker create --name cache_extractor ${imageName}-builder && \
  mkdir -p .next_cache_export && \
  (docker cp cache_extractor:/app/.next/cache .next_cache_export/cache || echo "No .next/cache found") && \
  docker rm cache_extractor && \
  if [ -d .next_cache_export/cache ]; then \
    tar -czf cache.tgz -C .next_cache_export cache && \
    (gsutil mb gs://${CACHE_BUCKET} || true) && \
    gsutil cp cache.tgz gs://${CACHE_BUCKET}/${projectSlug}.tgz; \
  else \
    echo "No cache to save"; \
  fi
} || echo "Cache save failed, ignoring..."`
            ],
        });
    }
    // 10. Deploy to Cloud Run
    commonSteps.push({
        name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
        entrypoint: 'gcloud',
        args: [
            'run', 'deploy', serviceName,
            '--image', imageName,
            '--region', region,
            '--platform', 'managed',
            '--allow-unauthenticated',
            '--memory', resources?.memory || config.cloudRun.memory,
            '--cpu', (resources?.cpu || config.cloudRun.cpu).toString(),
            '--min-instances', (resources?.minInstances !== undefined ? resources.minInstances : config.cloudRun.minInstances).toString(),
            '--max-instances', (resources?.maxInstances !== undefined ? resources.maxInstances : config.cloudRun.maxInstances).toString(),
            '--port', config.cloudRun.port.toString(),
            '--timeout', `${config.cloudRun.timeout}s`,
            ...(healthCheckPath ? ['--startup-probe-path', healthCheckPath, '--liveness-probe-path', healthCheckPath] : []),
            ...envArgs,
        ],
    });

    // 11. Route 100% traffic to the latest revision
    commonSteps.push({
        name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
        entrypoint: 'gcloud',
        args: [
            'run', 'services', 'update-traffic', serviceName,
            '--region', region,
            '--to-latest',
        ],
    });

    // 12. Explicitly set IAM policy to allow unauthenticated access
    commonSteps.push({
        name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
        entrypoint: 'bash',
        args: [
            '-c',
            `echo "Waiting for service to be ready..." && sleep 15 && gcloud run services add-iam-policy-binding ${serviceName} --region=${region} --project=${config.gcp.projectId} --member="allUsers" --role="roles/run.invoker" --quiet || (echo "Retry 1..." && sleep 10 && gcloud run services add-iam-policy-binding ${serviceName} --region=${region} --project=${config.gcp.projectId} --member="allUsers" --role="roles/run.invoker" --quiet) || (echo "Retry 2..." && sleep 10 && gcloud run services add-iam-policy-binding ${serviceName} --region=${region} --project=${config.gcp.projectId} --member="allUsers" --role="roles/run.invoker" --quiet) || echo "Warning: Could not set IAM policy - you may need to set it manually"`,
        ],
    });

    // 13. Get the service URL
    commonSteps.push({
        name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
        entrypoint: 'bash',
        args: [
            '-c',
            `gcloud run services describe ${serviceName} --region=${region} --format='value(status.url)' > /workspace/service_url.txt && echo "Deployed to: $(cat /workspace/service_url.txt)"`,
        ],
    });

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
            images: [imageName, latestImageName],
            options: {
                logging: 'CLOUD_LOGGING_ONLY',
                machineType: 'UNSPECIFIED',
            },
            timeout: buildTimeout ? `${buildTimeout}s` : '1800s',
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
        images: [imageName, latestImageName],
        options: {
            logging: 'CLOUD_LOGGING_ONLY',
            // Use UNSPECIFIED (default) machine type for better quota availability
            machineType: 'UNSPECIFIED',
        },
        timeout: buildTimeout ? `${buildTimeout}s` : '1800s', // Default 30 minutes or custom
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
    startTime?: string;
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
        startTime: data.startTime,
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
