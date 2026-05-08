import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export default function DashboardNotFound() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <Card className="max-w-md w-full overflow-hidden p-0 bg-[var(--card)] border-[var(--border)] shadow-lg">
        <div className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center mb-6 shrink-0">
                <FileQuestion className="w-10 h-10 text-[var(--primary)]" />
            </div>
            <div className="space-y-1 mb-6">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">404 Error</span>
                <h1 className="text-[10px] font-bold tracking-tight">
                    Page Not Found
                </h1>
            </div>
            <p className="text-[var(--muted-foreground)] text-[10px] font-bold uppercase tracking-wider mb-8 max-w-[280px]">
                The resource you are looking for within the dashboard could not be found.
            </p>
            <Link href="/dashboard" className="w-full">
                <Button variant="outline" className="w-full h-12 text-[10px] font-bold uppercase tracking-wider">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Return to Dashboard
                </Button>
            </Link>
        </div>
      </Card>
    </div>
  );
}
