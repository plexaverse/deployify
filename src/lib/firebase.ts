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

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Create a minimal mock Firestore for local development/audit
 */
function createMockFirestore(): any {
    const mockDoc = (id?: string, collection?: string) => ({
        id: id || 'mock-id',
        exists: true,
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
                name: 'Mock Project',
                slug: 'mock-slug',
                userId: 'audit-test',
                githubUsername: 'plexaverse',
                repoFullName: 'owner/repo',
                defaultBranch: 'main',
                gitBranch: 'main',
                gitCommitSha: 'abcdef1234567890',
                gitCommitMessage: 'Initial commit',
                status: 'ready',
                type: 'production',
                joinedAt: { toDate: () => new Date() },
                expiresAt: { toDate: () => new Date() },
            };
        },
        get: async () => mockDoc(id),
        set: async () => ({}),
        update: async () => ({}),
        delete: async () => ({}),
    });

    const mockCollection = (name: string) => ({
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
        runTransaction: async (cb: any) => cb({
            get: async () => mockDoc(),
            set: () => { },
            update: () => { },
            delete: () => { },
        }),
        getAll: async (...refs: any[]) => refs.map(ref => mockDoc(ref._path?.segments?.pop())),
    };
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
} as const;
