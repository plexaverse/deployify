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

        // Perform side-effect provisioning based on type
        if (storageConfig.type.includes('cloud-sql')) {
            const instanceName = storageConfig.metadata?.resourceName as string;
            if (!instanceName) {
                return NextResponse.json({ error: 'Cloud SQL instance name not found in metadata' }, { status: 400 });
            }

            const connectionString = await getSecretValue(storageConfig.connectionStringSecretId!);
            const urlObj = new URL(connectionString);
            const baseDbName = urlObj.pathname.split('/')[1] || 'postgres';
            const template = storageConfig.branchingSettings.template || '{base}_{identifier}';
            const branchDbName = template
                .replace('{base}', baseDbName)
                .replace('{identifier}', identifier);

            await ensureSqlBranch(instanceName, branchDbName);

            // Handle optional seeding
            let seedOperation: string | undefined;
            if (seed && storageConfig.branchingSettings.seedCommand) {
                const latestDeploy = await getLatestDeployment(project.id, pullRequestNumber ? 'preview' : 'branch');
                const commitSha = latestDeploy?.gitCommitSha || 'main';

                try {
                    const branchConn = urlObj.toString().replace(urlObj.pathname, `/${branchDbName}`);
                    const { operationName } = await runSeed(
                        project.id,
                        project.repoFullName,
                        commitSha,
                        branchConn,
                        storageConfig.envKey || 'DATABASE_URL',
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
                databaseName: branchDbName,
                seedOperation,
                message: `Ephemeral database ${branchDbName} ensured for ${identifier}${seedOperation ? ' (Seeding triggered)' : ''}`
            });
        }

        if (storageConfig.type === 'firestore') {
            const region = (storageConfig.metadata?.region as string) || project.region || 'us-central1';
            const baseDbName = (storageConfig.metadata?.resourceName as string) || '(default)';
            const template = storageConfig.branchingSettings.template || 'db-{identifier}';

            // Note: Firestore (default) database cannot be deleted and has fixed ID.
            // We use the template to create a NEW database for the branch.
            const branchDbName = template
                .replace('{base}', baseDbName === '(default)' ? 'default' : baseDbName)
                .replace('{identifier}', identifier)
                .replace(/[^a-z0-9-]/g, '-')
                .toLowerCase();

            // Validate ID (Firestore IDs must start with letter)
            const finalId = validateDatabaseId(branchDbName) ? branchDbName : `db-${branchDbName}`.substring(0, 63);

            await ensureFirestoreBranch(finalId, region);

            return NextResponse.json({
                success: true,
                databaseName: finalId,
                message: `Ephemeral Firestore database ${finalId} ensured for ${identifier}`
            });
        }

        if (storageConfig.type === 'memorystore-redis') {
            const connectionString = await getSecretValue(storageConfig.connectionStringSecretId!);
            const url = new URL(connectionString);
            let dbIndex = 0;

            if (pullRequestNumber) {
                dbIndex = (pullRequestNumber % 15) + 1;
            } else if (branch) {
                const hash = branch.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
                dbIndex = (hash % 15) + 1;
            }

            return NextResponse.json({
                success: true,
                databaseName: `db-${dbIndex}`,
                message: `Redis DB index ${dbIndex} assigned for ${identifier}`
            });
        }

        return NextResponse.json({
            success: true,
            message: `Branching context established for ${identifier}`
        });

    } catch (error) {
        console.error('Storage branching error:', error);
        return NextResponse.json({ error: 'Failed to provision storage branch' }, { status: 500 });
    }
}
