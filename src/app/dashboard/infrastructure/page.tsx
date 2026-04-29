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
    DollarSign,
    Zap,
    X,
    Download,
    TrendingUp,
    History as HistoryIcon,
    ArrowRight
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
import { ProximityMatrix, RegionalProximityMapping } from '@/components/ProximityMatrix';
import type { Project, StorageConfig } from '@/types';

interface FleetConnector extends StorageConfig {
    projectName: string;
    projectId: string;
}

export default function InfrastructureFleetPage() {
    const [connectors, setConnectors] = useState<FleetConnector[]>([]);
    const [mappings, setMappings] = useState<RegionalProximityMapping[]>([]);
    const [summary, setSummary] = useState<{
        averageEfficiencyScore?: number;
        averageSecurityScore?: number;
        totalEstimatedMonthlyCost?: number;
        totalPotentialSavings?: number;
        totalProjects?: number;
        totalRisks?: number;
        totalConnectors?: number;
        costForecast?: { month: string; cost: number }[];
        totalForecastedCost3m?: number;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [showComplianceReport, setShowComplianceReport] = useState(false);
    const [onlyOptimizable, setOnlyOptimizable] = useState(false);
    const [onlyDormant, setOnlyDormant] = useState(false);
    const [onlyAtRisk, setOnlyAtRisk] = useState(false);
    const [onlyUpcomingMaint, setOnlyUpcomingMaint] = useState(false);
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
                    setMappings(healthData.regionalMappings || []);
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
            const matchesMaint = !onlyUpcomingMaint || !!c.metadata?.maintenanceRecommendation;

            return matchesSearch && matchesStatus && matchesType && matchesOptimization && matchesDormancy && matchesRisk && matchesMaint;
        });
    }, [connectors, searchQuery, statusFilter, typeFilter, onlyOptimizable, onlyDormant, onlyAtRisk, onlyUpcomingMaint]);

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
                className="inline-flex items-center gap-2 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
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
                            <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Global Fleet</span>
                            <h1 className="text-[8px] md:text-[10px] font-bold tracking-tight">Infrastructure Intelligence</h1>
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
                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Fleet Filters</span>
                    </div>

                    <div className="flex items-center gap-4 flex-1">
                        <div className="space-y-1.5 min-w-[140px]">
                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-1">Status</Label>
                            <NativeSelect
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="h-8 text-[8px] uppercase font-bold"
                            >
                                <option value="all">ALL STATUSES</option>
                                <option value="healthy">HEALTHY</option>
                                <option value="degraded">DEGRADED (SLOW)</option>
                                <option value="unhealthy">UNHEALTHY</option>
                                <option value="provisioning">PROVISIONING</option>
                            </NativeSelect>
                        </div>

                        <div className="space-y-1.5 min-w-[160px]">
                            <Label className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] ml-1">Storage Type</Label>
                            <NativeSelect
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                className="h-8 text-[8px] uppercase font-bold"
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
                                <Label htmlFor="only-optimizable" className="text-[8px] font-bold uppercase tracking-wider cursor-pointer">
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
                                <Label htmlFor="only-dormant" className="text-[8px] font-bold uppercase tracking-wider cursor-pointer">
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
                                <Label htmlFor="only-at-risk" className="text-[8px] font-bold uppercase tracking-wider cursor-pointer text-[var(--error)]">
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
                                    setOnlyUpcomingMaint(false);
                                }}
                                className="h-7 text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                            >
                                Reset
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Maintenance Visibility (Phase 118) */}
                <div className="flex flex-wrap items-center gap-3">
                    {connectors.filter(c => c.metadata?.maintenanceRecommendation).length > 0 && (
                        <div
                            onClick={() => setOnlyUpcomingMaint(!onlyUpcomingMaint)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-all",
                                onlyUpcomingMaint ? "bg-[var(--primary)]/10 border-[var(--primary)] text-[var(--primary)]" : "bg-[var(--muted)]/5 border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/30"
                            )}
                        >
                            <HistoryIcon className="w-3 h-3" />
                            <span className="text-[8px] font-bold uppercase tracking-wider">Show Maintenance Recommendations</span>
                            <Badge variant="outline" className="h-4 px-1 text-[8px] font-mono">{connectors.filter(c => c.metadata?.maintenanceRecommendation).length}</Badge>
                        </div>
                    )}
                </div>
            </div>

            {/* Proximity Matrix Section */}
            <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                <ProximityMatrix mappings={mappings} />
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
                    { label: 'Efficiency', value: loading ? '...' : `${String(summary?.averageEfficiencyScore || 0)}%`, icon: Zap, color: 'text-[var(--warning)]', onClick: () => { setOnlyOptimizable(true); } },
                    { label: 'Security', value: loading ? '...' : `${String(summary?.averageSecurityScore || 100)}%`, icon: ShieldCheck, color: 'text-[var(--success)]', onClick: () => setShowComplianceReport(true) },
                    { label: 'Est. Cost', value: loading ? '...' : `$${String(summary?.totalEstimatedMonthlyCost || 0)}`, icon: DollarSign, color: 'text-[var(--success)]', onClick: () => {}, subValue: (summary?.totalPotentialSavings as number) > 0 ? `-$${summary?.totalPotentialSavings} SAVINGS` : undefined },
                    { label: '3M Forecast', value: loading ? '...' : `$${String(summary?.totalForecastedCost3m || 0)}`, icon: TrendingUp, color: 'text-[var(--primary)]', onClick: () => {} },
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
                            <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">{stat.label}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[10px] font-bold">{loading ? '...' : stat.value}</span>
                            {'subValue' in stat && stat.subValue && !loading && (
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--success)] animate-pulse truncate whitespace-nowrap">{stat.subValue}</span>
                            )}
                        </div>
                    </Card>
                ))}
            </div>

            {/* Compliance Report Modal */}
            {showComplianceReport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--background)]/80 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--muted)]/5">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                                    <ShieldCheck className="w-4 h-4 text-[var(--primary)]" />
                                </div>
                                <div>
                                    <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Workspace Governance</span>
                                    <h3 className="text-[10px] font-bold">Compliance Report</h3>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setShowComplianceReport(false)} className="h-8 w-8">
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]/5">
                                    <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)] mb-1">Avg Score</span>
                                    <span className="text-[10px] font-bold text-[var(--primary)]">{String(summary?.averageSecurityScore || 0)}%</span>
                                </div>
                                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]/5">
                                    <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)] mb-1">Total Risks</span>
                                    <span className="text-[10px] font-bold text-[var(--error)]">{String(summary?.totalRisks || 0)}</span>
                                </div>
                                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]/5">
                                    <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)] mb-1">Projects</span>
                                    <span className="text-[10px] font-bold">{String(summary?.totalProjects || 0)}</span>
                                </div>
                                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]/5">
                                    <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)] mb-1">Connectors</span>
                                    <span className="text-[10px] font-bold">{String(summary?.totalConnectors || 0)}</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] border-b border-[var(--border)] pb-2">Project Breakdown</h4>
                                <div className="space-y-2">
                                    {connectors.reduce((acc, c) => {
                                        const proj = acc.find(p => p.id === c.projectId);
                                        if (proj) proj.connectors.push(c);
                                        else acc.push({ id: c.projectId, name: c.projectName, connectors: [c] });
                                        return acc;
                                    }, [] as { id: string, name: string, connectors: FleetConnector[] }[]).map(project => (
                                        <div key={project.id} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--background)]">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-[10px] font-bold">{project.name}</span>
                                                <Badge variant="outline" className="text-[8px] font-bold">{project.connectors.length} CONNECTORS</Badge>
                                            </div>
                                            <div className="space-y-2">
                                                {project.connectors.map((c: FleetConnector) => {
                                                    const security = (c.metadata?.security as { score: number, risks: unknown[] } | undefined) || { score: 100, risks: [] };
                                                    return (
                                                        <div key={c.id} className="flex items-center justify-between p-2 rounded bg-[var(--muted)]/5 text-[8px]">
                                                            <div className="flex items-center gap-3">
                                                                <span className="font-bold">{c.name}</span>
                                                                <span className="text-[var(--muted-foreground)] uppercase">{c.type}</span>
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-[var(--muted-foreground)]">SCORE:</span>
                                                                    <span className={cn(
                                                                        "font-bold",
                                                                        security.score >= 90 ? "text-[var(--success)]" : security.score >= 70 ? "text-[var(--warning)]" : "text-[var(--error)]"
                                                                    )}>{security.score}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-[var(--muted-foreground)]">RISKS:</span>
                                                                    <span className={cn(
                                                                        "font-bold",
                                                                        security.risks.length > 0 ? "text-[var(--error)]" : "text-[var(--success)]"
                                                                    )}>{security.risks.length}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-[var(--muted)]/5 border-t border-[var(--border)] flex justify-end">
                            <Button
                                onClick={() => {
                                    const blob = new Blob([JSON.stringify({ summary, connectors }, null, 2)], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `compliance-report-${new Date().toISOString().split('T')[0]}.json`;
                                    a.click();
                                }}
                                className="text-[8px] font-bold uppercase tracking-wider bg-[var(--primary)]"
                            >
                                <Download className="w-3.5 h-3.5 mr-2" />
                                Export JSON Report
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Cost Forecast Chart Section */}
            {summary?.costForecast && summary.costForecast.length > 0 && (
                <Card className="p-6 border-[var(--primary)]/10 bg-[var(--card)]/50">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                                <TrendingUp className="w-4 h-4 text-[var(--primary)]" />
                            </div>
                            <div>
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Financial Intelligence</span>
                                <h3 className="text-[10px] font-bold">3-Month Cost Projection</h3>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Projected Growth</span>
                            <div className="flex items-center gap-1.5 text-[var(--success)]">
                                <Zap className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold">+5% MONTHLY</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-48 flex items-end gap-4 px-4">
                        {summary.costForecast.map((f, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                                <div className="w-full bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded-t-xl transition-all group-hover:bg-[var(--primary)]/20 relative"
                                     style={{ height: `${(f.cost / (summary.totalForecastedCost3m || 1)) * 250}%` }}>
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                        <span className="text-[8px] font-mono font-bold bg-[var(--popover)] border border-[var(--border)] px-2 py-1 rounded shadow-xl">
                                            ${f.cost.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                                <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">{f.month}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

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
                        <h2 className="text-[10px] font-bold">No Connectors Found</h2>
                        <p className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] max-w-xs mx-auto leading-relaxed">
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
                                                        <h3 className="text-[10px] font-bold tracking-tight truncate max-w-[140px]">{connector.name}</h3>
                                                        <Badge variant={
                                                            status === 'healthy' ? 'success' :
                                                            status === 'degraded' ? 'warning' :
                                                            status === 'provisioning' ? 'secondary' : 'destructive'
                                                        } className="text-[8px] font-bold uppercase px-1.5 py-0.5 h-4">
                                                            {status}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-[8px] font-bold uppercase text-[var(--muted-foreground)]">
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
                                                    <span className="text-[8px] font-bold uppercase truncate block">{connector.type.replace(/-/g, ' ')}</span>
                                                </div>
                                                <div className="p-2 rounded-lg bg-[var(--muted)]/5 border border-[var(--border)]">
                                                    <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)] mb-1">Region</span>
                                                    <span className="text-[8px] font-bold uppercase truncate block">{(connector.region || (connector.metadata?.region as string) || 'GLOBAL').toUpperCase()}</span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="p-2 rounded-lg bg-[var(--muted)]/10 border border-[var(--primary)]/10 flex items-center justify-between col-span-2">
                                                    <div>
                                                        <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Resource Tier</span>
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-[8px] font-mono font-bold text-[var(--primary)]">
                                                                {(connector.metadata?.tier as string) || (connector.metadata?.memorySizeGb ? `${connector.metadata.memorySizeGb}GB` : 'UNMANAGED')}
                                                            </span>
                                                            {connector.metadata?.efficiencyScore !== undefined && (
                                                                <span className={cn(
                                                                    "text-[8px] font-bold px-1 rounded-sm",
                                                                    (connector.metadata.efficiencyScore as number) >= 80 ? "bg-[var(--success)]/10 text-[var(--success)]" :
                                                                    (connector.metadata.efficiencyScore as number) >= 50 ? "bg-[var(--warning)]/10 text-[var(--warning)]" :
                                                                    "bg-[var(--error)]/10 text-[var(--error)]"
                                                                )}>
                                                                    {String(connector.metadata.efficiencyScore || 0)}% EFF
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <ArrowUpDown className="w-3.5 h-3.5 text-[var(--primary)]/30" />
                                                </div>
                                                <div className="p-2 rounded-lg bg-[var(--success-bg)]/5 border border-[var(--success)]/10 flex items-center justify-between col-span-2">
                                                    <div>
                                                        <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Monthly Est.</span>
                                                        <div className="flex items-center gap-1">
                                                            <DollarSign className="w-2.5 h-2.5 text-[var(--success)]" />
                                                            <span className="text-[8px] font-mono font-bold text-[var(--success)]">
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
                                                        <span className="text-[8px] font-mono font-bold">ACTV</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <ShieldCheck className="w-3 h-3 text-[var(--success)]" />
                                                        <span className="text-[8px] font-mono font-bold">SEC</span>
                                                    </div>
                                                    {optimization && (
                                                        <div className="flex items-center gap-1.5 animate-pulse">
                                                            <Sparkles className="w-3 h-3 text-[var(--primary)]" />
                                                            <span className="text-[8px] font-bold uppercase text-[var(--primary)]">Opt</span>
                                                        </div>
                                                    )}
                                                    {connector.dormancy?.isDormant && (
                                                        <div className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
                                                            <Moon className="w-3 h-3" />
                                                            <span className="text-[8px] font-bold uppercase">Idl</span>
                                                        </div>
                                                    )}
                                                    {(((connector.metadata?.security as Record<string, unknown>)?.risks as unknown[])?.length > 0) && (
                                                        <div className="flex items-center gap-1.5 text-[var(--error)]">
                                                            <ShieldAlert className="w-3 h-3" />
                                                            <span className="text-[8px] font-bold uppercase">Risk</span>
                                                        </div>
                                                    )}
                                                    {(((connector.metadata?.security as Record<string, unknown>)?.score as number) >= 90) && (
                                                        <div className="flex items-center gap-1.5 text-[var(--success)]">
                                                            <ShieldCheck className="w-3 h-3" />
                                                            <span className="text-[8px] font-bold uppercase">Safe</span>
                                                        </div>
                                                    )}

                                                {/* Phase 101: Workload Profile & Saturation */}
                                                {connector.workloadProfile && (
                                                    <div className={cn(
                                                        "flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm border",
                                                        connector.workloadProfile.type === 'COMPUTE_INTENSIVE' ? "border-[var(--error)]/20 text-[var(--error)] bg-[var(--error)]/5" :
                                                        connector.workloadProfile.type === 'READ_HEAVY' ? "border-[var(--primary)]/20 text-[var(--primary)] bg-[var(--primary)]/5" :
                                                        connector.workloadProfile.type === 'WRITE_HEAVY' ? "border-[var(--warning)]/20 text-[var(--warning)] bg-[var(--warning)]/5" :
                                                        "border-[var(--success)]/20 text-[var(--success)] bg-[var(--success)]/5"
                                                    )}>
                                                        <Zap className="w-2.5 h-2.5" />
                                                        <span className="text-[8px] font-bold uppercase">{connector.workloadProfile.type}</span>
                                                    </div>
                                                )}
                                                {connector.connectionSaturation !== undefined && connector.connectionSaturation > 50 && (
                                                    <div className="flex items-center gap-1.5 text-[var(--warning)] animate-pulse">
                                                        <Activity className="w-2.5 h-2.5" />
                                                        <span className="text-[8px] font-bold uppercase">{String(connector.connectionSaturation)}% SAT</span>
                                                    </div>
                                                )}
                                                {(connector.metadata?.health as { isColdStart?: boolean })?.isColdStart && (
                                                    <div className="flex items-center gap-1.5 text-[var(--warning)]">
                                                        <Zap className="w-2.5 h-2.5" />
                                                        <span className="text-[8px] font-bold uppercase">COLD</span>
                                                    </div>
                                                )}
                                                {connector.labelingStatus === 'SYNCED' && (
                                                    <div className="flex items-center gap-1.5 text-[var(--success)]/60">
                                                        <ShieldCheck className="w-2.5 h-2.5" />
                                                        <span className="text-[8px] font-bold uppercase">LBLD</span>
                                                    </div>
                                                )}
                                                {connector.type.includes('cloud-sql') && (
                                                    <div className="flex items-center gap-1.5 text-[var(--success)]">
                                                        <ShieldCheck className="w-2.5 h-2.5" />
                                                        <span className="text-[8px] font-bold uppercase">LOCK</span>
                                                    </div>
                                                )}
                                                {!!connector.metadata?.readyForCutover && !connector.metadata?.cutoverComplete && (
                                                    <div className="flex items-center gap-1.5 text-[var(--primary)] animate-pulse">
                                                        <ArrowRight className="w-2.5 h-2.5" />
                                                        <span className="text-[8px] font-bold uppercase">READY</span>
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
                                                            "text-[8px] font-mono font-bold",
                                                            status === 'healthy' ? "text-[var(--success)]" : "text-[var(--warning)]"
                                                        )}>{health.latency}ms</span>
                                                    </div>
                                                )}
                                                {health?.baselineLatency && (
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Baseline</span>
                                                        <span className="text-[8px] font-mono font-bold opacity-60">{health.baselineLatency}ms</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-[8px] font-bold uppercase text-[var(--muted-foreground)]">Environment</span>
                                                <span className="text-[8px] font-bold uppercase">{connector.environment}</span>
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
