import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export default function DashboardNotFound() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <Card className="max-w-md w-full p-8 text-center bg-[var(--card)] border-[var(--border)] shadow-lg">
        <div className="mb-6 flex justify-center">
            <div className="p-4 rounded-full bg-[var(--muted)]/20 text-[var(--muted-foreground)]">
                <FileQuestion className="w-12 h-12" />
            </div>
        </div>
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
            Page Not Found
        </h1>
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
