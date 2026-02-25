// Environment configuration
// All sensitive values should be in environment variables

const getAppUrl = () => {
    let url = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    // Ensure protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
    }
    // Remove trailing slash
    return url.endsWith('/') ? url.slice(0, -1) : url;
};

export const config = {
    // Application
    appName: 'Deployify',
    appUrl: getAppUrl(),

    // GitHub OAuth
    github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
        appId: process.env.GITHUB_APP_ID,
        privateKey: process.env.GITHUB_PRIVATE_KEY,
    },

    // GCP Configuration
    gcp: {
        projectId: process.env.GCP_PROJECT_ID!,
        projectNumber: process.env.GCP_PROJECT_NUMBER,
        region: process.env.GCP_REGION || 'asia-south1',
        artifactRegistry: process.env.GCP_ARTIFACT_REGISTRY || 'deployify-images',
    },

    // Firebase/Firestore
    firebase: {
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },

    // JWT Configuration
    jwt: {
        secret: process.env.JWT_SECRET!,
        expiresIn: '7d',
    },

    // Email
    email: {
        resendApiKey: process.env.RESEND_API_KEY,
        fromAddress: process.env.EMAIL_FROM || 'Deployify <noreply@deployify.io>',
    },

    // Security
    security: {
        rateLimitRequests: parseInt(process.env.RATE_LIMIT_REQUESTS || '100'),
        rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
        encryptionKey: process.env.ENCRYPTION_KEY || process.env.JWT_SECRET,
    },

    // Billing
    billing: {
        razorpay: {
            keyId: process.env.RAZORPAY_KEY_ID,
            keySecret: process.env.RAZORPAY_KEY_SECRET,
        },
    },

    // Cloud Run defaults
    cloudRun: {
        minInstances: 0,
        maxInstances: 10,
        memory: '512Mi',
        cpu: '1',
        port: 8080,
        timeout: 300,
    },
    // BigQuery
    bigquery: {
        dataset: process.env.BIGQUERY_DATASET || 'deployify_analytics',
        table: process.env.BIGQUERY_TABLE || 'events',
    },
} as const;

// Validate required environment variables
export function validateConfig(): void {
    const required = [
        'GITHUB_CLIENT_ID',
        'GITHUB_CLIENT_SECRET',
        'GITHUB_WEBHOOK_SECRET',
        'GCP_PROJECT_ID',
        'JWT_SECRET',
    ];

    let missing = required.filter(key => !process.env[key]);

    if (!process.env.ENCRYPTION_KEY && !process.env.JWT_SECRET) {
        missing.push('ENCRYPTION_KEY (or JWT_SECRET)');
    }

    if (missing.length > 0) {
        console.warn('╔═══════════════════════════════════════════════════════════════════╗');
        console.warn('║ [Config] WARNING: Missing required environment variables          ║');
        console.warn('╠═══════════════════════════════════════════════════════════════════╣');
        missing.forEach(key => {
            console.warn(`║  - ${key.padEnd(62)} ║`);
        });
        console.warn('╚═══════════════════════════════════════════════════════════════════╝');
        console.warn('[Config] Some features may not work correctly until these are set.');
    }
}
