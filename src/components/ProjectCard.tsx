'use client';

import { useState, useEffect } from 'react';
import { Project } from '@/types';
import { GitCommit, GitBranch, Clock, AlertCircle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

// Mock data for the sparkline - in a real app this would come from analytics API
const generateSparklineData = () => {
  return Array.from({ length: 20 }, () => ({
    value: Math.floor(Math.random() * 100) + 20
  }));
};

const statusConfig = {
  ready: { icon: CheckCircle2, color: 'text-[var(--success)]', bg: 'bg-[var(--success-bg)]', label: 'Healthy', stroke: 'var(--success)' },
  building: { icon: Loader2, color: 'text-[var(--warning)]', bg: 'bg-[var(--warning-bg)]', label: 'Building', stroke: 'var(--warning)' },
  deploying: { icon: Loader2, color: 'text-[var(--info)]', bg: 'bg-[var(--info-bg)]', label: 'Deploying', stroke: 'var(--info)' },
  error: { icon: XCircle, color: 'text-[var(--error)]', bg: 'bg-[var(--error-bg)]', label: 'Error', stroke: 'var(--error)' },
  queued: { icon: AlertCircle, color: 'text-[var(--muted-foreground)]', bg: 'bg-[var(--muted)]/10', label: 'Queued', stroke: 'var(--muted)' },
  cancelled: { icon: XCircle, color: 'text-[var(--muted-foreground)]', bg: 'bg-[var(--muted)]/10', label: 'Cancelled', stroke: 'var(--muted)' },
};

export function ProjectCard({ project }: { project: Project }) {
  const latestDeployment = project.latestDeployment;
  const status = latestDeployment?.status || 'queued';
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.queued;

  const [sparklineData, setSparklineData] = useState<{value: number}[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSparklineData(generateSparklineData());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col h-full justify-between">
      {/* Header: Name and Status */}
      <div className="flex items-start justify-between mb-2">
        <div>
           {/* We don't render title here as BentoGridItem does it, but we can render extra meta */}
           <div className="flex items-center gap-2 mb-1">
             <div className={`relative flex items-center justify-center w-2 h-2 rounded-full ${config.color.replace('text-', 'bg-')}`}>
                {(status === 'building' || status === 'deploying') && (
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.color.replace('text-', 'bg-')}`}></span>
                )}
             </div>
             <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
           </div>
        </div>
        <div className="h-8 w-24 opacity-50">
           {sparklineData.length > 0 && (
             <ResponsiveContainer width="100%" height="100%">
               <LineChart data={sparklineData}>
                 <Line type="monotone" dataKey="value" stroke={config.stroke} strokeWidth={2} dot={false} />
               </LineChart>
             </ResponsiveContainer>
           )}
        </div>
      </div>

      {/* Deployment Info */}
      <div className="mt-auto space-y-2">
        {latestDeployment ? (
          <>
            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] font-mono bg-[var(--card)] p-2 rounded-lg border border-[var(--border)]">
              <GitCommit className="w-3 h-3" />
              <span className="truncate flex-1">{latestDeployment.gitCommitMessage}</span>
              <span className="opacity-50">{latestDeployment.gitCommitSha.substring(0, 7)}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
               <div className="flex items-center gap-1.5">
                 <GitBranch className="w-3 h-3" />
                 <span>{latestDeployment.gitBranch}</span>
               </div>
               <div className="flex items-center gap-1.5">
                 <Clock className="w-3 h-3" />
                 <span>{new Date(latestDeployment.updatedAt).toLocaleDateString()}</span>
               </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-[var(--muted-foreground)] italic p-2">
            No deployments yet
          </div>
        )}
      </div>
    </div>
  );
}
