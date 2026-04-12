import { test, describe } from 'node:test';
import assert from 'node:assert';
import { exportDocuments, importDocuments } from './firestore-admin';

describe('Firestore Data Portability (Mock)', () => {
    test('exportDocuments returns mock operation', async () => {
        process.env.MOCK_DB = 'true';
        const result = await exportDocuments('test-db', 'gs://test-bucket/prefix');
        assert.ok(result.includes('projects/mock/databases/test-db/operations/export-'));
    });

    test('importDocuments returns mock operation', async () => {
        process.env.MOCK_DB = 'true';
        const result = await importDocuments('test-db', 'gs://test-bucket/prefix');
        assert.ok(result.includes('projects/mock/databases/test-db/operations/import-'));
    });
});
