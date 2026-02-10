import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getProjectById, updateProject } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';
import { checkProjectAccess } from '@/middleware/rbac';
import type { EnvVariable, EnvVariableTarget } from '@/types';

// Generate unique ID for env variables
function generateEnvId(): string {
    return `env_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
}

// GET - List all environment variables for a project
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status }
            );
        }

        const { project } = access;

        // Return env variables, masking secret values
        const envVariables = (project.envVariables || []).map((env: EnvVariable) => ({
            ...env,
            value: env.isSecret ? '••••••••' : env.value,
        }));

        return NextResponse.json({ envVariables });
    } catch (error) {
        console.error('Failed to get env variables:', error);
        return NextResponse.json(
            { error: 'Failed to get environment variables' },
            { status: 500 }
        );
    }
}

// POST - Add a new environment variable
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status }
            );
        }

        const { project, membership } = access;

        if (membership && membership.role === 'viewer') {
            return NextResponse.json(
                { error: 'Viewers cannot manage environment variables' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { key, value, isSecret = false, target = 'both', environment = 'all' } = body;

        if (!key || typeof key !== 'string') {
            return NextResponse.json({ error: 'Key is required' }, { status: 400 });
        }

        if (!value || typeof value !== 'string') {
            return NextResponse.json({ error: 'Value is required' }, { status: 400 });
        }

        // Validate key format (uppercase letters, numbers, underscores)
        if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
            return NextResponse.json(
                { error: 'Key must be uppercase and start with a letter (e.g., DATABASE_URL)' },
                { status: 400 }
            );
        }

        const envVariables = project.envVariables || [];

        // Check for duplicate key
        if (envVariables.some((env: EnvVariable) => env.key === key)) {
            return NextResponse.json(
                { error: `Environment variable ${key} already exists` },
                { status: 400 }
            );
        }

        const newEnvVar: EnvVariable = {
            id: generateEnvId(),
            key,
            value,
            isSecret: Boolean(isSecret),
            target: target as EnvVariableTarget,
            environment: environment as 'production' | 'preview' | 'all',
        };

        envVariables.push(newEnvVar);

        await updateProject(id, { envVariables });

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'env_var.created',
            {
                projectId: project.id,
                envVarKey: key,
                envVarId: newEnvVar.id
            },
            project.id
        );

        return NextResponse.json({
            envVariable: {
                ...newEnvVar,
                value: newEnvVar.isSecret ? '••••••••' : newEnvVar.value,
            },
            message: 'Environment variable added successfully',
        });
    } catch (error) {
        console.error('Failed to add env variable:', error);
        return NextResponse.json(
            { error: 'Failed to add environment variable' },
            { status: 500 }
        );
    }
}

// PUT - Update an existing environment variable
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status }
            );
        }

        const { project, membership } = access;

        if (membership && membership.role === 'viewer') {
            return NextResponse.json(
                { error: 'Viewers cannot manage environment variables' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { envId, key, value, isSecret, target, environment } = body;

        if (!envId) {
            return NextResponse.json({ error: 'Environment variable ID is required' }, { status: 400 });
        }

        const envVariables = project.envVariables || [];
        const envIndex = envVariables.findIndex((env: EnvVariable) => env.id === envId);

        if (envIndex === -1) {
            return NextResponse.json({ error: 'Environment variable not found' }, { status: 404 });
        }

        // Update the env variable
        const updatedEnv = { ...envVariables[envIndex] };
        if (key !== undefined) updatedEnv.key = key;
        if (value !== undefined) updatedEnv.value = value;
        if (isSecret !== undefined) updatedEnv.isSecret = Boolean(isSecret);
        if (target !== undefined) updatedEnv.target = target as EnvVariableTarget;
        if (environment !== undefined) updatedEnv.environment = environment as 'production' | 'preview' | 'all';

        envVariables[envIndex] = updatedEnv;

        await updateProject(id, { envVariables });

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'env_var.updated',
            {
                projectId: project.id,
                envVarKey: updatedEnv.key,
                envVarId: updatedEnv.id
            },
            project.id
        );

        return NextResponse.json({
            envVariable: {
                ...updatedEnv,
                value: updatedEnv.isSecret ? '••••••••' : updatedEnv.value,
            },
            message: 'Environment variable updated successfully',
        });
    } catch (error) {
        console.error('Failed to update env variable:', error);
        return NextResponse.json(
            { error: 'Failed to update environment variable' },
            { status: 500 }
        );
    }
}

// DELETE - Delete an environment variable
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const access = await checkProjectAccess(session.user.id, id);

        if (!access.allowed) {
            return NextResponse.json(
                { error: access.error },
                { status: access.status }
            );
        }

        const { project, membership } = access;

        if (membership && membership.role === 'viewer') {
            return NextResponse.json(
                { error: 'Viewers cannot manage environment variables' },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const envId = searchParams.get('envId');

        if (!envId) {
            return NextResponse.json({ error: 'Environment variable ID is required' }, { status: 400 });
        }

        const envVariables = project.envVariables || [];
        const filteredEnvs = envVariables.filter((env: EnvVariable) => env.id !== envId);

        if (filteredEnvs.length === envVariables.length) {
            return NextResponse.json({ error: 'Environment variable not found' }, { status: 404 });
        }

        await updateProject(id, { envVariables: filteredEnvs });

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'env_var.deleted',
            {
                projectId: project.id,
                envVarId: envId
            },
            project.id
        );

        return NextResponse.json({
            message: 'Environment variable deleted successfully',
        });
    } catch (error) {
        console.error('Failed to delete env variable:', error);
        return NextResponse.json(
            { error: 'Failed to delete environment variable' },
            { status: 500 }
        );
    }
}
