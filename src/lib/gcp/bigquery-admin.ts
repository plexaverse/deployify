import { BigQuery } from '@google-cloud/bigquery';
import { config } from '@/lib/config';
import type { BigQueryMetadata } from '@/types';

let bigquery: BigQuery | undefined;

function getBigQueryClient() {
    if (!bigquery) {
        const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
        bigquery = new BigQuery({
            projectId: gcpProjectId,
            credentials: {
                client_email: config.firebase.clientEmail,
                private_key: config.firebase.privateKey?.replace(/\\n/g, '\n'),
            },
        });
    }
    return bigquery;
}

/**
 * Create a new BigQuery dataset
 */
export async function createDataset(datasetId: string, location: string = 'US'): Promise<{ id: string, connectionString: string }> {
    if (process.env.MOCK_DB === 'true') {
        return {
            id: datasetId,
            connectionString: `bigquery://${datasetId}`
        };
    }

    try {
        const bq = getBigQueryClient();
        const [dataset] = await bq.createDataset(datasetId, { location });
        return {
            id: dataset.id || datasetId,
            connectionString: `bigquery://${dataset.id || datasetId}`
        };
    } catch (error) {
        console.error(`[BigQueryAdmin] Failed to create dataset ${datasetId}:`, error);
        throw error;
    }
}

/**
 * List all datasets in the project
 */
export async function listDatasets(): Promise<{ id: string, location: string }[]> {
    if (process.env.MOCK_DB === 'true') {
        return [
            { id: 'analytics_prod', location: 'US' },
            { id: 'raw_events', location: 'EU' }
        ];
    }

    try {
        const bq = getBigQueryClient();
        const [datasets] = await bq.getDatasets();
        return datasets.map(d => ({
            id: d.id || '',
            location: (d.metadata as Record<string, unknown>)?.location as string || 'US'
        }));
    } catch (error) {
        console.error('[BigQueryAdmin] Failed to list datasets:', error);
        return [];
    }
}

/**
 * Get detailed metadata for a BigQuery dataset
 */
export async function getDatasetMetadata(datasetId: string): Promise<BigQueryMetadata | null> {
    if (process.env.MOCK_DB === 'true') {
        return {
            datasetId,
            location: 'US',
            tableCount: 12,
            storageUsageGb: 450.5,
            totalBytesProcessedLast24H: 1024 * 1024 * 1024 * 50, // 50GB
            activeSlots: 5,
            lastSyncedAt: new Date().toISOString()
        };
    }

    try {
        const bq = getBigQueryClient();
        const dataset = bq.dataset(datasetId);
        const [metadata] = await dataset.getMetadata();
        const [tables] = await dataset.getTables();

        // GCP Monitoring API would be better for bytes processed/slots,
        // but for basic metadata we use the dataset object.
        return {
            datasetId,
            location: metadata.location || 'US',
            tableCount: tables.length,
            storageUsageGb: 0, // Placeholder, requires detailed table scan or Monitoring API
            lastSyncedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error(`[BigQueryAdmin] Failed to get metadata for ${datasetId}:`, error);
        return null;
    }
}

/**
 * Update dataset metadata (e.g. description, expiration)
 */
export async function updateDataset(datasetId: string, metadata: Record<string, unknown>): Promise<boolean> {
    if (process.env.MOCK_DB === 'true') return true;

    try {
        const bq = getBigQueryClient();
        const dataset = bq.dataset(datasetId);
        await dataset.setMetadata(metadata);
        return true;
    } catch (error) {
        console.error(`[BigQueryAdmin] Failed to update dataset ${datasetId}:`, error);
        return false;
    }
}

/**
 * Delete a BigQuery dataset
 */
export async function deleteDataset(datasetId: string): Promise<boolean> {
    if (process.env.MOCK_DB === 'true') return true;

    try {
        const bq = getBigQueryClient();
        const dataset = bq.dataset(datasetId);
        await dataset.delete({ force: true });
        return true;
    } catch (error) {
        console.error(`[BigQueryAdmin] Failed to delete dataset ${datasetId}:`, error);
        return false;
    }
}
