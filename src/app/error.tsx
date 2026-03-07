'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { BackgroundBeams } from '@/components/ui/background-beams';

export default function Error({
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
    <div className="min-h-screen w-full bg-[var(--background)] relative flex flex-col items-center justify-center antialiased overflow-hidden">
      <div className="max-w-md w-full p-4 z-10 relative">
        <Card className="overflow-hidden p-0 shadow-2xl border-[var(--error)]/30 backdrop-blur-xl bg-[var(--card)]/30">
            <div className="absolute top-0 left-0 w-full h-1 bg-[var(--error)]"></div>
            <div className="p-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-[var(--error)]/10 flex items-center justify-center shrink-0 mb-6">
                    <AlertCircle className="w-8 h-8 text-[var(--error)]" />
                </div>
                <div className="space-y-1 mb-6">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--error)]">System Error</span>
                    <h1 className="text-3xl font-bold tracking-tight">Something went wrong!</h1>
                </div>
                <p className="text-[var(--muted-foreground)] text-lg mb-8">
                    We encountered an unexpected error. Our team has been notified.
                </p>
                <div className="flex flex-col w-full gap-4">
                    <Button
                        size="lg"
                        onClick={() => reset()}
                        className="font-bold w-full"
                        variant="primary"
                    >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Try again
                    </Button>
                </div>
                <p className="mt-8 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] font-mono">
                    Error Digest: {error.digest || 'Unknown'}
                </p>
            </div>
        </Card>
      </div>
      <BackgroundBeams />
    </div>
  );
}
