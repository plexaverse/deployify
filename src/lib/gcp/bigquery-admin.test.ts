import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createDataset, listDatasets, getDatasetMetadata, deleteDataset } from './bigquery-admin';

describe('BigQuery Admin Library', () => {
    // Set MOCK_DB=true for testing logic without real GCP calls
    process.env.MOCK_DB = 'true';

    test('createDataset returns mock connection string', async () => {
        const result = await createDataset('test_dataset', 'US');
        assert.strictEqual(result.id, 'test_dataset');
        assert.strictEqual(result.connectionString, 'bigquery://test_dataset');
    });

    test('listDatasets returns mock list', async () => {
        const datasets = await listDatasets();
        assert.ok(Array.isArray(datasets));
        assert.ok(datasets.length > 0);
        assert.strictEqual(datasets[0].id, 'analytics_prod');
    });

    test('getDatasetMetadata returns mock metadata', async () => {
        const metadata = await getDatasetMetadata('test_dataset');
        assert.ok(metadata);
        assert.strictEqual(metadata?.datasetId, 'test_dataset');
        assert.strictEqual(metadata?.location, 'US');
    });

    test('deleteDataset returns true', async () => {
        const success = await deleteDataset('test_dataset');
        assert.strictEqual(success, true);
    });
});
