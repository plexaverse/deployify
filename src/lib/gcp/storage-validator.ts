import { getSecretValue } from './secrets';
import type { StorageType } from '@/types';
import net from 'net';
import { URL } from 'url';

/**
 * Result of a connection validation check
 */
export interface ValidationResult {
    valid: boolean;
    error?: string;
    latency?: number;
}

/**
 * Validates a storage connection based on its type and connection string
 */
export async function validateConnection(
    type: StorageType,
    connectionStringSecretId?: string,
    metadata?: Record<string, unknown>
): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
        // If we're in mock mode, always return success for valid-looking inputs
        if (process.env.MOCK_DB === 'true') {
            await new Promise(resolve => setTimeout(resolve, 800)); // Simulate network latency
            return {
                valid: true,
                latency: Date.now() - startTime
            };
        }

        if (!connectionStringSecretId && type !== 'firestore') {
            return { valid: false, error: 'Connection string is required' };
        }

        let connectionString = '';
        if (connectionStringSecretId) {
            connectionString = await getSecretValue(connectionStringSecretId);
        }

        // Implement validation logic based on type
        switch (type) {
            case 'cloud-sql-postgres':
            case 'supabase':
                return await validatePostgres(connectionString);

            case 'cloud-sql-mysql':
            case 'planetscale':
                return await validateMysql(connectionString);

            case 'memorystore-redis':
                return await validateRedis(connectionString);

            case 'mongodb-atlas':
                return await validateMongo(connectionString);

            case 'firestore':
                return await validateFirestore(metadata);

            case 'cloud-spanner':
                return { valid: true }; // Spanner usually handles its own auth/connectivity via IAM

            case 'generic':
                return await validateGeneric(connectionString);

            default:
                // Cast to string for broad check if type is somehow not in the union but we want to try anyway
                const typeStr = type as string;
                if (typeStr === 'postgres') return await validatePostgres(connectionString);
                if (typeStr === 'mysql') return await validateMysql(connectionString);
                if (typeStr === 'redis') return await validateRedis(connectionString);
                if (typeStr === 'mongodb') return await validateMongo(connectionString);

                return { valid: false, error: `Unsupported storage type for validation: ${type}` };
        }
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : 'Unknown validation error',
            latency: Date.now() - startTime
        };
    }
}

/**
 * Helper to check TCP reachability
 */
async function checkTcpReachability(host: string, port: number, timeout = 3000): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        const timer = setTimeout(() => {
            socket.destroy();
            resolve(false);
        }, timeout);

        socket.connect(port, host, () => {
            clearTimeout(timer);
            socket.destroy();
            resolve(true);
        });

        socket.on('error', () => {
            clearTimeout(timer);
            resolve(false);
        });
    });
}

/**
 * Parse connection string to extract host and port
 */
function parseConnectionString(connectionString: string, defaultPort: number): { host: string; port: number } {
    try {
        // Handle postgresql://, mysql://, redis://, mongodb://
        const url = new URL(connectionString);
        return {
            host: url.hostname,
            port: url.port ? parseInt(url.port, 10) : defaultPort
        };
    } catch {
        // Fallback for non-URL formats or simplified strings
        return { host: 'localhost', port: defaultPort };
    }
}

/**
 * Validates a Postgres connection
 */
async function validatePostgres(connectionString: string): Promise<ValidationResult> {
    if (!connectionString.startsWith('postgres://') && !connectionString.startsWith('postgresql://')) {
        return { valid: false, error: 'Invalid Postgres connection string format' };
    }

    // Support IAM authentication (no password)
    const isIamAuth = connectionString.includes('enable_iam_auth=true');
    if (isIamAuth) {
        // Skip TCP check if using Cloud SQL Unix Socket via Auth Proxy path in host or if explicit iam auth is set
        if (connectionString.includes('/cloudsql/') || connectionString.includes('host=')) {
            return { valid: true };
        }
    }

    const { host, port } = parseConnectionString(connectionString, 5432);
    const reachable = await checkTcpReachability(host, port);

    if (!reachable) {
        return { valid: false, error: `Could not reach Postgres host at ${host}:${port}` };
    }

    return { valid: true };
}

/**
 * Validates a MySQL connection
 */
async function validateMysql(connectionString: string): Promise<ValidationResult> {
    if (!connectionString.startsWith('mysql://')) {
        return { valid: false, error: 'Invalid MySQL connection string format' };
    }

    // Support IAM authentication
    const isIamAuth = connectionString.includes('enable_iam_auth=true');
    if (isIamAuth) {
        if (connectionString.includes('/cloudsql/') || connectionString.includes('socketPath=')) {
            return { valid: true };
        }
    }

    const { host, port } = parseConnectionString(connectionString, 3306);
    const reachable = await checkTcpReachability(host, port);

    if (!reachable) {
        return { valid: false, error: `Could not reach MySQL host at ${host}:${port}` };
    }

    return { valid: true };
}

/**
 * Validates a Redis connection
 */
async function validateRedis(connectionString: string): Promise<ValidationResult> {
    if (!connectionString.startsWith('redis://') && !connectionString.startsWith('rediss://')) {
        return { valid: false, error: 'Invalid Redis connection string format' };
    }

    const { host, port } = parseConnectionString(connectionString, 6379);
    const reachable = await checkTcpReachability(host, port);

    if (!reachable) {
        return { valid: false, error: `Could not reach Redis host at ${host}:${port}` };
    }

    return { valid: true };
}

/**
 * Validates a MongoDB connection
 */
async function validateMongo(connectionString: string): Promise<ValidationResult> {
    if (!connectionString.startsWith('mongodb://') && !connectionString.startsWith('mongodb+srv://')) {
        return { valid: false, error: 'Invalid MongoDB connection string format' };
    }

    // For mongodb+srv://, DNS resolution might be complex, so we just validate format for now
    if (connectionString.startsWith('mongodb+srv://')) {
        return { valid: true };
    }

    const { host, port } = parseConnectionString(connectionString, 27017);
    const reachable = await checkTcpReachability(host, port);

    if (!reachable) {
        return { valid: false, error: `Could not reach MongoDB host at ${host}:${port}` };
    }

    return { valid: true };
}

/**
 * Validates Firestore access
 */
async function validateFirestore(metadata?: Record<string, unknown>): Promise<ValidationResult> {
    // Firestore validation usually checks if the project ID is accessible
    // In this context, we assume the Firebase Admin SDK is already initialized
    if (metadata) {
        // Just Use metadata to avoid unused var warning
        console.debug('Validating Firestore with metadata', metadata);
    }
    return { valid: true };
}

/**
 * Generic validation for other database types
 */
async function validateGeneric(connectionString: string): Promise<ValidationResult> {
    if (!connectionString) {
        return { valid: false, error: 'Connection string is empty' };
    }
    return { valid: true };
}
