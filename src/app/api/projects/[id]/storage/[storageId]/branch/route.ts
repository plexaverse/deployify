import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
import { ensureEphemeralDatabase as ensureSqlBranch } from '@/lib/gcp/cloudsql';
import { ensureEphemeralDatabase as ensureFirestoreBranch, validateDatabaseId } from '@/lib/gcp/firestore-admin';
import { runSeed } from '@/lib/gcp/seeding';
import { getLatestDeployment } from '@/lib/db';
import type { StorageConfig } from '@/types';

/**
 * POST - Trigger provisioning of an ephemeral storage branch
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ error: access.error }, { status: access.status });
        }

        const { project } = access;
        const storageConfig = project.storageConfigs?.find((s: StorageConfig) => s.id === storageId);

        if (!storageConfig) {
            return NextResponse.json({ error: 'Storage connector not found' }, { status: 404 });
        }

        if (!storageConfig.branchingSettings?.enabled) {
            return NextResponse.json({ error: 'Branching is not enabled for this connector' }, { status: 400 });
        }

        const body = await request.json();
        const { branch, pullRequestNumber, seed } = body;

        if (!branch && !pullRequestNumber) {
            return NextResponse.json({ error: 'Branch name or PR number is required' }, { status: 400 });
        }

        const identifier = pullRequestNumber ? `pr${pullRequestNumber}` : branch.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

        let finalDbName = identifier;
        let branchConn = '';
        let message = `Branching context established for ${identifier}`;

        const baseConnectionString = storageConfig.connectionStringSecretId
            ? await getSecretValue(storageConfig.connectionStringSecretId)
            : '';

        // 1. Perform side-effect provisioning based on type
        if (storageConfig.type.includes('cloud-sql')) {
            const instanceName = storageConfig.metadata?.resourceName as string;
            if (!instanceName) {
                return NextResponse.json({ error: 'Cloud SQL instance name not found in metadata' }, { status: 400 });
            }

            if (!baseConnectionString) {
                return NextResponse.json({ error: 'Base connection string not found' }, { status: 400 });
            }

            const urlObj = new URL(baseConnectionString);
            const baseDbName = urlObj.pathname.split('/')[1] || 'postgres';
            const template = storageConfig.branchingSettings.template || '{base}_{identifier}';
            finalDbName = template
                .replace('{base}', baseDbName)
                .replace('{identifier}', identifier);

            await ensureSqlBranch(instanceName, finalDbName);
            branchConn = baseConnectionString.replace(urlObj.pathname, `/${finalDbName}`);
            message = `Ephemeral database ${finalDbName} ensured for ${identifier}`;
        } else if (storageConfig.type === 'firestore') {
            const region = (storageConfig.metadata?.region as string) || project.region || 'us-central1';
            const baseDbName = (storageConfig.metadata?.resourceName as string) || '(default)';
            const template = storageConfig.branchingSettings.template || 'db-{identifier}';

            const branchDbName = template
                .replace('{base}', baseDbName === '(default)' ? 'default' : baseDbName)
                .replace('{identifier}', identifier)
                .replace(/[^a-z0-9-]/g, '-')
                .toLowerCase();

            // Validate ID (Firestore IDs must start with letter)
            finalDbName = validateDatabaseId(branchDbName) ? branchDbName : `db-${branchDbName}`.substring(0, 63);

            await ensureFirestoreBranch(finalDbName, region);
            branchConn = `firestore://${finalDbName}`;
            message = `Ephemeral Firestore database ${finalDbName} ensured for ${identifier}`;
        } else if (storageConfig.type === 'memorystore-redis') {
            let dbIndex = 0;
            if (pullRequestNumber) {
                dbIndex = (pullRequestNumber % 15) + 1;
            } else if (branch) {
                const hash = branch.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
                dbIndex = (hash % 15) + 1;
            }

            finalDbName = `db-${dbIndex}`;
            if (baseConnectionString) {
                try {
                    const url = new URL(baseConnectionString);
                    url.pathname = `/${dbIndex}`;
                    branchConn = url.toString();
                } catch {
                    branchConn = baseConnectionString;
                }
            }
            message = `Redis DB index ${dbIndex} assigned for ${identifier}`;
        } else if (storageConfig.type === 'planetscale') {
            const organization = storageConfig.metadata?.organization as string;
            const database = storageConfig.metadata?.database as string;
            let providerApiKey = storageConfig.metadata?.providerApiKey as string;
            if (!providerApiKey && storageConfig.providerApiKeySecretId) {
                providerApiKey = await getSecretValue(storageConfig.providerApiKeySecretId);
            }

            if (organization && database && providerApiKey) {
                // Native PlanetScale Branching
                if (process.env.MOCK_DB === 'true') {
                    finalDbName = identifier;
                    branchConn = `mysql://mock_user:mock_password@aws.connect.psdb.cloud/${database}?ssl={"rejectUnauthorized":true}`;
                    message = `PlanetScale ephemeral branch ${identifier} created (MOCK)`;
                } else {
                    try {
                        // 1. Create Branch
                        const branchRes = await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/branches`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${providerApiKey}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ name: identifier })
                        });

                        if (!branchRes.ok && branchRes.status !== 422) {
                            console.error('[PlanetScale] Branch creation failed:', await branchRes.text());
                        }

                        // 2. Create Password for branch
                        const pwdRes = await fetch(`https://api.planetscale.com/v1/organizations/${organization}/databases/${database}/branches/${identifier}/passwords`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${providerApiKey}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ display_name: `deployify-${identifier}` })
                        });

                        if (pwdRes.ok) {
                            const pwdData = await pwdRes.json();
                            branchConn = `mysql://${pwdData.username}:${pwdData.plain_text}@${pwdData.access_host}/${database}?ssl={"rejectUnauthorized":true}`;
                        } else if (baseConnectionString) {
                            const url = new URL(baseConnectionString);
                            url.hostname = `${identifier}.${url.hostname}`;
                            branchConn = url.toString();
                        }
                        finalDbName = identifier;
                        message = `PlanetScale ephemeral branch ${identifier} ensured`;
                    } catch (e) {
                        console.error('[PlanetScale] Branching error:', e);
                    }
                }
            } else if (baseConnectionString) {
                const url = new URL(baseConnectionString);
                url.hostname = `${identifier}.${url.hostname}`;
                branchConn = url.toString();
                finalDbName = identifier;
            }
        } else if (storageConfig.type === 'neon') {
            const neonProjectId = storageConfig.metadata?.neonProjectId as string;
            let providerApiKey = storageConfig.metadata?.providerApiKey as string;
            if (!providerApiKey && storageConfig.providerApiKeySecretId) {
                providerApiKey = await getSecretValue(storageConfig.providerApiKeySecretId);
            }

            if (neonProjectId && providerApiKey) {
                // Native Neon Branching
                if (process.env.MOCK_DB === 'true') {
                    finalDbName = identifier;
                    branchConn = `postgresql://postgres:mock@ep-mock-123.${project.region}.aws.neon.tech/main`;
                    message = `Neon ephemeral branch ${identifier} created (MOCK)`;
                } else {
                    try {
                        // 1. Create Branch
                        const branchRes = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}/branches`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${providerApiKey}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                branch: { name: identifier }
                            })
                        });

                        if (branchRes.ok) {
                            const branchData = await branchRes.json();
                            const branchId = branchData.branch.id;

                            // 2. Get connection URI for the branch
                            const connRes = await fetch(`https://console.neon.tech/api/v2/projects/${neonProjectId}/connection_uri?branch_id=${branchId}`, {
                                headers: { 'Authorization': `Bearer ${providerApiKey}` }
                            });

                            if (connRes.ok) {
                                const connData = await connRes.json();
                                branchConn = connData.connection_uri;
                            }
                        }
                        finalDbName = identifier;
                        message = `Neon ephemeral branch ${identifier} ensured`;
                    } catch (e) {
                        console.error('[Neon] Branching error:', e);
                    }
                }
            } else if (baseConnectionString) {
                try {
                    const url = new URL(baseConnectionString);
                    url.hostname = `${identifier}.${url.hostname}`;
                    branchConn = url.toString();
                    finalDbName = identifier;
                } catch {
                    branchConn = baseConnectionString;
                }
            }
        } else if (storageConfig.type === 'supabase') {
            const supabaseId = storageConfig.metadata?.supabaseId as string;
            let providerApiKey = storageConfig.metadata?.providerApiKey as string;
            if (!providerApiKey && storageConfig.providerApiKeySecretId) {
                providerApiKey = await getSecretValue(storageConfig.providerApiKeySecretId);
            }

            // Extract password from base connection string if possible
            let dbPassword = 'password';
            if (baseConnectionString) {
                try {
                    const url = new URL(baseConnectionString);
                    dbPassword = url.password || 'password';
                } catch { /* ignore */ }
            }

            if (supabaseId && providerApiKey) {
                // Native Supabase Branching
                if (process.env.MOCK_DB === 'true') {
                    finalDbName = identifier;
                    branchConn = `postgresql://postgres:${dbPassword}@db.${supabaseId}-${identifier}.supabase.co:5432/postgres`;
                    message = `Supabase ephemeral branch ${identifier} created (MOCK)`;
                } else {
                    try {
                        // Supabase branching is currently in Beta and requires specific setup.
                        // We use their Branching API: https://supabase.com/docs/guides/platform/branching
                        const branchRes = await fetch(`https://api.supabase.com/v1/projects/${supabaseId}/branches`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${providerApiKey}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                branch_name: identifier,
                                git_branch: branch || identifier
                            })
                        });

                        if (branchRes.ok) {
                            const branchData = await branchRes.json();
                            // Supabase branches have their own host
                            branchConn = `postgresql://postgres:${dbPassword}@db.${branchData.id}.supabase.co:5432/postgres`;
                        } else if (branchRes.status === 422) {
                            // Already exists, try to get info
                            const listRes = await fetch(`https://api.supabase.com/v1/projects/${supabaseId}/branches`, {
                                headers: { 'Authorization': `Bearer ${providerApiKey}` }
                            });
                            if (listRes.ok) {
                                const branches = await listRes.json();
                                const existing = branches.find((b: { branch_name: string, id: string }) => b.branch_name === identifier);
                                if (existing) {
                                    branchConn = `postgresql://postgres:${dbPassword}@db.${existing.id}.supabase.co:5432/postgres`;
                                }
                            }
                        }

                        if (!branchConn && baseConnectionString) {
                            const url = new URL(baseConnectionString);
                            url.hostname = `db.${supabaseId}-${identifier}.supabase.co`;
                            branchConn = url.toString();
                        }
                        finalDbName = identifier;
                        message = `Supabase ephemeral branch ${identifier} ensured`;
                    } catch (e) {
                        console.error('[Supabase] Branching error:', e);
                    }
                }
            } else if (baseConnectionString) {
                try {
                    const url = new URL(baseConnectionString);
                    if (supabaseId) {
                        url.hostname = `db.${supabaseId}-${identifier}.supabase.co`;
                    } else {
                        url.hostname = `${identifier}.${url.hostname}`;
                    }
                    branchConn = url.toString();
                    finalDbName = identifier;
                } catch {
                    branchConn = baseConnectionString;
                }
            }
        } else if (storageConfig.type === 'mongodb-atlas' && baseConnectionString) {
            try {
                const url = new URL(baseConnectionString);
                const baseDbName = url.pathname.split('/')[1] || 'test';
                const template = storageConfig.branchingSettings.template || '{base}_{identifier}';
                finalDbName = template
                    .replace('{base}', baseDbName)
                    .replace('{identifier}', identifier);

                url.pathname = `/${finalDbName}`;
                branchConn = url.toString();

                // Explicitly establish MongoDB database context (idempotent)
                if (process.env.MOCK_DB !== 'true') {
                    const { MongoClient } = await import('mongodb');
                    const client = new MongoClient(branchConn, { serverSelectionTimeoutMS: 5000 });
                    await client.connect();
                    const db = client.db(finalDbName);
                    // Just a ping to ensure connectivity and context
                    await db.command({ ping: 1 });
                    await client.close();
                }
                message = `MongoDB ephemeral database ${finalDbName} established for ${identifier}`;
            } catch (e) {
                console.error('[MongoDB] Branching setup error:', e);
                // Fallback to naming convention if ping fails
                branchConn = baseConnectionString;
            }
        } else if (baseConnectionString) {
            // Generic fallback for others
            try {
                const url = new URL(baseConnectionString);
                const baseDbName = url.pathname.split('/')[1] || 'test';
                const template = storageConfig.branchingSettings.template || '{base}_{identifier}';
                finalDbName = template
                    .replace('{base}', baseDbName)
                    .replace('{identifier}', identifier);

                url.pathname = `/${finalDbName}`;
                branchConn = url.toString();
            } catch {
                branchConn = baseConnectionString;
            }
        }

        // 2. Handle Seeding (Type-Agnostic)
        let seedOperation: string | undefined;
        if (seed && storageConfig.branchingSettings.seedCommand && branchConn) {
            const latestDeploy = await getLatestDeployment(project.id, pullRequestNumber ? 'preview' : 'branch');
            const commitSha = latestDeploy?.gitCommitSha || 'main';

            try {
                const { operationName } = await runSeed(
                    project.id,
                    project.repoFullName,
                    commitSha,
                    branchConn,
                    storageConfig.envKey || (storageConfig.type === 'memorystore-redis' ? 'REDIS_URL' : storageConfig.type === 'mongodb-atlas' ? 'MONGODB_URI' : 'DATABASE_URL'),
                    storageConfig.branchingSettings.seedCommand,
                    project.region,
                    project.rootDirectory
                );
                seedOperation = operationName;
            } catch (e) {
                console.error('[Branching] Seeding failed to trigger:', e);
            }
        }

        return NextResponse.json({
            success: true,
            databaseName: finalDbName,
            seedOperation,
            message: `${message}${seedOperation ? ' (Seeding triggered)' : ''}`
        });

    } catch (error) {
        console.error('Storage branching error:', error);
        return NextResponse.json({ error: 'Failed to provision storage branch' }, { status: 500 });
    }
}
