import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { Card } from '@/components/ui/card';
import { ArrowLeft, FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full bg-[var(--background)] relative flex flex-col items-center justify-center antialiased overflow-hidden">
      <div className="max-w-md w-full p-4 z-10 relative">
        <Card className="overflow-hidden p-0 shadow-2xl border-[var(--border)] backdrop-blur-xl bg-[var(--card)]/30">
            <div className="p-8 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0 mb-6">
                    <FileQuestion className="w-8 h-8 text-[var(--primary)]" />
                </div>
                <div className="space-y-1 mb-6">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">404 Error</span>
                    <h1 className="text-sm font-bold tracking-tight">Page Not Found</h1>
                </div>
                <p className="text-[var(--muted-foreground)] text-sm mb-8">
                    The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
                </p>
                <div className="flex flex-col w-full gap-4">
                    <Link href="/" className="w-full">
                        <Button size="lg" className="font-bold w-full text-[10px] uppercase tracking-wider" variant="outline">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Home
                        </Button>
                    </Link>
                </div>
            </div>
        </Card>
      </div>
      <BackgroundBeams />
    </div>
  );
}
