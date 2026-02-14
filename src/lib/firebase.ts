import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { config } from '@/lib/config';
import { MockFirestore } from '@/lib/mock-firestore';

let app: App | undefined;
let db: Firestore | undefined;
// Use global to persist mock DB across hot reloads
const globalWithMock = global as typeof global & { mockDb?: any };
let mockDb: any | undefined = globalWithMock.mockDb;

/**
 * Initialize Firebase Admin SDK
 */
function initializeFirebase(): App {
    if (getApps().length > 0) {
        return getApps()[0];
    }

    // Use service account credentials if available
    if (config.firebase.clientEmail && config.firebase.privateKey) {
        return initializeApp({
            credential: cert({
                projectId: config.firebase.projectId,
                clientEmail: config.firebase.clientEmail,
                privateKey: config.firebase.privateKey,
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
        if (!mockDb) {
            console.log('Using Mock Firestore');
            mockDb = new MockFirestore();
            globalWithMock.mockDb = mockDb;
        }
        return mockDb as unknown as Firestore;
    }

    if (!db) {
        if (!app) {
            app = initializeFirebase();
        }
        db = getFirestore(app);
    }
    return db;
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
} as const;
