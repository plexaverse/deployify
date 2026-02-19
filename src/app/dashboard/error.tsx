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
      <Card className="max-w-md w-full p-8 text-center bg-[var(--card)] border-[var(--destructive)]/50 shadow-lg">
        <div className="mb-6 flex justify-center">
            <div className="p-4 rounded-full bg-[var(--destructive)]/10 text-[var(--destructive)]">
                <AlertCircle className="w-12 h-12" />
            </div>
        </div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
            Dashboard Error
        </h1>
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
        <p className="mt-4 text-xs text-[var(--muted-foreground)] font-mono">
             {error.message || 'Unknown error'}
        </p>
      </Card>
    </div>
  );
}
