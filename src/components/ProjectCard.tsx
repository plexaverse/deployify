'use client';

import { useState, useEffect } from 'react';
import { Project } from '@/types';
import { GitCommit, GitBranch, Clock, AlertCircle, CheckCircle2, Loader2, XCircle, ExternalLink, Copy, Check } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { ProjectAvatar } from '@/components/ProjectAvatar';

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
  ready: { variant: 'success' as const, icon: CheckCircle2, label: 'Ready', stroke: 'var(--success)' },
  building: { variant: 'warning' as const, icon: Loader2, label: 'Building', stroke: 'var(--warning)' },
  deploying: { variant: 'info' as const, icon: Loader2, label: 'Deploying', stroke: 'var(--info)' },
  error: { variant: 'error' as const, icon: AlertCircle, label: 'Error', stroke: 'var(--error)' },
  queued: { variant: 'secondary' as const, icon: Clock, label: 'Queued', stroke: 'var(--muted)' },
  cancelled: { variant: 'secondary' as const, icon: XCircle, label: 'Cancelled', stroke: 'var(--muted)' },
};

export function ProjectCard({ project }: { project: Project }) {
  const latestDeployment = project.latestDeployment;
  const status = latestDeployment?.status || 'queued';
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.queued;

  const [sparklineData, setSparklineData] = useState<{value: number}[]>([]);
  const [copiedSha, setCopiedSha] = useState(false);

  useEffect(() => {
    setSparklineData(generateSparklineData(status));
  }, [status]);

  const handleCopySha = (e: React.MouseEvent, sha: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(sha);
    setCopiedSha(true);
    toast.success('Commit SHA copied to clipboard');
    setTimeout(() => setCopiedSha(false), 2000);
  };

  return (
    <div className="flex flex-col h-full justify-between">
      {/* Header: Project Identity and Sparkline */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <ProjectAvatar name={project.name} productionUrl={project.productionUrl} className="w-8 h-8" />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--foreground)] truncate group-hover:text-[var(--primary)] transition-colors">
              {project.name}
            </h3>
            <div className="flex items-center gap-1.5">
              <Badge variant={config.variant} className="h-4 text-[9px] px-1.5 gap-1 uppercase tracking-tighter font-black">
                {status === 'building' || status === 'deploying' ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <config.icon className="w-2.5 h-2.5" />
                )}
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
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="truncate">{project.productionUrl.replace(/^https?:\/\//, '')}</span>
          </div>
        )}

        {latestDeployment ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)] font-mono bg-[var(--card-hover)]/50 p-2 rounded-md border border-[var(--border)] group-hover:border-[var(--border-hover)] transition-colors relative group/sha">
              <GitCommit className="w-3 h-3 shrink-0" />
              <span className="truncate flex-1">{latestDeployment.gitCommitMessage}</span>
              <span className="opacity-40">{latestDeployment.gitCommitSha.substring(0, 7)}</span>
              <button
                onClick={(e) => handleCopySha(e, latestDeployment.gitCommitSha)}
                className="opacity-0 group-hover/sha:opacity-100 focus-visible:opacity-100 p-1 hover:bg-[var(--border)] rounded transition-all outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                aria-label={copiedSha ? "SHA copied" : "Copy full commit SHA"}
              >
                {copiedSha ? <Check className="w-3 h-3 text-[var(--success)]" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] px-1">
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
