'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, RefreshCw } from 'lucide-react';
import './globals.css';

export default function GlobalError({
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
    <html lang="en">
      <body className="bg-[var(--background)] text-[var(--foreground)] antialiased">
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
             <Card className="max-w-md w-full overflow-hidden p-0 bg-[var(--card)] border-[var(--error)]/30 shadow-2xl">
                <div className="p-8 flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--error)]/10 flex items-center justify-center mb-6">
                        <AlertCircle className="w-10 h-10 text-[var(--error)]" />
                    </div>
                    <div className="space-y-1 mb-6">
                        <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--error)]">System Failure</span>
                        <h1 className="text-[8px] md:text-[10px] font-bold tracking-tight">Critical Error</h1>
                    </div>
                    <p className="text-[var(--muted-foreground)] text-[10px] mb-8 max-w-[280px]">
                      A critical error occurred and the application cannot recover automatically.
                    </p>
                    <Button
                        onClick={() => reset()}
                        size="lg"
                        className="w-full text-[8px] font-bold uppercase tracking-wider h-12"
                        variant="primary"
                    >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Reload Application
                    </Button>
                    {error.digest && (
                        <div className="mt-8 pt-6 border-t border-[var(--border)] w-full">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--muted)]">Error Digest</span>
                            <code className="block mt-2 text-[8px] font-bold uppercase tracking-wider font-mono text-[var(--muted-foreground)] bg-[var(--muted)]/10 p-2 rounded">
                                {error.digest}
                            </code>
                        </div>
                    )}
                </div>
            </Card>
        </div>
      </body>
    </html>
  );
}
