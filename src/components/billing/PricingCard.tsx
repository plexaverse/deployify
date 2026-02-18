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
                'relative flex flex-col p-6 transition-all duration-300',
                'bg-[var(--card)] border-[var(--border)]',
                'hover:border-[var(--border-hover)] hover:shadow-lg',
                // 'before:absolute before:inset-0 before:rounded-xl before:bg-[var(--gradient-card)] before:opacity-50 before:-z-10', // Removed complex before pseudo for now
                isCurrent && 'border-[var(--primary)] ring-1 ring-[var(--primary)] shadow-md shadow-[var(--primary)]/10'
            )}
        >
            {isPopular && (
                <div className="absolute -top-3 right-4">
                    <Badge variant="info" className="px-3 py-1 shadow-md">
                        Most Popular
                    </Badge>
                </div>
            )}

            <div className="mb-5">
                <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                <p className="text-sm text-[var(--muted-foreground)] min-h-[40px]">{plan.description}</p>
            </div>

            <div className="mb-6">
                <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                    {plan.price !== 'Custom' && <span className="text-[var(--muted-foreground)]">/mo</span>}
                </div>
            </div>

            <div className="flex-1 mb-8">
                <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                            <div className="mt-1 bg-[var(--primary)] rounded-full p-0.5 shrink-0">
                                <Check className="w-3 h-3 text-[var(--primary-foreground)]" strokeWidth={3} />
                            </div>
                            <span className="text-[var(--muted-foreground)]">{feature}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="mt-auto">
                <Button
                    onClick={() => onUpgrade(plan.id)}
                    disabled={isCurrent || (plan.id === 'free' && !isCurrent) || loading}
                    className="w-full"
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
        </Card>
    );
}
