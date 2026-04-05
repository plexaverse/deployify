import assert from 'node:assert';
import { test, describe } from 'node:test';
import { getBranchConnectionString } from '@/lib/db';
import { validateDatabaseId } from '@/lib/gcp/firestore-admin';

describe('Firestore Branching Logic', () => {
    test('validateDatabaseId should correctly validate Firestore IDs', () => {
        assert.strictEqual(validateDatabaseId('my-db'), true);
        assert.strictEqual(validateDatabaseId('db123'), true);
        assert.strictEqual(validateDatabaseId('1-db'), false); // Must start with letter
        assert.strictEqual(validateDatabaseId('db'), false);   // Too short (min 4)
        assert.strictEqual(validateDatabaseId('a'.repeat(64)), false); // Too long
    });

    test('getBranchConnectionString should derive correct Firestore DB ID', () => {
        const baseConn = 'firestore://(default)';
        const settings = { enabled: true, template: 'db-{identifier}' };

        // PR context
        const prConn = getBranchConnectionString(baseConn, 'firestore', settings, { pullRequestNumber: 123 });
        assert.strictEqual(prConn, 'firestore://db-pr123');

        // Branch context
        const branchConn = getBranchConnectionString(baseConn, 'firestore', settings, { branch: 'feat/login' });
        assert.strictEqual(branchConn, 'firestore://db-feat-login');
    });

    test('getBranchConnectionString should handle custom templates', () => {
        const baseConn = 'firestore://prod-db';
        const settings = { enabled: true, template: '{base}-preview-{identifier}' };

        const derived = getBranchConnectionString(baseConn, 'firestore', settings, { pullRequestNumber: 5 });
        assert.strictEqual(derived, 'firestore://prod-db-preview-pr5');
    });

    test('getBranchConnectionString should ensure ID starts with a letter', () => {
        const baseConn = 'firestore://(default)';
        const settings = { enabled: true, template: '{identifier}' };

        // PR identifier 'pr123' starts with letter 'p', no prefix needed
        const derivedPr = getBranchConnectionString(baseConn, 'firestore', settings, { pullRequestNumber: 123 });
        assert.strictEqual(derivedPr, 'firestore://pr123');

        // Branch identifier '123-feat' starts with number, should be prefixed
        const derivedBranch = getBranchConnectionString(baseConn, 'firestore', settings, { branch: '123-feat' });
        assert.strictEqual(derivedBranch, 'firestore://db-123-feat');
    });
});
