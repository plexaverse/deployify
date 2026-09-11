import assert from 'node:assert';
import { test, mock } from 'node:test';
import type { StorageConfig } from '@/types';

const makeConfig = (id: string, replicas: Array<{ id: string }> = []): StorageConfig => ({
    id,
    type: 'cloud-sql-postgres',
    name: 'Primary Postgres',
    status: 'active',
    environment: 'both',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    metadata: { provisioned: true, resourceName: 'prod-db', replicas },
});

// Shared fake project document. Registered BEFORE the module under test is imported so the
// real firebase-admin client is never constructed.
const stored: Record<string, unknown> = {
    id: 'proj_1',
    storageConfigs: [makeConfig('storage_1', [{ id: 'replica-bbbb' }])],
};

let transactions = 0;
const mockDb = {
    collection: () => ({ doc: (id: string) => ({ _id: id }) }),
    runTransaction: async <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => {
        transactions++;
        return cb({
            get: async () => ({ exists: true, data: () => stored }),
            update: (_ref: unknown, data: Record<string, unknown>) => {
                Object.assign(stored, data);
            },
        });
    },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(mock as any).module('./firebase', {
    namedExports: {
        getDb: () => mockDb,
        Collections: { PROJECTS: 'projects' },
    }
});

type Registry = typeof import('./storage-config-registry');
const loadRegistry = (): Promise<Registry> => import('./storage-config-registry');

test('storageConfigs replica mutations (defect reliability-races-4)', async (t) => {
    const { addReplicaToConfigs, removeReplicaFromConfigs, getStorageConfigWriteMode } = await loadRegistry();

    const prevMode = process.env.STORAGE_CONFIG_WRITE_MODE;
    const prevMock = process.env.MOCK_DB;
    t.after(() => {
        if (prevMode === undefined) delete process.env.STORAGE_CONFIG_WRITE_MODE;
        else process.env.STORAGE_CONFIG_WRITE_MODE = prevMode;
        if (prevMock === undefined) delete process.env.MOCK_DB;
        else process.env.MOCK_DB = prevMock;
    });

    await t.test('write mode defaults to today\'s behaviour', () => {
        delete process.env.STORAGE_CONFIG_WRITE_MODE;
        delete process.env.MOCK_DB;
        assert.strictEqual(getStorageConfigWriteMode(), 'legacy');

        process.env.STORAGE_CONFIG_WRITE_MODE = 'transactional';
        assert.strictEqual(getStorageConfigWriteMode(), 'transactional');

        process.env.MOCK_DB = 'true';
        assert.strictEqual(getStorageConfigWriteMode(), 'legacy', 'MOCK_DB must force the legacy path');

        delete process.env.MOCK_DB;
        delete process.env.STORAGE_CONFIG_WRITE_MODE;
    });

    await t.test('a concurrently-added replica is preserved, not clobbered', () => {
        // Admin A read the array with no replicas and is now committing replica-aaaa.
        // Admin B already committed replica-bbbb in the meantime, so the array Firestore
        // holds at commit time already carries it. Both must survive.
        const fresh = [makeConfig('storage_1', [{ id: 'replica-bbbb' }])];

        const next = addReplicaToConfigs(fresh, 'storage_1', { id: 'replica-aaaa' });
        assert.ok(next);

        const replicas = next[0].metadata?.replicas as Array<{ id: string }>;
        assert.deepStrictEqual(replicas.map(r => r.id), ['replica-bbbb', 'replica-aaaa']);
    });

    await t.test('other connectors and untouched metadata are left alone', () => {
        const fresh = [makeConfig('storage_1'), makeConfig('storage_2')];
        const next = addReplicaToConfigs(fresh, 'storage_2', { id: 'replica-aaaa' });
        assert.ok(next);

        assert.strictEqual(next[0], fresh[0], 'untouched connector must be the same object');
        assert.strictEqual(next[1].metadata?.resourceName, 'prod-db');
        assert.strictEqual(next[1].name, 'Primary Postgres');
        assert.deepStrictEqual(fresh[1].metadata?.replicas, [], 'input must not be mutated');
    });

    await t.test('a retried transaction cannot record the same replica twice', () => {
        const fresh = [makeConfig('storage_1', [{ id: 'replica-aaaa' }])];
        assert.strictEqual(addReplicaToConfigs(fresh, 'storage_1', { id: 'replica-aaaa' }), null);
    });

    await t.test('a connector deleted mid-flight is a no-op, not a resurrection', () => {
        assert.strictEqual(addReplicaToConfigs([], 'storage_1', { id: 'replica-aaaa' }), null);
        assert.strictEqual(removeReplicaFromConfigs([], 'storage_1', 'replica-aaaa'), null);
    });

    await t.test('delete removes only the named replica', () => {
        const fresh = [makeConfig('storage_1', [{ id: 'replica-aaaa' }, { id: 'replica-bbbb' }])];
        const next = removeReplicaFromConfigs(fresh, 'storage_1', 'replica-aaaa');
        assert.ok(next);

        const replicas = next[0].metadata?.replicas as Array<{ id: string }>;
        assert.deepStrictEqual(replicas.map(r => r.id), ['replica-bbbb']);
        assert.strictEqual(removeReplicaFromConfigs(next, 'storage_1', 'replica-aaaa'), null);
    });
});

test('mutateStorageConfigs commits through a transaction', async (t) => {
    const { addReplicaToConfigs, mutateStorageConfigs } = await loadRegistry();

    const prevMode = process.env.STORAGE_CONFIG_WRITE_MODE;
    t.after(() => {
        if (prevMode === undefined) delete process.env.STORAGE_CONFIG_WRITE_MODE;
        else process.env.STORAGE_CONFIG_WRITE_MODE = prevMode;
    });

    await t.test('legacy mode reads nothing and writes nothing', async () => {
        delete process.env.STORAGE_CONFIG_WRITE_MODE;
        const outcome = await mutateStorageConfigs('proj_1', () => [], 'test');
        assert.strictEqual(outcome, 'legacy');
        assert.strictEqual(transactions, 0, 'the kill switch must not cost an extra read');
    });

    await t.test('transactional mode merges onto the freshly-read array', async () => {
        process.env.STORAGE_CONFIG_WRITE_MODE = 'transactional';
        const outcome = await mutateStorageConfigs(
            'proj_1',
            (configs) => addReplicaToConfigs(configs, 'storage_1', { id: 'replica-aaaa' }),
            'replica.create'
        );

        assert.strictEqual(outcome, 'written');
        assert.strictEqual(transactions, 1);

        const configs = stored.storageConfigs as StorageConfig[];
        const replicas = configs[0].metadata?.replicas as Array<{ id: string }>;
        assert.deepStrictEqual(replicas.map(r => r.id), ['replica-bbbb', 'replica-aaaa']);
        assert.ok(stored.updatedAt instanceof Date, 'updatedAt must still be stamped');
    });

    await t.test('nothing to do commits nothing', async () => {
        process.env.STORAGE_CONFIG_WRITE_MODE = 'transactional';
        const outcome = await mutateStorageConfigs('proj_1', () => null, 'test');
        assert.strictEqual(outcome, 'noop');
    });

    await t.test('a transaction that cannot commit falls back to the legacy write', async () => {
        process.env.STORAGE_CONFIG_WRITE_MODE = 'transactional';
        const outcome = await mutateStorageConfigs('proj_1', () => { throw new Error('ABORTED'); }, 'test');
        assert.strictEqual(outcome, 'legacy', 'caller must still perform the pre-fix write');
    });
});
