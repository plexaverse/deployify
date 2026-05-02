import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { validateConnection } from '@/lib/gcp/storage-validator';
import type { StorageType } from '@/types';

const ALLOWED_PROTOCOLS = ['postgresql:', 'postgres:', 'mysql:', 'mongodb:', 'mongodb+srv:', 'redis:', 'rediss:'];

/**
 * POST - Project-scoped Pre-flight connection validation (Unpersisted)
 * Mitigates SSRF by scoping to project and whitelisting protocols.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: projectId } = await params;
        const body = await request.json();
        const { type, connectionString, metadata } = body;

        if (!type || (!connectionString && type !== 'firestore')) {
            return NextResponse.json({ error: 'Type and connection string are required' }, { status: 400 });
        }

        // Basic SSRF protection: Whitelist protocols
        if (connectionString && !ALLOWED_PROTOCOLS.some(p => connectionString.startsWith(p))) {
            return NextResponse.json({
                error: 'Invalid connection protocol',
                details: 'Connection string must start with an allowed protocol (e.g., postgresql://)'
            }, { status: 400 });
        }

        // Prevent internal network probing
        if (connectionString && (connectionString.includes('169.254.169.254') || connectionString.includes('metadata.google.internal'))) {
             return NextResponse.json({ error: 'Invalid host' }, { status: 400 });
        }

        const result = await validateConnection(
            type as StorageType,
            undefined,
            { ...metadata, rawConnectionString: connectionString, projectId }
        );

        return NextResponse.json({
            success: true,
            valid: result.valid,
            error: result.error,
            latency: result.latency
        });
    } catch (error) {
        console.error('Pre-flight validation failed:', error);
        return NextResponse.json({
            error: 'Validation failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
