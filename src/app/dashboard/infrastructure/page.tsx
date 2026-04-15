'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Database,
    Activity,
    CheckCircle2,
    AlertCircle,
    Zap,
    TrendingUp,
    Search,
    Loader2,
    Layout,
    ExternalLink,
    Sparkles,
    ShieldCheck,
    Cpu,
    HardDrive
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeam } from '@/contexts/TeamContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import type { Project, StorageConfig } from '@/types';

interface FleetConnector extends StorageConfig {
    projectName: string;
    projectId: string;
}

export default function InfrastructureFleetPage() {
    const [connectors, setConnectors] = useState<FleetConnector[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const { activeTeam, isLoading: isTeamLoading } = useTeam();

    useEffect(() => {
        async function fetchFleet() {
            setLoading(true);
            try {
                let url = '/api/projects';
                if (activeTeam) {
                    url += `?teamId=${activeTeam.id}`;
                }
                const response = await fetch(url);
                const data = await response.json();

                const projects: Project[] = data.projects || [];
                const allConnectors: FleetConnector[] = [];

                projects.forEach(project => {
                    const configs = project.storageConfigs || [];
                    configs.forEach(config => {
                        allConnectors.push({
                            ...config,
                            projectName: project.name,
                            projectId: project.id
                        });
                    });
                });

                setConnectors(allConnectors.sort((a, b) => {
                    const statusOrder: Record<string, number> = { 'error': 0, 'unhealthy': 1, 'degraded': 2, 'provisioning': 3, 'active': 4, 'healthy': 4 };
                    const statusA = (a.metadata?.health as { status: string })?.status || a.status;
                    const statusB = (b.metadata?.health as { status: string })?.status || b.status;
                    return (statusOrder[statusA] ?? 99) - (statusOrder[statusB] ?? 99);
                }));
            } catch (error) {
                console.error('Failed to fetch infrastructure fleet:', error);
            } finally {
                setLoading(false);
            }
        }

        if (!isTeamLoading) {
            fetchFleet();
        }
    }, [activeTeam, isTeamLoading]);

    const filteredConnectors = connectors.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.type.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const stats = {
        total: connectors.length,
        healthy: connectors.filter(c => (c.metadata?.health as { status: string })?.status === 'healthy').length,
        degraded: connectors.filter(c => (c.metadata?.health as { status: string })?.status === 'degraded').length,
        unhealthy: connectors.filter(c => (c.metadata?.health as { status: string })?.status === 'unhealthy' || c.status === 'error').length,
        provisioning: connectors.filter(c => c.status === 'provisioning').length,
        optimizations: connectors.filter(c => !!c.metadata?.optimization).length
    };

    return (
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
            {/* Breadcrumb */}
            <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
            </Link>

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Activity className="w-8 h-8 text-[var(--primary)]" />
                    </div>
                    <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Global Fleet</span>
                        <h1 className="text-[11px] md:text-xs font-bold tracking-tight">Infrastructure Intelligence</h1>
                    </div>
                </div>
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)] pointer-events-none" />
                    <Input
                        type="text"
                        placeholder="SEARCH CONNECTORS..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4"
                    />
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                    { label: 'Total', value: stats.total, icon: Database, color: 'text-[var(--primary)]' },
                    { label: 'Healthy', value: stats.healthy, icon: CheckCircle2, color: 'text-[var(--success)]' },
                    { label: 'Degraded', value: stats.degraded, icon: Activity, color: 'text-[var(--warning)]' },
                    { label: 'Unhealthy', value: stats.unhealthy, icon: AlertCircle, color: 'text-[var(--error)]' },
                    { label: 'Building', value: stats.provisioning, icon: Loader2, color: 'text-[var(--info)]' },
                    { label: 'Optimizable', value: stats.optimizations, icon: Sparkles, color: 'text-[var(--primary)]' },
                ].map((stat, i) => (
                    <Card key={i} className="p-4 flex flex-col justify-center border-[var(--primary)]/5 bg-[var(--card)]/50">
                        <div className="flex items-center gap-2 mb-1">
                            <stat.icon className={cn("w-3 h-3", stat.color)} />
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">{stat.label}</span>
                        </div>
                        <span className="text-xs font-bold">{loading ? '...' : stat.value}</span>
                    </Card>
                ))}
            </div>

            {/* Fleet Grid */}
            {loading ? (
                <BentoGrid>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <BentoGridItem
                            key={i}
                            header={<Skeleton className="h-40 w-full rounded-xl" />}
                            className="min-h-[10rem]"
                        />
                    ))}
                </BentoGrid>
            ) : filteredConnectors.length === 0 ? (
                <div className="py-20 text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--muted)]/10 flex items-center justify-center mx-auto">
                        <Database className="w-8 h-8 text-[var(--muted-foreground)]" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xs font-bold">No Connectors Found</h2>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] max-w-xs mx-auto leading-relaxed">
                            {searchQuery ? `No managed connectors match "${searchQuery}"` : "You haven't connected any databases to your projects yet."}
                        </p>
                    </div>
                </div>
            ) : (
                <BentoGrid>
                    {filteredConnectors.map((connector) => {
                        const health = connector.metadata?.health as { status: string; latency: number; baselineLatency?: number } | undefined;
                        const status = health?.status || (connector.status === 'provisioning' ? 'provisioning' : 'unknown');
                        const optimization = connector.metadata?.optimization as { recommendations: any[] } | undefined;

                        return (
                            <BentoGridItem
                                key={connector.id}
                                className="group relative border-[var(--primary)]/10"
                                header={
                                    <div className="p-5 h-full flex flex-col justify-between space-y-4">
                                        <div className="space-y-3">
                                            <div className="flex items-start justify-between">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="text-xs font-bold tracking-tight truncate max-w-[140px]">{connector.name}</h3>
                                                        <Badge variant={
                                                            status === 'healthy' ? 'success' :
                                                            status === 'degraded' ? 'warning' :
                                                            status === 'provisioning' ? 'secondary' : 'destructive'
                                                        } className="text-[8px] font-bold uppercase px-1 py-0 h-4">
                                                            {status}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[9px] font-bold uppercase text-[var(--muted-foreground)]">
                                                        <Layout className="w-3 h-3" />
                                                        <span className="truncate max-w-[120px]">{connector.projectName}</span>
                                                    </div>
                                                </div>
                                                <Link href={`/dashboard/${connector.projectId}/storage`}>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </Button>
                                                </Link>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="p-2 rounded-lg bg-[var(--muted)]/5 border border-[var(--border)]">
                                                    <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)] mb-1">Provider</span>
                                                    <span className="text-[9px] font-bold uppercase truncate block">{connector.type.replace(/-/g, ' ')}</span>
                                                </div>
                                                <div className="p-2 rounded-lg bg-[var(--muted)]/5 border border-[var(--border)]">
                                                    <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)] mb-1">Region</span>
                                                    <span className="text-[9px] font-bold uppercase truncate block">{(connector.region || (connector.metadata?.region as string) || 'GLOBAL').toUpperCase()}</span>
                                                </div>
                                            </div>

                                            {!!connector.metadata?.provisioned && (
                                                <div className="flex items-center gap-4 pt-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <Cpu className="w-3 h-3 text-[var(--primary)]" />
                                                        <span className="text-[10px] font-mono font-bold">ACTV</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <ShieldCheck className="w-3 h-3 text-[var(--success)]" />
                                                        <span className="text-[10px] font-mono font-bold">SEC</span>
                                                    </div>
                                                    {optimization && (
                                                        <div className="flex items-center gap-1.5 animate-pulse">
                                                            <Sparkles className="w-3 h-3 text-[var(--primary)]" />
                                                            <span className="text-[10px] font-bold uppercase text-[var(--primary)]">Opt</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {health?.latency && (
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Latency</span>
                                                        <span className={cn(
                                                            "text-[10px] font-mono font-bold",
                                                            status === 'healthy' ? "text-[var(--success)]" : "text-[var(--warning)]"
                                                        )}>{health.latency}ms</span>
                                                    </div>
                                                )}
                                                {health?.baselineLatency && (
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Baseline</span>
                                                        <span className="text-[10px] font-mono font-bold opacity-60">{health.baselineLatency}ms</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Environment</span>
                                                <span className="text-[9px] font-bold uppercase">{connector.environment}</span>
                                            </div>
                                        </div>
                                    </div>
                                }
                            />
                        );
                    })}
                </BentoGrid>
            )}
        </div>
    );
}
