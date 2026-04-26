import { upsertSecret, getSecretValue } from './secrets';
import { getRegionalEgressIps } from './networks';
import { getProjectById } from '@/lib/db';
import type { StorageConfig } from '@/types';

export interface SyncResult {
    success: boolean;
    connectionString?: string;
    lastSyncedAt: Date;
    firewallSynced?: boolean;
    tier?: string;
    error?: string;
}

/**
 * Helper to fetch provider API key from Secret Manager or metadata
 */
async function getProviderApiKey(storage: StorageConfig): Promise<string | undefined> {
    if (storage.providerApiKeySecretId) {
        try {
            return await getSecretValue(storage.providerApiKeySecretId);
        } catch (e) {
            console.error(`[ExternalSync] Failed to fetch API key from Secret Manager:`, e);
        }
    }
    return storage.metadata?.providerApiKey as string | undefined;
}

/**
 * Synchronize external connector credentials from provider APIs
 */
export async function syncExternalConnector(
    projectId: string,
    storage: StorageConfig
): Promise<SyncResult> {
    const now = new Date();
    const providerApiKey = await getProviderApiKey(storage);

    if (process.env.MOCK_DB !== 'true' && !providerApiKey) {
        return {
            success: false,
            error: `Auto-sync requires a Provider API Key for ${storage.type}. Please update the connector settings.`,
            lastSyncedAt: now
        };
    }

    try {
        let newConnectionString = '';
        let discoveredTier = '';

        if (process.env.MOCK_DB === 'true') {
            // Simulate API fetch delay
            await new Promise(resolve => setTimeout(resolve, 500));
            newConnectionString = storage.type === 'supabase'
                ? 'postgresql://postgres:mock@db.supabase.co:5432/postgres'
                : storage.type === 'mongodb-atlas'
                ? 'mongodb+srv://mock:password@cluster.mongodb.net/test'
                : 'mysql://mock:password@aws.connect.psdb.cloud/test';
            discoveredTier = 'PRO';
        } else {
            if (storage.type === 'supabase') {
                const supabaseId = storage.metadata?.supabaseId as string;
                if (!supabaseId) throw new Error('Supabase Reference ID is missing in metadata');

                // 1. Fetch Connection String
                const res = await fetch(`https://api.supabase.com/v1/projects/${supabaseId}/config/database`, {
                    headers: { 'Authorization': `Bearer ${providerApiKey}` }
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Supabase API error (DB): ${errorText}`);
                }

                const data = await res.json();
                newConnectionString = `postgresql://postgres:${data.password || 'password'}@db.${supabaseId}.supabase.co:5432/postgres`;

                // 2. Discover Tier
                try {
                    const projectRes = await fetch(`https://api.supabase.com/v1/projects/${supabaseId}`, {
                        headers: { 'Authorization': `Bearer ${providerApiKey}` }
                    });
                    if (projectRes.ok) {
                        const projectData = await projectRes.json();
                        discoveredTier = projectData.plan?.toUpperCase() || 'FREE';
                    }
                } catch (e) {
                    console.warn(`[StorageSync] Supabase tier discovery failed:`, e);
                }
            } else if (storage.type === 'mongodb-atlas') {
                const groupId = storage.metadata?.groupId as string;
                const clusterName = storage.metadata?.clusterName as string;

                if (!groupId) throw new Error('MongoDB Atlas Group ID is missing in connector metadata');
                if (!clusterName) throw new Error('MongoDB Atlas Cluster Name is missing in connector metadata');

                const res = await fetch(`https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/clusters/${clusterName}`, {
                    headers: {
                        'Authorization': `Bearer ${providerApiKey}`,
                        'Accept': 'application/json'
                    }
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`MongoDB Atlas API error (${res.status}): ${errorText || 'Failed to fetch cluster details'}`);
                }

                const data = await res.json();
                newConnectionString = data.connectionStrings?.standardSrv || `mongodb+srv://user:password@${clusterName}.mongodb.net/test`;
                discoveredTier = data.providerSettings?.instanceSizeName || 'M0';
            } else if (storage.type === 'planetscale') {
                const organization = storage.metadata?.organization as string;
                const database = storage.metadata?.database as string;
                if (!organization || !database) throw new Error('PlanetScale Organization or Database name is missing');

                // 0. Discover Tier
                try {
                    const dbRes = await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}`, {
                        headers: { 'Authorization': `Bearer ${providerApiKey}` }
                    });
                    if (dbRes.ok) {
                        const dbData = await dbRes.json();
                        discoveredTier = dbData.plan?.toUpperCase() || 'FREE';
                    }
                } catch (e) {
                    console.warn(`[StorageSync] PlanetScale tier discovery failed:`, e);
                }

                // 1. Create a new "deployify-managed" password with regional IP allowlisting
                const project = await getProjectById(projectId);
                const { ips } = getRegionalEgressIps(project?.region || (storage.metadata?.region as string));

                const createRes = await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/passwords`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${providerApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: `deployify-sync-${now.getTime()}`,
                        role: 'readwriter',
                        trusted_ips: ips
                    })
                });

                if (!createRes.ok) {
                    const errorText = await createRes.text();
                    throw new Error(`PlanetScale API error (Create): ${errorText}`);
                }

                const newPwd = await createRes.json();
                if (newPwd.username && newPwd.plain_text && newPwd.access_host) {
                    newConnectionString = `mysql://${newPwd.username}:${newPwd.plain_text}@${newPwd.access_host}/${database}?ssl={"rejectUnauthorized":true}`;
                } else {
                    throw new Error('Failed to retrieve full credential set from PlanetScale API');
                }

                // 2. List existing passwords and cleanup old "deployify-sync-*" ones
                try {
                    const listRes = await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/passwords`, {
                        headers: { 'Authorization': `Bearer ${providerApiKey}` }
                    });

                    if (listRes.ok) {
                        const passwords = await listRes.json();
                        // Filter for passwords created by deployify sync that aren't the one we just created
                        const oldPasswords = (passwords.data || passwords || []).filter((p: { name?: string; id?: string }) =>
                            p.name?.startsWith('deployify-sync-') && p.id !== newPwd.id
                        );

                        for (const oldPwd of oldPasswords) {
                            await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/passwords/${oldPwd.id}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${providerApiKey}` }
                            });
                        }
                    }
                } catch (cleanupError) {
                    console.warn(`[StorageSync] PlanetScale password cleanup failed:`, cleanupError);
                    // Don't fail the whole sync if cleanup fails
                }
            } else if (storage.type === 'neon') {
                const neonProjectId = storage.metadata?.neonProjectId as string;
                if (!neonProjectId) throw new Error('Neon Project ID is missing');

                // 1. Fetch Connection String
                const res = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}/connection_uri?branch_id=main`, {
                    headers: { 'Authorization': `Bearer ${providerApiKey}` }
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Neon API error (Conn): ${errorText}`);
                }

                const data = await res.json();
                newConnectionString = data.connection_uri || '';

                // 2. Discover Tier
                try {
                    const projectRes = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}`, {
                        headers: { 'Authorization': `Bearer ${providerApiKey}` }
                    });
                    if (projectRes.ok) {
                        const projectData = await projectRes.json();
                        // Neon projects use 'plan_id'
                        discoveredTier = (projectData.project?.plan_id || 'free').toUpperCase();
                    }
                } catch (e) {
                    console.warn(`[StorageSync] Neon tier discovery failed:`, e);
                }
            }
        }

        if (newConnectionString && storage.connectionStringSecretId) {
            await upsertSecret(`deployify-${projectId}-${storage.id}-conn`, newConnectionString);
        }

        // 3. Automatically sync firewall if enabled
        let firewallSynced = false;
        try {
            const fwResult = await syncExternalFirewall(projectId, storage);
            firewallSynced = fwResult.success;
        } catch (fwError) {
            console.warn(`[StorageSync] Firewall sync failed for ${storage.name}:`, fwError);
            // We don't fail the credential sync if firewall sync fails, but we log it
        }

        return {
            success: true,
            connectionString: newConnectionString,
            lastSyncedAt: now,
            firewallSynced,
            tier: discoveredTier || undefined
        };
    } catch (error) {
        console.error(`External sync failed for ${storage.type}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown sync error',
            lastSyncedAt: now
        };
    }
}

/**
 * Provision a new external storage resource via Provider API
 */
export async function provisionExternalConnector(
    projectId: string,
    name: string,
    type: string,
    region: string,
    metadata: Record<string, unknown>
): Promise<{ operationName: string; connectionString: string; metadata?: Record<string, unknown> }> {
    // Note: for provision, the apiKey is passed directly in the request body
    // which is merged into metadata temporarily in the route handler.
    const providerApiKey = metadata.providerApiKey as string;

    if (process.env.MOCK_DB === 'true') {
        const mockId = `mock-${Date.now().toString(36)}`;
        return {
            operationName: `external/provision/${type}/${mockId}`,
            connectionString: type === 'neon'
                ? `postgresql://user:password@${mockId}.aws.neon.tech/main`
                : `postgresql://postgres:password@db.${mockId}.supabase.co:5432/postgres`,
            metadata: {
                ...(type === 'neon' ? { neonProjectId: mockId } : { supabaseId: mockId }),
                provisionStatus: 'DONE'
            }
        };
    }

    if (!providerApiKey) {
        throw new Error(`Provisioning requires a Provider API Key for ${type}`);
    }

    // Generate a secure random password if not provided
    const generatePassword = () => {
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
        let retVal = '';
        for (let i = 0; i < 16; ++i) {
            retVal += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return retVal;
    };

    if (type === 'neon') {
        // Neon Project Creation
        const res = await fetch('https://console.neon.tech/api/v2/projects', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${providerApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project: {
                    name,
                    region_id: region || 'aws-us-east-1'
                }
            })
        });

        if (!res.ok) {
            throw new Error(`Neon Provisioning Error: ${await res.text()}`);
        }

        const data = await res.json();
        const neonProjectId = data.project.id;

        // Fetch connection string for main branch
        const connRes = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}/connection_uri?branch_id=main`, {
            headers: { 'Authorization': `Bearer ${providerApiKey}` }
        });
        const connData = await connRes.json();

        return {
            operationName: `neon/projects/${neonProjectId}`,
            connectionString: connData.connection_uri,
            metadata: {
                neonProjectId,
                provisionStatus: 'DONE'
            }
        };
    } else if (type === 'supabase') {
        // Supabase Project Creation
        const db_pass = (metadata.dbPassword as string) || generatePassword();
        const res = await fetch('https://api.supabase.com/v1/projects', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${providerApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                region: region || 'us-east-1',
                organization_id: metadata.organizationId || '', // Required for Supabase
                db_pass
            })
        });

        if (!res.ok) {
            throw new Error(`Supabase Provisioning Error: ${await res.text()}`);
        }

        const data = await res.json();
        const supabaseId = data.id;

        return {
            operationName: `supabase/projects/${supabaseId}`,
            connectionString: `postgresql://postgres:${db_pass}@db.${supabaseId}.supabase.co:5432/postgres`,
            metadata: {
                supabaseId,
                provisionStatus: 'RUNNING' // Supabase usually takes a minute to provision DB
            }
        };
    }

    throw new Error(`Automated provisioning is not yet supported for ${type}`);
}

/**
 * Poll external provider for project provisioning status
 */
export async function getExternalOperationStatus(
    operationName: string,
    metadata: Record<string, unknown>,
    providerApiKeySecretId?: string
): Promise<{ status: 'PENDING' | 'RUNNING' | 'DONE' | 'ERROR'; error?: string }> {
    let providerApiKey = metadata.providerApiKey as string;

    if (!providerApiKey && providerApiKeySecretId) {
        try {
            providerApiKey = await getSecretValue(providerApiKeySecretId);
        } catch (e) {
            console.error(`[ExternalSync] Failed to fetch API key for status check:`, e);
        }
    }

    if (process.env.MOCK_DB === 'true') {
        return { status: 'DONE' };
    }

    if (!providerApiKey) {
        // In a real production scenario, we might want to fetch this from Secret Manager
        // if we stored the Provider API Key there.
        return { status: 'ERROR', error: 'Provider API Key is missing for status check' };
    }

    try {
        if (operationName.startsWith('neon/')) {
            const neonProjectId = operationName.split('/').pop();
            const res = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}`, {
                headers: { 'Authorization': `Bearer ${providerApiKey}` }
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Neon API error: ${errorText}`);
            }

            const data = await res.json();
            const neonStatus = data.project?.status;

            // Neon project statuses: 'initing', 'active', 'ready', 'failed'
            if (neonStatus === 'ready' || neonStatus === 'active') {
                return { status: 'DONE' };
            }
            if (neonStatus === 'failed') {
                return { status: 'ERROR', error: 'Neon project creation failed' };
            }
            return { status: 'RUNNING' };

        } else if (operationName.startsWith('supabase/')) {
            const supabaseId = operationName.split('/').pop();
            const res = await fetch(`https://api.supabase.com/v1/projects/${supabaseId}`, {
                headers: { 'Authorization': `Bearer ${providerApiKey}` }
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Supabase API error: ${errorText}`);
            }

            const data = await res.json();
            const supabaseStatus = data.status;

            // Supabase project statuses: 'ACTIVE_HEALTHY', 'COMING_UP', 'GOING_DOWN', 'INACTIVE', 'INIT_DB', 'PAUSING', 'RESTORING'
            if (supabaseStatus === 'ACTIVE_HEALTHY') {
                return { status: 'DONE' };
            }
            if (supabaseStatus === 'INACTIVE' || supabaseStatus === 'PAUSED') {
                return { status: 'ERROR', error: `Supabase project in unexpected state: ${supabaseStatus}` };
            }
            return { status: 'RUNNING' };
        }
    } catch (error) {
        return {
            status: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown status check error'
        };
    }

    return { status: 'DONE' };
}

/**
 * Automatically allowlist Deployify egress IPs in the external provider's firewall
 */
/**
 * Automatically rotate provider API keys (Tokens) for external connectors
 * Currently supports: Neon
 */
export async function rotateProviderToken(
    projectId: string,
    storage: StorageConfig
): Promise<{ success: boolean; error?: string; providerApiKeySecretId?: string }> {
    if (process.env.MOCK_DB === 'true') {
        return { success: true };
    }

    const providerApiKey = await getProviderApiKey(storage);
    if (!providerApiKey) {
        return { success: false, error: 'Current Provider API key is missing' };
    }

    try {
        if (storage.type === 'neon') {
            const neonProjectId = storage.metadata?.neonProjectId as string;
            if (!neonProjectId) throw new Error('Neon Project ID is missing');

            // 1. Create a new API key for the project
            // Neon's V2 API allows creating project-level API keys (Service Tokens)
            const createRes = await fetch('https://console.neon.tech/api/v2/api_keys', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${providerApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: {
                        name: `deployify-rotation-${Date.now()}`
                    }
                })
            });

            if (!createRes.ok) {
                const err = await createRes.text();
                throw new Error(`Neon Token Rotation Error (Create): ${err}`);
            }

            const newKeyData = await createRes.json();
            const newKey = newKeyData.key;

            // 2. Update GCP Secret Manager
            const secretId = storage.providerApiKeySecretId || `deployify-${projectId}-${storage.id}-apikey`;
            const providerApiKeySecretId = await upsertSecret(secretId, newKey);

            // 3. Optional: List and cleanup old keys if we had a naming convention
            // (Neon key listing doesn't easily filter by name in V2 without manual iteration)

            return { success: true, providerApiKeySecretId };
        } else if (storage.type === 'planetscale') {
            const organization = storage.metadata?.organization as string;
            const database = storage.metadata?.database as string;
            if (!organization || !database) throw new Error('PlanetScale metadata missing');

            // PlanetScale uses 'passwords' which act as tokens.
            // Rotating here means creating a new password and updating the connection string.
            const project = await getProjectById(projectId);
            const { ips } = getRegionalEgressIps(project?.region || (storage.metadata?.region as string));

            const createRes = await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/passwords`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${providerApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: `deployify-rotation-${Date.now()}`,
                    role: 'readwriter',
                    trusted_ips: ips
                })
            });

            if (!createRes.ok) {
                const err = await createRes.text();
                throw new Error(`PlanetScale Rotation Error: ${err}`);
            }

            const newPwd = await createRes.json();
            const newConnStr = `mysql://${newPwd.username}:${newPwd.plain_text}@${newPwd.access_host}/${database}?ssl={"rejectUnauthorized":true}`;

            // Update Connection String Secret
            if (storage.connectionStringSecretId) {
                await upsertSecret(storage.connectionStringSecretId, newConnStr);
            }

            // Cleanup old rotation passwords
            try {
                const listRes = await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/passwords`, {
                    headers: { 'Authorization': `Bearer ${providerApiKey}` }
                });

                if (listRes.ok) {
                    const passwords = await listRes.json();
                    const oldPasswords = (passwords.data || []).filter((p: { name?: string; id?: string }) =>
                        p.name?.startsWith('deployify-rotation-') && p.id !== newPwd.id
                    );

                    for (const oldPwd of oldPasswords) {
                        await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/passwords/${oldPwd.id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${providerApiKey}` }
                        });
                    }
                }
            } catch (e) {
                console.warn(`[PlanetScaleRotation] Old password cleanup failed:`, e);
            }

            return { success: true };
        }

        // Add other providers (Supabase, MongoDB Atlas) if their APIs support it.
        // PlanetScale: Uses service tokens which can be rotated.
        // MongoDB Atlas: Uses API keys which can be managed via API.
        // Supabase: Management API tokens are personal, not project-specific.

        return { success: false, error: `Automated token rotation not yet implemented for ${storage.type}` };
    } catch (error) {
        console.error(`[TokenRotation] Failed for ${storage.type}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown token rotation error'
        };
    }
}

export async function syncExternalFirewall(
    projectId: string,
    storage: StorageConfig
): Promise<{ success: boolean; error?: string }> {
    const providerApiKey = await getProviderApiKey(storage);
    if (process.env.MOCK_DB === 'true' || !providerApiKey) return { success: true };

    try {
        const project = await getProjectById(projectId);
        const { ips } = getRegionalEgressIps(project?.region || (storage.metadata?.region as string));

        if (storage.type === 'supabase') {
            const supabaseId = storage.metadata?.supabaseId as string;
            if (!supabaseId) throw new Error('Supabase Reference ID missing');

            const res = await fetch(`https://api.supabase.com/v1/projects/${supabaseId}/network-restrictions`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${providerApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    db_allowed_cidrs: ips
                })
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Supabase Firewall API error: ${errorText}`);
            }
        } else if (storage.type === 'mongodb-atlas') {
            const groupId = storage.metadata?.groupId as string;
            if (!groupId) throw new Error('MongoDB Atlas Group ID missing');

            // MongoDB Atlas access list takes individual entries
            const body = ips.map(cidr => ({
                cidrBlock: cidr,
                comment: 'Deployify Managed Egress'
            }));

            const res = await fetch(`https://cloud.mongodb.com/api/atlas/v1.0/groups/${groupId}/accessList`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${providerApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            // 409 means it already exists, which is fine
            if (!res.ok && res.status !== 409) {
                const errorText = await res.text();
                throw new Error(`MongoDB Atlas Access List API error: ${errorText}`);
            }
        } else if (storage.type === 'neon') {
            const neonProjectId = storage.metadata?.neonProjectId as string;
            if (!neonProjectId) throw new Error('Neon Project ID missing');

            // Neon V2 API handles IP allowlisting via nested project settings
            const res = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${providerApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    project: {
                        settings: {
                            ip_allow: {
                                allowed_ips: ips
                            }
                        }
                    }
                })
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Neon Firewall API error: ${errorText}`);
            }
        } else if (storage.type === 'planetscale') {
            // PlanetScale firewall sync is handled during password creation via 'trusted_ips'
            return { success: true };
        }

        return { success: true };
    } catch (error) {
        console.error(`Firewall sync failed for ${storage.type}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown firewall sync error'
        };
    }
}
