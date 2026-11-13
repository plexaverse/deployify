import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
    escapeRegExp,
    sanitizeQueryVariables,
    resolveWidgetStorageId,
    MAX_QUERY_VARIABLES,
    splitSqlStatements,
    exceedsQueryLengthLimit,
    getMaxQueryChars,
    projectedLengthAfterReplace,
    DEFAULT_MAX_QUERY_CHARS
} from './query-variables';

/**
 * Reproduces the exact substitution loop used by the Data Lab query proxy for
 * NoSQL/Redis connectors (src/app/api/projects/[id]/storage/[storageId]/query/route.ts).
 */
function substituteNonSql(query: string, variables: Record<string, unknown>): string {
    const sortedVarNames = Object.keys(variables).sort((a, b) => b.length - a.length);
    for (const key of sortedVarNames) {
        const val = variables[key];
        const replaceVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
        const regex = new RegExp(`:${escapeRegExp(key)}\\b`, 'g');
        query = query.replace(regex, () => replaceVal);
    }
    return query;
}

describe('Data Lab query variable hardening', () => {
    test('a regex-metacharacter variable name cannot rewrite the saved query', () => {
        const saved = '{"collection":"public_posts","limit":10}';
        // Before the fix this produced {"collection":"users","limit":500}
        const out = substituteNonSql(saved, { '.*': ':"users","limit":500' });
        assert.strictEqual(out, saved);
    });

    test('an unbalanced-group variable name does not throw', () => {
        assert.doesNotThrow(() => substituteNonSql('{"collection":"c"}', { '(': 'x' }));
    });

    test('legitimate variable substitution still works', () => {
        assert.strictEqual(
            substituteNonSql('{"collection":"c","f":":v"}', { v: 'abc' }),
            '{"collection":"c","f":"abc"}'
        );
    });

    test('$-patterns inside a variable VALUE are inserted literally', () => {
        assert.strictEqual(
            substituteNonSql('{"f":":v"}', { v: '$&$`' }),
            '{"f":"$&$`"}'
        );
    });

    test('escapeRegExp leaves plain identifier names untouched', () => {
        assert.strictEqual(escapeRegExp('user_id42'), 'user_id42');
    });

    test('sanitizeQueryVariables rejects non-object payloads', () => {
        assert.deepStrictEqual(sanitizeQueryVariables('abc'), {});
        assert.deepStrictEqual(sanitizeQueryVariables(['a', 'b']), {});
        assert.deepStrictEqual(sanitizeQueryVariables(null), {});
        assert.deepStrictEqual(sanitizeQueryVariables(undefined), {});
    });

    test('sanitizeQueryVariables preserves ordinary variables unchanged', () => {
        assert.deepStrictEqual(
            sanitizeQueryVariables({ id: 1, name: 'jane' }),
            { id: 1, name: 'jane' }
        );
    });

    test('sanitizeQueryVariables caps the number of variables', () => {
        const many: Record<string, number> = {};
        for (let i = 0; i < MAX_QUERY_VARIABLES + 50; i++) many[`v${i}`] = i;
        assert.strictEqual(Object.keys(sanitizeQueryVariables(many)).length, MAX_QUERY_VARIABLES);
    });

    test('sanitizeQueryVariables drops oversized names', () => {
        const out = sanitizeQueryVariables({ ['x'.repeat(500)]: 1, ok: 2 });
        assert.deepStrictEqual(out, { ok: 2 });
    });
});

describe('Public widget storage binding', () => {
    test('pins execution to the widget document, ignoring the URL segment', () => {
        const result = resolveWidgetStorageId('storage_staging', 'storage_production');
        assert.strictEqual(result.storageId, 'storage_staging');
        assert.strictEqual(result.bound, true);
        assert.strictEqual(result.mismatch, true);
    });

    test('matching ids are a no-op with no mismatch signal', () => {
        const result = resolveWidgetStorageId('storage_1', 'storage_1');
        assert.strictEqual(result.storageId, 'storage_1');
        assert.strictEqual(result.mismatch, false);
    });

    test('legacy widget documents without storageId fall back to the URL segment', () => {
        const result = resolveWidgetStorageId(undefined, 'storage_1');
        assert.strictEqual(result.storageId, 'storage_1');
        assert.strictEqual(result.bound, false);
        assert.strictEqual(result.mismatch, false);
    });

    test('a non-string or empty stored storageId falls back rather than crashing', () => {
        assert.strictEqual(resolveWidgetStorageId('', 'storage_1').storageId, 'storage_1');
        assert.strictEqual(resolveWidgetStorageId(42, 'storage_1').storageId, 'storage_1');
        assert.strictEqual(resolveWidgetStorageId(null, 'storage_1').storageId, 'storage_1');
    });
});

describe('Data Lab DoS hardening', () => {
    test('splitSqlStatements matches the old O(n^2) regex on every short string', () => {
        // Old implementation, verbatim from route.ts before the fix.
        const legacy = (s: string) => s.split(/;(?=(?:[^']*'[^']*')*[^']*$)/);
        const alphabet = [';', "'", 'a'];
        let checked = 0;
        const walk = (prefix: string, depth: number) => {
            if (depth === 0) {
                checked++;
                assert.deepStrictEqual(splitSqlStatements(prefix), legacy(prefix), prefix);
                return;
            }
            for (const c of alphabet) walk(prefix + c, depth - 1);
        };
        for (let d = 0; d <= 8; d++) walk('', d);
        assert.ok(checked > 9000, `expected exhaustive coverage, got ${checked}`);
    });

    test('splitSqlStatements keeps semicolons inside string literals intact', () => {
        assert.deepStrictEqual(
            splitSqlStatements("SELECT * FROM t WHERE a = 'x;y' ; SELECT 1"),
            ["SELECT * FROM t WHERE a = 'x;y' ", ' SELECT 1']
        );
    });

    test('splitSqlStatements is linear, not quadratic', () => {
        const payload = 'SELECT 1' + ';'.repeat(200_000);
        const started = Date.now();
        splitSqlStatements(payload);
        // The old regex needed ~20s for this input; linear scan is single-digit ms.
        assert.ok(Date.now() - started < 1000, 'statement split should be linear');
    });

    test('exceedsQueryLengthLimit honours the default and the env override', () => {
        assert.strictEqual(exceedsQueryLengthLimit('SELECT 1'), false);
        assert.strictEqual(exceedsQueryLengthLimit('x'.repeat(DEFAULT_MAX_QUERY_CHARS + 1)), true);
        process.env.DATALAB_MAX_QUERY_CHARS = '10';
        try {
            assert.strictEqual(exceedsQueryLengthLimit('x'.repeat(11)), true);
            assert.strictEqual(getMaxQueryChars(), 10);
        } finally {
            delete process.env.DATALAB_MAX_QUERY_CHARS;
        }
        assert.strictEqual(getMaxQueryChars(), DEFAULT_MAX_QUERY_CHARS);
    });

    test('exceedsQueryLengthLimit leaves non-strings on their existing code path', () => {
        assert.strictEqual(exceedsQueryLengthLimit(undefined), false);
        assert.strictEqual(exceedsQueryLengthLimit({ a: 1 }), false);
    });

    test('projectedLengthAfterReplace predicts substitution blow-up without allocating', () => {
        const query = ':v '.repeat(1000);
        const regex = new RegExp(`:${escapeRegExp('v')}\\b`, 'g');
        // 1000 occurrences of ':v' (2 chars) replaced by 4096 chars, plus 1000 spaces.
        assert.strictEqual(projectedLengthAfterReplace(query, regex, 4096), 1000 * 4096 + 1000);
        // The helper must not leave lastIndex behind for the real replace().
        assert.strictEqual(regex.lastIndex, 0);
        assert.strictEqual(query.replace(regex, () => 'x'.repeat(4096)).length, 1000 * 4096 + 1000);
    });

    test('non-identifier variable names are dropped by default', () => {
        assert.deepStrictEqual(sanitizeQueryVariables({ '(a+)+b': 1, ok_1: 2 }), { ok_1: 2 });
        assert.deepStrictEqual(sanitizeQueryVariables({ '.*': 1 }), {});
    });

    test('the escape hatch restores the pre-hardening name behaviour', () => {
        process.env.DATALAB_ALLOW_NON_IDENTIFIER_VARIABLE_NAMES = 'true';
        try {
            assert.deepStrictEqual(sanitizeQueryVariables({ 'a-b': 1 }), { 'a-b': 1 });
        } finally {
            delete process.env.DATALAB_ALLOW_NON_IDENTIFIER_VARIABLE_NAMES;
        }
    });

    test('a __proto__ key becomes an own property, never a prototype swap', () => {
        const out = sanitizeQueryVariables(JSON.parse('{"__proto__":{"polluted":true},"id":1}'));
        // Own, enumerable, and inert - not applied to the object's prototype chain.
        assert.ok(Object.prototype.hasOwnProperty.call(out, '__proto__'));
        assert.strictEqual(Object.getPrototypeOf(out), Object.prototype);
        assert.strictEqual((out as Record<string, unknown>).polluted, undefined);
        assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
    });

    test('every variable name the Data Lab UI can emit survives sanitising', () => {
        // src/components/DataLab.tsx discovers variables with this exact regex.
        const detected = 'SELECT * FROM t WHERE id = :id AND org = :org_id7'.match(/:[a-zA-Z0-9_]+/g) || [];
        const bag = Object.fromEntries(detected.map(m => [m.slice(1), 'v']));
        assert.deepStrictEqual(sanitizeQueryVariables(bag), { id: 'v', org_id7: 'v' });
    });
});
