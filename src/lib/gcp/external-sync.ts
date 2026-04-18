import { upsertSecret } from './secrets';
import { getRegionalEgressIps } from './networks';
import { getProjectById } from '@/lib/db';
import type { StorageConfig } from '@/types';

export interface SyncResult {
    success: boolean;
    connectionString?: string;
    lastSyncedAt: Date;
    firewallSynced?: boolean;
    error?: string;
}

/**
 * Synchronize external connector credentials from provider APIs
 */
export async function syncExternalConnector(
    projectId: string,
    storage: StorageConfig
): Promise<SyncResult> {
    const now = new Date();
    const providerApiKey = storage.metadata?.providerApiKey as string;

    if (process.env.MOCK_DB !== 'true' && !providerApiKey) {
        return {
            success: false,
            error: `Auto-sync requires a Provider API Key for ${storage.type}. Please update the connector settings.`,
            lastSyncedAt: now
        };
    }

    try {
        let newConnectionString = '';

        if (process.env.MOCK_DB === 'true') {
            // Simulate API fetch delay
            await new Promise(resolve => setTimeout(resolve, 500));
            newConnectionString = storage.type === 'supabase'
                ? 'postgresql://postgres:mock@db.supabase.co:5432/postgres'
                : storage.type === 'mongodb-atlas'
                ? 'mongodb+srv://mock:password@cluster.mongodb.net/test'
                : storage.type === 'neon'
                ? 'postgresql://mock:password@ep-mock-123.us-east-1.aws.neon.tech/neondb'
                : 'mysql://mock:password@aws.connect.psdb.cloud/test';
        } else {
            if (storage.type === 'supabase') {
                const supabaseId = storage.metadata?.supabaseId as string;
                if (!supabaseId) throw new Error('Supabase Reference ID is missing in metadata');

                const res = await fetch(`https://api.supabase.com/v1/projects/${supabaseId}/config/database`, {
                    headers: { 'Authorization': `Bearer ${providerApiKey}` }
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Supabase API error: ${errorText}`);
                }

                const data = await res.json();
                newConnectionString = `postgresql://postgres:${data.password || 'password'}@db.${supabaseId}.supabase.co:5432/postgres`;
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
            } else if (storage.type === 'planetscale') {
                const organization = storage.metadata?.organization as string;
                const database = storage.metadata?.database as string;
                if (!organization || !database) throw new Error('PlanetScale Organization or Database name is missing');

                // Fetch regional IPs for trusted_ips
                const project = await getProjectById(projectId);
                const { ips } = getRegionalEgressIps(project?.region || (storage.metadata?.region as string));

                // 1. Create a new "deployify-managed" password with trusted IPs
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

                const res = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}/connection_uri?branch_id=main`, {
                    headers: { 'Authorization': `Bearer ${providerApiKey}` }
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(`Neon API error: ${errorText}`);
                }

                const data = await res.json();
                newConnectionString = data.connection_uri || '';
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
            firewallSynced
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
 * Automatically allowlist Deployify egress IPs in the external provider's firewall
 */
export async function syncExternalFirewall(
    projectId: string,
    storage: StorageConfig
): Promise<{ success: boolean; error?: string }> {
    const providerApiKey = storage.metadata?.providerApiKey as string;
    if (process.env.MOCK_DB === 'true') return { success: true };
    if (!providerApiKey) return { success: false, error: 'Provider API Key is missing' };

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
            if (!neonProjectId) throw new Error('Neon Project ID is missing');

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
            // PlanetScale firewall is synced during credential creation in syncExternalConnector
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
