'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Zap, Server, Wifi } from 'lucide-react';
import Link from 'next/link';

interface UsageData {
    usage: {
        deployments: number;
        buildMinutes: number;
        bandwidth: number;
    };
    limits: {
        deployments: number;
        buildMinutes: number;
        bandwidth: number;
    };
    tier: {
        id: string;
        name: string;
    };
}

export default function BillingPage() {
    const [data, setData] = useState<UsageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/billing/usage')
            .then(res => {
                if (res.status === 401) {
                    window.location.href = '/login';
                    throw new Error('Unauthorized');
                }
                if (!res.ok) throw new Error('Failed to load billing data');
                return res.json();
            })
            .then(data => {
                setData(data);
                setLoading(false);
            })
            .catch(err => {
                if (err.message !== 'Unauthorized') {
                    console.error(err);
                    setError('Failed to load usage data. Please try again later.');
                    setLoading(false);
                }
            });
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error || !data) {
        return (
             <div className="min-h-screen bg-[var(--background)] p-8 flex flex-col items-center justify-center text-center">
                <h1 className="text-2xl font-bold mb-4">Error</h1>
                <p className="text-[var(--muted-foreground)] mb-6">{error || 'Something went wrong'}</p>
                <Link href="/dashboard" className="text-primary hover:underline">
                    Back to Dashboard
                </Link>
            </div>
        );
    }

    const { usage, limits, tier } = data;

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Calculate percentages
    const getPercent = (used: number, limit: number) => {
        if (limit === Infinity) return 0;
        return Math.min(100, Math.round((used / limit) * 100));
    };

    return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-6 md:p-12">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/dashboard" className="p-2 hover:bg-[var(--card)] rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </Link>
                    <h1 className="text-3xl font-bold">Billing & Usage</h1>
                </div>

                {/* Current Plan Card */}
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h2 className="text-lg font-medium text-[var(--muted-foreground)] mb-1">Current Plan</h2>
                        <div className="text-4xl font-bold flex items-center gap-3">
                            {tier.name}
                            <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full border border-primary/30 uppercase tracking-wider font-semibold">
                                Active
                            </span>
                        </div>
                        <p className="text-sm text-[var(--muted-foreground)] mt-2">
                            You are on the {tier.name} plan.
                        </p>
                    </div>
                    <button className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-lg font-medium transition-colors shadow-lg shadow-primary/20">
                        Upgrade Plan
                    </button>
                </div>

                {/* Usage Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                        <h2 className="text-xl font-semibold mb-6">Resource Usage</h2>
                    </div>

                    {/* Deployments */}
                    <UsageCard
                        icon={<Zap className="w-5 h-5 text-yellow-500" />}
                        title="Deployments"
                        used={usage.deployments}
                        limit={limits.deployments}
                        unit=""
                        percent={getPercent(usage.deployments, limits.deployments)}
                    />

                    {/* Build Minutes */}
                    <UsageCard
                        icon={<Server className="w-5 h-5 text-blue-500" />}
                        title="Build Minutes"
                        used={usage.buildMinutes}
                        limit={limits.buildMinutes}
                        unit="min"
                        percent={getPercent(usage.buildMinutes, limits.buildMinutes)}
                    />

                    {/* Bandwidth */}
                    <UsageCard
                        icon={<Wifi className="w-5 h-5 text-green-500" />}
                        title="Bandwidth"
                        used={usage.bandwidth}
                        limit={limits.bandwidth}
                        format={formatBytes}
                        percent={getPercent(usage.bandwidth, limits.bandwidth)}
                    />
                </div>
            </div>
        </div>
    );
}

function UsageCard({
    icon,
    title,
    used,
    limit,
    unit,
    percent,
    format
}: {
    icon: React.ReactNode,
    title: string,
    used: number,
    limit: number,
    unit?: string,
    percent: number,
    format?: (v: number) => string
}) {
    const formattedUsed = format ? format(used) : used;
    const formattedLimit = limit === Infinity ? 'Unlimited' : (format ? format(limit) : limit);

    return (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-[var(--background)] rounded-lg border border-[var(--border)]">
                    {icon}
                </div>
                <h3 className="font-medium">{title}</h3>
            </div>

            <div className="mb-2 flex justify-between items-end">
                <div className="text-2xl font-bold">
                    {formattedUsed} <span className="text-sm text-[var(--muted-foreground)] font-normal">{unit}</span>
                </div>
                <div className="text-sm text-[var(--muted-foreground)]">
                    of {formattedLimit} {unit && limit !== Infinity ? unit : ''}
                </div>
            </div>

            <div className="h-2 w-full bg-[var(--background)] rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${percent > 90 ? 'bg-red-500' : 'bg-primary'}`}
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
}
