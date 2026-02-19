import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { BackgroundBeams } from '@/components/ui/background-beams';
import { Card } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full bg-[var(--background)] relative flex flex-col items-center justify-center antialiased overflow-hidden">
      <div className="max-w-2xl mx-auto p-4 z-10 relative">
        <Card className="p-12 backdrop-blur-xl bg-[var(--card)]/30 border-[var(--border)] text-center shadow-2xl">
            <h1 className="text-6xl md:text-9xl font-black bg-clip-text text-transparent bg-gradient-to-b from-[var(--foreground)] to-[var(--muted-foreground)] mb-6 tracking-tighter">
              404
            </h1>
            <h2 className="text-2xl font-bold text-[var(--foreground)] mb-4">Page Not Found</h2>
            <p className="text-[var(--muted-foreground)] text-lg mb-8 max-w-md mx-auto">
              The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
            </p>
            <div className="flex justify-center gap-4">
                 <Link href="/">
                    <Button size="lg" className="font-semibold">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Home
                    </Button>
                </Link>
            </div>
        </Card>
      </div>
      <BackgroundBeams />
    </div>
  );
}
