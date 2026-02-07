import { Badge } from '@/components/ui/badge';

interface PlanBadgeProps {
    tier: 'free' | 'pro' | 'team' | 'enterprise';
}

export function PlanBadge({ tier }: PlanBadgeProps) {
    if (tier === 'free') return null;

    const gradients = {
        pro: 'from-indigo-500 via-purple-500 to-pink-500',
        team: 'from-blue-500 via-cyan-500 to-teal-500',
        enterprise: 'from-amber-500 via-orange-600 to-red-600',
    };

    const labels = {
        pro: 'Pro',
        team: 'Team',
        enterprise: 'Enterprise',
    };

    const gradient = gradients[tier] || gradients.pro;
    const label = labels[tier] || 'Plan';

    return (
        <Badge
            variant="secondary"
            className={`shrink-0 h-5 px-1.5 text-[10px] bg-gradient-to-r ${gradient} text-white border-0 font-bold uppercase tracking-wider animate-in fade-in zoom-in duration-300`}
        >
            {label}
        </Badge>
    );
}
