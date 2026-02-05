'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Zap, Server, Wifi, Check, Loader2 } from 'lucide-react';
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

const PLANS = [
    {
        id: 'free',
        name: 'Free',
        price: '$0',
        description: 'Perfect for hobby projects',
        features: ['3 Projects', '20 Deployments/mo', '100 Build Minutes/mo', '5 GB Bandwidth/mo'],
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '$29',
        description: 'For professional developers',
        features: ['10 Projects', '1,000 Deployments/mo', '1,000 Build Minutes/mo', '100 GB Bandwidth/mo'],
    },
    {
        id: 'team',
        name: 'Team',
        price: '$99',
        description: 'For growing teams',
        features: ['50 Projects', '5,000 Deployments/mo', '5,000 Build Minutes/mo', '500 GB Bandwidth/mo'],
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: 'Custom',
        description: 'For large scale applications',
        features: ['Unlimited Projects', 'Unlimited Deployments', 'Unlimited Build Minutes', 'Unlimited Bandwidth'],
    },
];

export default function BillingPage() {
    const [data, setData] = useState<UsageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [upgrading, setUpgrading] = useState<string | null>(null);

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

    const handleUpgrade = async (tierId: string) => {
        if (tierId === 'free' || tierId === 'enterprise') return; // Enterprise usually contact sales, free is default

        setUpgrading(tierId);
        try {
            const res = await fetch('/api/billing/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tierId }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to create checkout session');
            }

            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error('No checkout URL returned');
            }
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Failed to initiate upgrade');
            setUpgrading(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
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

    const scrollToPlans = () => {
        document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-6 md:p-12">
            <div className="max-w-6xl mx-auto space-y-12">
                <div className="flex items-center gap-4">
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
                    {tier.id !== 'enterprise' && (
                        <button
                            onClick={scrollToPlans}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-lg font-medium transition-colors shadow-lg shadow-primary/20"
                        >
                            Upgrade Plan
                        </button>
                    )}
                </div>

                {/* Usage Section */}
                <section>
                    <h2 className="text-xl font-semibold mb-6">Resource Usage</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                </section>

                {/* Plans Section */}
                <section id="plans">
                    <h2 className="text-xl font-semibold mb-6">Available Plans</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {PLANS.map((plan) => (
                            <div
                                key={plan.id}
                                className={`bg-[var(--card)] border rounded-xl p-6 flex flex-col ${
                                    plan.id === tier.id
                                        ? 'border-primary ring-1 ring-primary relative overflow-hidden'
                                        : 'border-[var(--border)]'
                                }`}
                            >
                                {plan.id === tier.id && (
                                    <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-bl-lg font-medium">
                                        Current
                                    </div>
                                )}

                                <div className="mb-4">
                                    <h3 className="text-lg font-bold">{plan.name}</h3>
                                    <div className="flex items-baseline gap-1 mt-2">
                                        <span className="text-3xl font-bold">{plan.price}</span>
                                        {plan.price !== 'Custom' && <span className="text-[var(--muted-foreground)]">/mo</span>}
                                    </div>
                                    <p className="text-sm text-[var(--muted-foreground)] mt-2 h-10">
                                        {plan.description}
                                    </p>
                                </div>

                                <div className="space-y-3 mb-8 flex-1">
                                    {plan.features.map((feature, i) => (
                                        <div key={i} className="flex items-start gap-2 text-sm">
                                            <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                            <span>{feature}</span>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    onClick={() => handleUpgrade(plan.id)}
                                    disabled={plan.id === tier.id || plan.id === 'free' || plan.id === 'enterprise' || upgrading !== null}
                                    className={`w-full py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                                        plan.id === tier.id
                                            ? 'bg-[var(--muted)] text-[var(--muted-foreground)] cursor-default'
                                            : plan.id === 'enterprise'
                                            ? 'bg-transparent border border-[var(--border)] hover:bg-[var(--muted)]'
                                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                                    }`}
                                >
                                    {upgrading === plan.id && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {plan.id === tier.id
                                        ? 'Current Plan'
                                        : plan.id === 'enterprise'
                                            ? 'Contact Sales'
                                            : 'Upgrade'}
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
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
