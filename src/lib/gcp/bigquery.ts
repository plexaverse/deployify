import { BigQuery } from '@google-cloud/bigquery';
import { config } from '@/lib/config';

let bigquery: BigQuery | undefined;

function getBigQueryClient() {
    if (!bigquery) {
        const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;
        bigquery = new BigQuery({
            projectId: gcpProjectId,
            credentials: {
                client_email: config.firebase.clientEmail,
                private_key: config.firebase.privateKey,
            },
        });
    }
    return bigquery;
}

export interface BigQueryAnalyticsEvent {
    projectId: string;
    type: string;
    path: string;
    referrer?: string;
    width?: number;
    metrics?: {
        lcp?: number;
        cls?: number;
        fid?: number;
        fcp?: number;
        ttfb?: number;
    } | null;
    ip?: string;
    userAgent?: string;
    source: 'edge' | 'client';
    timestamp: string; // ISO string for BigQuery
}

/**
 * Stream a single event to BigQuery
 */
export async function streamEventToBigQuery(event: BigQueryAnalyticsEvent) {
    if (process.env.NODE_ENV === 'development') {
        console.log('[BigQuery] [Mock] Streaming event:', event);
        return;
    }

    const bq = getBigQueryClient();
    const dataset = bq.dataset(config.bigquery.dataset);
    const table = dataset.table(config.bigquery.table);

    const gcpProjectId = config.gcp.projectId || process.env.GCP_PROJECT_ID;

    try {
        await table.insert(event);
        console.log(`[BigQuery] Successfully streamed ${event.type} for ${event.projectId} in project ${gcpProjectId}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        // If dataset/table doesn't exist, this might fail
        console.error('[BigQuery] Streaming failed:', error);
        if (error.name === 'PartialFailureError') {
            console.error('[BigQuery] Partial errors:', JSON.stringify(error.errors, null, 2));
        }
    }
}

/**
 * Create Dataset and Table if they don't exist
 * Useful for one-time setup
 */
export async function ensureBigQuerySchema() {
    const bq = getBigQueryClient();
    const datasetId = config.bigquery.dataset;
    const tableId = config.bigquery.table;

    const [datasets] = await bq.getDatasets();
    if (!datasets.some(d => d.id === datasetId)) {
        await bq.createDataset(datasetId);
        console.log(`[BigQuery] Created dataset: ${datasetId}`);
    }

    const dataset = bq.dataset(datasetId);
    const [tables] = await dataset.getTables();
    if (!tables.some(t => t.id === tableId)) {
        const schema = [
            { name: 'projectId', type: 'STRING', mode: 'REQUIRED' },
            { name: 'type', type: 'STRING', mode: 'REQUIRED' },
            { name: 'path', type: 'STRING', mode: 'REQUIRED' },
            { name: 'referrer', type: 'STRING', mode: 'NULLABLE' },
            { name: 'width', type: 'INTEGER', mode: 'NULLABLE' },
            {
                name: 'metrics',
                type: 'RECORD',
                mode: 'NULLABLE',
                fields: [
                    { name: 'lcp', type: 'FLOAT', mode: 'NULLABLE' },
                    { name: 'cls', type: 'FLOAT', mode: 'NULLABLE' },
                    { name: 'fid', type: 'FLOAT', mode: 'NULLABLE' },
                    { name: 'fcp', type: 'FLOAT', mode: 'NULLABLE' },
                    { name: 'ttfb', type: 'FLOAT', mode: 'NULLABLE' },
                ],
            },
            { name: 'ip', type: 'STRING', mode: 'NULLABLE' },
            { name: 'userAgent', type: 'STRING', mode: 'NULLABLE' },
            { name: 'source', type: 'STRING', mode: 'REQUIRED' },
            { name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
        ];

        await dataset.createTable(tableId, { schema });
        console.log(`[BigQuery] Created table: ${tableId}`);
    }
}
