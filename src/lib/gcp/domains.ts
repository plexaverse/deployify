import { config } from '@/lib/config';

/**
 * Create a domain mapping for a Cloud Run service
 * This maps a custom domain to a Cloud Run service
 */
export async function createDomainMapping(
    serviceName: string,
    domain: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Get access token from metadata server (works on GCP)
        const tokenResponse = await fetch(
            'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
            { headers: { 'Metadata-Flavor': 'Google' } }
        );

        if (!tokenResponse.ok) {
            return { success: false, error: 'Failed to get access token' };
        }

        const { access_token } = await tokenResponse.json();

        // Create domain mapping using Cloud Run Admin API
        const apiUrl = `https://run.googleapis.com/v1/projects/${config.gcp.projectId}/locations/${config.gcp.region}/domainmappings`;

        const domainMapping = {
            apiVersion: 'run.googleapis.com/v1',
            kind: 'DomainMapping',
            metadata: {
                name: domain,
                namespace: config.gcp.projectId,
            },
            spec: {
                routeName: serviceName,
            },
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(domainMapping),
        });

        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.error?.message || 'Failed to create domain mapping';
            console.error('Domain mapping error:', errorData);
            return { success: false, error: errorMessage };
        }

        return { success: true };
    } catch (error) {
        console.error('Failed to create domain mapping:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Delete a domain mapping
 */
export async function deleteDomainMapping(
    domain: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Get access token from metadata server
        const tokenResponse = await fetch(
            'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
            { headers: { 'Metadata-Flavor': 'Google' } }
        );

        if (!tokenResponse.ok) {
            return { success: false, error: 'Failed to get access token' };
        }

        const { access_token } = await tokenResponse.json();

        // Delete domain mapping
        const apiUrl = `https://run.googleapis.com/v1/projects/${config.gcp.projectId}/locations/${config.gcp.region}/domainmappings/${domain}`;

        const response = await fetch(apiUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${access_token}`,
            },
        });

        if (!response.ok && response.status !== 404) {
            const errorData = await response.json();
            const errorMessage = errorData.error?.message || 'Failed to delete domain mapping';
            return { success: false, error: errorMessage };
        }

        return { success: true };
    } catch (error) {
        console.error('Failed to delete domain mapping:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get the status of a domain mapping
 */
export async function getDomainMappingStatus(
    domain: string
): Promise<{ status: 'pending' | 'active' | 'error' | 'not_found'; error?: string }> {
    try {
        // Get access token from metadata server
        const tokenResponse = await fetch(
            'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
            { headers: { 'Metadata-Flavor': 'Google' } }
        );

        if (!tokenResponse.ok) {
            return { status: 'error', error: 'Failed to get access token' };
        }

        const { access_token } = await tokenResponse.json();

        // Get domain mapping status
        const apiUrl = `https://run.googleapis.com/v1/projects/${config.gcp.projectId}/locations/${config.gcp.region}/domainmappings/${domain}`;

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${access_token}`,
            },
        });

        if (response.status === 404) {
            return { status: 'not_found' };
        }

        if (!response.ok) {
            const errorData = await response.json();
            return { status: 'error', error: errorData.error?.message };
        }

        const data = await response.json();

        // Check conditions to determine status
        const conditions = data.status?.conditions || [];
        const readyCondition = conditions.find((c: { type: string }) => c.type === 'Ready');

        if (readyCondition?.status === 'True') {
            return { status: 'active' };
        } else if (readyCondition?.status === 'Unknown') {
            return { status: 'pending' };
        } else {
            return { status: 'error', error: readyCondition?.message };
        }
    } catch (error) {
        console.error('Failed to get domain mapping status:', error);
        return {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get DNS records that user needs to configure
 */
export function getDnsRecords(domain: string): { type: string; name: string; value: string }[] {
    const isApex = !domain.includes('.') || domain.split('.').length === 2;

    if (isApex) {
        // Root domain - need A records
        return [
            { type: 'A', name: '@', value: '216.239.32.21' },
            { type: 'A', name: '@', value: '216.239.34.21' },
            { type: 'A', name: '@', value: '216.239.36.21' },
            { type: 'A', name: '@', value: '216.239.38.21' },
        ];
    } else {
        // Subdomain - use CNAME
        const subdomain = domain.split('.')[0];
        return [
            { type: 'CNAME', name: subdomain, value: 'ghs.googlehosted.com.' },
        ];
    }
}
