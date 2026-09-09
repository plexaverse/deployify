import { test } from 'node:test';
import assert from 'node:assert';
import {
    pickSlugOwner,
    slugCreatedAtMillis,
    getSlugUniquenessMode,
    getSlugResolutionMode,
    RESERVED_SLUGS,
} from './slug-registry';
import { generateServiceName } from './utils';
import { getPreviewServiceName } from './gcp/cloudrun';

type FakeDoc = { id: string; data: () => Record<string, unknown> };

const doc = (id: string, createdAt?: unknown): FakeDoc => ({
    id,
    data: () => ({ id, slug: 'acme-store', createdAt }),
});

// Firestore returns __name__ ascending for a where()+limit() query with no orderBy,
// so docs[0] is the lowest document id. Project ids are proj_<random base36>, which
// means an attacker can retry creation until their id sorts below the victim's.
const VICTIM = doc('proj_zzzzzzzzzzzz', new Date('2025-01-01T00:00:00Z'));
const SQUATTER = doc('proj_aaaaaaaaaaaa', new Date('2026-09-01T00:00:00Z'));

test('slug resolution modes', async (t) => {
    const prev = process.env.PROJECT_SLUG_RESOLUTION_MODE;
    t.after(() => {
        if (prev === undefined) delete process.env.PROJECT_SLUG_RESOLUTION_MODE;
        else process.env.PROJECT_SLUG_RESOLUTION_MODE = prev;
    });

    await t.test('single match is returned untouched in every mode', () => {
        delete process.env.PROJECT_SLUG_RESOLUTION_MODE;
        assert.strictEqual(pickSlugOwner([VICTIM], 'acme-store').id, VICTIM.id);
        process.env.PROJECT_SLUG_RESOLUTION_MODE = 'oldest-wins';
        assert.strictEqual(pickSlugOwner([VICTIM], 'acme-store').id, VICTIM.id);
    });

    await t.test('legacy mode (default) preserves the current winner exactly', () => {
        delete process.env.PROJECT_SLUG_RESOLUTION_MODE;
        assert.strictEqual(getSlugResolutionMode(), 'legacy');
        // Firestore hands back the squatter first; legacy mode must not change that.
        assert.strictEqual(pickSlugOwner([SQUATTER, VICTIM], 'acme-store').id, SQUATTER.id);
    });

    await t.test('oldest-wins gives the hostname back to the original tenant', () => {
        process.env.PROJECT_SLUG_RESOLUTION_MODE = 'oldest-wins';
        assert.strictEqual(pickSlugOwner([SQUATTER, VICTIM], 'acme-store').id, VICTIM.id);
    });

    await t.test('oldest-wins is deterministic when createdAt is missing', () => {
        process.env.PROJECT_SLUG_RESOLUTION_MODE = 'oldest-wins';
        const dated = doc('proj_yyy', new Date('2025-06-01T00:00:00Z'));
        const undated = doc('proj_aaa', undefined);
        // An undated doc never outranks a dated one, whichever order Firestore returns.
        assert.strictEqual(pickSlugOwner([undated, dated], 'acme-store').id, dated.id);
        assert.strictEqual(pickSlugOwner([dated, undated], 'acme-store').id, dated.id);
    });
});

test('slugCreatedAtMillis normalises every stored shape', async (t) => {
    await t.test('Date', () => {
        assert.strictEqual(slugCreatedAtMillis(new Date(1700000000000)), 1700000000000);
    });

    await t.test('Firestore Timestamp', () => {
        assert.strictEqual(
            slugCreatedAtMillis({ toDate: () => new Date(1700000000000) }),
            1700000000000
        );
    });

    await t.test('missing sorts last', () => {
        assert.strictEqual(slugCreatedAtMillis(undefined), Number.MAX_SAFE_INTEGER);
        assert.strictEqual(slugCreatedAtMillis(null), Number.MAX_SAFE_INTEGER);
    });
});

test('slug uniqueness modes', async (t) => {
    const prevMode = process.env.PROJECT_SLUG_UNIQUENESS_MODE;
    const prevMock = process.env.MOCK_DB;
    t.after(() => {
        if (prevMode === undefined) delete process.env.PROJECT_SLUG_UNIQUENESS_MODE;
        else process.env.PROJECT_SLUG_UNIQUENESS_MODE = prevMode;
        if (prevMock === undefined) delete process.env.MOCK_DB;
        else process.env.MOCK_DB = prevMock;
    });

    await t.test('defaults to suffix so a create is never blocked', () => {
        delete process.env.MOCK_DB;
        delete process.env.PROJECT_SLUG_UNIQUENESS_MODE;
        assert.strictEqual(getSlugUniquenessMode(), 'suffix');
    });

    await t.test('MOCK_DB forces off - local dev keeps today\'s code path', () => {
        process.env.MOCK_DB = 'true';
        process.env.PROJECT_SLUG_UNIQUENESS_MODE = 'enforce';
        assert.strictEqual(getSlugUniquenessMode(), 'off');
    });

    await t.test('off is the break-glass kill switch', () => {
        delete process.env.MOCK_DB;
        process.env.PROJECT_SLUG_UNIQUENESS_MODE = 'off';
        assert.strictEqual(getSlugUniquenessMode(), 'off');
    });

    await t.test('unknown values fall back to the default', () => {
        delete process.env.MOCK_DB;
        process.env.PROJECT_SLUG_UNIQUENESS_MODE = 'banana';
        assert.strictEqual(getSlugUniquenessMode(), 'suffix');
    });
});

test('reserved slugs match the proxy reserved subdomains', () => {
    // Keep in sync with reservedSubdomains in src/proxy.ts.
    for (const name of ['api', 'dashboard', 'www', 'login', 'billing', 'edge-debug']) {
        assert.ok(RESERVED_SLUGS.has(name), `${name} should be reserved`);
    }
    assert.ok(!RESERVED_SLUGS.has('acme-store'));
});

// --- Why claimProjectSlug also reserves `svc:<generateServiceName(slug)>` ---
// These pin the collision the reservation exists to prevent. claimProjectSlug itself needs
// Firestore, so it is covered by integration testing, not here.
test('derived service names: two registry-distinct slugs collapse at 59 chars', () => {
    const a = 'a'.repeat(59);
    const b = 'a'.repeat(59) + 'b';
    assert.notStrictEqual(a, b, 'slugs must be distinct to the registry');
    assert.strictEqual(
        generateServiceName(a),
        generateServiceName(b),
        'truncation makes these one Cloud Run service - this is why the service name is reserved too'
    );
});

test('derived service names: a slug can impersonate another project preview service', () => {
    // victim project "acme" with PR 7 runs dfy-acme-pr-7
    assert.strictEqual(generateServiceName('acme-pr-7'), getPreviewServiceName('acme', 7));
});
