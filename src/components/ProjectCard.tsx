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

// Deterministic sparkline data based on project ID and status
const useSparklineData = (projectId: string, status: string) => {
  return useMemo(() => {
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

    // Simple seed based on project ID string
    const seed = projectId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

    return Array.from({ length }, (_, i) => {
      const pseudoRandom = Math.abs(Math.sin(seed + i) * 10000) % 1;
      return {
        value: Math.max(0, Math.floor(pseudoRandom * volatility) + base)
      };
    });
  }, [projectId, status]);
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
  const sparklineData = useSparklineData(project.id, status);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      className={cn(
        "flex flex-col h-full justify-between p-6 transition-all duration-500 rounded-3xl bg-[var(--card)]/50 backdrop-blur-md border border-[var(--border)]/50 hover:border-[var(--foreground)]/20 hover:shadow-[0_0_30px_var(--foreground)]/5 group",
        config.glow
      )}
    >
      {/* Header: Project Identity and Sparkline */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <ProjectAvatar name={project.name} productionUrl={project.productionUrl} className="w-10 h-10 rounded-xl" />
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
        <div className="h-10 w-24 opacity-30 group-hover:opacity-80 transition-opacity">
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
        </div>
      </div>

      {/* Deployment Info */}
      <div className="mt-auto space-y-4">
        {project.productionUrl && (
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors px-1">
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="truncate">{project.productionUrl.replace(/^https?:\/\//, '')}</span>
          </div>
        )}

        {latestDeployment ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)] font-mono bg-[var(--foreground)]/[0.03] p-2.5 rounded-2xl border border-[var(--border)] group-hover:border-[var(--foreground)]/10 transition-all group/sha">
              <GitCommit className="w-3.5 h-3.5 shrink-0 opacity-50" />
              <span className="truncate flex-1 font-medium">{latestDeployment.gitCommitMessage}</span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigator.clipboard.writeText(latestDeployment.gitCommitSha);
                  setCopiedId(project.id);
                  toast.success('Copied SHA', {
                    description: latestDeployment.gitCommitSha.substring(0, 7)
                  });
                  setTimeout(() => setCopiedId(null), 2000);
                }}
                className="opacity-40 hover:opacity-100 flex items-center gap-1.5 transition-all p-1.5 rounded-lg hover:bg-[var(--foreground)]/5 focus-visible:ring-2 focus-visible:ring-[var(--foreground)]/40 focus-visible:outline-none"
                aria-label={copiedId === project.id ? "SHA Copied" : `Copy SHA for commit: ${latestDeployment.gitCommitMessage}`}
              >
                <span className="font-bold tabular-nums">{latestDeployment.gitCommitSha.substring(0, 7)}</span>
                {copiedId === project.id ? (
                  <Check className="w-3 h-3 text-[var(--success)]" />
                ) : (
                  <Copy className="w-3 h-3 opacity-0 group-hover/sha:opacity-100 transition-opacity" />
                )}
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)] px-1">
               <div className="flex items-center gap-1.5">
                 <GitBranch className="w-3.5 h-3.5 opacity-50" />
                 <span>{latestDeployment.gitBranch}</span>
               </div>
               <div className="flex items-center gap-1.5">
                 <Clock className="w-3.5 h-3.5 opacity-50" />
                 <span>{new Date(latestDeployment.updatedAt).toLocaleDateString()}</span>
               </div>
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-[var(--muted-foreground)] font-bold uppercase tracking-[0.2em] bg-[var(--foreground)]/[0.03] p-4 rounded-2xl border border-dashed border-[var(--border)] text-center">
            No deployments yet
          </div>
        )}
      </div>
    </motion.div>
  );
}
