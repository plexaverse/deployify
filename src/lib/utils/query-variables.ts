/**
 * Helpers for the Data Lab query proxy's variable substitution and for binding a
 * public dashboard widget to the connector it was saved against.
 *
 * These live outside the route handler so they can be unit tested — a Next.js
 * `route.ts` may only export HTTP method handlers and route segment config.
 */

export const MAX_QUERY_VARIABLES = 100;
export const MAX_VARIABLE_NAME_LENGTH = 128;

/** Default ceiling on the character length of a Data Lab query. */
export const DEFAULT_MAX_QUERY_CHARS = 100_000;

/**
 * How much larger than the query ceiling the *substituted* query may get.
 * Only reachable on the NoSQL/Redis branch, which splices variable VALUES into
 * the command string rather than binding them.
 */
export const SUBSTITUTION_BUDGET_FACTOR = 8;

/**
 * Variable names the Data Lab UI can actually produce. src/components/DataLab.tsx
 * discovers them with /:[a-zA-Z0-9_]+/g, so every first-party caller is already
 * inside this set — see MAX_QUERY_CHARS notes in env.example.
 */
const IDENTIFIER = /^[A-Za-z0-9_]+$/;

/** Resolved at call time (not module load) so tests and Cloud Run env edits both take effect. */
export function getMaxQueryChars(): number {
    const raw = Number(process.env.DATALAB_MAX_QUERY_CHARS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_QUERY_CHARS;
}

/**
 * `true` when the query is too long to scan safely. Non-strings are reported as
 * within the limit so they keep hitting exactly the code path they hit today.
 */
export function exceedsQueryLengthLimit(query: unknown): boolean {
    return typeof query === 'string' && query.length > getMaxQueryChars();
}

/**
 * Escape regex metacharacters so a caller-supplied variable NAME can never
 * change the shape of the RegExp we build from it (`:name\b`).
 */
export function escapeRegExp(literal: string): string {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalise the caller-supplied `variables` bag before it is used to build
 * regexes. Non-object payloads become {}, and empty/absurd names are dropped.
 *
 * Dropping is deliberate rather than erroring: a variable name that does not
 * occur in the query was already ignored, so no caller observes a new error
 * code or a new response shape.
 */
export function sanitizeQueryVariables(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const out: Record<string, unknown> = {};
    // Default-on. Set DATALAB_ALLOW_NON_IDENTIFIER_VARIABLE_NAMES=true to restore
    // the pre-hardening behaviour of accepting any name shape.
    const strictNames = process.env.DATALAB_ALLOW_NON_IDENTIFIER_VARIABLE_NAMES !== 'true';
    let kept = 0;
    for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
        if (kept >= MAX_QUERY_VARIABLES) break;
        if (name.length === 0 || name.length > MAX_VARIABLE_NAME_LENGTH) continue;
        if (strictNames && !IDENTIFIER.test(name)) continue;
        // defineProperty, not `out[name] = value`: a caller-supplied "__proto__"
        // key would otherwise hit Object.prototype's setter and re-point this
        // object's prototype instead of becoming an ordinary own property.
        Object.defineProperty(out, name, {
            value,
            writable: true,
            enumerable: true,
            configurable: true,
        });
        kept++;
    }
    return out;
}

/**
 * Split a SQL string on statement-separating semicolons.
 *
 * EXACT drop-in for the previous inline regex
 *   cleanQuery.split(/;(?=(?:[^']*'[^']*')*[^']*$)/)
 * whose lookahead succeeds precisely when an EVEN number of `'` follows the
 * semicolon. Because the lookahead re-scanned to end-of-string at every `;`,
 * that split was O(n^2): a 160KB body blocked the event loop for ~14s.
 *
 * This computes the same parity in two linear passes. Equivalence is pinned by
 * an exhaustive test over every string of length <= 9 in {';', "'", 'a'}.
 */
export function splitSqlStatements(sql: string): string[] {
    const QUOTE = 39; // '
    const SEMI = 59;  // ;

    let totalQuotes = 0;
    for (let i = 0; i < sql.length; i++) {
        if (sql.charCodeAt(i) === QUOTE) totalQuotes++;
    }

    const parts: string[] = [];
    let start = 0;
    let seenQuotes = 0;
    for (let i = 0; i < sql.length; i++) {
        const code = sql.charCodeAt(i);
        if (code === QUOTE) {
            seenQuotes++;
        } else if (code === SEMI && (totalQuotes - seenQuotes) % 2 === 0) {
            parts.push(sql.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(sql.slice(start));
    return parts;
}

/**
 * Length `query` would reach if every `regex` match were replaced by a string of
 * `replacementLength` characters. Lets the NoSQL/Redis branch refuse an
 * amplifying substitution BEFORE allocating the giant string.
 */
export function projectedLengthAfterReplace(
    query: string,
    regex: RegExp,
    replacementLength: number
): number {
    let matchedChars = 0;
    let occurrences = 0;
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(query)) !== null) {
        occurrences++;
        matchedChars += match[0].length;
        if (match[0].length === 0) regex.lastIndex++; // defensive: `:name\b` cannot be empty
    }
    regex.lastIndex = 0;
    return query.length - matchedChars + occurrences * replacementLength;
}

/**
 * Decide which storage connector a public dashboard widget executes against.
 *
 * The widget document owns the binding (written by
 * POST /api/projects/[id]/storage/dashboards, where storageId is required).
 * The URL segment is anonymous caller input on this path and must never be able
 * to point a public widget at a different connector.
 *
 * Legacy widget documents written before storageId was persisted fall back to
 * the URL segment so existing shared links keep working — a lazy migration with
 * no backfill.
 */
export function resolveWidgetStorageId(
    widgetStorageId: unknown,
    urlStorageId: string
): { storageId: string; bound: boolean; mismatch: boolean } {
    if (typeof widgetStorageId === 'string' && widgetStorageId.length > 0) {
        return {
            storageId: widgetStorageId,
            bound: true,
            mismatch: widgetStorageId !== urlStorageId,
        };
    }
    return { storageId: urlStorageId, bound: false, mismatch: false };
}
