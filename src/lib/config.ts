// Environment configuration
// All sensitive values should be in environment variables

export const config = {
    // Application
    appName: 'Deployify',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',

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
        projectNumber: process.env.GCP_PROJECT_NUMBER || '853384839522', // Fallback to provided default if not set
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
        resendApiKey: process.env.RESEND_API_KEY!,
        fromAddress: process.env.EMAIL_FROM || 'Deployify <noreply@deployify.io>',
    },

    // Security
    security: {
        rateLimitRequests: parseInt(process.env.RATE_LIMIT_REQUESTS || '100'),
        rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    },

    // Billing
    billing: {
        razorpay: {
            keyId: process.env.RAZORPAY_KEY_ID!,
            keySecret: process.env.RAZORPAY_KEY_SECRET!,
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
        'RAZORPAY_KEY_ID',
        'RAZORPAY_KEY_SECRET',
        'RESEND_API_KEY',
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}
