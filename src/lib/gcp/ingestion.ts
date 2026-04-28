import { createInstance, createUser, importInstance, createDatabase, getOperationStatus } from './cloudsql';
import { getSecretValue } from './secrets';
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
 * Orchestrates the ingestion of an external database into a newly provisioned Cloud SQL instance.
 * This is a high-level multi-step process:
 * 1. Provision a new Cloud SQL instance (IAM-based)
 * 2. Create target database and user
 * 3. [Future] Orchestrate external dump via Cloud Build
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
        const { operationName, connectionString } = await createInstance(
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

        // Note: In a real environment, we would need to wait for the instance to be RUNNABLE
        // before creating users and databases. The Storage Sync API handles this lifecycle.
        // If storageUri is provided, we'll queue the import task in the metadata.
        if (options.storageUri) {
            newStorage.metadata = {
                ...newStorage.metadata,
                pendingImportUri: options.storageUri,
                importDatabase: dbName
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
