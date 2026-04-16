'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Database,
    Activity,
    CheckCircle2,
    AlertCircle,
    Search,
    Loader2,
    Layout,
    ExternalLink,
    Sparkles,
    ShieldCheck,
    ShieldAlert,
    Cpu,
    Filter,
    ArrowUpDown,
    Moon,
    DollarSign
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTeam } from '@/contexts/TeamContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid';
import { NativeSelect } from '@/components/ui/native-select';
import type { Project, StorageConfig } from '@/types';

interface FleetConnector extends StorageConfig {
    projectName: string;
    projectId: string;
}

export default function InfrastructureFleetPage() {
    const [connectors, setConnectors] = useState<FleetConnector[]>([]);
    const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [onlyOptimizable, setOnlyOptimizable] = useState(false);
    const [onlyDormant, setOnlyDormant] = useState(false);
    const [onlyAtRisk, setOnlyAtRisk] = useState(false);
    const { activeTeam, isLoading: isTeamLoading } = useTeam();

    useEffect(() => {
        async function fetchFleet() {
            setLoading(true);
            try {
                let url = '/api/projects';
                let healthUrl = '/api/infrastructure/health';
                if (activeTeam) {
                    url += `?teamId=${activeTeam.id}`;
                    healthUrl += `?teamId=${activeTeam.id}`;
                }

                const [projRes, healthRes] = await Promise.all([
                    fetch(url),
                    fetch(healthUrl)
                ]);

                const data = await projRes.json();
                const healthData = await healthRes.json();

                if (healthData.success) {
                    setSummary(healthData.summary);
                }

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

    const filteredConnectors = useMemo(() => {
        return connectors.filter(c => {
            const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.type.toLowerCase().includes(searchQuery.toLowerCase());

            const health = c.metadata?.health as { status: string } | undefined;
            const status = health?.status || (c.status === 'provisioning' ? 'provisioning' : 'unknown');

            const matchesStatus = statusFilter === 'all' || status === statusFilter;
            const matchesType = typeFilter === 'all' || (
                typeFilter === 'gcp-native' ? ['cloud-sql-postgres', 'cloud-sql-mysql', 'firestore', 'memorystore-redis'].includes(c.type) :
                typeFilter === 'external' ? ['supabase', 'mongodb-atlas', 'planetscale'].includes(c.type) :
                c.type === typeFilter
            );

            const matchesOptimization = !onlyOptimizable || !!c.metadata?.optimization;
            const matchesDormancy = !onlyDormant || !!c.dormancy?.isDormant;
            const matchesRisk = !onlyAtRisk || (((c.metadata?.security as Record<string, unknown>)?.risks as unknown[])?.length > 0);

            return matchesSearch && matchesStatus && matchesType && matchesOptimization && matchesDormancy && matchesRisk;
        });
    }, [connectors, searchQuery, statusFilter, typeFilter, onlyOptimizable, onlyDormant, onlyAtRisk]);

    const stats = useMemo(() => ({
        total: connectors.length,
        healthy: connectors.filter(c => (c.metadata?.health as { status: string })?.status === 'healthy').length,
        degraded: connectors.filter(c => (c.metadata?.health as { status: string })?.status === 'degraded').length,
        unhealthy: connectors.filter(c => (c.metadata?.health as { status: string })?.status === 'unhealthy' || c.status === 'error').length,
        provisioning: connectors.filter(c => c.status === 'provisioning').length,
        optimizations: connectors.filter(c => !!c.metadata?.optimization).length,
        dormant: connectors.filter(c => c.dormancy?.isDormant).length,
        atRisk: connectors.filter(c => (((c.metadata?.security as Record<string, unknown>)?.risks as unknown[])?.length > 0)).length
    }), [connectors]);

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
            <div className="flex flex-col gap-8">
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
                    <div className="flex flex-wrap items-center gap-4">
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
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-4 p-4 border border-[var(--primary)]/10 rounded-2xl bg-[var(--card)]/30">
                    <div className="flex items-center gap-2 px-2 mr-2 border-r border-[var(--primary)]/10">
                        <Filter className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Fleet Filters</span>
                    </div>

                    <div className="flex items-center gap-4 flex-1">
                        <div className="space-y-1.5 min-w-[140px]">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-1">Status</Label>
                            <NativeSelect
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="h-8 text-[10px] uppercase font-bold"
                            >
                                <option value="all">ALL STATUSES</option>
                                <option value="healthy">HEALTHY</option>
                                <option value="degraded">DEGRADED (SLOW)</option>
                                <option value="unhealthy">UNHEALTHY</option>
                                <option value="provisioning">PROVISIONING</option>
                            </NativeSelect>
                        </div>

                        <div className="space-y-1.5 min-w-[160px]">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-1">Storage Type</Label>
                            <NativeSelect
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                className="h-8 text-[10px] uppercase font-bold"
                            >
                                <option value="all">ALL TYPES</option>
                                <optgroup label="CATEGORIES">
                                    <option value="gcp-native">GCP NATIVE</option>
                                    <option value="external">MANAGED EXTERNAL</option>
                                </optgroup>
                                <optgroup label="PROVIDERS">
                                    <option value="cloud-sql-postgres">CLOUD SQL (POSTGRES)</option>
                                    <option value="cloud-sql-mysql">CLOUD SQL (MYSQL)</option>
                                    <option value="firestore">FIRESTORE</option>
                                    <option value="memorystore-redis">MEMORYSTORE (REDIS)</option>
                                    <option value="supabase">SUPABASE</option>
                                    <option value="mongodb-atlas">MONGODB ATLAS</option>
                                    <option value="planetscale">PLANETSCALE</option>
                                </optgroup>
                            </NativeSelect>
                        </div>

                        <div className="flex items-center gap-3 ml-auto pr-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="only-optimizable"
                                    checked={onlyOptimizable}
                                    onChange={(e) => {
                                        setOnlyOptimizable(e.target.checked);
                                        if (e.target.checked) {
                                            setOnlyDormant(false);
                                            setOnlyAtRisk(false);
                                        }
                                    }}
                                    className="w-4 h-4 rounded border-[var(--primary)]/20 text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                                <Label htmlFor="only-optimizable" className="text-[10px] font-bold uppercase tracking-wider cursor-pointer">
                                    Optimizable
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="only-dormant"
                                    checked={onlyDormant}
                                    onChange={(e) => {
                                        setOnlyDormant(e.target.checked);
                                        if (e.target.checked) {
                                            setOnlyOptimizable(false);
                                            setOnlyAtRisk(false);
                                        }
                                    }}
                                    className="w-4 h-4 rounded border-[var(--primary)]/20 text-[var(--primary)] focus:ring-[var(--primary)]"
                                />
                                <Label htmlFor="only-dormant" className="text-[10px] font-bold uppercase tracking-wider cursor-pointer">
                                    Dormant
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="only-at-risk"
                                    checked={onlyAtRisk}
                                    onChange={(e) => {
                                        setOnlyAtRisk(e.target.checked);
                                        if (e.target.checked) {
                                            setOnlyOptimizable(false);
                                            setOnlyDormant(false);
                                        }
                                    }}
                                    className="w-4 h-4 rounded border-[var(--error)]/20 text-[var(--error)] focus:ring-[var(--error)]"
                                />
                                <Label htmlFor="only-at-risk" className="text-[10px] font-bold uppercase tracking-wider cursor-pointer text-[var(--error)]">
                                    At Risk
                                </Label>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setStatusFilter('all');
                                    setTypeFilter('all');
                                    setSearchQuery('');
                                    setOnlyOptimizable(false);
                                    setOnlyDormant(false);
                                    setOnlyAtRisk(false);
                                }}
                                className="h-7 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                            >
                                Reset
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-9 gap-4">
                {[
                    { label: 'Total', value: stats.total, icon: Database, color: 'text-[var(--primary)]', onClick: () => { setStatusFilter('all'); setOnlyOptimizable(false); setOnlyDormant(false); setOnlyAtRisk(false); } },
                    { label: 'Healthy', value: stats.healthy, icon: CheckCircle2, color: 'text-[var(--success)]', onClick: () => { setStatusFilter('healthy'); setOnlyOptimizable(false); setOnlyDormant(false); setOnlyAtRisk(false); } },
                    { label: 'Degraded', value: stats.degraded, icon: Activity, color: 'text-[var(--warning)]', onClick: () => { setStatusFilter('degraded'); setOnlyOptimizable(false); setOnlyDormant(false); setOnlyAtRisk(false); } },
                    { label: 'Unhealthy', value: stats.unhealthy, icon: AlertCircle, color: 'text-[var(--error)]', onClick: () => { setStatusFilter('unhealthy'); setOnlyOptimizable(false); setOnlyDormant(false); setOnlyAtRisk(false); } },
                    { label: 'At Risk', value: stats.atRisk, icon: ShieldAlert, color: 'text-[var(--error)]', onClick: () => { setOnlyAtRisk(true); setOnlyOptimizable(false); setOnlyDormant(false); setStatusFilter('all'); } },
                    { label: 'Building', value: stats.provisioning, icon: Loader2, color: 'text-[var(--info)]', onClick: () => { setStatusFilter('provisioning'); setOnlyOptimizable(false); setOnlyDormant(false); setOnlyAtRisk(false); } },
                    { label: 'Optimizable', value: stats.optimizations, icon: Sparkles, color: 'text-[var(--primary)]', onClick: () => { setOnlyOptimizable(true); setOnlyDormant(false); setOnlyAtRisk(false); setStatusFilter('all'); } },
                    { label: 'Security', value: loading ? '...' : `${summary?.averageSecurityScore || 100}%`, icon: ShieldCheck, color: 'text-[var(--success)]', onClick: () => {} },
                    { label: 'Est. Cost', value: loading ? '...' : `$${summary?.totalEstimatedMonthlyCost || 0}`, icon: DollarSign, color: 'text-[var(--success)]', onClick: () => {} },
                ].map((stat, i) => (
                    <Card
                        key={i}
                        className={cn(
                            "p-4 flex flex-col justify-center border-[var(--primary)]/5 bg-[var(--card)]/50 cursor-pointer transition-all hover:bg-[var(--primary)]/[0.02] hover:border-[var(--primary)]/20 group",
                            ((stat.label === 'Optimizable' && onlyOptimizable) || (stat.label === 'Dormant' && onlyDormant) || (stat.label === 'At Risk' && onlyAtRisk) || (statusFilter === stat.label.toLowerCase())) && "border-[var(--primary)]/30 bg-[var(--primary)]/[0.03]"
                        )}
                        onClick={stat.onClick}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <stat.icon className={cn("w-3 h-3 transition-transform group-hover:scale-110", stat.color)} />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">{stat.label}</span>
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
                        const optimization = connector.metadata?.optimization as { recommendations: unknown[] } | undefined;

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
                                                        } className="text-[10px] font-bold uppercase px-1.5 py-0.5 h-4">
                                                            {status}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-[var(--muted-foreground)]">
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
                                                    <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-1">Provider</span>
                                                    <span className="text-[10px] font-bold uppercase truncate block">{connector.type.replace(/-/g, ' ')}</span>
                                                </div>
                                                <div className="p-2 rounded-lg bg-[var(--muted)]/5 border border-[var(--border)]">
                                                    <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)] mb-1">Region</span>
                                                    <span className="text-[10px] font-bold uppercase truncate block">{(connector.region || (connector.metadata?.region as string) || 'GLOBAL').toUpperCase()}</span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="p-2 rounded-lg bg-[var(--muted)]/10 border border-[var(--primary)]/10 flex items-center justify-between col-span-2">
                                                    <div>
                                                        <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Resource Tier</span>
                                                        <span className="text-[10px] font-mono font-bold text-[var(--primary)]">
                                                            {(connector.metadata?.tier as string) || (connector.metadata?.memorySizeGb ? `${connector.metadata.memorySizeGb}GB` : 'UNMANAGED')}
                                                        </span>
                                                    </div>
                                                    <ArrowUpDown className="w-3.5 h-3.5 text-[var(--primary)]/30" />
                                                </div>
                                                <div className="p-2 rounded-lg bg-[var(--success-bg)]/5 border border-[var(--success)]/10 flex items-center justify-between col-span-2">
                                                    <div>
                                                        <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Monthly Est.</span>
                                                        <div className="flex items-center gap-1">
                                                            <DollarSign className="w-2.5 h-2.5 text-[var(--success)]" />
                                                            <span className="text-[10px] font-mono font-bold text-[var(--success)]">
                                                                {(() => {
                                                                    // Define a simple version here for client-side to avoid require/import issues
                                                                    const type = connector.type;
                                                                    const tier = (connector.metadata?.tier as string) || (type.includes('cloud-sql') ? 'db-f1-micro' : (type === 'memorystore-redis' ? '1GB' : ''));
                                                                    const diskSizeGb = (connector.metadata?.diskSizeGb as number) || (connector.metadata?.memorySizeGb as number);
                                                                    const isHA = !!connector.metadata?.highAvailability;

                                                                    let cost = 0;
                                                                    if (type.includes('cloud-sql')) {
                                                                        const computeCosts: Record<string, number> = { 'db-f1-micro': 9.50, 'db-g1-small': 25.50, 'db-custom-1-3840': 52.00, 'db-custom-2-7680': 104.00, 'db-custom-4-15360': 208.00 };
                                                                        cost = computeCosts[tier] || computeCosts['db-f1-micro'];
                                                                        if (diskSizeGb) cost += diskSizeGb * 0.17;
                                                                        if (isHA) cost *= 2;
                                                                    } else if (type === 'memorystore-redis') {
                                                                        const sizeGb = parseInt(tier) || 1;
                                                                        cost = sizeGb * (isHA ? 72.00 : 36.00);
                                                                    } else if (['supabase', 'mongodb-atlas', 'planetscale'].includes(type)) {
                                                                        if (tier === 'PRO') cost = 25;
                                                                    }
                                                                    return cost.toFixed(2);
                                                                })()}
                                                            </span>
                                                        </div>
                                                    </div>
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
                                                    {connector.dormancy?.isDormant && (
                                                        <div className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
                                                            <Moon className="w-3 h-3" />
                                                            <span className="text-[10px] font-bold uppercase">Idl</span>
                                                        </div>
                                                    )}
                                                    {(((connector.metadata?.security as Record<string, unknown>)?.risks as unknown[])?.length > 0) && (
                                                        <div className="flex items-center gap-1.5 text-[var(--error)]">
                                                            <ShieldAlert className="w-3 h-3" />
                                                            <span className="text-[10px] font-bold uppercase">Risk</span>
                                                        </div>
                                                    )}
                                                    {(((connector.metadata?.security as Record<string, unknown>)?.score as number) >= 90) && (
                                                        <div className="flex items-center gap-1.5 text-[var(--success)]">
                                                            <ShieldCheck className="w-3 h-3" />
                                                            <span className="text-[10px] font-bold uppercase">Safe</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {health?.latency && (
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Latency</span>
                                                        <span className={cn(
                                                            "text-[10px] font-mono font-bold",
                                                            status === 'healthy' ? "text-[var(--success)]" : "text-[var(--warning)]"
                                                        )}>{health.latency}ms</span>
                                                    </div>
                                                )}
                                                {health?.baselineLatency && (
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Baseline</span>
                                                        <span className="text-[10px] font-mono font-bold opacity-60">{health.baselineLatency}ms</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-[10px] font-bold uppercase text-[var(--muted-foreground)]">Environment</span>
                                                <span className="text-[10px] font-bold uppercase">{connector.environment}</span>
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
