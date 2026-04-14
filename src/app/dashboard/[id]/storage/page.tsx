'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Database } from 'lucide-react';
import { StorageSection } from '@/components/StorageSection';
import { DataLab } from '@/components/DataLab';
import { useStore } from '@/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProjectStoragePage() {
    const params = useParams();
    const {
        currentProject: project,
        isLoadingProject: loading,
        fetchProjectDetails
    } = useStore();

    useEffect(() => {
        if (params.id) {
            fetchProjectDetails(params.id as string);
        }
    }, [params.id, fetchProjectDetails]);

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
                        <div className="space-y-2">
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-8 w-48" />
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    {[1, 2].map((i) => (
                        <Card key={i} className="overflow-hidden p-0">
                            <div className="p-6 flex items-center gap-3">
                                <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                                <div className="space-y-2">
                                    <Skeleton className="h-3 w-24" />
                                    <Skeleton className="h-5 w-40" />
                                </div>
                            </div>
                            <Separator />
                            <div className="p-6">
                                <Skeleton className="h-24 w-full rounded-xl" />
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
                <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--muted)]/10 flex items-center justify-center">
                        <Database className="w-8 h-8 text-[var(--muted-foreground)]" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-[11px] md:text-xs font-bold">Project Not Found</h2>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                            The project you are looking for does not exist or you don&apos;t have access.
                        </p>
                    </div>
                    <Link href="/dashboard">
                        <Button variant="outline" className="text-[10px] font-bold uppercase tracking-wider">
                            Back to Dashboard
                        </Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
            {/* Breadcrumb */}
            <Link
                href={`/dashboard/${project.id}`}
                className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to {project.name}
            </Link>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Database className="w-8 h-8 text-[var(--primary)]" />
                    </div>
                    <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Infrastructure</span>
                        <h1 className="text-[11px] md:text-xs font-bold tracking-tight">Storage & Data</h1>
                    </div>
                </div>
            </div>

            <div className="space-y-8">
                {/* Storage Section */}
                <StorageSection
                    projectId={project.id}
                    projectRegion={project.region}
                    onUpdate={() => fetchProjectDetails(project.id)}
                />

                {/* Data Lab Section (Only show if connectors exist) */}
                {project.storageConfigs && project.storageConfigs.length > 0 && (
                    <DataLab
                        projectId={project.id}
                        connectors={project.storageConfigs}
                    />
                )}
            </div>
        </div>
    );
}
