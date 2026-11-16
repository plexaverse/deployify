import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateProject } from '@/lib/db';
import { logAuditEvent } from '@/lib/audit';
import { checkProjectAccess } from '@/middleware/rbac';
import { encrypt, decrypt } from '@/lib/crypto';
import { validateConnectionString } from '@/lib/utils';
import {
    isDuplicateEnvKey,
    normalizeEnvDescription,
    resolveEnvValueUpdate,
    validateEnvKey,
} from '@/lib/env-variables';
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

        return NextResponse.json({ success: true, envVariables });
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

        if (access.role === 'viewer') {
            return NextResponse.json(
                { error: 'Forbidden: Viewers cannot manage environment variables' },
                { status: 403 }
            );
        }

        const { project } = access;

        const body = await request.json();
        const { key, value, isSecret = false, target = 'both', environment = 'both', group, description } = body;

        if (!key || typeof key !== 'string') {
            return NextResponse.json({ error: 'Key is required' }, { status: 400 });
        }

        if (!value || typeof value !== 'string') {
            return NextResponse.json({ error: 'Value is required' }, { status: 400 });
        }

        // Validate key format (uppercase letters, numbers, underscores)
        const keyCheck = validateEnvKey(key);
        if (!keyCheck.valid) {
            return NextResponse.json({ error: keyCheck.error }, { status: 400 });
        }

        const descriptionCheck = normalizeEnvDescription(description);
        if (!descriptionCheck.valid) {
            return NextResponse.json({ error: descriptionCheck.error }, { status: 400 });
        }

        // Connection string validation for common keys
        let warning: string | undefined;
        if (key.includes('URL') || key.includes('CONNECTION') || key.includes('DSN') || key.includes('DATABASE')) {
            const validation = validateConnectionString(value);
            if (!validation.valid) {
                warning = validation.error;
            }
        }

        const envVariables = project.envVariables || [];

        // Check for duplicate key
        if (isDuplicateEnvKey(envVariables, key)) {
            return NextResponse.json(
                { error: `Environment variable ${key} already exists` },
                { status: 400 }
            );
        }

        const isEncrypted = Boolean(isSecret);
        const storedValue = isEncrypted ? encrypt(value) : value;

        const newEnvVar: EnvVariable = {
            id: generateEnvId(),
            key,
            value: storedValue,
            isSecret: Boolean(isSecret),
            isEncrypted,
            target: target as EnvVariableTarget,
            environment: environment as 'production' | 'preview' | 'both',
            group: group || 'General',
            // Omitted entirely when blank, so variables without a note stay clean.
            ...(descriptionCheck.value ? { description: descriptionCheck.value } : {}),
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
            }
        );

        return NextResponse.json({
            success: true,
            envVariable: {
                ...newEnvVar,
                value: newEnvVar.isSecret ? '••••••••' : newEnvVar.value,
            },
            message: warning ? `Added with warning: ${warning}` : 'Environment variable added successfully',
            warning
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

        if (access.role === 'viewer') {
            return NextResponse.json(
                { error: 'Forbidden: Viewers cannot manage environment variables' },
                { status: 403 }
            );
        }

        const { project } = access;

        const body = await request.json();
        const { envId, key, value, isSecret, target, environment, group, description } = body;

        if (!envId) {
            return NextResponse.json({ error: 'Environment variable ID is required' }, { status: 400 });
        }

        const envVariables = project.envVariables || [];
        const envIndex = envVariables.findIndex((env: EnvVariable) => env.id === envId);

        if (envIndex === -1) {
            return NextResponse.json({ error: 'Environment variable not found' }, { status: 404 });
        }

        // Absent means "keep the stored value"; present means it must be a string,
        // the same contract POST enforces.
        if (value !== undefined && typeof value !== 'string') {
            return NextResponse.json({ error: 'Value must be a string' }, { status: 400 });
        }

        // Update the env variable
        const updatedEnv = { ...envVariables[envIndex] };
        const wasEncrypted = Boolean(updatedEnv.isEncrypted);

        if (key !== undefined) {
            // A rename goes through the same gate as a create. Without this, an
            // update could introduce a key the deployment pipeline cannot export,
            // or a second variable shadowing an existing name.
            const keyCheck = validateEnvKey(key);
            if (!keyCheck.valid) {
                return NextResponse.json({ error: keyCheck.error }, { status: 400 });
            }
            if (isDuplicateEnvKey(envVariables, key, envId)) {
                return NextResponse.json(
                    { error: `Environment variable ${key} already exists` },
                    { status: 400 }
                );
            }
            updatedEnv.key = key;
        }

        if (description !== undefined) {
            const descriptionCheck = normalizeEnvDescription(description);
            if (!descriptionCheck.valid) {
                return NextResponse.json({ error: descriptionCheck.error }, { status: 400 });
            }
            if (descriptionCheck.value) {
                updatedEnv.description = descriptionCheck.value;
            } else {
                // An empty description clears the note rather than storing ''.
                delete updatedEnv.description;
            }
        }

        if (isSecret !== undefined) {
            updatedEnv.isSecret = Boolean(isSecret);
            updatedEnv.isEncrypted = updatedEnv.isSecret;
        }

        let warning: string | undefined;
        if (value !== undefined) {
            // Connection string validation for common keys
            const keyToValidate = updatedEnv.key || '';
            if (keyToValidate.includes('URL') || keyToValidate.includes('CONNECTION') || keyToValidate.includes('DSN') || keyToValidate.includes('DATABASE')) {
                const validation = validateConnectionString(value);
                if (!validation.valid) {
                    warning = validation.error;
                }
            }
        }

        updatedEnv.value = resolveEnvValueUpdate(
            {
                currentValue: updatedEnv.value,
                wasEncrypted,
                willEncrypt: Boolean(updatedEnv.isEncrypted),
                newValue: value,
            },
            { encrypt, decrypt }
        );

        if (target !== undefined) updatedEnv.target = target as EnvVariableTarget;
        if (environment !== undefined) updatedEnv.environment = environment as 'production' | 'preview' | 'both';
        if (group !== undefined) updatedEnv.group = group;

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
            }
        );

        return NextResponse.json({
            success: true,
            envVariable: {
                ...updatedEnv,
                value: updatedEnv.isSecret ? '••••••••' : updatedEnv.value,
            },
            message: warning ? `Updated with warning: ${warning}` : 'Environment variable updated successfully',
            warning
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

        // Viewers have read-only access. Every other handler in this route already
        // enforces this; DELETE was the one that did not.
        if (access.role === 'viewer') {
            return NextResponse.json(
                { error: 'Forbidden: Viewers cannot delete environment variables' },
                { status: 403 }
            );
        }

        const { project } = access;

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
            }
        );

        return NextResponse.json({
            success: true,
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
