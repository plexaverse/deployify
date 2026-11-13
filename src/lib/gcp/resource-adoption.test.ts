import { test, describe } from 'node:test';
import assert from 'node:assert';
import { tryAdoptResourceName } from './resource-ownership';
import type { StorageConfig, Project } from '@/types';

const project = { id: 'proj-mine' } as Pick<Project, 'id'>;
const mk = (over: Partial<StorageConfig> = {}) =>
    ({ id: 'st_1', type: 'cloud-sql-postgres', name: 'Prod DB', status: 'active',
       environment: 'both', ...over } as StorageConfig);

describe('tryAdoptResourceName — verified adoption', () => {
    test('adopts an UNLABELLED resource (legacy, pre-labelling)', async () => {
        const got = await tryAdoptResourceName(project, mk(), async () => null);
        assert.strictEqual(got, 'prod-db');
    });

    test('adopts a resource already labelled for THIS project', async () => {
        const got = await tryAdoptResourceName(project, mk(), async () => 'proj-mine');
        assert.strictEqual(got, 'prod-db');
    });

    test('REFUSES a resource labelled for another project', async () => {
        const got = await tryAdoptResourceName(project, mk(), async () => 'proj-victim');
        assert.strictEqual(got, null, 'must never adopt another project resource');
    });

    test('does nothing when the connector is already bound', async () => {
        const bound = mk({ metadata: { resourceName: 'already-bound' } });
        const got = await tryAdoptResourceName(project, bound, async () => null);
        assert.strictEqual(got, null);
    });

    test('refuses when the label lookup throws (fail closed)', async () => {
        const got = await tryAdoptResourceName(project, mk(), async () => { throw new Error('api down'); });
        assert.strictEqual(got, null);
    });

    test('can be disabled with STORAGE_ADOPTION_ENABLED=false', async () => {
        const env = process.env as Record<string, string | undefined>;
        env.STORAGE_ADOPTION_ENABLED = 'false';
        const got = await tryAdoptResourceName(project, mk(), async () => null);
        delete env.STORAGE_ADOPTION_ENABLED;
        assert.strictEqual(got, null);
    });

    test('refuses a connector with a blank name', async () => {
        const got = await tryAdoptResourceName(project, mk({ name: '   ' }), async () => null);
        assert.strictEqual(got, null);
    });
});
