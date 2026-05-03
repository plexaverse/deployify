import { createInstance } from './cloudsql';
import { config } from '@/lib/config';
import { updateProject, getProjectById, listProjectsByTeam, listProjectsByUser } from '@/lib/db';
import type { StorageConfig, Project } from '@/types';

export interface IngestionResult {
    success: boolean;
    message: string;
    operationName?: string;
    targetStorageId?: string;
    error?: string;
}

/**
 * Triggers a Cloud Build job to perform a database dump from an external provider.
 * Supports multi-database dumps (Phase 132).
 */
export async function runExternalDump(
    projectId: string,
    storageConfig: StorageConfig,
    gcsUri: string, // Base GCS URI (folder)
    databases: string[] = []
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
    const dbsToDump = databases.length > 0 ? databases : ['app']; // Default to 'app' if not specified

    // Build steps for each database
    const steps = [];

    for (const db of dbsToDump) {
        steps.push({
            name: isPostgres ? 'postgres:15-alpine' : 'mysql:8',
            entrypoint: 'sh',
            args: [
                '-c',
                isPostgres
                    ? `
                        # Simple URI parser for Postgres to swap DB
                        URI="$$DATABASE_URL"
                        BASE_URI="\${URI%\\?*}"
                        PARAMS="\${URI#*?}"
                        if [ "$PARAMS" = "$URI" ]; then PARAMS=""; else PARAMS="?$PARAMS"; fi
                        WITHOUT_DB="\${BASE_URI%/*}"
                        NEW_URL="\${WITHOUT_DB}/${db}\${PARAMS}"
                        pg_dump "$NEW_URL" | sed "s/CREATE DATABASE/-- CREATE DATABASE/g" > ${db}.sql
                      `
                    : `
                        # Simple URI parser for MySQL
                        URI="$$DATABASE_URL"
                        URL="\${URI#*://}"
                        USERPASS="\${URL%%@*}"
                        HOSTPORTDB="\${URL#*@}"
                        USER="\${USERPASS%%:*}"
                        PASS="\${USERPASS#*:}"
                        HOSTPORT="\${HOSTPORTDB%%/*}"
                        DB="${db}"
                        HOST="\${HOSTPORT%%:*}"
                        PORT="\${HOSTPORT#*:}"
                        if [ "$HOSTPORT" = "$HOST" ]; then PORT=3306; fi

                        mysqldump -h "$HOST" -P "$PORT" -u "$USER" -p"$PASS" "$DB" > ${db}.sql
                      `
            ],
            secretEnv: ['DATABASE_URL']
        });

        steps.push({
            name: 'gcr.io/cloud-builders/gsutil',
            args: ['cp', `${db}.sql`, `${gcsUri.endsWith('/') ? gcsUri : gcsUri + '/'}${db}.sql`]
        });
    }

    // Build configuration for the dump
    const buildConfig = {
        steps,
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
 * Orchestrate workspace-wide cutover from a source external connector to a newly migrated native connector.
 * Swaps envKey/secrets and re-points dependent projects. (Phase 118)
 */
export async function orchestrateCutover(
    projectId: string,
    sourceStorageId: string,
    targetStorageId: string,
    userId: string,
    options: { validate?: boolean } = {}
): Promise<{ success: boolean; message: string; error?: string }> {
    try {
        const project = await getProjectById(projectId);
        if (!project) throw new Error('Project not found');

        const sourceStorage = project.storageConfigs?.find(s => s.id === sourceStorageId);
        const targetStorage = project.storageConfigs?.find(s => s.id === targetStorageId);

        if (!sourceStorage || !targetStorage) throw new Error('Connectors not found');

        // Phase 132: Readiness Validation Pass
        if (options.validate) {
            const { validateConnection } = await import('./storage-validator');
            const result = await validateConnection(
                targetStorage.type,
                targetStorage.connectionStringSecretId,
                targetStorage.metadata
            );

            if (!result.valid) {
                return {
                    success: false,
                    message: 'Pre-cutover validation failed. Native connector is not yet reachable.',
                    error: result.error
                };
            }
        }

        // 1. Fetch all projects in the workspace (Team or Personal)
        let workspaceProjects: Project[] = [];
        if (project.teamId) {
            workspaceProjects = await listProjectsByTeam(project.teamId);
        } else {
            workspaceProjects = await listProjectsByUser(userId);
        }

        const targetSecretId = targetStorage.connectionStringSecretId;

        if (!targetSecretId) throw new Error('Target connector secret missing');

        // 2. Iterate through all projects and re-point any that use the source connector
        for (const p of workspaceProjects) {
            let projectModified = false;
            const updatedConfigs = (p.storageConfigs || []).map(s => {
                if (s.id === sourceStorageId) {
                    projectModified = true;
                    // In a real cutover, we might want to preserve the source but mark it as 'deprecated'
                    // For this implementation, we swap the ID and metadata to the target
                    return {
                        ...targetStorage,
                        id: sourceStorageId, // Preserve original ID to maintain deployment bindings
                        name: `${sourceStorage.name} (MIGRATED)`,
                        environment: s.environment,
                        envKey: s.envKey
                    };
                }
                return s;
            });

            if (projectModified) {
                await updateProject(p.id, { storageConfigs: updatedConfigs });

                // Verification Check (Phase 118)
                const verifiedProject = await getProjectById(p.id);
                const isUpdated = verifiedProject?.storageConfigs?.some(s => s.id === sourceStorageId && s.name.includes('MIGRATED'));

                if (!isUpdated) {
                    console.error(`[Cutover] Verification failed for project ${p.id}. Storage ID not correctly updated.`);
                    throw new Error(`Workspace cutover failed: Project ${p.id} state could not be verified after update.`);
                }

                console.log(`[Cutover] Updated and verified project ${p.id} with new native connector`);
            }
        }

        // 3. Mark target as active and source as disconnected
        const finalConfigs = (project.storageConfigs || []).map(s => {
            if (s.id === targetStorageId) {
                return {
                    ...s,
                    metadata: {
                        ...s.metadata,
                        cutoverComplete: true,
                        cutoverAt: new Date().toISOString()
                    }
                };
            }
            if (s.id === sourceStorageId) {
                return { ...s, status: 'disconnected' as const };
            }
            return s;
        });

        await updateProject(projectId, { storageConfigs: finalConfigs });

        return {
            success: true,
            message: 'Workspace-wide migration cutover completed successfully. Deployment configurations updated.'
        };

    } catch (error) {
        console.error('[Cutover] Error:', error);
        return {
            success: false,
            message: 'Failed to execute cutover orchestration',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
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
        storageUri?: string; // GCS URI for the SQL dump (or folder for multi-db)
        databases?: string | string[]; // Comma separated or array of database names (Phase 132)
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

        // Normalize databases (Phase 132)
        let dbsToIngest: string[] = [];
        if (Array.isArray(options.databases)) {
            dbsToIngest = options.databases;
        } else if (typeof options.databases === 'string') {
            dbsToIngest = options.databases.split(',').map(s => s.trim()).filter(Boolean);
        }

        if (dbsToIngest.length === 0) dbsToIngest = ['app'];

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
                ingestionStage: 'PROVISIONING_INSTANCE',
                totalDatabases: dbsToIngest.length
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
            // Use a folder for multi-db dumps
            storageUri = `gs://${bucket}/dumps/${sourceStorage.id}-${Date.now()}/`;

            try {
                dumpBuildId = await runExternalDump(projectId, sourceStorage, storageUri, dbsToIngest);
            } catch (dumpErr) {
                console.warn('[Ingestion] Failed to trigger automated dump:', dumpErr);
            }
        }

        if (storageUri) {
            // Setup pending imports queue (Phase 132)
            const pendingImports = dbsToIngest.map(db => ({
                database: db,
                uri: storageUri?.endsWith('.sql') ? storageUri : `${storageUri}${db}.sql`
            }));

            newStorage.metadata = {
                ...newStorage.metadata,
                pendingImports,
                currentImportIndex: 0,
                baseIngestionUri: storageUri,
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
