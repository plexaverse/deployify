import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { checkProjectAccess } from '@/middleware/rbac';
import { getSecretValue } from '@/lib/gcp/secrets';
import { logAuditEvent } from '@/lib/audit';
import type { StorageConfig } from '@/types';

/**
 * Execute safe database maintenance operations (REINDEX, OPTIMIZE)
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; storageId: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id, storageId } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json({ success: false, error: access.error }, { status: access.status });
        }

        if (access.role === 'viewer') {
            return NextResponse.json({
                success: false,
                error: 'Insufficient permissions to run maintenance'
            }, { status: 403 });
        }

        const { project } = access;
        const storage = project.storageConfigs?.find((s: StorageConfig) => s.id === storageId);

        if (!storage) {
            return NextResponse.json({ success: false, error: 'Storage connector not found' }, { status: 404 });
        }

        const { entity, indexName, command: clientCommand } = await request.json();

        if (!entity) {
            return NextResponse.json({ success: false, error: 'Entity is required' }, { status: 400 });
        }

        const isPostgres = storage.type.includes('postgres') || storage.type === 'supabase' || storage.type === 'neon';

        // Security Hardening: Construct command server-side using strict whitelisting
        let command = '';
        if (isPostgres) {
            if (!indexName) return NextResponse.json({ success: false, error: 'Index name is required for Postgres reindexing' }, { status: 400 });
            // Whitelist: Alpha-numeric and underscores only to prevent injection
            if (!/^[a-zA-Z0-9_]+$/.test(indexName)) return NextResponse.json({ success: false, error: 'Invalid index name' }, { status: 400 });
            command = `REINDEX INDEX "${indexName}";`;
        } else {
            // Whitelist: Alpha-numeric and underscores only to prevent injection
            if (!/^[a-zA-Z0-9_]+$/.test(entity)) return NextResponse.json({ success: false, error: 'Invalid entity name' }, { status: 400 });
            command = `OPTIMIZE TABLE \`${entity}\`;`;
        }

        // Optional: verify that client intended this command type
        if (clientCommand && !command.toUpperCase().startsWith(clientCommand.split(' ')[0].toUpperCase())) {
            return NextResponse.json({ success: false, error: 'Command mismatch' }, { status: 400 });
        }

        if (process.env.MOCK_DB === 'true') {
            await new Promise(resolve => setTimeout(resolve, 1500));
            return NextResponse.json({ success: true, message: 'Maintenance completed (MOCK)', command });
        }

        const connectionString = storage.connectionStringSecretId ? await getSecretValue(storage.connectionStringSecretId) : '';
        if (!connectionString) {
            return NextResponse.json({ success: false, error: 'Connection string not available' }, { status: 400 });
        }

        try {
            if (isPostgres) {
                const { Client } = await import('pg');
                const client = new Client({
                    connectionString,
                    ssl: storage.ssl ? { rejectUnauthorized: false } : false
                });
                await client.connect();
                try {
                    // Postgres REINDEX usually cannot run in a transaction block
                    await client.query(command);
                } finally {
                    await client.end().catch(() => {});
                }
            } else {
                const mysql = await import('mysql2/promise');
                const connection = await mysql.createConnection(connectionString);
                try {
                    await connection.execute(command);
                } finally {
                    await connection.end().catch(() => {});
                }
            }

            await logAuditEvent(
                project.teamId || null,
                session.user.id,
                'storage.maintenance_run',
                {
                    projectId: id,
                    storageId,
                    entity,
                    indexName,
                    command
                }
            );

            return NextResponse.json({ success: true });
        } catch (dbErr) {
            console.error(`[MaintenanceAPI] Execution failed for ${storageId}:`, dbErr);
            return NextResponse.json({
                success: false,
                error: `Database error: ${dbErr instanceof Error ? dbErr.message : 'Unknown error'}`
            }, { status: 500 });
        }
    } catch (error) {
        console.error('Maintenance execution error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
