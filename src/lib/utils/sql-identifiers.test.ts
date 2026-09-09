import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
    quotePostgresIdentifier,
    quoteMysqlIdentifier,
    validateIndexDdl,
    getCustomIndexSqlMode,
    InvalidSqlIdentifierError,
    MAX_SQL_IDENTIFIER_LENGTH
} from './sql-identifiers';

describe('sql identifier quoting', () => {
    test('is byte-identical to the previous interpolation for ordinary identifiers', () => {
        // The backward-compatibility contract: anything without a quote char must
        // render exactly as `"${table}"` / `` `${table}` `` used to.
        for (const id of ['users', 'user_profiles', 'MixedCase', 'public.users', 'has space', 'has-dash', 'v2$col']) {
            assert.strictEqual(quotePostgresIdentifier('table', id), `"${id}"`);
            assert.strictEqual(quoteMysqlIdentifier('table', id), `\`${id}\``);
        }
    });

    test('escapes the dialect quote character instead of letting it terminate the identifier', () => {
        assert.strictEqual(quotePostgresIdentifier('table', 'we"ird'), '"we""ird"');
        assert.strictEqual(quoteMysqlIdentifier('table', 'we`ird'), '`we``ird`');
    });

    test('neutralises the injection payload from the defect report', () => {
        const payload = 'users" ("id"); DROP TABLE accounts; --';
        const quoted = quotePostgresIdentifier('table', payload);
        // Every embedded quote is doubled, so the whole payload stays one identifier.
        assert.strictEqual(quoted, '"users"" (""id""); DROP TABLE accounts; --"');
        const body = quoted.slice(1, -1).replace(/""/g, '');
        assert.ok(!body.includes('"'), 'no unescaped quote may survive');
    });

    test('rejects only inputs that cannot be a real identifier', () => {
        for (const bad of [undefined, null, 42, {}, '', '   ']) {
            assert.throws(() => quotePostgresIdentifier('table', bad), InvalidSqlIdentifierError);
        }
        assert.throws(() => quotePostgresIdentifier('table', 'a\u0000b'), InvalidSqlIdentifierError);
        assert.throws(
            () => quotePostgresIdentifier('table', 'x'.repeat(MAX_SQL_IDENTIFIER_LENGTH + 1)),
            InvalidSqlIdentifierError
        );
    });
});

describe('validateIndexDdl', () => {
    test('accepts the index maintenance statements the optimiser emits', () => {
        for (const sql of [
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_a" ON "users" ("email")',
            'CREATE UNIQUE INDEX idx_b ON users (email)',
            'DROP INDEX idx_b',
            'REINDEX TABLE users',
            'ANALYZE users',
            'OPTIMIZE TABLE users',
            '  create index idx_c on users (email);  '
        ]) {
            const res = validateIndexDdl(sql);
            assert.strictEqual(res.ok, true, `expected accept: ${sql}`);
        }
    });

    test('rejects the stacked-statement payload from the defect report', () => {
        const res = validateIndexDdl('DROP TABLE users; DELETE FROM accounts');
        assert.strictEqual(res.ok, false);
    });

    test('rejects a destructive statement smuggled after a valid index prefix', () => {
        for (const sql of [
            'CREATE INDEX idx ON users (email); DROP TABLE accounts',
            'CREATE INDEX idx ON users (email); DELETE FROM accounts',
            'CREATE INDEX idx ON users (email) /* */; TRUNCATE accounts',
            'CREATE INDEX idx ON users (email); UPDATE accounts SET balance = 0',
            'DELETE FROM accounts',
            'GRANT ALL ON users TO attacker',
            'SELECT pg_sleep(30)'
        ]) {
            const res = validateIndexDdl(sql);
            assert.strictEqual(res.ok, false, `expected reject: ${sql}`);
        }
    });

    test('rejects a second statement hidden by a nested block comment', () => {
        // JS regex does not nest block comments, so the trailing text survives the
        // strip and splits into a second statement -> fails closed.
        const res = validateIndexDdl('CREATE INDEX idx ON users (email) /* /* */; DROP TABLE accounts; */');
        assert.strictEqual(res.ok, false);
    });

    test('returns the original text, not the comment-stripped copy', () => {
        const sql = 'CREATE INDEX idx ON users (email) -- keep me';
        const res = validateIndexDdl(sql);
        assert.strictEqual(res.ok, true);
        if (res.ok) assert.strictEqual(res.sql, sql);
    });

    test('rejects non-strings and oversized payloads', () => {
        assert.strictEqual(validateIndexDdl(undefined).ok, false);
        assert.strictEqual(validateIndexDdl({}).ok, false);
        assert.strictEqual(validateIndexDdl('CREATE INDEX ' + 'x'.repeat(20_000)).ok, false);
    });
});

describe('getCustomIndexSqlMode', () => {
    beforeEach(() => {
        delete process.env.DATALAB_APPLY_INDEX_CUSTOM_SQL;
    });

    test('defaults to off, including for unrecognised values', () => {
        assert.strictEqual(getCustomIndexSqlMode(), 'off');
        process.env.DATALAB_APPLY_INDEX_CUSTOM_SQL = 'yes';
        assert.strictEqual(getCustomIndexSqlMode(), 'off');
        process.env.DATALAB_APPLY_INDEX_CUSTOM_SQL = 'true';
        assert.strictEqual(getCustomIndexSqlMode(), 'off');
    });

    test('honours the two explicit opt-ins, case and whitespace insensitively', () => {
        process.env.DATALAB_APPLY_INDEX_CUSTOM_SQL = ' Validated ';
        assert.strictEqual(getCustomIndexSqlMode(), 'validated');
        process.env.DATALAB_APPLY_INDEX_CUSTOM_SQL = 'RAW';
        assert.strictEqual(getCustomIndexSqlMode(), 'raw');
    });
});
