'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, RotateCcw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <Card className="max-w-md w-full overflow-hidden p-0 bg-[var(--card)] border-[var(--error)]/30 shadow-lg relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-[var(--error)]"></div>
        <div className="p-8 flex flex-col items-center text-center">
            <div className="mb-6 flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[var(--error)]/10 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-6 h-6 text-[var(--error)]" />
                </div>
                <div className="space-y-1">
                    <span className="text-[7px] font-bold uppercase tracking-wider text-[var(--error)]">System Error</span>
                    <h1 className="text-[7px] md:text-[9px] font-bold tracking-tight">
                        Dashboard Error
                    </h1>
                </div>
            </div>
            <p className="text-[var(--muted-foreground)] mb-8">
                An error occurred while loading this dashboard view.
            </p>
            <Button
                onClick={() => reset()}
                className="w-full"
                variant="primary"
            >
                <RotateCcw className="mr-2 h-4 w-4" />
                Try Again
            </Button>
            <p className="mt-4 text-[7px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] font-mono truncate w-full px-2" title={error.message || 'Unknown error'}>
                 {error.message || 'Unknown error'}
            </p>
        </div>
      </Card>
    </div>
  );
}
