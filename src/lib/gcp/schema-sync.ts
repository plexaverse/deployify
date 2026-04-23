import { exportInstance, importInstance } from './cloudsql';
import type { StorageConfig } from '@/types';

export interface SyncResult {
    success: boolean;
    message: string;
    operationName?: string;
    storageUri?: string;
    error?: string;
}

/**
 * Orchestrates schema and data synchronization between two storage connectors
 * Currently supports Cloud SQL via GCS intermediate exports.
 */
export async function syncSchema(
    sourceStorage: StorageConfig,
    targetStorage: StorageConfig,
    gcsBucket: string
): Promise<SyncResult> {
    try {
        const sourceType = sourceStorage.type;
        const targetType = targetStorage.type;

        // Currently only supporting Cloud SQL cross-sync
        if (!sourceType.includes('cloud-sql') || !targetType.includes('cloud-sql')) {
            return {
                success: false,
                message: 'Schema sync is currently only supported for Cloud SQL connectors.',
                error: 'Unsupported storage types'
            };
        }

        const sourceInstance = (sourceStorage.metadata?.resourceName as string);
        const targetInstance = (targetStorage.metadata?.resourceName as string);

        if (!sourceInstance || !targetInstance) {
            return {
                success: false,
                message: 'Both connectors must have valid GCP resource names.',
                error: 'Missing resource names'
            };
        }

        // Generate unique GCS URI for this sync operation
        const timestamp = new Date().getTime();
        const storageUri = `gs://${gcsBucket}/sync-exports/${sourceInstance}-${timestamp}.sql`;

        // 1. Trigger Export from Source
        const exportOp = await exportInstance(sourceInstance, storageUri);

        return {
            success: true,
            message: 'Schema synchronization orchestrated via GCS export/import.',
            operationName: exportOp,
            storageUri
        };

    } catch (error) {
        console.error('Schema sync error:', error);
        return {
            success: false,
            message: 'Failed to orchestrate schema sync',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Follow-up function to trigger the import once export is DONE
 */
export async function finalizeSync(
    targetInstance: string,
    storageUri: string,
    database: string
): Promise<string> {
    return await importInstance(targetInstance, storageUri, database);
}
