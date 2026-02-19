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
      <div className="max-w-2xl mx-auto p-4 z-10 relative">
        <Card className="p-12 backdrop-blur-xl bg-[var(--card)]/30 border-[var(--destructive)]/50 text-center shadow-2xl">
            <div className="mb-6 flex justify-center">
                <div className="p-4 rounded-full bg-[var(--destructive)]/10 text-[var(--destructive)]">
                    <AlertCircle className="w-12 h-12" />
                </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-b from-[var(--foreground)] to-[var(--muted-foreground)] mb-6 tracking-tighter">
              Something went wrong!
            </h1>
            <p className="text-[var(--muted-foreground)] text-lg mb-8 max-w-md mx-auto">
              We encountered an unexpected error. Our team has been notified.
            </p>
            <div className="flex justify-center gap-4">
                <Button
                    size="lg"
                    onClick={() => reset()}
                    className="font-semibold"
                >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try again
                </Button>
            </div>
             <p className="mt-8 text-xs text-[var(--muted-foreground)] font-mono">
                Error Digest: {error.digest || 'Unknown'}
            </p>
        </Card>
      </div>
      <BackgroundBeams />
    </div>
  );
}
