'use client';

import { useEffect } from 'react';
import { ArrowLeft, Zap, Server, Wifi, FileText, Loader2 } from 'lucide-react';
import Link from 'next/link';
import Script from 'next/script';
import { PricingCard } from '@/components/billing/PricingCard';
import { ComparePlansTable } from '@/components/billing/ComparePlansTable';
import { UsageGauge } from '@/components/billing/UsageGauge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { useStore } from '@/store';
import { cn } from '@/lib/utils';

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
            <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    if (billingError || !usageData) {
        return (
            <div className="min-h-screen bg-[var(--background)] p-8 flex flex-col items-center justify-center text-center">
                <h1 className="text-2xl font-bold mb-4">Error</h1>
                <p className="text-[var(--muted-foreground)] mb-6">{billingError || 'Something went wrong'}</p>
                <Link href="/dashboard" className="text-[var(--primary)] hover:underline">
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
                        <Badge variant="default" className="capitalize">{tier.name}</Badge>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-6 py-12 space-y-20">

                {/* Usage Section */}
                <section>
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold mb-2 text-[var(--foreground)]">Usage</h2>
                        <p className="text-[var(--muted-foreground)]">Monitor your resource consumption for the current billing cycle.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <UsageGauge
                            icon={<Zap className="w-5 h-5 text-[var(--warning)]" />}
                            title="Deployments"
                            used={usage.deployments}
                            limit={limits.deployments}
                            unit=""
                            percent={getPercent(usage.deployments, limits.deployments)}
                        />
                        <UsageGauge
                            icon={<Server className="w-5 h-5 text-[var(--info)]" />}
                            title="Build Minutes"
                            used={usage.buildMinutes}
                            limit={limits.buildMinutes}
                            unit="min"
                            percent={getPercent(usage.buildMinutes, limits.buildMinutes)}
                        />
                        <UsageGauge
                            icon={<Wifi className="w-5 h-5 text-[var(--success)]" />}
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
                    <Card className="p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-[var(--muted)]/5 border-b border-[var(--border)] text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="p-4 font-semibold text-[var(--muted-foreground)]">Invoice #</th>
                                        <th className="p-4 font-semibold text-[var(--muted-foreground)]">Date</th>
                                        <th className="p-4 font-semibold text-[var(--muted-foreground)]">Amount</th>
                                        <th className="p-4 font-semibold text-[var(--muted-foreground)]">Status</th>
                                        <th className="p-4 font-semibold text-[var(--muted-foreground)] text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border)]">
                                    {invoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-[var(--muted-foreground)]">
                                                No invoices found
                                            </td>
                                        </tr>
                                    ) : (
                                        invoices.map((invoice) => (
                                            <tr key={invoice.id} className="hover:bg-[var(--muted)]/10 transition-colors">
                                                <td className="p-4 font-medium">{invoice.invoiceNumber}</td>
                                                <td className="p-4">{new Date(invoice.date).toLocaleDateString()}</td>
                                                <td className="p-4">₹{invoice.total.toFixed(2)}</td>
                                                <td className="p-4">
                                                    <Badge
                                                        variant={
                                                            invoice.status === 'paid' ? 'success' :
                                                            invoice.status === 'pending' ? 'warning' : 'secondary'
                                                        }
                                                        className="capitalize"
                                                    >
                                                        {invoice.status}
                                                    </Badge>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <a
                                                        href={`/api/billing/invoices/${invoice.id}/download`}
                                                        className={cn(
                                                            buttonVariants({ variant: 'ghost', size: 'sm' }),
                                                            "inline-flex items-center gap-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                                        )}
                                                        download
                                                    >
                                                        <FileText className="w-3.5 h-3.5" />
                                                        Download
                                                    </a>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </section>
            </main>
        </div>
    );
}
