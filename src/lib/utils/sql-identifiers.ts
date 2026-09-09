/**
 * Identifier quoting and DDL shape checks for the Data Lab "one-click index"
 * optimiser (src/app/api/projects/[id]/storage/[storageId]/apply-index/route.ts).
 *
 * These live outside the route handler so they can be unit tested — a Next.js
 * `route.ts` may only export HTTP method handlers and route segment config.
 *
 * There is no bind-parameter form for an *identifier* in either Postgres or
 * MySQL, so index DDL has to be built by concatenation. The only correct defence
 * is to quote the identifier and escape the quote character inside it.
 *
 * BACKWARD-COMPATIBILITY CONTRACT: for any identifier that contains no quote
 * character and no NUL — which is every identifier the Data Lab schema browser
 * has ever produced, since it reads `information_schema.tables` / `.columns` —
 * the output is byte-for-byte what the previous `"${table}"` / `` `${table}` ``
 * interpolation produced. Dots, spaces, hyphens and mixed case are preserved
 * exactly as before, so no tenant table that is indexable today stops being
 * indexable.
 */

import { splitSqlStatements } from '@/lib/utils/query-variables';

/**
 * Postgres truncates identifiers at 63 bytes and MySQL rejects above 64; 128 is
 * a deliberately loose ceiling that only rejects payloads that are obviously not
 * an identifier, so it can never reject a real table a tenant already has.
 */
export const MAX_SQL_IDENTIFIER_LENGTH = 128;

/** Ceiling on the optional `customSql` escape hatch, before it is scanned. */
export const MAX_CUSTOM_INDEX_SQL_CHARS = 10_000;

/**
 * Thrown by the quote helpers. Carries the offending field name so the route can
 * build a 400 body in the same `{ success: false, error }` shape it already uses.
 */
export class InvalidSqlIdentifierError extends Error {
    readonly field: string;

    constructor(field: string, message: string) {
        super(message);
        this.name = 'InvalidSqlIdentifierError';
        this.field = field;
    }
}

function assertQuotableIdentifier(field: string, raw: unknown): string {
    if (typeof raw !== 'string') {
        throw new InvalidSqlIdentifierError(field, `Invalid ${field}: expected a string`);
    }
    const value = raw.trim();
    if (value.length === 0) {
        throw new InvalidSqlIdentifierError(field, `Invalid ${field}: must not be empty`);
    }
    if (value.length > MAX_SQL_IDENTIFIER_LENGTH) {
        throw new InvalidSqlIdentifierError(
            field,
            `Invalid ${field}: exceeds ${MAX_SQL_IDENTIFIER_LENGTH} characters`
        );
    }
    // A NUL terminates the statement inside the server's C string handling and
    // can never occur in a real Postgres or MySQL identifier.
    if (value.includes('\u0000')) {
        throw new InvalidSqlIdentifierError(field, `Invalid ${field}: contains a null byte`);
    }
    return value;
}

/** `users` -> `"users"`; `we"ird` -> `"we""ird"`. */
export function quotePostgresIdentifier(field: string, raw: unknown): string {
    return `"${assertQuotableIdentifier(field, raw).replace(/"/g, '""')}"`;
}

/** ``users`` -> `` `users` ``; `` we`ird `` -> `` `we``ird` ``. */
export function quoteMysqlIdentifier(field: string, raw: unknown): string {
    return `\`${assertQuotableIdentifier(field, raw).replace(/`/g, '``')}\``;
}

/**
 * Statements the index optimiser is allowed to emit when the `customSql` escape
 * hatch is running in `validated` mode. Deliberately narrow: index maintenance
 * only, nothing that can drop or rewrite data.
 */
const ALLOWED_INDEX_DDL_PREFIX =
    /^(CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+INDEX|REINDEX|ANALYZE|ANALYSE|OPTIMIZE\s+TABLE)\b/i;

export type IndexDdlCheck =
    | { ok: true; sql: string }
    | { ok: false; error: string };

/**
 * Shape check for caller-supplied `customSql`.
 *
 * Fails closed by design: anything the scanner cannot confidently read as a
 * single index-maintenance statement is rejected rather than executed. Comments
 * are stripped before scanning; a `;` the scanner believes is *outside* a string
 * literal splits the input and therefore rejects it, so hiding a second
 * statement in a comment or a block-comment nesting trick lands on the reject
 * path, not the execute path.
 *
 * The original text is what gets returned for execution — the stripped copy is
 * only ever used for the check, so no tenant's literal comment or string content
 * is silently rewritten.
 */
export function validateIndexDdl(raw: unknown): IndexDdlCheck {
    if (typeof raw !== 'string') {
        return { ok: false, error: 'customSql must be a string' };
    }
    if (raw.length > MAX_CUSTOM_INDEX_SQL_CHARS) {
        return { ok: false, error: `customSql exceeds ${MAX_CUSTOM_INDEX_SQL_CHARS} characters` };
    }

    const stripped = raw
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--.*$/gm, ' ')
        .replace(/#.*$/gm, ' ');

    const statements = splitSqlStatements(stripped)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    if (statements.length !== 1) {
        return { ok: false, error: 'customSql must be a single statement' };
    }
    if (!ALLOWED_INDEX_DDL_PREFIX.test(statements[0])) {
        return {
            ok: false,
            error: 'customSql must be a single CREATE INDEX, DROP INDEX, REINDEX, ANALYZE or OPTIMIZE TABLE statement'
        };
    }

    return { ok: true, sql: raw };
}

export type CustomIndexSqlMode = 'off' | 'validated' | 'raw';

/**
 * Resolved at call time (not module load) so tests and Cloud Run env edits both
 * take effect.
 *
 * Default is `off`. A repo-wide grep for `customSql` finds exactly one producer
 * — none: src/components/DataLab.tsx (the sole caller of this route) posts
 * `{ table, column }` and nothing else — so `off` breaks no first-party caller.
 * `raw` restores the pre-fix behaviour byte-for-byte as a break-glass rollback
 * that needs an env edit, not a deploy.
 */
export function getCustomIndexSqlMode(): CustomIndexSqlMode {
    const raw = (process.env.DATALAB_APPLY_INDEX_CUSTOM_SQL || '').trim().toLowerCase();
    return raw === 'raw' || raw === 'validated' ? raw : 'off';
}
