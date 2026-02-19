import React from 'react';
import { Check, Minus, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface Plan {
    id: string;
    name: string;
    description: string;
}

interface Feature {
    name: string;
    info?: string;
    values: Record<string, string | boolean>;
}

interface ComparePlansTableProps {
    plans: Plan[];
    currentPlanId?: string;
}

const features: { category: string; items: Feature[] }[] = [
    {
        category: 'General',
        items: [
            {
                name: 'Projects',
                values: { free: '3', pro: '10', team: '50', enterprise: 'Unlimited' },
            },
            {
                name: 'Team Members',
                values: { free: '1', pro: '1', team: '5', enterprise: 'Unlimited' },
            },
        ],
    },
    {
        category: 'Infrastructure',
        items: [
            {
                name: 'Deployments',
                info: 'Total internal and production deployments per month.',
                values: { free: '20/mo', pro: '1,000/mo', team: '5,000/mo', enterprise: 'Unlimited' },
            },
            {
                name: 'Build Minutes',
                info: 'Total build time allowed per month.',
                values: { free: '100 mins', pro: '1,000 mins', team: '5,000 mins', enterprise: 'Unlimited' },
            },
            {
                name: 'Bandwidth',
                info: 'Data transfer limits per month.',
                values: { free: '5 GB', pro: '100 GB', team: '500 GB', enterprise: 'Unlimited' },
            },
        ],
    },
    {
        category: 'Support',
        items: [
            {
                name: 'Community Support',
                values: { free: true, pro: true, team: true, enterprise: true },
            },
            {
                name: 'Email Support',
                values: { free: false, pro: 'Standard', team: 'Priority', enterprise: 'Dedicated' },
            },
            {
                name: 'SLA',
                values: { free: false, pro: false, team: '99.9%', enterprise: '99.99%' },
            },
        ],
    },
];

export function ComparePlansTable({ plans, currentPlanId }: ComparePlansTableProps) {
    return (
        <Card className="w-full overflow-hidden p-0 border border-[var(--border)]">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr>
                            <th className="p-4 min-w-[200px] bg-[var(--background)] sticky left-0 z-10 border-b border-[var(--border)] shadow-[4px_0_10px_-2px_rgba(0,0,0,0.1)]">
                                <span className="text-lg font-semibold">Features</span>
                            </th>
                            {plans.map((plan) => (
                                <th key={plan.id} className="p-4 min-w-[150px] border-b border-[var(--border)] text-center bg-[var(--background)]">
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="font-semibold">{plan.name}</span>
                                        {plan.id === currentPlanId && (
                                            <Badge variant="default" className="text-[10px] px-1.5 h-5">
                                                Current
                                            </Badge>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {features.map((section) => (
                            <React.Fragment key={section.category}>
                                <tr className="bg-[var(--muted)]/20">
                                    <td colSpan={plans.length + 1} className="p-4 py-3 font-medium text-sm text-[var(--muted-foreground)] border-y border-[var(--border)] sticky left-0 z-10">
                                        {section.category}
                                    </td>
                                </tr>
                                {section.items.map((feature) => (
                                    <tr key={feature.name} className="group hover:bg-[var(--muted)]/5 transition-colors">
                                        <td className="p-4 border-b border-[var(--border)] bg-[var(--background)] sticky left-0 z-10 shadow-[4px_0_10px_-2px_rgba(0,0,0,0.05)]">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-[var(--foreground)]">{feature.name}</span>
                                                {feature.info && (
                                                    <div className="group/tooltip relative">
                                                        <HelpCircle className="w-3.5 h-3.5 text-[var(--muted-foreground)] cursor-help" />
                                                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-48 p-2 bg-[var(--popover)] text-[var(--popover-foreground)] text-xs rounded-md shadow-md opacity-0 group-hover/tooltip:opacity-100 pointer-events-none transition-opacity z-20 border border-[var(--border)]">
                                                            {feature.info}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        {plans.map((plan) => {
                                            const value = feature.values[plan.id];
                                            return (
                                                <td key={`${plan.id}-${feature.name}`} className="p-4 border-b border-[var(--border)] text-center text-sm">
                                                    {value === true ? (
                                                        <div className="flex justify-center">
                                                            <div className="bg-[var(--primary)]/10 rounded-full p-1">
                                                                <Check className="w-4 h-4 text-[var(--primary)]" />
                                                            </div>
                                                        </div>
                                                    ) : value === false ? (
                                                        <div className="flex justify-center">
                                                            <Minus className="w-4 h-4 text-[var(--muted-foreground)]/30" />
                                                        </div>
                                                    ) : (
                                                        <span className="text-[var(--muted-foreground)] font-medium">{value}</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
