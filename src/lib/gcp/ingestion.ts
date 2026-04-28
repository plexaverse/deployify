import { createInstance } from './cloudsql';
import { config } from '@/lib/config';
import { updateProject } from '@/lib/db';
import type { StorageConfig, Project } from '@/types';

export interface IngestionResult {
    success: boolean;
    message: string;
    operationName?: string;
    targetStorageId?: string;
    error?: string;
}

/**
 * Triggers a Cloud Build job to perform a database dump from an external provider
 */
export async function runExternalDump(
    projectId: string,
    storageConfig: StorageConfig,
    gcsUri: string
): Promise<string> {
    if (process.env.MOCK_DB === 'true') {
        return 'mock-build-id';
    }

    const { submitCloudBuild } = await import('./cloudbuild');
    const isPostgres = storageConfig.type.includes('postgres') ||
                       storageConfig.type === 'supabase' ||
                       storageConfig.type === 'neon';

    const secretId = storageConfig.connectionStringSecretId;
    if (!secretId) throw new Error('Connection string secret ID missing');

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;

    // Build configuration for the dump
    const buildConfig = {
        steps: [
            {
                name: isPostgres ? 'postgres:15-alpine' : 'mysql:8',
                entrypoint: 'sh',
                args: [
                    '-c',
                    isPostgres
                        ? 'pg_dump "$$DATABASE_URL" > dump.sql'
                        : `
                            # Simple URI parser for MySQL
                            URI="$$DATABASE_URL"
                            URL="\${URI#*://}"
                            USERPASS="\${URL%%@*}"
                            HOSTPORTDB="\${URL#*@}"
                            USER="\${USERPASS%%:*}"
                            PASS="\${USERPASS#*:}"
                            HOSTPORT="\${HOSTPORTDB%%/*}"
                            DB="\${HOSTPORTDB#*/}"
                            DB="\${DB%%\\?*}"
                            HOST="\${HOSTPORT%%:*}"
                            PORT="\${HOSTPORT#*:}"
                            if [ "$HOSTPORT" = "$HOST" ]; then PORT=3306; fi

                            mysqldump -h "$HOST" -P "$PORT" -u "$USER" -p"$PASS" "$DB" > dump.sql
                          `
                ],
                secretEnv: ['DATABASE_URL']
            },
            {
                name: 'gcr.io/cloud-builders/gsutil',
                args: ['cp', 'dump.sql', gcsUri]
            }
        ],
        availableSecrets: {
            secretManager: [
                {
                    versionName: `projects/${gcpProjectId}/secrets/${secretId}/versions/latest`,
                    env: 'DATABASE_URL'
                }
            ]
        },
        options: {
            logging: 'CLOUD_LOGGING_ONLY'
        }
    };

    const { buildId } = await submitCloudBuild(buildConfig);
    return buildId;
}

/**
 * Orchestrates the ingestion of an external database into a newly provisioned Cloud SQL instance.
 * This is a high-level multi-step process:
 * 1. Provision a new Cloud SQL instance (IAM-based)
 * 2. Create target database and user
 * 3. Orchestrate external dump via Cloud Build
 * 4. Trigger GCP Import from Storage
 */
export async function ingestExternalToNative(
    projectId: string,
    sourceStorageId: string,
    project: Project,
    options: {
        targetName?: string;
        region?: string;
        dbType: 'postgres' | 'mysql';
        storageUri?: string; // GCS URI for the SQL dump
    }
): Promise<IngestionResult> {
    try {
        const sourceStorage = project.storageConfigs?.find(s => s.id === sourceStorageId);
        if (!sourceStorage) {
            throw new Error('Source storage connector not found');
        }

        const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
        const region = options.region || project.region || 'us-central1';
        const targetInstanceName = options.targetName || `${sourceStorage.name.toLowerCase().replace(/\s+/g, '-')}-native`;
        const dbName = 'app'; // Default DB name

        // 1. Provision Cloud SQL
        const { operationName } = await createInstance(
            targetInstanceName,
            options.dbType,
            region,
            {
                tier: 'db-f1-micro', // Start small
                highAvailability: false,
                deletionProtectionEnabled: true
            }
        );

        // 2. Create the new storage config record
        const targetStorageId = `storage_${Date.now().toString(36)}`;
        const newStorage: StorageConfig = {
            id: targetStorageId,
            name: (options.targetName || `${sourceStorage.name} (NATIVE)`).toUpperCase(),
            type: options.dbType === 'postgres' ? 'cloud-sql-postgres' : 'cloud-sql-mysql',
            status: 'provisioning',
            environment: 'production',
            envKey: sourceStorage.envKey,
            region,
            metadata: {
                provisioned: true,
                resourceName: targetInstanceName,
                operationName,
                ingestedFrom: sourceStorageId,
                ingestionStage: 'PROVISIONING_INSTANCE'
            },
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const updatedConfigs = [...(project.storageConfigs || []), newStorage];
        await updateProject(projectId, { storageConfigs: updatedConfigs });

        // 3. Trigger Data Dump if no URI provided but source exists
        let storageUri = options.storageUri;
        let dumpBuildId;

        if (!storageUri && sourceStorage.connectionStringSecretId) {
            const bucket = `${gcpProjectId}_deployify_ingestion`;
            storageUri = `gs://${bucket}/dumps/${sourceStorage.id}-${Date.now()}.sql`;

            try {
                dumpBuildId = await runExternalDump(projectId, sourceStorage, storageUri);
            } catch (dumpErr) {
                console.warn('[Ingestion] Failed to trigger automated dump:', dumpErr);
            }
        }

        if (storageUri) {
            newStorage.metadata = {
                ...newStorage.metadata,
                pendingImportUri: storageUri,
                importDatabase: dbName,
                dumpBuildId
            };
            await updateProject(projectId, { storageConfigs: updatedConfigs.map(s => s.id === targetStorageId ? newStorage : s) });
        }

        return {
            success: true,
            message: 'Native resource provisioning started. Data ingestion will follow once the instance is ready.',
            operationName,
            targetStorageId
        };

    } catch (error) {
        console.error('[Ingestion] Error:', error);
        return {
            success: false,
            message: 'Failed to initiate data ingestion',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
