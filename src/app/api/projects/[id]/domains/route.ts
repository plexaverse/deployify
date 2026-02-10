import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateProject } from '@/lib/db';
import { checkProjectAccess } from '@/middleware/rbac';
import { createDomainMapping, deleteDomainMapping, getDomainMappingStatus, getDnsRecords } from '@/lib/gcp/domains';
import type { Domain, DomainStatus } from '@/types';
import { logAuditEvent } from '@/lib/audit';

// Generate unique ID for domains
function generateDomainId(): string {
    return `dom_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
}

// Validate domain format
function isValidDomain(domain: string): boolean {
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
}

// GET - List all domains for a project
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

        const domains = project.domains || [];

        // Optionally update status of each domain from Cloud Run
        // This is expensive, so we do it on-demand when user views
        const updatedDomains = await Promise.all(
            domains.map(async (domain: Domain) => {
                if (domain.status === 'pending') {
                    const { status } = await getDomainMappingStatus(domain.domain);
                    if (status === 'active') {
                        return { ...domain, status: 'active' as DomainStatus, verifiedAt: new Date() };
                    } else if (status === 'error') {
                        return { ...domain, status: 'error' as DomainStatus };
                    }
                }
                return domain;
            })
        );

        // Update project if any status changed
        const statusChanged = updatedDomains.some(
            (d, i) => d.status !== domains[i].status
        );
        if (statusChanged && updatedDomains.length > 0) {
            await updateProject(id, { domains: updatedDomains });
        }

        return NextResponse.json({ domains: updatedDomains });
    } catch (error) {
        console.error('Failed to get domains:', error);
        return NextResponse.json(
            { error: 'Failed to get domains' },
            { status: 500 }
        );
    }
}

// POST - Add a new domain
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

        if (project.teamId && membership && !['owner', 'admin'].includes(membership.role)) {
             return NextResponse.json(
                { error: 'Only owners and admins can manage domains' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { domain } = body;

        if (!domain || typeof domain !== 'string') {
            return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
        }

        const normalizedDomain = domain.toLowerCase().trim();

        if (!isValidDomain(normalizedDomain)) {
            return NextResponse.json(
                { error: 'Invalid domain format. Example: app.example.com' },
                { status: 400 }
            );
        }

        const domains = project.domains || [];

        // Check for duplicate domain
        if (domains.some((d: Domain) => d.domain === normalizedDomain)) {
            return NextResponse.json(
                { error: `Domain ${normalizedDomain} already exists` },
                { status: 400 }
            );
        }

        // Get the Cloud Run service name
        const serviceName = project.cloudRunServiceId || `dfy-${project.slug}`;

        // Create domain mapping in Cloud Run
        const result = await createDomainMapping(serviceName, normalizedDomain);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || 'Failed to create domain mapping' },
                { status: 500 }
            );
        }

        const newDomain: Domain = {
            id: generateDomainId(),
            domain: normalizedDomain,
            status: 'pending',
            createdAt: new Date(),
        };

        domains.push(newDomain);
        await updateProject(id, { domains });

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'domain.created',
            {
                projectId: project.id,
                domain: normalizedDomain,
                domainId: newDomain.id
            }
        );

        // Get DNS records for the user
        const dnsRecords = getDnsRecords(normalizedDomain);

        return NextResponse.json({
            domain: newDomain,
            dnsRecords,
            message: 'Domain added successfully. Configure the DNS records shown below.',
        });
    } catch (error) {
        console.error('Failed to add domain:', error);
        return NextResponse.json(
            { error: 'Failed to add domain' },
            { status: 500 }
        );
    }
}

// DELETE - Delete a domain
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

        if (project.teamId && membership && !['owner', 'admin'].includes(membership.role)) {
             return NextResponse.json(
                { error: 'Only owners and admins can manage domains' },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const domainId = searchParams.get('domainId');

        if (!domainId) {
            return NextResponse.json({ error: 'Domain ID is required' }, { status: 400 });
        }

        const domains = project.domains || [];
        const domainToDelete = domains.find((d: Domain) => d.id === domainId);

        if (!domainToDelete) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        // Delete domain mapping from Cloud Run
        await deleteDomainMapping(domainToDelete.domain);

        const filteredDomains = domains.filter((d: Domain) => d.id !== domainId);
        await updateProject(id, { domains: filteredDomains });

        await logAuditEvent(
            project.teamId || null,
            session.user.id,
            'domain.deleted',
            {
                projectId: project.id,
                domain: domainToDelete.domain,
                domainId: domainId
            }
        );

        return NextResponse.json({
            message: 'Domain deleted successfully',
        });
    } catch (error) {
        console.error('Failed to delete domain:', error);
        return NextResponse.json(
            { error: 'Failed to delete domain' },
            { status: 500 }
        );
    }
}
