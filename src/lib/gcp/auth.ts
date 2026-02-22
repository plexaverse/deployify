/**
 * GCP Authentication Utilities
 */

/**
 * Check if the application is running on Google Cloud Platform
 */
export function isRunningOnGCP(): boolean {
    return process.env.K_SERVICE !== undefined || process.env.GOOGLE_CLOUD_PROJECT !== undefined;
}

/**
 * Get Google Cloud Platform Access Token
 * Attempts metadata server first (GCP), then falls back to google-auth-library (Local)
 */
export async function getGcpAccessToken(): Promise<string> {
    // 1. Try Metadata Server (GCP Environment)
    try {
        const tokenResponse = await fetch(
            'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
            { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(2000) }
        );

        if (tokenResponse.ok) {
            const tokenData = await tokenResponse.json();
            return tokenData.access_token;
        }
    } catch {
        // Fallback to local auth
    }

    // 2. Try Google Auth Library (Local Development)
    try {
        const { GoogleAuth } = await import('google-auth-library');
        const auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        if (token.token) return token.token;
    } catch (e) {
        console.error('Local GCP authentication failed:', e instanceof Error ? e.message : e);
    }

    throw new Error('GCP authentication failed. Ensure you are on GCP or have run "gcloud auth application-default login"');
}

/**
 * Fetch GCP Project Number from Project ID
 */
export async function getGcpProjectNumber(projectId: string): Promise<string | null> {
    try {
        const token = await getGcpAccessToken();
        const response = await fetch(
            `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.ok) {
            const data = await response.json();
            return data.projectNumber || null;
        }
    } catch (e) {
        console.error('Failed to fetch project number:', e);
    }
    return null;
}
