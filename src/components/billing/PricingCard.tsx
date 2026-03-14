import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface PricingCardProps {
    plan: {
        id: string;
        name: string;
        price: string;
        description: string;
        features: string[];
    };
    currentPlanId?: string;
    onUpgrade: (planId: string) => void;
    loading?: boolean;
    isPopular?: boolean;
}

export function PricingCard({ plan, currentPlanId, onUpgrade, loading, isPopular }: PricingCardProps) {
    const isCurrent = plan.id === currentPlanId;
    const isEnterprise = plan.id === 'enterprise';

    return (
        <Card
            className={cn(
                'relative flex flex-col overflow-hidden p-0 transition-all duration-300 h-full',
                'bg-[var(--card)] border-[var(--border)]',
                'hover:border-[var(--primary)] hover:shadow-xl group',
                isCurrent && 'border-[var(--primary)] ring-1 ring-[var(--primary)] shadow-md shadow-[var(--primary)]/10',
                isPopular && 'shadow-lg shadow-[var(--info-bg)] border-[var(--info)]/20'
            )}
        >
            {isPopular && (
                <div className="absolute top-0 right-0 p-4 z-10">
                    <Badge variant="info" className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-md">
                        Most Popular
                    </Badge>
                </div>
            )}

            <div className="p-8 flex flex-col h-full">
                <div className="mb-8">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-1 block group-hover:text-[var(--primary)] transition-colors">
                        Available Plan
                    </span>
                    <h3 className="text-2xl font-bold mb-3">{plan.name}</h3>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] min-h-[40px] leading-relaxed">{plan.description}</p>
                </div>

                <div className="mb-10">
                    <div className="flex items-baseline gap-1">
                        <span className="text-5xl font-bold tracking-tighter">{plan.price}</span>
                        {plan.price !== 'Custom' && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">/ month</span>
                        )}
                    </div>
                </div>

                <div className="flex-1 mb-10">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-4 block">
                        Included Features
                    </span>
                    <ul className="space-y-4">
                        {plan.features.map((feature, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm">
                                <div className="mt-0.5 bg-[var(--primary)]/10 rounded-full p-1 shrink-0">
                                    <Check className="w-3 h-3 text-[var(--primary)]" strokeWidth={3} />
                                </div>
                                <span className="text-[var(--muted-foreground)] font-semibold leading-tight">{feature}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="mt-auto">
                    <Button
                        onClick={() => onUpgrade(plan.id)}
                        disabled={isCurrent || (plan.id === 'free' && !isCurrent) || loading}
                        className="w-full h-12 font-bold uppercase tracking-wider text-[10px]"
                        variant={isCurrent ? 'outline' : isEnterprise ? 'secondary' : 'primary'}
                        size="lg"
                        loading={loading}
                    >
                        {isCurrent
                            ? 'Current Plan'
                            : isEnterprise
                                ? 'Contact Sales'
                                : `Upgrade to ${plan.name}`}
                    </Button>
                </div>
            </div>
        </Card>
    );
}
