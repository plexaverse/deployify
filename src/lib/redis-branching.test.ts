import assert from 'node:assert';
import { test, describe } from 'node:test';
import { getBranchConnectionString } from '@/lib/db';

describe('Redis Branching Logic', () => {
    test('getBranchConnectionString should derive correct Redis DB index for PR', () => {
        const baseConn = 'redis://127.0.0.1:6379';
        const settings = { enabled: true };

        const pr1 = getBranchConnectionString(baseConn, 'memorystore-redis', settings, { pullRequestNumber: 1 });
        const pr2 = getBranchConnectionString(baseConn, 'memorystore-redis', settings, { pullRequestNumber: 2 });

        assert.strictEqual(pr1, 'redis://127.0.0.1:6379/2');
        assert.strictEqual(pr2, 'redis://127.0.0.1:6379/3');
    });

    test('getBranchConnectionString should derive correct Redis DB index for branch', () => {
        const baseConn = 'redis://127.0.0.1:6379';
        const settings = { enabled: true };

        const branch1 = getBranchConnectionString(baseConn, 'memorystore-redis', settings, { branch: 'feat/abc' });
        const branch2 = getBranchConnectionString(baseConn, 'memorystore-redis', settings, { branch: 'fix/xyz' });

        assert.ok(branch1.startsWith('redis://127.0.0.1:6379/'));
        assert.notStrictEqual(branch1, baseConn);
        assert.notStrictEqual(branch1, branch2);
    });

    test('getBranchConnectionString should stay within 1-15 range for Redis', () => {
        const baseConn = 'redis://127.0.0.1:6379';
        const settings = { enabled: true };

        for (let i = 1; i <= 50; i++) {
            const derived = getBranchConnectionString(baseConn, 'memorystore-redis', settings, { pullRequestNumber: i });
            const index = parseInt(derived.split('/').pop() || '0');
            assert.ok(index >= 1 && index <= 15, `Index ${index} for PR ${i} is out of range`);
        }
    });
});
