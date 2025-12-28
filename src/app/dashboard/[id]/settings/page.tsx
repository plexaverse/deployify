'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { Project, EnvVariable, Domain } from '@/types';
import { EnvVariablesSection } from '@/components/EnvVariablesSection';
import { DomainsSection } from '@/components/DomainsSection';
import { RegionSettings } from '@/components/RegionSettings';

export default function ProjectSettingsPage() {
    const params = useParams();
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [envVariables, setEnvVariables] = useState<EnvVariable[]>([]);
    const [domains, setDomains] = useState<Domain[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchProject = async () => {
        try {
            const response = await fetch(`/api/projects/${params.id}`);

            if (!response.ok) {
                router.push('/dashboard');
                return;
            }

            const data = await response.json();
            setProject(data.project);

            // Fetch env variables separately
            const envResponse = await fetch(`/api/projects/${params.id}/env`);
            if (envResponse.ok) {
                const envData = await envResponse.json();
                setEnvVariables(envData.envVariables || []);
            }

            // Fetch domains separately
            const domainsResponse = await fetch(`/api/projects/${params.id}/domains`);
            if (domainsResponse.ok) {
                const domainsData = await domainsResponse.json();
                setDomains(domainsData.domains || []);
            }
        } catch (error) {
            console.error('Failed to fetch project:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (params.id) {
            fetchProject();
        }
    }, [params.id, router]);

    if (loading) {
        return (
            <div className="p-8">
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--muted-foreground)]" />
                </div>
            </div>
        );
    }

    if (!project) {
        return null;
    }

    return (
        <div className="p-8 max-w-4xl">
            {/* Breadcrumb */}
            <Link
                href={`/dashboard/${project.id}`}
                className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to {project.name}
            </Link>

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold mb-1">Project Settings</h1>
                <p className="text-[var(--muted-foreground)]">
                    Configure settings for {project.name}
                </p>
            </div>

            {/* Domains Section */}
            <DomainsSection
                projectId={project.id}
                initialDomains={domains}
                productionUrl={project.productionUrl}
                onUpdate={fetchProject}
            />

            {/* Environment Variables Section */}
            <div className="mt-8">
                <EnvVariablesSection
                    projectId={project.id}
                    initialEnvVariables={envVariables}
                    onUpdate={fetchProject}
                />
            </div>

            {/* Region Settings */}
            <RegionSettings
                projectId={project.id}
                currentRegion={project.region}
                onUpdate={fetchProject}
            />

            {/* General Settings (can be expanded later) */}
            <div className="card mt-8">
                <h2 className="text-lg font-semibold mb-4">Build Settings</h2>
                <div className="space-y-4">
                    <div className="flex items-center justify-between py-3 border-b border-[var(--border)]">
                        <div>
                            <p className="font-medium">Build Command</p>
                            <p className="text-sm text-[var(--muted-foreground)]">The command to build your project</p>
                        </div>
                        <code className="px-3 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-sm">
                            {project.buildCommand || 'npm run build'}
                        </code>
                    </div>
                    <div className="flex items-center justify-between py-3 border-b border-[var(--border)]">
                        <div>
                            <p className="font-medium">Install Command</p>
                            <p className="text-sm text-[var(--muted-foreground)]">The command to install dependencies</p>
                        </div>
                        <code className="px-3 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-sm">
                            {project.installCommand || 'npm install'}
                        </code>
                    </div>
                    <div className="flex items-center justify-between py-3">
                        <div>
                            <p className="font-medium">Root Directory</p>
                            <p className="text-sm text-[var(--muted-foreground)]">The directory where your code lives</p>
                        </div>
                        <code className="px-3 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-sm">
                            {project.rootDirectory || './'}
                        </code>
                    </div>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="card mt-8 border-red-500/30">
                <h2 className="text-lg font-semibold mb-4 text-red-400">Danger Zone</h2>
                <div className="flex items-center justify-between py-3">
                    <div>
                        <p className="font-medium">Delete Project</p>
                        <p className="text-sm text-[var(--muted-foreground)]">
                            Permanently delete this project and all its deployments
                        </p>
                    </div>
                    <button className="btn border-red-500/50 text-red-400 hover:bg-red-500/10">
                        Delete Project
                    </button>
                </div>
            </div>
        </div>
    );
}
