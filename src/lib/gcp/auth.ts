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
 * Get Google Cloud Platform Access Token from Metadata Server
 * Throws error if not running on GCP or if fetch fails
 */
export async function getGcpAccessToken(): Promise<string> {
    const tokenResponse = await fetch(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        { headers: { 'Metadata-Flavor': 'Google' } }
    );

    if (!tokenResponse.ok) {
        throw new Error('Cannot get access token - likely not running on GCP');
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
}
