import * as React from "react"
import { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  description?: string
  icon?: LucideIcon
  action?: React.ReactNode
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/5",
        className
      )}
      {...props}
    >
      {Icon && (
        <div className="w-20 h-20 rounded-full bg-[var(--background)] border border-[var(--border)] flex items-center justify-center mb-6 shadow-sm relative">
           <div className="absolute inset-0 bg-blue-500/5 rounded-full animate-pulse-glow" />
           <Icon className="w-10 h-10 text-[var(--muted-foreground)] opacity-50" />
        </div>
      )}
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      {description && (
        <p className="text-[var(--muted-foreground)] max-w-sm mb-6 leading-relaxed">
          {description}
        </p>
      )}
      {children && (
        <div className="mb-6 w-full flex justify-center">
            {children}
        </div>
      )}
      {action && (
        <div className="mt-2">
            {action}
        </div>
      )}
    </div>
  )
}
