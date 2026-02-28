'use client';

import { useState, useMemo } from 'react';
import { Project } from '@/types';
import { cn } from '@/lib/utils';
import { GitCommit, GitBranch, Clock, AlertCircle, CheckCircle2, Loader2, XCircle, ExternalLink, Copy, Check } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { ProjectAvatar } from '@/components/ProjectAvatar';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

// Mock data for the sparkline - reflects status
const generateSparklineData = (status: string, seed: string) => {
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

  // Simple deterministic random based on seed
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  return Array.from({ length }, (_, i) => {
    const pseudoRandom = (Math.sin(hash + i) + 1) / 2;
    return {
      value: Math.max(0, Math.floor(pseudoRandom * volatility) + base)
    };
  });
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

  const sparklineData = useMemo(() => generateSparklineData(status, project.name), [status, project.name]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, text: string, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(`${project.id}-${type}`);
    toast.success(`Copied ${type}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className={cn("flex flex-col h-full justify-between transition-all duration-500 rounded-2xl bg-[var(--card)]/40 backdrop-blur-sm border border-[var(--border)] hover:border-[var(--foreground)]/20 group/card", config.glow)}>
      {/* Header: Project Identity and Sparkline */}
      <div className="flex items-start justify-between mb-4 p-4 pb-0">
        <div className="flex items-center gap-3">
          <ProjectAvatar name={project.name} productionUrl={project.productionUrl} className="w-8 h-8" />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--foreground)] truncate group-hover/card:text-[var(--primary)] transition-colors">
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
        <div className="h-10 w-20 opacity-40 group-hover/card:opacity-100 transition-opacity">
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
      <div className="mt-auto space-y-3 p-4 pt-0">
        {project.productionUrl && (
          <div className="flex items-center justify-between group/url">
            <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors min-w-0">
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{project.productionUrl.replace(/^https?:\/\//, '')}</span>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={(e) => handleCopy(e, project.productionUrl!, 'URL')}
              className="opacity-0 group-hover/url:opacity-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-[var(--foreground)] rounded p-1 transition-all"
              aria-label={copiedId === `${project.id}-URL` ? "URL copied" : "Copy production URL"}
            >
              {copiedId === `${project.id}-URL` ? (
                <Check className="w-3 h-3 text-[var(--success)]" />
              ) : (
                <Copy className="w-3 h-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" />
              )}
            </motion.button>
          </div>
        )}

        {latestDeployment ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)] font-mono bg-[var(--card-hover)]/30 p-2 rounded-lg border border-[var(--border)] group-hover/card:border-[var(--foreground)]/10 transition-all group/sha">
              <GitCommit className="w-3 h-3 shrink-0" />
              <span className="truncate flex-1">{latestDeployment.gitCommitMessage}</span>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={(e) => handleCopy(e, latestDeployment.gitCommitSha, 'SHA')}
                className="opacity-40 hover:opacity-100 flex items-center gap-1 transition-opacity focus-visible:ring-1 focus-visible:ring-[var(--foreground)] rounded px-1"
                aria-label={copiedId === `${project.id}-SHA` ? "SHA copied" : "Copy SHA"}
              >
                {latestDeployment.gitCommitSha.substring(0, 7)}
                {copiedId === `${project.id}-SHA` ? (
                  <Check className="w-2.5 h-2.5 text-[var(--success)]" />
                ) : (
                  <Copy className="w-2.5 h-2.5 opacity-0 group-hover/sha:opacity-100" />
                )}
              </motion.button>
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
