import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getNamedDb, DEFAULT_DATABASE_ID } from './firebase';

describe('getNamedDb — tenant Firestore isolation', () => {
    test('refuses an empty databaseId instead of falling back to the control plane', () => {
        assert.throws(() => getNamedDb(''), /Refusing to open the default Firestore database/);
    });

    test('refuses a whitespace-only databaseId', () => {
        assert.throws(() => getNamedDb('   '), /Refusing to open the default Firestore database/);
    });

    test('refuses the default database id explicitly', () => {
        assert.throws(() => getNamedDb(DEFAULT_DATABASE_ID), /Refusing to open the default Firestore database/);
    });

    test('returns a client for a real named database id', () => {
        const db = getNamedDb('tenant-db-1');
        assert.ok(db, 'expected a Firestore client for a named database');
    });

    // Caching is only exercised against a real Firebase app; under MOCK_DB the helper
    // returns a fresh mock per call, matching getDb()'s behaviour.
    test('returns a usable client for distinct named databases', () => {
        const a = getNamedDb('tenant-db-2');
        const b = getNamedDb('tenant-db-3');
        assert.ok(a && b, 'expected clients for both named databases');
    });
});
