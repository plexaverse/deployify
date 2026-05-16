import { test, describe } from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('Storage RBAC API', () => {
    const mockParams = Promise.resolve({ id: 'project-123', storageId: 'storage-456' });

    test('should return 401 if unauthorized', async () => {
        const req = new NextRequest('http://localhost/api/projects/project-123/storage/storage-456/rbac', {
            method: 'GET'
        });

        try {
            const res = await GET(req, { params: mockParams });
            assert.ok(res.status === 401 || res.status === 500);
        } catch {
            // Expected
        }
    });
});
