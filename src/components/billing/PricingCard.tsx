import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Button as MovingBorderButton } from '@/components/ui/moving-border';

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

    const renderButton = () => {
        if (loading) {
            return (
                <Button disabled className="w-full" size="lg">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Upgrading...
                </Button>
            );
        }

        if (isCurrent) {
            return (
                <Button disabled variant="outline" className="w-full" size="lg">
                    Current Plan
                </Button>
            );
        }

        if (isEnterprise) {
            return (
                <Button variant="secondary" className="w-full" size="lg">
                    Contact Sales
                </Button>
            );
        }

        if (plan.id === 'free') {
             return (
                <Button disabled variant="outline" className="w-full" size="lg">
                    Downgrade
                </Button>
            );
        }

        return (
            <MovingBorderButton
                onClick={() => onUpgrade(plan.id)}
                containerClassName="w-full h-12"
                className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold"
            >
                Upgrade to {plan.name}
            </MovingBorderButton>
        );
    };

    return (
        <div
            className={cn(
                'relative flex flex-col p-6 rounded-xl transition-all duration-300',
                'bg-[var(--card)] border border-[var(--border)]',
                'hover:border-[var(--border-hover)] hover:shadow-lg',
                'before:absolute before:inset-0 before:rounded-xl before:bg-[var(--gradient-card)] before:opacity-50 before:-z-10',
                isCurrent && 'border-[var(--primary)] ring-1 ring-[var(--primary)] shadow-md shadow-[var(--primary)]/10'
            )}
        >
            {isPopular && (
                <div className="absolute -top-3 right-4">
                    <Badge className="bg-blue-600 hover:bg-blue-700 text-white border-none px-3 py-1">
                        Most Popular
                    </Badge>
                </div>
            )}

            <div className="mb-5">
                <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                <p className="text-sm text-muted-foreground min-h-[40px]">{plan.description}</p>
            </div>

            <div className="mb-6">
                <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                    {plan.price !== 'Custom' && <span className="text-muted-foreground">/mo</span>}
                </div>
            </div>

            <div className="flex-1 mb-8">
                <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                            <div className="mt-1 bg-primary rounded-full p-0.5">
                                <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                            </div>
                            <span className="text-muted-foreground">{feature}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="mt-auto">
                {renderButton()}
            </div>
        </div>
    );
}
