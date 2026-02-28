'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Project } from '@/types';
import { cn } from '@/lib/utils';
import { GitCommit, GitBranch, Clock, AlertCircle, CheckCircle2, Loader2, XCircle, ExternalLink, Copy, Check } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { ProjectAvatar } from '@/components/ProjectAvatar';
import { toast } from 'sonner';

// Mock data for the sparkline - reflects status
const generateSparklineData = (status: string) => {
  const length = 20;
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

  return Array.from({ length }, () => ({
    value: Math.max(0, Math.floor(Math.random() * volatility) + base)
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

  const sparklineData = useMemo(() => generateSparklineData(status), [status]);

  return (
    <div className={cn("flex flex-col h-full justify-between transition-all duration-500 rounded-2xl bg-[var(--card)]/40 backdrop-blur-sm border border-[var(--border)] hover:border-[var(--foreground)]/20", config.glow)}>
      {/* Header: Project Identity and Sparkline */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <ProjectAvatar name={project.name} productionUrl={project.productionUrl} className="w-8 h-8" />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--foreground)] truncate group-hover:text-[var(--primary)] transition-colors">
              {project.name}
            </h3>
            <div className="flex items-center gap-1.5">
              <Badge variant={config.variant} className="h-4 text-[8px] px-2 gap-1.5 uppercase tracking-[0.2em] font-bold">
                {status === 'building' || status === 'deploying' ? <Loader2 className="w-2 h-2 animate-spin" /> : <config.icon className="w-2 h-2" />}
                {config.label}
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
      <div className="mt-auto space-y-3">
        {project.productionUrl && (
          <div className="flex items-center justify-between group/url">
            <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)] group-hover/url:text-[var(--foreground)] transition-colors min-w-0">
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{project.productionUrl.replace(/^https?:\/\//, '')}</span>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigator.clipboard.writeText(project.productionUrl!);
                setCopiedId(project.id + '-url');
                toast.success('URL copied');
                setTimeout(() => setCopiedId(null), 2000);
              }}
              className="opacity-0 group-hover/url:opacity-100 transition-opacity p-1 hover:bg-[var(--card-hover)] rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--primary)] outline-none"
              aria-label={copiedId === project.id + '-url' ? "URL copied" : "Copy URL"}
            >
              {copiedId === project.id + '-url' ? (
                <Check className="w-3 h-3 text-[var(--success)]" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </motion.button>
          </div>
        )}

        {latestDeployment ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)] font-mono bg-[var(--card-hover)]/30 p-2 rounded-lg border border-[var(--border)] group-hover:border-[var(--foreground)]/10 transition-all group/sha">
              <GitCommit className="w-3 h-3 shrink-0" />
              <span className="truncate flex-1">{latestDeployment.gitCommitMessage}</span>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(latestDeployment.gitCommitSha); setCopiedId(project.id); toast.success('Copied SHA'); setTimeout(() => setCopiedId(null), 2000); }}
                className="opacity-40 hover:opacity-100 flex items-center gap-1 transition-opacity focus-visible:ring-2 focus-visible:ring-[var(--primary)] outline-none rounded"
                aria-label="Copy SHA"
              >
                {latestDeployment.gitCommitSha.substring(0, 7)}
                {copiedId === project.id ? <Check className="w-2.5 h-2.5 text-[var(--success)]" /> : <Copy className="w-2.5 h-2.5 opacity-0 group-hover/sha:opacity-100" />}
              </button>
            </div>
            <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.1em] font-bold text-[var(--muted-foreground)] px-1">
               <div className="flex items-center gap-1.5">
                 <GitBranch className="w-3 h-3" />
                 <span>{latestDeployment.gitBranch}</span>
               </div>
               <div className="flex items-center gap-1.5">
                 <Clock className="w-3 h-3" />
                 <span>{new Date(latestDeployment.updatedAt).toLocaleDateString()}</span>
               </div>
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-[var(--muted-foreground)] italic bg-[var(--card-hover)]/30 p-2 rounded-md border border-dashed border-[var(--border)] text-center">
            No deployments yet
          </div>
        )}
      </div>
    </div>
  );
}
