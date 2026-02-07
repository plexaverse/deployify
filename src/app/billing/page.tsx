'use client';

import { useEffect } from 'react';
import { ArrowLeft, Zap, Server, Wifi, FileText, Loader2 } from 'lucide-react';
import Link from 'next/link';
import Script from 'next/script';
import { PricingCard } from '@/components/billing/PricingCard';
import { ComparePlansTable } from '@/components/billing/ComparePlansTable';
import { Badge } from '@/components/ui/badge';
import { useStore } from '@/store';

declare global {
    interface Window {
        Razorpay: any;
    }
}

const PLANS = [
    {
        id: 'free',
        name: 'Free',
        price: '₹0',
        description: 'Perfect for hobby projects and experiments.',
        features: ['3 Projects', '20 Deployments/mo', '100 Build Minutes/mo', '5 GB Bandwidth/mo'],
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '₹1,500',
        description: 'For professional developers building next-gen apps.',
        features: ['10 Projects', '1,000 Deployments/mo', '1,000 Build Minutes/mo', '100 GB Bandwidth/mo'],
    },
    {
        id: 'team',
        name: 'Team',
        price: '₹5,000',
        description: 'Collaborate with your team to ship faster.',
        features: ['50 Projects', '5,000 Deployments/mo', '5,000 Build Minutes/mo', '500 GB Bandwidth/mo'],
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: '₹15,000',
        description: 'For large scale applications with high volume.',
        features: ['Unlimited Projects', 'Unlimited Deployments', 'Unlimited Build Minutes', 'Unlimited Bandwidth'],
    },
];

export default function BillingPage() {
    const {
        usageData,
        invoices,
        isLoadingBilling,
        billingError,
        upgradingTierId,
        setUpgradingTierId,
        fetchBillingData
    } = useStore();

    useEffect(() => {
        fetchBillingData();
    }, [fetchBillingData]);

    const handleUpgrade = async (tierId: string) => {
        if (tierId === 'free') return; // Free is default

        setUpgradingTierId(tierId);
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

            // Handle redirect if provided (e.g. Stripe or Razorpay Payment Links)
            if (data.url) {
                window.location.href = data.url;
                return;
            }

            // Handle Razorpay Modal
            if (!window.Razorpay) {
                throw new Error('Payment SDK not loaded. Please refresh the page.');
            }

            const options = {
                key: data.keyId,
                amount: data.amount,
                currency: data.currency,
                name: 'Deployify',
                description: `Upgrade to ${tierId} plan`,
                order_id: data.orderId,
                handler: async function (response: any) {
                    try {
                        const verifyRes = await fetch('/api/billing/verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                orderId: response.razorpay_order_id,
                                paymentId: response.razorpay_payment_id,
                                signature: response.razorpay_signature,
                                tierId: tierId // Pass tierId from closure
                            }),
                        });

                        const verifyData = await verifyRes.json();

                        if (verifyRes.ok) {
                            alert('Payment Successful & Verified! Upgrading your plan...');
                            setUpgradingTierId(null);
                            window.location.reload();
                        } else {
                            throw new Error(verifyData.error || 'Payment verification failed');
                        }
                    } catch (err) {
                        console.error('Verification error:', err);
                        alert('Payment successful but verification failed. Please contact support.');
                        setUpgradingTierId(null);
                    }
                },
                modal: {
                    ondismiss: function () {
                        setUpgradingTierId(null);
                    }
                }
            };

            const rzp1 = new window.Razorpay(options);
            rzp1.on('payment.failed', function (response: any) {
                alert(response.error.description);
                setUpgradingTierId(null);
            });
            rzp1.open();

        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Failed to initiate upgrade');
            setUpgradingTierId(null);
        }
    };

    if (isLoadingBilling) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (billingError || !usageData) {
        return (
            <div className="min-h-screen bg-background p-8 flex flex-col items-center justify-center text-center">
                <h1 className="text-2xl font-bold mb-4">Error</h1>
                <p className="text-muted-foreground mb-6">{billingError || 'Something went wrong'}</p>
                <Link href="/dashboard" className="text-primary hover:underline">
                    Back to Dashboard
                </Link>
            </div>
        );
    }

    const { usage, limits, tier } = usageData;

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
        <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] pb-24 relative overflow-hidden">
            <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
            <Script src="https://checkout.razorpay.com/v1/checkout.js" />

            {/* Header */}
            <div className="border-b border-[var(--border)] bg-[var(--background)]/50 backdrop-blur-md sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="p-2 -ml-2 hover:bg-[var(--card-hover)] rounded-full transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-lg font-semibold gradient-text">Billing & Usage</h1>
                    </div>
                    <div className="flex items-center gap-x-2">
                        <span className="text-sm text-[var(--muted-foreground)]">Current Plan:</span>
                        <Badge variant="secondary" className="capitalize bg-[var(--primary)] text-[var(--primary-foreground)]">{tier.name}</Badge>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-6 py-12 space-y-20">

                {/* Usage Section - Kept similar but refined */}
                <section>
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold mb-2 text-[var(--foreground)]">Usage</h2>
                        <p className="text-[var(--muted-foreground)]">Monitor your resource consumption for the current billing cycle.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <UsageGauge
                            icon={<Zap className="w-5 h-5 text-yellow-500" />}
                            title="Deployments"
                            used={usage.deployments}
                            limit={limits.deployments}
                            unit=""
                            percent={getPercent(usage.deployments, limits.deployments)}
                        />
                        <UsageGauge
                            icon={<Server className="w-5 h-5 text-blue-500" />}
                            title="Build Minutes"
                            used={usage.buildMinutes}
                            limit={limits.buildMinutes}
                            unit="min"
                            percent={getPercent(usage.buildMinutes, limits.buildMinutes)}
                        />
                        <UsageGauge
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
                <section id="plans" className="scroll-mt-24">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <h2 className="text-3xl font-bold mb-4 text-[var(--foreground)] tracking-tight">Simple, transparent pricing</h2>
                        <p className="text-lg text-[var(--muted-foreground)]">
                            Choose the plan that fits your needs. Upgrade or downgrade at any time.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 items-start">
                        {PLANS.map((plan) => (
                            <PricingCard
                                key={plan.id}
                                plan={plan}
                                currentPlanId={tier.id}
                                onUpgrade={handleUpgrade}
                                loading={upgradingTierId === plan.id}
                                isPopular={plan.id === 'pro'}
                            />
                        ))}
                    </div>
                </section>

                {/* Comparison Table */}
                <section>
                    <div className="mb-10 text-center">
                        <h2 className="text-2xl font-bold">Compare features</h2>
                    </div>
                    <ComparePlansTable plans={PLANS} currentPlanId={tier.id} />
                </section>

                {/* Invoice History */}
                <section>
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold mb-2 text-[var(--foreground)]">Invoices</h2>
                        <p className="text-[var(--muted-foreground)]">View and download your past invoices.</p>
                    </div>
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[var(--card-hover)] border-b border-[var(--border)]">
                                <tr>
                                    <th className="p-4 font-medium text-[var(--muted-foreground)]">Invoice #</th>
                                    <th className="p-4 font-medium text-[var(--muted-foreground)]">Date</th>
                                    <th className="p-4 font-medium text-[var(--muted-foreground)]">Amount</th>
                                    <th className="p-4 font-medium text-[var(--muted-foreground)]">Status</th>
                                    <th className="p-4 font-medium text-[var(--muted-foreground)] text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {invoices.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                            No invoices found
                                        </td>
                                    </tr>
                                ) : (
                                    invoices.map((invoice) => (
                                        <tr key={invoice.id} className="hover:bg-muted/20 transition-colors">
                                            <td className="p-4 font-medium">{invoice.invoiceNumber}</td>
                                            <td className="p-4">{new Date(invoice.date).toLocaleDateString()}</td>
                                            <td className="p-4">₹{invoice.total.toFixed(2)}</td>
                                            <td className="p-4">
                                                <Badge
                                                    variant="secondary"
                                                    className={
                                                        invoice.status === 'paid'
                                                            ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                                                            : 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
                                                    }
                                                >
                                                    {invoice.status}
                                                </Badge>
                                            </td>
                                            <td className="p-4 text-right">
                                                <a
                                                    href={`/api/billing/invoices/${invoice.id}/download`}
                                                    className="inline-flex items-center gap-2 text-[var(--primary)] hover:underline font-medium"
                                                    download
                                                >
                                                    <FileText className="w-4 h-4" />
                                                    Download
                                                </a>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>
    );
}

function UsageGauge({
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
    const radius = 50;
    const stroke = 8;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (percent / 100) * circumference;

    const formattedUsed = format ? format(used) : used;
    const formattedLimit = limit === Infinity ? 'Unlimited' : (format ? format(limit) : limit);

    return (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 flex flex-col items-center justify-center relative overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
            <div className="absolute top-4 left-4 flex items-center gap-2">
                <div className="p-2 bg-[var(--card-hover)] rounded-md">
                    {icon}
                </div>
                <h3 className="font-medium text-sm text-[var(--muted-foreground)]">{title}</h3>
            </div>

            <div className="mt-8 relative flex items-center justify-center">
                <svg
                    height={radius * 2 + 20}
                    width={radius * 2 + 20}
                    className="transform -rotate-90"
                >
                    <circle
                        stroke="currentColor"
                        fill="transparent"
                        strokeWidth={stroke}
                        strokeDasharray={circumference + ' ' + circumference}
                        style={{ strokeDashoffset: 0 }}
                        r={normalizedRadius}
                        cx={radius + 10}
                        cy={radius + 10}
                        className="text-[var(--border)] opacity-20"
                    />
                    <circle
                        stroke="currentColor"
                        fill="transparent"
                        strokeWidth={stroke}
                        strokeDasharray={circumference + ' ' + circumference}
                        style={{ strokeDashoffset }}
                        r={normalizedRadius}
                        cx={radius + 10}
                        cy={radius + 10}
                        className={`transition-all duration-1000 ease-out ${percent > 90 ? 'text-[var(--error)]' : 'text-[var(--primary)]'}`}
                        strokeLinecap="round"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-bold tracking-tighter text-[var(--foreground)]">{percent}%</span>
                </div>
            </div>

            <div className="mt-4 text-center">
                <div className="text-xl font-bold text-[var(--foreground)]">
                    {formattedUsed} <span className="text-sm text-[var(--muted-foreground)] font-normal">{unit}</span>
                </div>
                <div className="text-xs text-[var(--muted-foreground)] mt-1">
                    of {formattedLimit} {unit && limit !== Infinity ? unit : ''}
                </div>
            </div>
        </div>
    );
}
