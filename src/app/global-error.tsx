'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, RefreshCw } from 'lucide-react';
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
             <Card className="max-w-md w-full p-8 text-center bg-[var(--card)] border-[var(--destructive)] shadow-2xl">
                <div className="mb-6 flex justify-center">
                    <div className="p-4 rounded-full bg-[var(--destructive)]/10 text-[var(--destructive)]">
                        <AlertTriangle className="w-16 h-16" />
                    </div>
                </div>
                <h1 className="text-3xl font-black mb-4">
                  Critical Error
                </h1>
                <p className="text-[var(--muted-foreground)] mb-8">
                  A critical error occurred and the application cannot recover automatically.
                </p>
                <Button
                    onClick={() => reset()}
                    size="lg"
                    className="w-full font-bold"
                    variant="primary"
                >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reload Application
                </Button>
            </Card>
        </div>
      </body>
    </html>
  );
}
