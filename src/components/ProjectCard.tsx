'use client';

import { useState, useEffect } from 'react';
import { Project } from '@/types';
import { cn } from '@/lib/utils';
import { GitCommit, GitBranch, Clock, AlertCircle, CheckCircle2, Loader2, XCircle, ExternalLink, Copy, Check } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { ProjectAvatar } from '@/components/ProjectAvatar';
import { toast } from 'sonner';

// Mock data for the sparkline - reflects status
const generateSparklineData = (status: string, seed: string = 'default') => {
  const length = 20;
  // Use a simple deterministic "random" generator based on seed string
  const getPseudoRandom = (i: number) => {
    let hash = 0;
    const combined = seed + i;
    for (let j = 0; j < combined.length; j++) {
      hash = (hash << 5) - hash + combined.charCodeAt(j);
      hash |= 0;
    }
    return (Math.abs(hash) % 100) / 100;
  };

  let base = 50;
  let volatility = 20;

  if (status === 'error') {
    base = 10;
    volatility = 50;
  } else if (status === 'building' || status === 'deploying') {
    base = 30;
    volatility = 40;
  } else if (status === 'ready') {
    base = 70;
    volatility = 10;
  }

  return Array.from({ length }, (_, i) => ({
    value: Math.max(0, Math.floor(getPseudoRandom(i) * volatility) + base)
  }));
};

const statusConfig = {
  ready: { variant: 'success' as const, icon: CheckCircle2, label: 'Ready', stroke: 'var(--success)', glow: 'hover:shadow-[0_0_20px_var(--success-bg)]' },
  building: { variant: 'warning' as const, icon: Loader2, label: 'Building', stroke: 'var(--warning)', glow: 'hover:shadow-[0_0_20px_var(--warning-bg)]' },
  deploying: { variant: 'info' as const, icon: Loader2, label: 'Deploying', stroke: 'var(--info)', glow: 'hover:shadow-[0_0_20px_var(--info-bg)]' },
  error: { variant: 'error' as const, icon: AlertCircle, label: 'Error', stroke: 'var(--error)', glow: 'hover:shadow-[0_0_20px_var(--error-bg)]' },
  queued: { variant: 'secondary' as const, icon: Clock, label: 'Queued', stroke: 'var(--muted)', glow: 'hover:shadow-md' },
  cancelled: { variant: 'secondary' as const, icon: XCircle, label: 'Cancelled', stroke: 'var(--muted)', glow: 'hover:shadow-md' },
};

export function ProjectCard({ project }: { project: Project }) {
  const latestDeployment = project.latestDeployment;
  const status = latestDeployment?.status || 'queued';
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.queued;
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Use useMemo for deterministic sparkline data to ensure visual consistency
  const sparklineData = React.useMemo(() => generateSparklineData(status, project.id), [status, project.id]);

  return (
    <div className={cn("flex flex-col h-full justify-between transition-all duration-500 rounded-3xl bg-[var(--card)]/50 backdrop-blur-xl border border-[var(--border)]/50 hover:border-[var(--foreground)]/20 shadow-none hover:shadow-2xl hover:shadow-[var(--foreground)]/5", config.glow)}>
      {/* Header: Project Identity and Sparkline */}
      <div className="flex justify-between w-full mb-4">
        <div className="flex items-center gap-3">
          <ProjectAvatar name={project.name} productionUrl={project.productionUrl} className="w-8 h-8" />
          <div className="min-w-0">
            <h3 className="text-[10px] font-bold text-[var(--foreground)] truncate group-hover:text-[var(--primary)] transition-colors uppercase tracking-tight">
              {project.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-1.5">
              <Badge
                variant={config.variant}
                className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 gap-1.5"
              >
                {status === 'building' || status === 'deploying' ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <config.icon className="w-2.5 h-2.5" />
                )}
                {config.label.toUpperCase()}
              </Badge>
            </div>
          </div>
        </div>
        <div className="h-10 w-20 opacity-40 group-hover:opacity-100 transition-opacity">
          {sparklineData.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={config.stroke}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={true}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Deployment Info */}
      <div className="mt-auto space-y-4">
        {project.productionUrl && (
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-1">
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="truncate">{project.productionUrl.replace(/^https?:\/\//, '')}</span>
          </div>
        )}

        {latestDeployment ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] font-mono bg-[var(--card-hover)]/30 p-2 rounded-lg border border-[var(--border)] group-hover:border-[var(--foreground)]/10 transition-all group/sha">
              <GitCommit className="w-3 h-3 shrink-0" />
              <span className="truncate flex-1">{latestDeployment.gitCommitMessage}</span>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(latestDeployment.gitCommitSha); setCopiedId(project.id); toast.success('Copied SHA'); setTimeout(() => setCopiedId(null), 2000); }}
                className="opacity-40 hover:opacity-100 flex items-center gap-1 transition-opacity"
                aria-label="Copy SHA"
              >
                <span className="font-mono">{latestDeployment.gitCommitSha.substring(0, 7).toUpperCase()}</span>
                {copiedId === project.id ? <Check className="w-2.5 h-2.5 text-[var(--success)]" /> : <Copy className="w-2.5 h-2.5 opacity-0 group-hover/sha:opacity-100" />}
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] px-1">
               <div className="flex items-center gap-1.5">
                 <GitBranch className="w-3 h-3" />
                 <span>{latestDeployment.gitBranch.toUpperCase()}</span>
               </div>
               <div className="flex items-center gap-1.5">
                 <Clock className="w-3 h-3" />
                 <span>{new Date(latestDeployment.updatedAt).toLocaleDateString().toUpperCase()}</span>
               </div>
            </div>
          </div>
        ) : (
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] italic bg-[var(--card-hover)]/30 p-2 rounded-md border border-dashed border-[var(--border)] text-center">
            No deployments yet
          </div>
        )}
      </div>
    </div>
  );
}
