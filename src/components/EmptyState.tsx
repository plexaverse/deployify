import React from 'react';
import { FolderPlus, Globe, Key, Search, AlertCircle, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EmptyStateType = 'project' | 'domain' | 'env' | 'deployment' | 'search' | 'generic';

interface EmptyStateProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  type?: EmptyStateType;
  children?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  type = 'generic',
  children,
  className
}: EmptyStateProps) {

  const getIcon = () => {
    if (icon) return icon;

    const iconProps = { className: "w-8 h-8 text-[var(--muted-foreground)] opacity-50" };

    switch (type) {
      case 'project':
        return <FolderPlus {...iconProps} />;
      case 'domain':
        return <Globe {...iconProps} />;
      case 'env':
        return <Key {...iconProps} />;
      case 'deployment':
        return <GitBranch {...iconProps} />;
      case 'search':
        return <Search {...iconProps} />;
      default:
        return <AlertCircle {...iconProps} />;
    }
  };

  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 px-4 border border-dashed border-[var(--border)] rounded-xl bg-[var(--muted)]/5 text-center animate-fade-in",
      className
    )}>
      <div className="w-16 h-16 rounded-full bg-[var(--background)] border border-[var(--border)] flex items-center justify-center mb-4 shadow-sm relative overflow-hidden">
        <div className="absolute inset-0 bg-[var(--primary)]/5 rounded-full" />
        {getIcon()}
      </div>
      <h3 className="text-lg font-medium mb-1 text-[var(--foreground)]">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--muted-foreground)] max-w-sm mb-6 leading-relaxed">
          {description}
        </p>
      )}
      {children && (
        <div className="mb-6 w-full max-w-md">
          {children}
        </div>
      )}
      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </div>
  );
}
