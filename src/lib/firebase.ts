import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { config } from '@/lib/config';

let app: App | undefined;
let db: Firestore | undefined;

/**
 * Initialize Firebase Admin SDK
 */
function initializeFirebase(): App {
    if (getApps().length > 0) {
        return getApps()[0];
    }

    // Skip real initialization if mock mode is on
    if (process.env.MOCK_DB === 'true') {
        return initializeApp({
            projectId: config.firebase.projectId || 'mock-project',
        });
    }

    // Use service account credentials if available
    if (config.firebase.clientEmail && config.firebase.privateKey && config.firebase.privateKey.includes('BEGIN PRIVATE KEY')) {
        let privateKey = config.firebase.privateKey;
        // The config.ts already replaces \\n with \n, but let's be double sure for direct env var access
        if (privateKey.includes('\\n')) {
            privateKey = privateKey.replace(/\\n/g, '\n');
        } else if (!privateKey.includes('\n')) {
            // Handle case where \n was stripped completely or wasn't there but it's not a valid PEM
            // The config might have literal "\n" chars if loaded from some env managers.
            console.warn('[Firebase] Private key might be missing newlines.');
        }

        return initializeApp({
            credential: cert({
                projectId: config.firebase.projectId,
                clientEmail: config.firebase.clientEmail,
                privateKey: privateKey,
            }),
        });
    }

    // Otherwise, use default credentials (works in GCP environment)
    return initializeApp({
        projectId: config.firebase.projectId,
    });
}

/**
 * Get Firestore database instance
 */
export function getDb(): Firestore {
    if (process.env.MOCK_DB === 'true') {
        return createMockFirestore();
    }
    if (!db) {
        if (!app) {
            app = initializeFirebase();
        }
        db = getFirestore(app);
    }
    return db;
}

/**
 * Create a minimal mock Firestore for local development/audit
 */
function createMockFirestore(): Firestore {
    const mockDoc = (id?: string, collection?: string): unknown => ({
        id: id || 'mock-id',
        exists: true,
        ref: { id: id || 'mock-id', path: `${collection || 'mock'}/${id || 'mock-id'}` },
        data: () => {
            const base = {
                id: id || 'mock-id',
                createdAt: { toDate: () => new Date() },
                updatedAt: { toDate: () => new Date() },
            };

            if (collection === Collections.INVOICES) {
                return {
                    ...base,
                    invoiceNumber: 'INV-2026-001',
                    date: { toDate: () => new Date() },
                    total: 1500.00,
                    status: 'paid',
                    userId: 'audit-test',
                };
            }

            return {
                ...base,
                projectId: id || 'audit-id',
                name: 'Mock Project',
                slug: 'mock-slug',
                productionUrl: 'https://mock-slug.deployify.app',
                userId: 'audit-test',
                githubUsername: 'plexaverse',
                repoFullName: 'owner/repo',
                defaultBranch: 'main',
                gitBranch: 'main',
                gitCommitSha: 'abcdef1234567890',
                gitCommitMessage: 'Initial commit',
                status: 'ready',
                type: 'production',
                buildDurationMs: 45000,
                performanceMetrics: { performanceScore: 0.95 },
                storageConfigs: [
                    {
                        id: 'storage_1',
                        type: 'cloud-sql-postgres',
                        name: 'Primary Postgres',
                        status: 'active',
                        environment: 'both',
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        connectionStringSecretId: 'mock-secret-id',
                        branchingSettings: { enabled: true, template: '{base}_{identifier}' },
                        dormancy: {
                            isDormant: true,
                            avgCpuUtilization: 0.2,
                            avgMemoryUtilization: 12.5,
                            lastActiveAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                            analysisPeriodDays: 7
                        },
                        metadata: {
                            provisioned: true,
                            region: 'us-central1',
                            resourceName: 'primary-db',
                            security: {
                                score: 70,
                                grade: 'C',
                                risks: [
                                    {
                                        id: 'unencrypted_connection',
                                        level: 'high',
                                        title: 'Unencrypted Connection',
                                        description: 'Transit encryption (SSL/TLS) is not enforced for this connector.',
                                        remediation: 'Enable the "SSL Required" toggle in connector settings.'
                                    }
                                ],
                                lastAuditedAt: new Date().toISOString()
                            }
                        }
                    },
                    {
                        id: 'storage_neon',
                        type: 'neon',
                        name: 'Neon DB',
                        status: 'active',
                        environment: 'both',
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        connectionStringSecretId: 'mock-neon-id',
                        metadata: {
                            provisioned: false,
                            autoSync: true,
                            readyForCutover: true,
                            maintenanceRecommendation: {
                                day: 7,
                                hour: 4,
                                reason: 'Dormant period detected between 02:00 and 06:00 UTC'
                            },
                            neonProjectId: 'ep-mock-123456',
                            firewallSynced: false,
                            region: 'us-central1',
                            security: {
                                score: 85,
                                grade: 'B',
                                risks: [
                                    {
                                        id: 'unmanaged_firewall',
                                        level: 'medium',
                                        title: 'Unmanaged Firewall Policy',
                                        description: 'This external connector does not have an automated firewall synchronization policy active.',
                                        remediation: 'Trigger a "Sync Status" operation to allowlist regional egress IPs in the provider firewall.'
                                    }
                                ],
                                lastAuditedAt: new Date().toISOString()
                            }
                        }
                    },
                    {
                        id: 'storage_redis',
                        type: 'memorystore-redis',
                        name: 'Cache Layer',
                        status: 'active',
                        environment: 'both',
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        connectionStringSecretId: 'mock-redis-id',
                        metadata: {
                            provisioned: true,
                            region: 'us-central1',
                            security: {
                                score: 100,
                                grade: 'A',
                                risks: [],
                                lastAuditedAt: new Date().toISOString()
                            }
                        }
                    }
                ],
                joinedAt: { toDate: () => new Date() },
                expiresAt: { toDate: () => new Date() },
                envVariables: collection === Collections.PROJECTS ? [
                    { id: 'audit-id', key: 'AUDIT_KEY', value: 'AUDIT_VALUE', target: 'both', isSecret: false }
                ] : undefined,
                cloudBuildId: 'audit-id',
            };
        },
        get: async () => mockDoc(id, collection),
        set: async () => ({}),
        update: async () => ({}),
        delete: async () => ({}),
        _path: { segments: [collection || 'mock', id || 'mock-id'] },
    });

    const mockCollection = (name: string): unknown => ({
        doc: (id: string) => mockDoc(id, name),
        where: () => mockCollection(name),
        orderBy: () => mockCollection(name),
        limit: () => mockCollection(name),
        get: async () => ({
            empty: false,
            docs: [mockDoc('mock-id-1', name), mockDoc('mock-id-2', name)],
        }),
        add: async () => mockDoc('new-id', name),
    });

    return {
        _path: { segments: ['mock'] },
        collection: (name: string) => mockCollection(name),
        doc: (path: string) => {
            const segments = path.split('/');
            const collection = segments.length > 1 ? segments[segments.length - 2] : undefined;
            return mockDoc(segments.pop(), collection);
        },
        batch: () => ({
            set: () => { },
            update: () => { },
            delete: () => { },
            commit: async () => { },
        }),
        runTransaction: async (cb: (t: unknown) => Promise<unknown>) => cb({
            get: async () => mockDoc(),
            set: () => { },
            update: () => { },
            delete: () => { },
        }),
        getAll: async (...refs: { _path?: { segments?: string[] } }[]) => refs.map(ref => mockDoc(ref._path?.segments?.pop())),
    } as unknown as Firestore;
}

// Collection names
export const Collections = {
    USERS: 'users',
    PROJECTS: 'projects',
    DEPLOYMENTS: 'deployments',
    ENV_VARS: 'envVars',
    USAGE: 'usage',
    INVOICES: 'invoices',
    TEAMS: 'teams',
    TEAM_MEMBERSHIPS: 'teamMemberships',
    AUDIT_LOGS: 'auditLogs',
    INVITES: 'invites',
    ANALYTICS_EVENTS: 'analytics_events',
    ERRORS: 'errors',
    STORAGE_METRICS: 'storage_metrics',
    SAVED_QUERIES: 'saved_queries',
    QUERY_HISTORY: 'query_history',
    QUERY_COMMENTS: 'query_comments',
    SCHEMA_DOCS: 'schema_docs',
    DATA_LAB_AUDIT: 'dataLabAudit',
} as const;
