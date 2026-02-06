'use client';

import { useState, useEffect } from 'react';
import { Project } from '@/types';
import { GitCommit, GitBranch, Clock, AlertCircle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

// Mock data for the sparkline - in a real app this would come from analytics API
const generateSparklineData = () => {
  return Array.from({ length: 20 }, (_, i) => ({
    value: Math.floor(Math.random() * 100) + 20
  }));
};

const statusConfig = {
  ready: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Healthy', hex: '#10b981' },
  building: { icon: Loader2, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Building', hex: '#f59e0b' },
  deploying: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Deploying', hex: '#3b82f6' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Error', hex: '#ef4444' },
  queued: { icon: AlertCircle, color: 'text-neutral-500', bg: 'bg-neutral-500/10', label: 'Queued', hex: '#737373' },
  cancelled: { icon: XCircle, color: 'text-neutral-500', bg: 'bg-neutral-500/10', label: 'Cancelled', hex: '#737373' },
};

export function ProjectCard({ project }: { project: Project }) {
  const latestDeployment = project.latestDeployment;
  const status = latestDeployment?.status || 'queued';
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.queued;
  const StatusIcon = config.icon;

  const [sparklineData, setSparklineData] = useState<{value: number}[]>([]);

  useEffect(() => {
    setSparklineData(generateSparklineData());
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
                 <Line type="monotone" dataKey="value" stroke={config.hex} strokeWidth={2} dot={false} />
               </LineChart>
             </ResponsiveContainer>
           )}
        </div>
      </div>

      {/* Deployment Info */}
      <div className="mt-auto space-y-2">
        {latestDeployment ? (
          <>
            <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono bg-white/5 p-2 rounded-lg border border-white/5">
              <GitCommit className="w-3 h-3" />
              <span className="truncate flex-1">{latestDeployment.gitCommitMessage}</span>
              <span className="opacity-50">{latestDeployment.gitCommitSha.substring(0, 7)}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-neutral-500">
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
          <div className="text-xs text-neutral-500 italic p-2">
            No deployments yet
          </div>
        )}
      </div>
    </div>
  );
}
