import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export default function DashboardNotFound() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <Card className="max-w-md w-full p-8 text-center bg-[var(--card)] border-[var(--border)] shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                <FileQuestion className="w-6 h-6 text-[var(--primary)]" />
            </div>
            <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">404 Error</span>
                <h1 className="text-3xl font-bold tracking-tight">
                    Page Not Found
                </h1>
            </div>
        </div>
        <p className="text-[var(--muted-foreground)] mb-8">
            The resource you are looking for within the dashboard could not be found.
        </p>
        <Link href="/dashboard">
            <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Return to Dashboard
            </Button>
        </Link>
      </Card>
    </div>
  );
}
